"""Frozen nested-validation protocol (VC-04, C-03, C-04, Implementation_Plan P2).

Protocol (contract-fixed, never redesigned here):

* one shared outer structure ``RepeatedStratifiedKFold(5 splits x 3 repeats,
  random_state=411)`` stratified on the joint 8-pattern LAD/LCX/RCA outcome
  label, reused for all four targets;
* inner ``StratifiedKFold(4, shuffle=True, seed=412+foldIndex)`` on the
  outer-train joint label;
* scaler, XGB, LR, Platt, threshold and abstention fitted only on training
  data of the relevant level — Platt and threshold for an outer fold come from
  that fold's INNER out-of-fold margins; the outer test fold is touched only
  for scoring;
* patient-level evidence pools each patient's 3 repeat probabilities into 303
  out-of-fold rows; every reported number derives from that pool;
* the evidence ladder re-scores outer-test rows with unobserved modalities
  masked to fold-local background rows (60, seeded from outer-train only) and
  averages the raw ensemble margin over those rows.

No synthetic resampling appears anywhere in this module; the prohibition is
recorded in ``results.json`` as ``protocol.noSmote``.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from sklearn.model_selection import RepeatedStratifiedKFold, StratifiedKFold

from .calibration import (
    apply_platt,
    fit_platt,
    raw_margin_from_probability,
    sigmoid,
)
from .config import load_registry
from .errors import PipelineError
from .metrics import classification_metrics, roc_auc
from .prepare import PreparedDataset
from .train import ensemble_raw_margin, fit_ensemble

BASE_SEED = 411
OUTER_SPLITS = 5
OUTER_REPEATS = 3
INNER_SPLITS = 4
BACKGROUND_ROWS = 60
ABSTENTION_FRACTIONS = (0.0, 0.2, 0.4, 0.6)
ABSTENTION_DEFAULT_FRACTION = 0.4
THRESHOLD_METHOD = "max_f1_inner_validation"
THRESHOLD_SOURCE = "validated_pipeline"
STAGE_SEMANTICS = (
    "Cumulative information from the training cohort, not a recommended work-up order."
)
LADDER_PROVENANCE = (
    "Outer-test rows re-scored per stage with unobserved modalities masked to "
    "fold-local background rows (60 rows seeded from the outer-training fold only); "
    "margin = mean over background rows; AUC on raw ensemble margins (the Platt "
    "map is affine and AUC is rank-invariant, so calibration is irrelevant here); "
    "pooled per patient across repeats; 95% percentile bootstrap CI over patients."
)
SELECTION_RULE = (
    "Deployed half width = 40th percentile of |margin - thresholdMargin| over pooled "
    "out-of-fold margins (numpy linear quantile); sweeps abstain the closest "
    "0/20/40/60% by the same distance, ties broken by cohort order."
)


def inner_fold_seed(fold_index: int) -> int:
    return BASE_SEED + 1 + int(fold_index)


def fold_xgb_seed(fold_index: int, target_index: int) -> int:
    return 5000 + BASE_SEED + int(fold_index) * 4 + int(target_index)


def deployed_xgb_seed(target_index: int) -> int:
    return 5000 + BASE_SEED + OUTER_SPLITS * OUTER_REPEATS * 4 + int(target_index)


def fold_background_seed(fold_index: int) -> int:
    return 6000 + BASE_SEED + int(fold_index)


def deployed_background_seed() -> int:
    return 7000 + BASE_SEED


def bootstrap_performance_seed(target_index: int) -> int:
    return 8000 + BASE_SEED + int(target_index)


def bootstrap_subgroup_seed(target_index: int, group_index: int) -> int:
    return 8100 + BASE_SEED + int(target_index) * 4 + int(group_index)


def bootstrap_ladder_seed(target_index: int, stage_index: int) -> int:
    return 8200 + BASE_SEED + int(target_index) * 5 + int(stage_index)


@dataclass(frozen=True)
class FoldSpec:
    fold_index: int
    repeat: int
    position: int
    train_idx: np.ndarray
    test_idx: np.ndarray


@dataclass
class TargetFoldResult:
    fold_index: int
    train_idx: np.ndarray
    test_idx: np.ndarray
    platt: dict[str, float]
    threshold: float
    fold_auc: float
    margin_test: np.ndarray
    prob_test: np.ndarray
    raw_prob_test: np.ndarray
    inner_margins: np.ndarray
    inner_probs: np.ndarray
    ladder_test: np.ndarray
    lr_pipeline: object
    background_idx: np.ndarray


@dataclass
class TargetValidation:
    target_id: str
    labels: np.ndarray
    pooled_prob: np.ndarray
    pooled_raw_prob: np.ndarray
    pooled_margin: np.ndarray
    pooled_ladder: np.ndarray
    fold_auc: list[float]
    fold_thresholds: list[float]
    folds: list[TargetFoldResult]


def registry_stages() -> list[dict]:
    """Cumulative evidence-ladder stages in registry order (C-02)."""
    doc = load_registry()
    stages = sorted(doc["stages"], key=lambda entry: int(entry["order"]))
    if not stages:
        raise PipelineError("registry declares no evidence-ladder stages")
    return stages


def build_outer_folds(joint: np.ndarray) -> list[FoldSpec]:
    """The one shared outer structure; all 8 joint patterns must survive each fold."""
    labels = np.asarray(joint, dtype=np.int64).ravel()
    if np.unique(labels).size != 8:
        raise PipelineError("joint label must carry all 8 vessel patterns")
    splitter = RepeatedStratifiedKFold(
        n_splits=OUTER_SPLITS, n_repeats=OUTER_REPEATS, random_state=BASE_SEED
    )
    folds: list[FoldSpec] = []
    dummy = np.zeros((labels.size, 1))
    all_patterns = set(np.unique(labels).tolist())
    for fold_index, (train_idx, test_idx) in enumerate(splitter.split(dummy, labels)):
        train_patterns = set(np.unique(labels[train_idx]).tolist())
        test_patterns = set(np.unique(labels[test_idx]).tolist())
        if train_patterns != all_patterns or test_patterns != all_patterns:
            raise PipelineError(f"outer fold {fold_index} lost a joint pattern")
        folds.append(
            FoldSpec(
                fold_index=fold_index,
                repeat=fold_index // OUTER_SPLITS,
                position=fold_index % OUTER_SPLITS,
                train_idx=np.asarray(train_idx),
                test_idx=np.asarray(test_idx),
            )
        )
    if len(folds) != OUTER_SPLITS * OUTER_REPEATS:
        raise PipelineError("outer fold count differs from the frozen protocol")
    return folds


def stage_feature_mask(
    feature_order: list[str], modality_by_feature: dict[str, str], modalities_through: list[str]
) -> np.ndarray:
    """Boolean observed-feature mask for a cumulative ladder stage."""
    keep = set(modalities_through)
    unknown = [fid for fid in feature_order if fid not in modality_by_feature]
    if unknown:
        raise PipelineError("feature without a modality assignment")
    return np.array([modality_by_feature[fid] in keep for fid in feature_order], dtype=bool)


def select_threshold(probabilities: np.ndarray, labels: np.ndarray) -> float:
    """Max-F1 threshold on out-of-fold calibrated probabilities.

    Ties on F1 resolve to the LARGEST threshold (the most conservative candidate
    among equal-F1 options), which makes the choice deterministic.
    """
    p = np.asarray(probabilities, dtype=np.float64).ravel()
    y = (np.asarray(labels, dtype=np.float64).ravel() >= 0.5).astype(np.int64)
    if p.shape != y.shape or p.size == 0:
        raise PipelineError("threshold selection needs matching non-empty inputs")
    if not np.all(np.isfinite(p)):
        raise PipelineError("threshold selection received non-finite probabilities")
    order = np.argsort(-p, kind="stable")
    p_sorted = p[order]
    y_sorted = y[order]
    tp = np.cumsum(y_sorted)
    fp = np.cumsum(1 - y_sorted)
    positives = float(tp[-1])
    last = np.flatnonzero(np.concatenate([p_sorted[1:] != p_sorted[:-1], [True]]))
    tp_last = tp[last].astype(np.float64)
    fp_last = fp[last].astype(np.float64)
    fn_last = positives - tp_last
    denominator = 2.0 * tp_last + fp_last + fn_last
    f1 = np.where(denominator > 0.0, 2.0 * tp_last / np.where(denominator > 0.0, denominator, 1.0), 0.0)
    if float(np.max(f1)) <= 0.0:
        raise PipelineError("threshold selection found no candidate with a positive F1")
    best_mask = f1 == np.max(f1)
    candidates = p_sorted[last]
    return float(np.max(candidates[best_mask]))


def ladder_margins(
    xgb_model,
    lr_model,
    features_test: np.ndarray,
    background: np.ndarray,
    observed_mask: np.ndarray,
) -> np.ndarray:
    """Per-row mean raw ensemble margin with masked columns drawn from background rows."""
    x_test = np.asarray(features_test, dtype=np.float64)
    x_bg = np.asarray(background, dtype=np.float64)
    mask = np.asarray(observed_mask, dtype=bool)
    if x_test.ndim != 2 or x_bg.ndim != 2 or x_test.shape[1] != x_bg.shape[1]:
        raise PipelineError("ladder scoring received inconsistent matrices")
    if mask.shape != (x_test.shape[1],):
        raise PipelineError("ladder stage mask does not match the feature order")
    n_test, n_bg = x_test.shape[0], x_bg.shape[0]
    masked = ~mask
    grid = np.broadcast_to(x_test[:, None, :], (n_test, n_bg, x_test.shape[1])).copy()
    if bool(masked.any()):
        grid[:, :, masked] = x_bg[None, :, masked]
    flat = grid.reshape(n_test * n_bg, x_test.shape[1])
    margins = ensemble_raw_margin(xgb_model, lr_model, flat)
    return margins.reshape(n_test, n_bg).mean(axis=1)


def run_outer_fold(
    prepared: PreparedDataset,
    target_id: str,
    fold: FoldSpec,
    target_index: int,
    stages: list[dict],
) -> TargetFoldResult:
    """One outer fold: inner-OOF Platt + threshold, then isolated outer scoring."""
    labels = prepared.labels[target_id]
    train_idx = fold.train_idx
    test_idx = fold.test_idx
    x_train = prepared.X[train_idx]
    x_test = prepared.X[test_idx]
    y_train = labels[train_idx]
    joint_train = prepared.joint[train_idx]
    inner = StratifiedKFold(
        n_splits=INNER_SPLITS,
        shuffle=True,
        random_state=inner_fold_seed(fold.fold_index),
    )
    inner_margins = np.empty(train_idx.size, dtype=np.float64)
    seed = fold_xgb_seed(fold.fold_index, target_index)
    dummy = np.zeros((train_idx.size, 1))
    for inner_train, inner_val in inner.split(dummy, joint_train):
        xgb_inner, lr_inner = fit_ensemble(
            x_train[inner_train], y_train[inner_train], seed
        )
        inner_margins[inner_val] = ensemble_raw_margin(
            xgb_inner, lr_inner, x_train[inner_val]
        )
    platt = fit_platt(inner_margins, y_train)
    inner_probs = apply_platt(inner_margins, platt)
    threshold = select_threshold(inner_probs, y_train)
    xgb_model, lr_model = fit_ensemble(x_train, y_train, seed)
    margin_test = ensemble_raw_margin(xgb_model, lr_model, x_test)
    prob_test = apply_platt(margin_test, platt)
    raw_prob_test = sigmoid(margin_test)
    fold_auc = roc_auc(margin_test, labels[test_idx])
    rng = np.random.default_rng(fold_background_seed(fold.fold_index))
    background_idx = rng.choice(train_idx, size=BACKGROUND_ROWS, replace=False)
    ladder = np.empty((test_idx.size, len(stages)), dtype=np.float64)
    background_x = prepared.X[background_idx]
    for stage_index, stage in enumerate(stages):
        observed = stage_feature_mask(
            prepared.feature_order, prepared.modality_by_feature, stage["modalitiesThrough"]
        )
        ladder[:, stage_index] = ladder_margins(
            xgb_model, lr_model, x_test, background_x, observed
        )
    return TargetFoldResult(
        fold_index=fold.fold_index,
        train_idx=train_idx,
        test_idx=test_idx,
        platt=platt,
        threshold=threshold,
        fold_auc=fold_auc,
        margin_test=margin_test,
        prob_test=prob_test,
        raw_prob_test=raw_prob_test,
        inner_margins=inner_margins,
        inner_probs=inner_probs,
        ladder_test=ladder,
        lr_pipeline=lr_model,
        background_idx=background_idx,
    )


def run_nested_cv(
    prepared: PreparedDataset,
    stages: list[dict] | None = None,
    folds: list[FoldSpec] | None = None,
) -> dict[str, TargetValidation]:
    """Full protocol for all targets; returns pooled out-of-fold evidence."""
    stage_list = stages if stages is not None else registry_stages()
    fold_specs = folds if folds is not None else build_outer_folds(prepared.joint)
    n_patients = prepared.n_patients
    results: dict[str, TargetValidation] = {}
    for target_index, target_id in enumerate(prepared.labels):
        fold_results = [
            run_outer_fold(prepared, target_id, spec, target_index, stage_list)
            for spec in fold_specs
        ]
        prob_sum = np.zeros(n_patients, dtype=np.float64)
        raw_sum = np.zeros(n_patients, dtype=np.float64)
        margin_sum = np.zeros(n_patients, dtype=np.float64)
        ladder_sum = np.zeros((n_patients, len(stage_list)), dtype=np.float64)
        counts = np.zeros(n_patients, dtype=np.int64)
        for fold_result in fold_results:
            idx = fold_result.test_idx
            prob_sum[idx] += fold_result.prob_test
            raw_sum[idx] += fold_result.raw_prob_test
            margin_sum[idx] += fold_result.margin_test
            ladder_sum[idx] += fold_result.ladder_test
            counts[idx] += 1
        if not bool(np.all(counts == OUTER_REPEATS)):
            raise PipelineError("protocol violation: a patient missed a repeat test fold")
        results[target_id] = TargetValidation(
            target_id=target_id,
            labels=prepared.labels[target_id],
            pooled_prob=prob_sum / counts,
            pooled_raw_prob=raw_sum / counts,
            pooled_margin=margin_sum / counts,
            pooled_ladder=ladder_sum / counts[:, None],
            fold_auc=[float(result.fold_auc) for result in fold_results],
            fold_thresholds=[float(result.threshold) for result in fold_results],
            folds=fold_results,
        )
    return results


def abstention_sweeps(
    margins: np.ndarray,
    threshold_margin: float,
    probabilities: np.ndarray,
    labels: np.ndarray,
    threshold_probability: float,
    fractions: tuple[float, ...] = ABSTENTION_FRACTIONS,
) -> list[dict]:
    """Coverage/accuracy among decided cases when the closest cases abstain."""
    m = np.asarray(margins, dtype=np.float64).ravel()
    p = np.asarray(probabilities, dtype=np.float64).ravel()
    y = (np.asarray(labels, dtype=np.float64).ravel() >= 0.5).astype(np.int64)
    if m.shape != p.shape or p.shape != y.shape or m.size == 0:
        raise PipelineError("abstention sweeps need matching non-empty inputs")
    distance = np.abs(m - float(threshold_margin))
    order = np.argsort(distance, kind="stable")
    correct = ((p >= float(threshold_probability)).astype(np.int64) == y)
    n = float(m.size)
    sweeps: list[dict] = []
    for fraction in fractions:
        abstained = int(np.floor(float(fraction) * m.size))
        decided_mask = np.ones(m.size, dtype=bool)
        decided_mask[order[:abstained]] = False
        decided = int(np.sum(decided_mask))
        accuracy = float(np.mean(correct[decided_mask])) if decided > 0 else 0.0
        sweeps.append(
            {
                "abstainFraction": abstained / n,
                "coverage": decided / n,
                "accuracyDecided": accuracy,
            }
        )
    return sweeps


def decision_evidence(validation: TargetValidation, platt: dict[str, float]) -> dict:
    """C-04 decision block: sweep points, selected threshold, abstention band."""
    labels = validation.labels
    probabilities = validation.pooled_prob
    threshold = select_threshold(probabilities, labels)
    points: list[dict] = []
    for candidate in np.unique(probabilities):
        metrics = classification_metrics(labels, probabilities, float(candidate))
        points.append(
            {
                "threshold": float(candidate),
                "precision": float(metrics["precision"]),
                "recall": float(metrics["recall"]),
                "f1": float(metrics["f1"]),
            }
        )
    if not points:
        raise PipelineError("decision sweep produced no points")
    threshold_margin = raw_margin_from_probability(threshold, platt)
    distances = np.abs(validation.pooled_margin - threshold_margin)
    half_width = float(np.quantile(distances, ABSTENTION_DEFAULT_FRACTION))
    if not np.isfinite(half_width) or half_width <= 0.0:
        raise PipelineError("abstention half width is not a positive finite number")
    sweeps = abstention_sweeps(
        validation.pooled_margin,
        threshold_margin,
        probabilities,
        labels,
        threshold,
    )
    return {
        "targetId": validation.target_id,
        "points": points,
        "selectedThreshold": float(threshold),
        "thresholdSelection": {"method": THRESHOLD_METHOD, "source": THRESHOLD_SOURCE},
        "abstention": {
            "sweeps": sweeps,
            "selectedHalfWidthMargin": half_width,
            "selectionRule": SELECTION_RULE,
        },
    }
