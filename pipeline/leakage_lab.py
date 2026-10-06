"""Quarantined leakage laboratory: deliberately flawed probe models (C-04).

This module answers one question for the Trust view — *how much would a
careless validation protocol have claimed?* — by running five deliberately
flawed pipeline variants and reporting their numbers **as probes, never as
evidence of deployed performance** (Contracts §5.4 C-04 "leakageLab";
Architecture §5.4 "Quarantined dishonesty"; Implementation_Plan P2 step 13).

Probe families (all random forests; no tuning anywhere; every probe is
labelled ``probe model``):

| id                           | protocol (summary)                                  |
|------------------------------|-----------------------------------------------------|
| ``honest-inside-fold``       | 10-fold × 3 repeated stratified CV; SMOTE fitted on the training fold only |
| ``smote-before-cv``          | SMOTE once on the full dataset, THEN split          |
| ``feature-selection-before-cv`` | top-k ANOVA-F on the full dataset, THEN split     |
| ``target-leakage``           | LAD/LCX/RCA appended as CAD inputs — the ONLY place forbidden columns ever enter a feature matrix |
| ``seed-sensitivity``         | 30 random 80/20 splits, per-target stratification   |

**A-priori hyperparameters** (fixed and documented before any probe metric
was computed):

* ``RandomForestClassifier(n_estimators=100, n_jobs=1,
  random_state=<derived from the run seed>)``, scikit-learn 1.9.1 defaults
  otherwise (gini, ``max_features="sqrt"``, bootstrap). The suggested 500
  trees were replaced by 100 from a wall-clock budget measurement alone —
  510 fits × 0.235 s measured on the pinned runtime ⇒ ≈124 s of fitting
  against the < 180 s full-run target; no metric was observed when the value
  was chosen.
* Cross-validation: 10 folds × 3 repeats, stratified per target on that
  target's own label, shuffled with a seed derived from the run seed.
* SMOTE: k = 5 nearest neighbours in the encoded feature space, linear
  interpolation, seeded numpy PCG64 generator. ``imbalanced-learn`` is
  deliberately NOT a dependency.
* Feature selection: top-k = 20 of 54 by ANOVA F-score, fitted before split.
* Seed lottery: 30 splits at ``test_size = 0.2``, stratified per target.

**Quarantine rules** (C-04 / INV-C07 / VC-02 / AG-07), all enforced by the
blocking tests in ``tests/test_leakage_boundary.py``:

* this module performs NO file input/output of any kind — it receives a
  DataFrame and returns a plain dict (AST scan proves no I/O calls);
* the production training path MUST NOT import it (static scan + fresh-
  interpreter side-effect proof);
* only ``pipeline/reproduce.py`` imports it, lazily, after model fitting;
* probe results are labelled ``probe model`` and never merged with deployed
  results; ``target-leakage`` is the single sanctioned place forbidden
  columns enter a feature matrix, here only, for measurement.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.feature_selection import f_classif
from sklearn.metrics import accuracy_score, roc_auc_score
from sklearn.model_selection import StratifiedKFold, StratifiedShuffleSplit

from .config import (
    feature_index,
    feature_list,
    load_forbidden,
    load_registry,
    load_targets,
)
from .encode import encode_value
from .errors import SchemaMismatchError
from .schema import validate_dataset

LAB_LABEL = "probe models — quarantined evidence; never merged with deployed-model results"
LAB_KIND = "leakageLab"
PROBE_LABEL = "probe model"
MODEL_FAMILY = "random-forest"
TARGET_IDS = ("CAD", "LAD", "LCX", "RCA")
LEAKED_VESSEL_IDS = ("LAD", "LCX", "RCA")
EXPECTED_FEATURE_COUNT = 54

RF_N_ESTIMATORS = 100
CV_FOLDS = 10
CV_REPEATS = 3
SEED_SPLITS = 30
SEED_TEST_FRACTION = 0.2
SMOTE_K = 5
FEATURE_SELECTION_K = 20
_SEED_MODULUS = 2_147_483_647

_REDUCE_N_ESTIMATORS = 32
_REDUCE_FOLDS = 3
_REDUCE_REPEATS = 1
_REDUCE_SEED_SPLITS = 6

_STREAM_CV_SPLITS = 1
_STREAM_CV_FITS = 2
_STREAM_SMOTE_INSIDE = 3
_STREAM_SMOTE_ONCE = 4
_STREAM_HONEST = 10
_STREAM_SMOTE_BEFORE = 20
_STREAM_FEATURE_SELECTION = 30
_STREAM_TARGET_LEAKAGE = 40
_STREAM_SEED_SENSITIVITY = 50

_EXPLANATION = (
    "These five probes are deliberately flawed variants, run only to measure how much an "
    "unguarded validation protocol inflates apparent performance; only the honest probe uses "
    "the leakage-safe protocol. Inflated probe results are quarantined evidence and are never "
    "merged with the deployed model's results, which are reported separately under performance. "
    "The seed-sensitivity probe shows that picking a favourable train/test split alone can move "
    "apparent accuracy by several points without any change to the model."
)

_HONEST_NOTE = (
    "Reference probe: everything that learns from data is fitted inside the training fold, so "
    "this is what the leakage-safe protocol earns for the probe family."
)
_SMOTE_NOTE = (
    "Inflated: resampling before splitting lets held-out rows enter training through their "
    "synthetic neighbours, so the test fold is no longer unseen."
)
_FEATURE_SELECTION_NOTE = (
    "Inflated: the feature ranking saw every row's label before the split, so the held-out fold "
    "helped choose the columns it was later scored on."
)


def _derive(seed: int, stream: int, index: int) -> int:
    """Deterministic child seed for sklearn/numpy from ``(seed, stream, index)``."""
    return int((seed * 1_000_003 + stream * 10_007 + index * 97 + 1) % _SEED_MODULUS)


def _rng(seed: int, stream: int, index: int) -> np.random.Generator:
    return np.random.default_rng(_derive(seed, stream, index))


def _excluded_columns() -> list[str]:
    doc = load_forbidden()
    return [entry["id"] for entry in doc["forbiddenInputColumns"] + doc["constantColumns"]]


def _feature_order() -> list[str]:
    """The 54 model features in registry order; never a forbidden column."""
    registry = load_registry()
    order = [entry["id"] for entry in registry["features"]]
    config_order = [entry["id"] for entry in feature_list()]
    if order != config_order:
        raise SchemaMismatchError(
            ["registry.json feature order differs from features.json feature order"]
        )
    if len(order) != EXPECTED_FEATURE_COUNT:
        raise SchemaMismatchError(
            [f"feature order has {len(order)} entries, expected {EXPECTED_FEATURE_COUNT}"]
        )
    if len(set(order)) != len(order):
        raise SchemaMismatchError(["duplicate feature ids in registry order"])
    excluded = set(_excluded_columns())
    overlap = sorted(fid for fid in order if fid in excluded)
    if overlap:
        raise SchemaMismatchError([f"forbidden column in feature order: {overlap}"])
    return order


def _encoded_matrix(df: pd.DataFrame, order: list[str]) -> np.ndarray:
    index = feature_index()
    missing = [fid for fid in order if fid not in df.columns]
    if missing:
        raise SchemaMismatchError([f"dataset is missing feature columns: {missing}"])
    matrix = np.empty((len(df), len(order)), dtype=np.float64)
    for column, feature_id in enumerate(order):
        feature = index[feature_id]
        matrix[:, column] = [encode_value(feature, raw) for raw in df[feature_id].to_numpy()]
    if not np.all(np.isfinite(matrix)):
        raise SchemaMismatchError(["encoded probe matrix contains non-finite values"])
    return matrix


def _target_labels(df: pd.DataFrame, order: list[str]) -> dict[str, np.ndarray]:
    labels: dict[str, np.ndarray] = {}
    problems: list[str] = []
    for target in load_targets()["targets"]:
        target_id = target["id"]
        column = target["labelColumn"]
        positive = target["labelValues"]["positive"]
        negative = target["labelValues"]["negative"]
        if column in order:
            problems.append(f"label column {column!r} is a model feature")
            continue
        if column not in df.columns:
            problems.append(f"label column {column!r} is missing from the dataset")
            continue
        if int(df[column].isna().sum()) != 0:
            problems.append(f"label column {column!r} contains missing values")
            continue
        observed = {str(value) for value in df[column].unique()}
        if observed != {positive, negative}:
            problems.append(
                f"label column {column!r} holds {sorted(observed)}, expected {[positive, negative]}"
            )
            continue
        labels[target_id] = (df[column] == positive).astype(np.int64).to_numpy()
    if problems:
        raise SchemaMismatchError(problems)
    absent = [target_id for target_id in TARGET_IDS if target_id not in labels]
    if absent:
        raise SchemaMismatchError([f"missing labels for targets: {absent}"])
    return labels


def _prepare(df: pd.DataFrame) -> tuple[np.ndarray, dict[str, np.ndarray], list[str]]:
    """Schema-gate the frame, then encode X (registry order) and the labels."""
    if not isinstance(df, pd.DataFrame):
        raise SchemaMismatchError(["leakage lab expects a pandas DataFrame"])
    validate_dataset(df)
    order = _feature_order()
    X = _encoded_matrix(df, order)
    labels = _target_labels(df, order)
    return X, labels, order


def _smote(
    X: np.ndarray, y: np.ndarray, *, k: int, rng: np.random.Generator
) -> tuple[np.ndarray, np.ndarray]:
    """Minimal deterministic SMOTE: k-NN interpolation on the minority class only.

    Applied exclusively to a training partition (honest probe) or once to the
    full frame before splitting (the deliberately flawed smote-before-cv probe).
    ``imbalanced-learn`` is intentionally not used; this is ~25 lines with a
    seeded PCG64 generator, so identical calls reproduce identical rows.
    """
    classes, counts = np.unique(y, return_counts=True)
    if classes.size != 2:
        raise SchemaMismatchError([f"SMOTE needs exactly two classes, observed {classes.size}"])
    majority = classes[int(np.argmax(counts))]
    minority = classes[int(np.argmin(counts))]
    X_majority = X[y == majority]
    X_minority = X[y == minority]
    need = int(X_majority.shape[0] - X_minority.shape[0])
    if need <= 0 or X_minority.shape[0] < 2:
        return X, y
    neighbours = min(k, int(X_minority.shape[0]) - 1)
    squared = np.einsum("ij,ij->i", X_minority, X_minority)
    distances = squared[:, None] + squared[None, :] - 2.0 * (X_minority @ X_minority.T)
    np.fill_diagonal(distances, np.inf)
    nearest = np.argsort(distances, axis=1, kind="stable")[:, :neighbours]
    anchors = rng.integers(0, X_minority.shape[0], size=need)
    picks = rng.integers(0, neighbours, size=need)
    partners = nearest[anchors, picks]
    alpha = rng.random((need, 1))
    synthetic = X_minority[anchors] + alpha * (X_minority[partners] - X_minority[anchors])
    X_out = np.vstack([X, synthetic])
    y_out = np.concatenate([y, np.full(need, minority, dtype=y.dtype)])
    return X_out, y_out


def _rf(random_state: int, n_estimators: int) -> RandomForestClassifier:
    return RandomForestClassifier(
        n_estimators=n_estimators, random_state=random_state, n_jobs=1
    )


def _cv_probe(
    X: np.ndarray,
    y: np.ndarray,
    *,
    seed: int,
    n_estimators: int,
    n_folds: int,
    n_repeats: int,
    smote_mode: str,
) -> dict[str, float]:
    """Repeated stratified CV returning mean accuracy and mean ROC-AUC.

    ``smote_mode`` is ``"inside"`` (resample each training fold only),
    ``"once"`` (resample the full matrix before any split — deliberately
    flawed) or ``"none"`` (no resampling).
    """
    if smote_mode == "once":
        X_fit, y_fit = _smote(
            X, y, k=SMOTE_K, rng=_rng(seed, _STREAM_SMOTE_ONCE, 0)
        )
    elif smote_mode in {"inside", "none"}:
        X_fit, y_fit = X, y
    else:
        raise SchemaMismatchError([f"unknown SMOTE mode {smote_mode!r}"])

    accuracies: list[float] = []
    aucs: list[float] = []
    for repeat in range(n_repeats):
        splitter = StratifiedKFold(
            n_splits=n_folds,
            shuffle=True,
            random_state=_derive(seed, _STREAM_CV_SPLITS, repeat),
        )
        for fold, (train, test) in enumerate(splitter.split(X_fit, y_fit)):
            X_train, y_train = X_fit[train], y_fit[train]
            if smote_mode == "inside":
                X_train, y_train = _smote(
                    X_train,
                    y_train,
                    k=SMOTE_K,
                    rng=_rng(seed, _STREAM_SMOTE_INSIDE, repeat * n_folds + fold),
                )
            model = _rf(
                _derive(seed, _STREAM_CV_FITS, repeat * n_folds + fold), n_estimators
            )
            model.fit(X_train, y_train)
            probabilities = model.predict_proba(X_fit[test])
            positive_column = int(np.flatnonzero(model.classes_ == 1)[0])
            predictions = model.predict(X_fit[test])
            accuracies.append(float(accuracy_score(y_fit[test], predictions)))
            aucs.append(float(roc_auc_score(y_fit[test], probabilities[:, positive_column])))
    return {"accuracy": float(np.mean(accuracies)), "rocAuc": float(np.mean(aucs))}


def _select_features(X: np.ndarray, y: np.ndarray, *, k: int) -> np.ndarray:
    """Top-k ANOVA F-scores. Caller decides WHEN this runs (before split = leak)."""
    with np.errstate(invalid="ignore", divide="ignore"):
        scores = f_classif(X, y)[0]
    scores = np.nan_to_num(scores, nan=-np.inf, posinf=0.0)
    ranked = np.argsort(scores, kind="stable")[::-1]
    chosen = np.sort(ranked[: min(k, X.shape[1])])
    if chosen.size == 0:
        raise SchemaMismatchError(["feature selection produced no columns"])
    return chosen


def _seed_probe(
    X: np.ndarray,
    y: np.ndarray,
    *,
    seed: int,
    n_estimators: int,
    n_splits: int,
) -> dict[str, float]:
    """Accuracy over ``n_splits`` random 80/20 stratified splits: min/median/max."""
    accuracies: list[float] = []
    for index in range(n_splits):
        splitter = StratifiedShuffleSplit(
            n_splits=1,
            test_size=SEED_TEST_FRACTION,
            random_state=_derive(seed, _STREAM_CV_SPLITS, index),
        )
        train, test = next(splitter.split(X, y))
        model = _rf(_derive(seed, _STREAM_CV_FITS, index), n_estimators)
        model.fit(X[train], y[train])
        predictions = model.predict(X[test])
        accuracies.append(float(accuracy_score(y[test], predictions)))
    values = np.asarray(accuracies, dtype=np.float64)
    return {
        "accuracyMin": float(values.min()),
        "accuracyMedian": float(np.median(values)),
        "accuracyMax": float(values.max()),
    }


def _vessel_label_matrix(df: pd.DataFrame) -> np.ndarray:
    """LAD/LCX/RCA label columns as 0/1 floats — target-leakage probe ONLY.

    INV-C07 holds everywhere except inside the quarantined target-leakage
    probe; this helper is called from exactly one place.
    """
    columns: list[np.ndarray] = []
    for target in load_targets()["targets"]:
        if target["id"] not in LEAKED_VESSEL_IDS:
            continue
        column = target["labelColumn"]
        positive = target["labelValues"]["positive"]
        negative = target["labelValues"]["negative"]
        if column not in df.columns:
            raise SchemaMismatchError([f"leakage probe column {column!r} missing"])
        if int(df[column].isna().sum()) != 0:
            raise SchemaMismatchError([f"leakage probe column {column!r} has missing values"])
        observed = {str(value) for value in df[column].unique()}
        if observed != {positive, negative}:
            raise SchemaMismatchError(
                [f"leakage probe column {column!r} holds {sorted(observed)}"]
            )
        columns.append((df[column] == positive).astype(np.float64).to_numpy())
    if len(columns) != len(LEAKED_VESSEL_IDS):
        raise SchemaMismatchError(
            [f"leakage probe expected {len(LEAKED_VESSEL_IDS)} vessel columns, got {len(columns)}"]
        )
    return np.column_stack(columns)


def _cv_entry(
    probe_id: str,
    protocol: str,
    metrics: dict[str, dict[str, float]],
    *,
    inflated: bool,
    note: str,
) -> dict:
    return {
        "id": probe_id,
        "label": PROBE_LABEL,
        "modelFamily": MODEL_FAMILY,
        "protocol": protocol,
        "metrics": metrics,
        "inflated": inflated,
        "note": note,
    }


def _build_lab(
    df: pd.DataFrame,
    *,
    seed: int,
    n_estimators: int,
    n_folds: int,
    n_repeats: int,
    n_seed_splits: int,
) -> dict:
    X, labels, _order = _prepare(df)

    honest_metrics: dict[str, dict[str, float]] = {}
    smote_metrics: dict[str, dict[str, float]] = {}
    selection_metrics: dict[str, dict[str, float]] = {}
    for target_index, target_id in enumerate(TARGET_IDS):
        y = labels[target_id]
        honest_metrics[target_id] = _cv_probe(
            X,
            y,
            seed=_derive(seed, _STREAM_HONEST, target_index),
            n_estimators=n_estimators,
            n_folds=n_folds,
            n_repeats=n_repeats,
            smote_mode="inside",
        )
        smote_metrics[target_id] = _cv_probe(
            X,
            y,
            seed=_derive(seed, _STREAM_SMOTE_BEFORE, target_index),
            n_estimators=n_estimators,
            n_folds=n_folds,
            n_repeats=n_repeats,
            smote_mode="once",
        )
        selected = _select_features(X, y, k=FEATURE_SELECTION_K)
        selection_metrics[target_id] = _cv_probe(
            X[:, selected],
            y,
            seed=_derive(seed, _STREAM_FEATURE_SELECTION, target_index),
            n_estimators=n_estimators,
            n_folds=n_folds,
            n_repeats=n_repeats,
            smote_mode="none",
        )

    leaked_X = np.hstack([X, _vessel_label_matrix(df)])
    target_leakage_metrics = {
        "CAD": _cv_probe(
            leaked_X,
            labels["CAD"],
            seed=_derive(seed, _STREAM_TARGET_LEAKAGE, 0),
            n_estimators=n_estimators,
            n_folds=n_folds,
            n_repeats=n_repeats,
            smote_mode="inside",
        )
    }

    seed_metrics: dict[str, dict[str, float]] = {}
    for target_index, target_id in enumerate(TARGET_IDS):
        seed_metrics[target_id] = _seed_probe(
            X,
            labels[target_id],
            seed=_derive(seed, _STREAM_SEED_SENSITIVITY, target_index),
            n_estimators=n_estimators,
            n_splits=n_seed_splits,
        )

    honest_protocol = (
        f"{n_folds}-fold × {n_repeats} repeated stratified CV, SMOTE applied INSIDE training "
        f"folds only; probe random forest n_estimators={n_estimators}, hyperparameters fixed a "
        "priori, no tuning; each target stratified on its own label."
    )
    smote_protocol = (
        f"SMOTE applied once to the FULL dataset BEFORE any split, then {n_folds}-fold × "
        f"{n_repeats} repeated stratified CV; probe random forest n_estimators={n_estimators}. "
        "Synthetic rows built from the whole dataset cross the split boundary."
    )
    selection_protocol = (
        f"top-{FEATURE_SELECTION_K} ANOVA-F feature selection fitted on the FULL dataset BEFORE "
        f"any split, then {n_folds}-fold × {n_repeats} repeated stratified CV with a plain probe "
        f"RF n_estimators={n_estimators} (no resampling); the ranking saw every row's label."
    )
    target_leakage_protocol = (
        "LAD/LCX/RCA included as CAD inputs — intentionally leaky; "
        f"{n_folds}-fold × {n_repeats} repeated stratified CV on CAD, SMOTE applied INSIDE "
        "training folds only, otherwise identical to the honest probe. Quarantined: the only "
        "place forbidden columns enter a feature matrix."
    )
    seed_protocol = (
        f"{n_seed_splits} random 80/20 splits, per-target stratification on that target's own "
        f"label; plain probe RF n_estimators={n_estimators}, no resampling; accuracy "
        "min/median/max across split seeds."
    )

    probes: list[dict] = []
    for probe_id, protocol, metrics, inflated, note in (
        ("honest-inside-fold", honest_protocol, honest_metrics, False, _HONEST_NOTE),
        ("smote-before-cv", smote_protocol, smote_metrics, True, _SMOTE_NOTE),
        (
            "feature-selection-before-cv",
            selection_protocol,
            selection_metrics,
            True,
            _FEATURE_SELECTION_NOTE,
        ),
    ):
        entry = _cv_entry(probe_id, protocol, metrics, inflated=inflated, note=note)
        probes.append(entry)
    probes.append(
        {
            "id": "target-leakage",
            "label": PROBE_LABEL,
            "protocol": target_leakage_protocol,
            "metrics": target_leakage_metrics,
            "inflated": True,
        }
    )
    probes.append(
        {
            "id": "seed-sensitivity",
            "label": PROBE_LABEL,
            "protocol": seed_protocol,
            "metrics": seed_metrics,
        }
    )

    return {
        "label": LAB_LABEL,
        "kind": LAB_KIND,
        "excludedColumns": _excluded_columns(),
        "probes": probes,
        "explanation": _EXPLANATION,
    }


def run_leakage_lab(df, seed: int = 411) -> dict:
    """Frozen cross-unit interface consumed by ``pipeline.reproduce.py``.

    ``seed`` is positional-or-keyword so both ``run_leakage_lab(df, seed=411)``
    and ``run_leakage_lab(df, 411)`` work. Returns the C-04 ``leakageLab``
    dict; performs no file I/O and is deterministic for a given seed.
    """
    return _build_lab(
        df,
        seed=int(seed),
        n_estimators=RF_N_ESTIMATORS,
        n_folds=CV_FOLDS,
        n_repeats=CV_REPEATS,
        n_seed_splits=SEED_SPLITS,
    )


def _run_leakage_lab_reduced(df, seed: int = 411) -> dict:
    """Internal reduced-cost helper for tests: identical shape, tiny parameters.

    Injects ``n_estimators`` / ``n_folds`` / ``n_repeats`` / ``n_seed_splits``
    through the same code path as :func:`run_leakage_lab`, so determinism and
    structure tests run in seconds instead of minutes.
    """
    return _build_lab(
        df,
        seed=int(seed),
        n_estimators=_REDUCE_N_ESTIMATORS,
        n_folds=_REDUCE_FOLDS,
        n_repeats=_REDUCE_REPEATS,
        n_seed_splits=_REDUCE_SEED_SPLITS,
    )
