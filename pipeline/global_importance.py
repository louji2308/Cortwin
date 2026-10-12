"""C-04 additive extension (SES-SCORE-01): cohort-level global feature importance.

Global importance is the mean over cohort patients of the absolute exact
Shapley attribution for each of the 54 features, computed with
:mod:`pipeline.shap_exact` against the same 60-row background the runtime
ships in ``model.json`` (deployed background), on the deployed ensemble
serialized through the same C-03 transformation the exporter uses
(``pipeline.export_model.parse_tree`` + ``build_linear_block``).  Attributions
live in raw ensemble-margin (log-odds) space — ``0.5 * (tree + linear)`` —
matching the ``scale`` recorded in ``globalImportanceMeta``.

Transport rule (C-07, mirrored from ``pipeline.oracle``): case rows are
rounded to float32 on entry; background rows stay float64 exactly as the
worker loads them from ``model.json``.

Only cohort-level aggregates are stored (C-04 L176): per-feature means of
``|SHAP|``; no patient-level attribution or prediction ever leaves this
module.  Determinism: tree dumps are a pure function of the fitted booster
(fixed seeds, ``n_jobs=1``); split features are walked in ascending order and
subsets enumerated by bitmask inside ``shap_exact``; the patient sample (used
only when the full pass exceeds the time budget) is a seeded choice from
``np.random.default_rng(411)``.
"""

from __future__ import annotations

import numpy as np

from .errors import PipelineError
from .export_model import build_linear_block, parse_tree
from .shap_exact import DecisionTree, exact_tree_shapley, linear_attributions

METHOD_PREFIX = "mean |SHAP|"
SCALE = "margin (log-odds)"
SAMPLE_SEED = 411
SAMPLE_SIZE = 101
# The full 303-patient exact-SHAP pass measured beyond the agreed ~5-minute
# budget (SES-SCORE-01, 2026-10-12), so the protocol uses a deterministic
# seeded sample.  Honesty rule: ``patients`` in ``globalImportanceMeta`` is
# the ACTUAL number of patients scored and the method string says
# "deterministically sampled".
USE_SAMPLED_PATIENTS = True


def choose_patient_indices(
    n_patients: int, *, sampled: bool = USE_SAMPLED_PATIENTS
) -> tuple[np.ndarray, bool]:
    """Deterministic patient subset for the global-importance pass."""
    if not sampled:
        return np.arange(n_patients, dtype=np.int64), False
    size = min(int(SAMPLE_SIZE), int(n_patients))
    rng = np.random.default_rng(SAMPLE_SEED)
    chosen = np.sort(rng.choice(n_patients, size=size, replace=False))
    return np.asarray(chosen, dtype=np.int64), True


def runtime_target_parts(
    target_id: str,
    xgb_model,
    lr_model,
    feature_order: list[str],
) -> tuple[list[DecisionTree], dict]:
    """Runtime-form trees + linear block for one deployed target (C-03 form)."""
    booster = xgb_model.get_booster()
    dumps = booster.get_dump(dump_format="json")
    if not dumps:
        raise PipelineError(f"target {target_id}: booster has no trees")
    feature_count = len(feature_order)
    trees = [DecisionTree(parse_tree(dump, feature_count)) for dump in dumps]
    linear_block = build_linear_block(lr_model, feature_order)
    return trees, linear_block


def target_mean_abs_shap(
    trees: list[DecisionTree],
    linear_block: dict,
    background: np.ndarray,
    cases: np.ndarray,
) -> np.ndarray:
    """Mean ``|SHAP|`` per feature over the given fully-observed case rows."""
    matrix = np.asarray(cases, dtype=np.float64)
    if matrix.ndim != 2:
        raise PipelineError("global importance needs a 2D case matrix")
    if not np.all(np.isfinite(matrix)):
        raise PipelineError("global importance received non-finite case rows")
    matrix = matrix.astype(np.float32).astype(np.float64)
    background = np.asarray(background, dtype=np.float64)
    background_mean = background.mean(axis=0)
    observed = np.ones(matrix.shape[1], dtype=bool)
    total = np.zeros(matrix.shape[1], dtype=np.float64)
    for row_index in range(matrix.shape[0]):
        case = matrix[row_index]
        phi_tree = exact_tree_shapley(trees, background, case, observed)
        phi_linear = linear_attributions(linear_block, case, observed, background_mean)
        total += np.abs(0.5 * (phi_tree + phi_linear))
    means = total / float(matrix.shape[0])
    if not np.all(np.isfinite(means)):
        raise PipelineError("global importance produced non-finite means")
    return means


def sort_importance(feature_order: list[str], mean_abs_shap: np.ndarray) -> list[dict]:
    """All features sorted by meanAbsShap DESC; ties broken by feature id ASC."""
    values = np.asarray(mean_abs_shap)
    if len(feature_order) != values.shape[0]:
        raise PipelineError("importance width differs from the feature order")
    entries = [
        {"feature": fid, "meanAbsShap": float(value)}
        for fid, value in zip(feature_order, values, strict=True)
    ]
    entries.sort(key=lambda entry: (-entry["meanAbsShap"], entry["feature"]))
    return entries


def build_global_importance(
    feature_matrix: np.ndarray,
    feature_order: list[str],
    background_indices: np.ndarray,
    background_seed: int,
    deployed: dict,
    target_ids: list[str],
) -> tuple[dict, dict]:
    """Compute ``globalImportance`` + ``globalImportanceMeta`` (C-04 additive).

    ``deployed`` maps ``targetId -> (xgb_model, lr_pipeline)`` — the same
    payload reproduce fits.  Returns ``(importance_by_target, meta)`` where
    importance maps each target to its full 54-entry sorted list.
    """
    x = np.asarray(feature_matrix, dtype=np.float64)
    if x.ndim != 2 or x.shape[1] != len(feature_order):
        raise PipelineError("cohort matrix does not match the feature order")
    background_rows = x[np.asarray(background_indices, dtype=np.int64)]
    if not np.all(np.isfinite(background_rows)):
        raise PipelineError("background rows contain non-finite values")
    indices, sampled = choose_patient_indices(x.shape[0])
    cases = x[indices]
    importance: dict[str, list[dict]] = {}
    for target_id in target_ids:
        if target_id not in deployed:
            raise PipelineError(f"global importance: target {target_id} not deployed")
        xgb_model, lr_model = deployed[target_id]
        trees, linear_block = runtime_target_parts(
            target_id, xgb_model, lr_model, feature_order
        )
        means = target_mean_abs_shap(trees, linear_block, background_rows, cases)
        importance[target_id] = sort_importance(feature_order, means)
    method = (
        f"{METHOD_PREFIX} over all {int(x.shape[0])} cohort patients, "
        f"exact Shapley, deployed model"
    )
    if sampled:
        method = (
            f"{METHOD_PREFIX} over {int(cases.shape[0])} of {int(x.shape[0])} cohort "
            f"patients, exact Shapley, deployed model, deterministically sampled "
            f"(seed {SAMPLE_SEED})"
        )
    meta = {
        "method": method,
        "scale": SCALE,
        "patients": int(cases.shape[0]),
        "background": (
            f"{int(background_rows.shape[0])} rows, seed {int(background_seed)} "
            f"(deployed background; the same rows shipped in model.json background.rows)"
        ),
    }
    return importance, meta
