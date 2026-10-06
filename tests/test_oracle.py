"""Runtime-form oracle (``pipeline.oracle``) — C-03 evaluation / C-08 explanation.

Evidence produced here (mission D):

* **Import purity** — a fresh interpreter importing only ``pipeline.oracle``
  must not have ``xgboost``/``sklearn``/``joblib``/``shap`` in ``sys.modules``.
* **Runtime-form vs training-library equality** — ≥50 inputs (60 shipped
  background rows + 8 cohort rows + split-threshold boundary rows) comparing
  the oracle's raw ensemble margins against
  ``pipeline.train.ensemble_raw_margin``, plus the masked value function
  against ``pipeline.validate.ladder_margins``; tolerance 1e-5 (C-06).
* Decision-band semantics, abstention mapping, reliability *lookup* (never
  computed), headline CAD coherence when a vessel exceeds CAD, missing-evidence
  invariance, efficiency residual ≤1e-6, aggregation reconciliation, range
  flags, typed finite-output failure (C-07 ``NONFINITE_INPUT``), float32
  transport and byte determinism.
"""

from __future__ import annotations

import json
import math
import subprocess
import sys
from pathlib import Path

import joblib
import numpy as np
import pytest

from pipeline.config import feature_list, load_registry
from pipeline.encode import decode_value
from pipeline.errors import EncodingError, ForbiddenInputError
from pipeline.oracle import (
    CAVEATS,
    CONTRACT_TARGETS,
    Oracle,
    OracleError,
    c07_error_code,
    decide_state,
)
from pipeline.prepare import prepare_dataset
from pipeline.shap_exact import ShapExactError

pytestmark = pytest.mark.blocking

ROOT = Path(__file__).resolve().parents[1]
LIBRARY_TOLERANCE = 1e-5
EFFICIENCY_TOLERANCE = 1e-6
RECONCILIATION_TOLERANCE = 1e-9
COHORT_ROW_INDEX = (0, 23, 47, 71, 96, 144, 187, 251)


@pytest.fixture(scope="module")
def oracle() -> Oracle:
    if not (ROOT / "model.json").is_file():
        pytest.fail("model.json missing — run `python -m pipeline.export_model` first")
    return Oracle.load()


@pytest.fixture(scope="module")
def model_doc() -> dict:
    return json.loads((ROOT / "model.json").read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def registry() -> dict:
    return load_registry()


@pytest.fixture(scope="module")
def prepared():
    return prepare_dataset()


@pytest.fixture(scope="module")
def deployed() -> dict:
    path = ROOT / "pipeline" / "artifacts" / "deployed_model.joblib"
    if not path.is_file():
        pytest.fail("deployed_model.joblib missing — run `python -m pipeline.export_model`")
    return joblib.load(path)


@pytest.fixture(scope="module")
def background(model_doc: dict) -> np.ndarray:
    return np.asarray(model_doc["background"]["rows"], dtype=np.float64)


def _all_observed(oracle: Oracle) -> np.ndarray:
    return np.ones(oracle.n_features, dtype=bool)


def _cohort_rows(prepared) -> np.ndarray:
    return prepared.X[list(COHORT_ROW_INDEX)]


def _boundary_rows(model_doc: dict, background: np.ndarray) -> list[np.ndarray]:
    """Rows sitting exactly on (and one float step either side of) split thresholds."""
    thresholds: list[tuple[int, float]] = []
    seen: set[tuple[int, float]] = set()
    for entry in model_doc["components"]["CAD"]["trees"]["trees"][:24]:
        for node in entry["nodes"]:
            if node.get("leaf") is None:
                key = (int(node["featureIndex"]), float(node["threshold"]))
                if key not in seen:
                    seen.add(key)
                    thresholds.append(key)
    rows: list[np.ndarray] = []
    base = background[0].copy()
    for position, threshold in thresholds[:4]:
        below = base.copy()
        below[position] = float(np.nextafter(threshold, -math.inf))
        exact = base.copy()
        exact[position] = threshold
        above = base.copy()
        above[position] = float(np.nextafter(threshold, math.inf))
        rows.extend([below, exact, above])
    assert len(rows) >= 12, "split-threshold boundary rows were not produced"
    return rows


def _modality_mask(registry: dict, modalities: set[str]) -> np.ndarray:
    return np.array(
        [feature["modality"] in modalities for feature in registry["features"]],
        dtype=bool,
    )


def _decode_row(prepared, row_index: int) -> dict[str, object]:
    defs = feature_list()
    row = prepared.X[row_index]
    return {
        feature["id"]: decode_value(feature, float(row[position]))
        for position, feature in enumerate(defs)
    }


# ----------------------------------------------------------------- purity


def test_importing_the_oracle_never_loads_the_training_library() -> None:
    code = (
        "import sys\n"
        "import pipeline.oracle\n"
        "banned = {'xgboost', 'sklearn', 'joblib', 'shap'}\n"
        "loaded = sorted(name.split('.')[0] for name in sys.modules if name.split('.')[0] in banned)\n"
        "print('loaded=' + ','.join(loaded))\n"
        "raise SystemExit(1 if loaded else 0)\n"
    )
    result = subprocess.run(
        [sys.executable, "-c", code],
        cwd=ROOT,
        capture_output=True,
        text=True,
        timeout=300,
        check=False,
    )
    assert result.returncode == 0, f"training library leaked into the oracle: {result.stdout}{result.stderr}"
    assert "loaded=" in result.stdout


def test_oracle_never_imports_results_or_metrics() -> None:
    source = (ROOT / "pipeline" / "oracle.py").read_text(encoding="utf-8")
    imports = [
        line for line in source.splitlines() if line.startswith(("import ", "from "))
    ]
    assert not any("metrics" in line for line in imports), imports
    assert not any("results" in line for line in imports), imports


# ------------------------------------------------- runtime form vs library


def test_oracle_raw_margins_match_the_training_library(
    oracle: Oracle, deployed: dict, prepared, background: np.ndarray, model_doc: dict
) -> None:
    from pipeline.train import ensemble_raw_margin

    rows = [background[index] for index in range(background.shape[0])]
    rows.extend(_cohort_rows(prepared))
    rows.extend(_boundary_rows(model_doc, background))
    assert len(rows) >= 50, f"need at least 50 comparison inputs, got {len(rows)}"
    matrix = np.asarray(rows, dtype=np.float64)
    observed = _all_observed(oracle)

    worst = 0.0
    for target_id in CONTRACT_TARGETS:
        library = ensemble_raw_margin(
            deployed["targets"][target_id]["xgb"],
            deployed["targets"][target_id]["lr"],
            matrix,
        )
        for position in range(matrix.shape[0]):
            oracle_margin = oracle.raw_margin(target_id, matrix[position], observed)
            worst = max(worst, abs(oracle_margin - float(library[position])))
    print(f"[oracle-vs-library] {matrix.shape[0]} rows x 4 targets, max|diff| = {worst:.3e}")
    assert worst <= LIBRARY_TOLERANCE


def test_oracle_probabilities_match_the_training_library(
    oracle: Oracle, deployed: dict, prepared, background: np.ndarray, model_doc: dict
) -> None:
    from pipeline.train import ensemble_raw_margin

    rows = [background[index] for index in (3, 17, 41)]
    rows.extend(_cohort_rows(prepared))
    rows.extend(_boundary_rows(model_doc, background)[:3])
    observed = _all_observed(oracle)

    worst = 0.0
    for row in rows:
        evaluation = oracle.evaluate(row, observed)
        for target_id in CONTRACT_TARGETS:
            library_margin = float(
                ensemble_raw_margin(
                    deployed["targets"][target_id]["xgb"],
                    deployed["targets"][target_id]["lr"],
                    np.asarray(row, dtype=np.float64).reshape(1, -1),
                )[0]
            )
            platt = deployed["targets"][target_id]["platt"]
            z = float(platt["slope"]) * library_margin + float(platt["intercept"])
            library_probability = float(1.0 / (1.0 + math.exp(-z)))
            worst = max(
                worst,
                abs(evaluation["targets"][target_id]["probability"] - library_probability),
            )
    print(f"[oracle-vs-library] probabilities, max|diff| = {worst:.3e}")
    assert worst <= LIBRARY_TOLERANCE


def test_masked_value_function_matches_the_library_ladder(
    oracle: Oracle, deployed: dict, prepared, background: np.ndarray, registry: dict
) -> None:
    from pipeline.validate import ladder_margins

    masks = {
        "history-only": _modality_mask(registry, {"history"}),
        "stage-exam": _modality_mask(registry, {"history", "exam"}),
        "alternating": np.arange(oracle.n_features) % 3 == 0,
    }
    rows = _cohort_rows(prepared)

    worst = 0.0
    for mask in masks.values():
        for row in rows:
            oracle_margins = oracle.raw_margins(row, mask)
            for target_id in CONTRACT_TARGETS:
                library = ladder_margins(
                    deployed["targets"][target_id]["xgb"],
                    deployed["targets"][target_id]["lr"],
                    row.reshape(1, -1),
                    background,
                    mask,
                )[0]
                worst = max(worst, abs(oracle_margins[target_id] - float(library)))
    print(f"[oracle-vs-library] masked value function, max|diff| = {worst:.3e}")
    assert worst <= LIBRARY_TOLERANCE


# ------------------------------------------------------------- evaluation


def test_evaluation_payload_shape_and_target_order(oracle: Oracle, prepared) -> None:
    evaluation = oracle.evaluate(prepared.X[0], _all_observed(oracle))
    assert list(evaluation) == ["observedFeatureIds", "targets", "headlineCad", "rangeFlags"]
    assert list(evaluation["targets"]) == list(CONTRACT_TARGETS)
    assert evaluation["observedFeatureIds"] == list(oracle.feature_ids)
    headline = evaluation["headlineCad"]
    assert set(headline) == {
        "probability",
        "valueSourceTargetId",
        "decisionReferenceTargetId",
        "decision",
        "reliability",
        "thresholdProbability",
        "explanationSourceTargetId",
    }
    assert headline["decisionReferenceTargetId"] == "CAD"
    assert headline["probability"] == pytest.approx(
        max(evaluation["targets"][tid]["probability"] for tid in CONTRACT_TARGETS), abs=0.0
    )
    for target_id in CONTRACT_TARGETS:
        target = evaluation["targets"][target_id]
        assert target["targetId"] == target_id
        assert 0.0 < target["probability"] < 1.0
        assert target["decision"] in {"above", "below", "indeterminate"}
        assert target["reliability"] in {"strong", "moderate", "limited"}
        abstention = target["abstention"]
        assert abstention["lowerProbability"] < target["thresholdProbability"]
        assert target["thresholdProbability"] < abstention["upperProbability"]
        assert abstention["halfWidthMargin"] > 0.0


def test_decision_band_edges_are_indeterminate() -> None:
    assert decide_state(0.0, 0.0, 1.0) == "indeterminate"
    assert decide_state(1.0, 0.0, 1.0) == "indeterminate"
    assert decide_state(-1.0, 0.0, 1.0) == "indeterminate"
    assert decide_state(math.nextafter(1.0, math.inf), 0.0, 1.0) == "above"
    assert decide_state(math.nextafter(-1.0, -math.inf), 0.0, 1.0) == "below"
    assert decide_state(2.5, 0.0, 1.0) == "above"
    assert decide_state(-2.5, 0.0, 1.0) == "below"


def test_abstention_probabilities_map_the_raw_margin_band(
    oracle: Oracle, model_doc: dict
) -> None:
    for target_id in CONTRACT_TARGETS:
        parameters = model_doc["decisionParameters"][target_id]
        platt = model_doc["components"][target_id]["platt"]
        threshold = float(parameters["thresholdProbability"])
        half_width = float(parameters["abstentionHalfWidthMargin"])
        threshold_margin = (math.log(threshold / (1.0 - threshold)) - float(platt["intercept"])) / float(
            platt["slope"]
        )
        lower = 1.0 / (1.0 + math.exp(-(float(platt["slope"]) * (threshold_margin - half_width) + float(platt["intercept"]))))
        upper = 1.0 / (1.0 + math.exp(-(float(platt["slope"]) * (threshold_margin + half_width) + float(platt["intercept"]))))
        band = oracle._decisions[target_id]
        assert band["thresholdMargin"] == pytest.approx(threshold_margin, abs=1e-12)
        assert band["lowerProbability"] == pytest.approx(lower, abs=1e-12)
        assert band["upperProbability"] == pytest.approx(upper, abs=1e-12)
        assert lower < threshold < upper


def test_reliability_is_looked_up_and_never_case_dependent(
    oracle: Oracle, prepared, model_doc: dict
) -> None:
    observed = _all_observed(oracle)
    first = oracle.evaluate(prepared.X[0], observed)
    blank = oracle.evaluate(np.zeros(oracle.n_features), np.zeros(oracle.n_features, dtype=bool))
    for target_id in CONTRACT_TARGETS:
        assert first["targets"][target_id]["reliability"] == blank["targets"][target_id]["reliability"]
    reference = {
        entry["targetId"]: entry["tier"] for entry in model_doc["reliabilityReferences"]
    }
    assert all(
        first["targets"][target_id]["reliability"] == reference[target_id]
        for target_id in CONTRACT_TARGETS
    )

    mutated = json.loads(json.dumps(model_doc))
    for entry in mutated["reliabilityReferences"]:
        if entry["targetId"] == "LAD":
            entry["tier"] = "limited"
    rebuilt = Oracle(mutated)
    assert rebuilt.evaluate(prepared.X[0], observed)["targets"]["LAD"]["reliability"] == "limited"
    assert first["targets"]["LAD"]["reliability"] == reference["LAD"]


def test_headline_uses_the_vessel_that_exceeds_cad(
    oracle: Oracle, prepared, registry: dict
) -> None:
    observed = _all_observed(oracle)
    reference_entry = {
        entry["id"]: entry for entry in load_registry()["targets"]
    }
    hit: dict | None = None
    for row_index in range(prepared.X.shape[0]):
        evaluation = oracle.evaluate(prepared.X[row_index], observed)
        headline = evaluation["headlineCad"]
        if headline["valueSourceTargetId"] != "CAD":
            hit = evaluation
            break
    assert hit is not None, "no cohort row puts a vessel above CAD (coverage: vessel-above-CAD)"

    headline = hit["headlineCad"]
    source = headline["valueSourceTargetId"]
    cad = hit["targets"]["CAD"]
    assert source != "CAD"
    assert reference_entry[source]["kind"] == "vessel"
    assert headline["explanationSourceTargetId"] == source
    assert headline["probability"] == hit["targets"][source]["probability"]
    assert headline["decision"] == cad["decision"]
    assert headline["reliability"] == cad["reliability"]
    assert headline["thresholdProbability"] == cad["thresholdProbability"]
    assert headline["decisionReferenceTargetId"] == "CAD"


def test_stage_mask_matches_the_registry_modalities(
    oracle: Oracle, prepared, registry: dict
) -> None:
    stage = next(entry for entry in registry["stages"] if entry["id"] == "exam")
    mask = _modality_mask(registry, set(stage["modalitiesThrough"]))
    evaluation = oracle.evaluate(prepared.X[5], mask)
    expected = [
        feature["id"]
        for feature in registry["features"]
        if feature["modality"] in set(stage["modalitiesThrough"])
    ]
    assert evaluation["observedFeatureIds"] == expected


def test_source_space_round_trip_matches_the_vector_path(oracle: Oracle, prepared) -> None:
    values = _decode_row(prepared, 12)
    via_case = oracle.evaluate_case(values)
    via_vector = oracle.evaluate(prepared.X[12], _all_observed(oracle))
    assert json.dumps(via_case, sort_keys=True) == json.dumps(via_vector, sort_keys=True)


# ------------------------------------------------------------ missingness


def test_blank_case_is_the_background_reference(oracle: Oracle) -> None:
    provided = {fid: False for fid in oracle.feature_ids}
    evaluation = oracle.evaluate_case({}, provided)
    defaults = oracle.evaluate(
        np.zeros(oracle.n_features, dtype=np.float64),
        np.zeros(oracle.n_features, dtype=bool),
    )
    assert evaluation == defaults, "blank defaults must not affect inference"
    assert evaluation["observedFeatureIds"] == []
    explanation = oracle.explain_case({}, provided, "CAD")
    assert explanation["featureAttributions"] == []
    assert explanation["displayGroups"] == []
    assert explanation["modalityContributions"] == []
    assert explanation["efficiencyResidual"] == pytest.approx(0.0, abs=1e-12)
    assert explanation["referenceMargin"] == pytest.approx(explanation["outputMargin"], abs=1e-12)


def test_fully_observed_shortcut_equals_the_background_mean(
    oracle: Oracle, prepared, background: np.ndarray
) -> None:
    case, observed = oracle._coerce(prepared.X[15], _all_observed(oracle))
    repeated = np.tile(case, (background.shape[0], 1))
    for target_id in CONTRACT_TARGETS:
        via_rows = oracle._mean_raw_margin(target_id, repeated)
        via_shortcut = oracle.raw_margin(target_id, prepared.X[15], observed)
        assert abs(via_rows - via_shortcut) <= 1e-12


def test_unprovided_values_never_reach_inference(oracle: Oracle, prepared) -> None:
    mask = np.zeros(oracle.n_features, dtype=bool)
    mask[[0, 4, 9, 20]] = True
    clean = np.zeros(oracle.n_features, dtype=np.float64)
    clean[mask] = prepared.X[8][mask]
    dirty = np.full(oracle.n_features, 1e9, dtype=np.float64)
    dirty[~mask] = np.nan
    dirty[mask] = prepared.X[8][mask]

    assert oracle.evaluate(clean, mask) == oracle.evaluate(dirty, mask)

    explanation = oracle.explain(dirty, mask, "CAD")
    shown = {item["featureId"] for item in explanation["featureAttributions"]}
    assert shown == {oracle.feature_ids[index] for index in np.flatnonzero(mask)}
    for group in explanation["displayGroups"]:
        assert group["memberFeatureIds"], "an emitted group must declare its members"
        assert set(group["memberFeatureIds"]) & shown, "an emitted group needs an observed member"


def test_explanations_reconcile_and_satisfy_efficiency(
    oracle: Oracle, prepared, registry: dict
) -> None:
    masks = [
        _all_observed(oracle),
        _modality_mask(registry, {"history", "exam"}),
        np.arange(oracle.n_features) % 4 == 1,
    ]
    worst_residual = 0.0
    worst_gap = 0.0
    for mask in masks:
        for target_id in CONTRACT_TARGETS:
            explanation = oracle.explain(prepared.X[31], mask, target_id)
            worst_residual = max(worst_residual, abs(explanation["efficiencyResidual"]))
            feature_sum = sum(item["contribution"] for item in explanation["featureAttributions"])
            group_sum = sum(item["contribution"] for item in explanation["displayGroups"])
            modality_sum = sum(
                item["contribution"] for item in explanation["modalityContributions"]
            )
            worst_gap = max(
                worst_gap,
                abs(feature_sum - group_sum),
                abs(feature_sum - modality_sum),
            )
            assert explanation["targetId"] == target_id
            assert explanation["caveats"] == list(CAVEATS)
    print(
        f"[explanations] max|efficiency residual| = {worst_residual:.3e}, "
        f"max aggregation gap = {worst_gap:.3e}"
    )
    assert worst_residual <= EFFICIENCY_TOLERANCE
    assert worst_gap <= RECONCILIATION_TOLERANCE


def test_output_margin_equals_the_target_evaluation(
    oracle: Oracle, prepared
) -> None:
    observed = _all_observed(oracle)
    evaluation = oracle.evaluate(prepared.X[64], observed)
    for target_id in CONTRACT_TARGETS:
        explanation = oracle.explain(prepared.X[64], observed, target_id)
        assert explanation["outputMargin"] == pytest.approx(
            evaluation["targets"][target_id]["calibratedMargin"], abs=1e-12
        )


# ------------------------------------------------------------ range / encode


def test_range_flags_are_informational_only(oracle: Oracle) -> None:
    values = _decode_row_values(oracle)
    values["Age"] = 10.0
    evaluation = oracle.evaluate_case(values)
    assert evaluation["rangeFlags"]["Age"] is True
    assert evaluation["rangeFlags"]["BBB"] is False

    provided = {fid: fid != "Age" for fid in oracle.feature_ids}
    masked = oracle.evaluate_case(
        {fid: value for fid, value in values.items() if fid != "Age"}, provided
    )
    assert masked["rangeFlags"]["Age"] is False


def _decode_row_values(oracle: Oracle) -> dict[str, object]:
    defs = feature_list()
    row = np.zeros(oracle.n_features, dtype=np.float64)
    values = {}
    for position, feature in enumerate(defs):
        sample = row[position]
        values[feature["id"]] = decode_value(feature, float(sample))
    return values


def test_non_finite_input_fails_loudly_with_a_c07_code(oracle: Oracle) -> None:
    values = _decode_row_values(oracle)
    values["Age"] = "NaN"
    with pytest.raises(EncodingError) as excinfo:
        oracle.evaluate_case(values)
    assert c07_error_code(excinfo.value) == "NONFINITE_INPUT"
    assert "NaN" not in str(excinfo.value)


def test_c07_error_code_mapping() -> None:
    assert c07_error_code(OracleError("x", code="NONFINITE_INPUT")) == "NONFINITE_INPUT"
    assert c07_error_code(OracleError("x")) == "ARTIFACT_INVALID"
    assert c07_error_code(ForbiddenInputError("LAD", "target leakage")) == "MALFORMED_REQUEST"
    assert c07_error_code(EncodingError("Age", "non-finite value")) == "NONFINITE_INPUT"
    assert (
        c07_error_code(EncodingError("Sex", "unknown categorical level"))
        == "INVALID_FEATURE_VECTOR"
    )
    assert c07_error_code(ShapExactError("malformed tree")) == "ARTIFACT_INVALID"
    assert c07_error_code(ValueError("boom")) == "INTERNAL_COMPUTE_FAILURE"


def test_invalid_vectors_and_masks_are_typed_errors(oracle: Oracle, prepared) -> None:
    vector = prepared.X[0]
    with pytest.raises(OracleError) as short_mask:
        oracle.evaluate(vector, np.ones(oracle.n_features - 1, dtype=bool))
    assert short_mask.value.code == "INVALID_FEATURE_VECTOR"

    with pytest.raises(OracleError) as short_vector:
        oracle.evaluate(vector[:-1], _all_observed(oracle))
    assert short_vector.value.code == "INVALID_FEATURE_VECTOR"

    with pytest.raises(OracleError) as bad_mask:
        oracle.evaluate(vector, np.full(oracle.n_features, 2, dtype=int))
    assert bad_mask.value.code == "INVALID_FEATURE_VECTOR"

    poisoned = vector.copy()
    poisoned[0] = np.nan
    with pytest.raises(OracleError) as non_finite:
        oracle.evaluate(poisoned, _all_observed(oracle))
    assert non_finite.value.code == "NONFINITE_INPUT"

    with pytest.raises(OracleError) as unknown_target:
        oracle.explain(vector, _all_observed(oracle), "LEAD")
    assert unknown_target.value.code == "MALFORMED_REQUEST"


def test_float32_transport_rounds_case_values(oracle: Oracle, prepared) -> None:
    observed = _all_observed(oracle)
    vector = prepared.X[9].copy()
    shifted = vector.copy()
    age_index = list(oracle.feature_ids).index("Age")
    shifted[age_index] = vector[age_index] + 1e-7
    assert oracle.evaluate(vector, observed) == oracle.evaluate(shifted, observed)

    case, mask = oracle._coerce(vector, observed)
    assert np.array_equal(case, vector.astype(np.float32).astype(np.float64))
    assert bool(mask.all())


def test_evaluation_and_explanation_are_deterministic(oracle: Oracle, prepared) -> None:
    observed = _all_observed(oracle)
    vector = prepared.X[77]
    first = json.dumps(oracle.evaluate(vector, observed), sort_keys=True)
    second = json.dumps(oracle.evaluate(vector, observed), sort_keys=True)
    assert first == second

    explained_first = json.dumps(oracle.explain(vector, observed, "RCA"), sort_keys=True)
    explained_second = json.dumps(oracle.explain(vector, observed, "RCA"), sort_keys=True)
    assert explained_first == explained_second
