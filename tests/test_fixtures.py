"""Golden-fixture contract tests (C-06 / Implementation_Plan P3-2).

Recomputes every stored expectation from the validated oracle at C-06
tolerances and pins the artifact bindings: model identity, canonical serial
form, coverage classes, explanation shape and C-07 failure codes.

The heavy test (:func:`test_every_normal_fixture_recomputes`) is the whole
point of the artifact: if the oracle, model.json, registry or generator drift
apart from ``tests/fixtures/golden.json``, this fails before the TypeScript
engine ever sees a stale expectation.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pytest

from pipeline.config import forbidden_ids, load_registry
from pipeline.errors import EncodingError, ForbiddenInputError
from pipeline.oracle import (
    CONTRACT_TARGETS,
    MODEL_PATH,
    Oracle,
    OracleError,
    c07_error_code,
)

pytestmark = pytest.mark.blocking

GOLDEN_PATH = Path(__file__).resolve().parent / "fixtures" / "golden.json"
EXPECTED_MODEL_SHA = "df8ced596d704bc3cd771e0b86c0b28232f28b275433ef4186f7d8df138aac0c"
REQUIRED_TAGS = (
    "fully-observed",
    "blank",
    "modality-masked",
    "cumulative-stage",
    "multi-modality",
    "categorical-levels",
    "split-threshold",
    "float-rounding",
    "threshold-boundary",
    "abstention-edge",
    "vessel-above-CAD",
    "out-of-range",
    "observed-only",
    "finite-output-failure",
)
EXPLANATION_KEYS = {
    "targetId",
    "referenceMargin",
    "outputMargin",
    "efficiencyResidual",
    "featureAttributions",
    "displayGroups",
    "modalityContributions",
    "caveats",
}
TARGET_KEYS = {
    "targetId",
    "probability",
    "calibratedMargin",
    "thresholdProbability",
    "decision",
    "reliability",
    "abstention",
}


@pytest.fixture(scope="module")
def golden_bytes() -> bytes:
    assert GOLDEN_PATH.is_file(), "tests/fixtures/golden.json missing — run make_fixtures"
    return GOLDEN_PATH.read_bytes()


@pytest.fixture(scope="module")
def golden(golden_bytes: bytes) -> dict:
    return json.loads(golden_bytes)


@pytest.fixture(scope="module")
def oracle() -> Oracle:
    return Oracle.load()


def _normal(golden: dict) -> list[dict]:
    return [entry for entry in golden["fixtures"] if "failure" not in entry["expected"]]


def _failures(golden: dict) -> list[dict]:
    return [entry for entry in golden["fixtures"] if "failure" in entry["expected"]]


def _by_id(items: list[dict], key: str) -> dict[str, dict]:
    return {item[key]: item for item in items}


def test_canonical_json_form(golden_bytes: bytes, golden: dict) -> None:
    rebuilt = (
        json.dumps(
            golden, indent=2, sort_keys=True, ensure_ascii=True, allow_nan=False
        )
        + "\n"
    ).encode("utf-8")
    assert rebuilt == golden_bytes, "golden.json is not in canonical serial form"


def test_model_json_sha_is_pinned() -> None:
    digest = hashlib.sha256(MODEL_PATH.read_bytes()).hexdigest()
    assert digest == EXPECTED_MODEL_SHA, (
        "model.json changed — regenerate tests/fixtures/golden.json "
        "(python -m pipeline.make_fixtures) and only then update EXPECTED_MODEL_SHA"
    )


def test_provenance_matches_current_artifacts(golden: dict) -> None:
    model = json.loads(MODEL_PATH.read_text(encoding="utf-8"))
    registry = load_registry()
    provenance = golden["provenance"]
    assert provenance["modelId"] == model["metadata"]["modelId"]
    assert provenance["dataSha256"] == model["provenance"]["dataSha256"]
    assert provenance["registryVersion"] == registry["schemaVersion"]
    assert provenance["generationSeed"] == 606
    assert golden["schemaVersion"] == "1.0.0"


def test_tolerance_matches_c06(golden: dict) -> None:
    assert golden["tolerance"] == {
        "probability": 1e-5,
        "margin": 1e-5,
        "attribution": 1e-5,
        "efficiency": 1e-6,
    }


def test_coverage_classes_are_complete(golden: dict) -> None:
    tags = {tag for entry in golden["fixtures"] for tag in entry["coverageTags"]}
    assert not [tag for tag in REQUIRED_TAGS if tag not in tags]
    normal = _normal(golden)
    assert len(_failures(golden)) >= 1
    assert normal
    for entry in normal:
        assert sorted(entry["expected"]["explanations"]) == sorted(CONTRACT_TARGETS)


def test_fixture_entries_have_stable_shape(golden: dict, oracle: Oracle) -> None:
    forbidden = set(forbidden_ids())
    seen_ids: set[str] = set()
    for position, entry in enumerate(golden["fixtures"], start=1):
        assert entry["id"] == f"fixture-{position:03d}"
        assert entry["id"] not in seen_ids
        seen_ids.add(entry["id"])
        assert entry["coverageTags"]
        values = entry["input"]["values"]
        provided = entry["input"]["providedFeatures"]
        assert not (set(values) & forbidden), f"{entry['id']} carries a forbidden column"
        assert sorted(provided) == sorted(oracle.feature_ids)
        if "failure" in entry["expected"]:
            assert set(entry["expected"]) == {"failure"}
            assert set(entry["expected"]["failure"]) == {"code", "featureId"}
            continue
        expected = entry["expected"]
        assert sorted(expected) == ["explanations", "headlineCad", "rangeFlags", "targets"]
        assert sorted(expected["targets"]) == sorted(CONTRACT_TARGETS)
        for target_id in CONTRACT_TARGETS:
            assert set(expected["targets"][target_id]) == TARGET_KEYS
        assert sorted(expected["rangeFlags"]) == sorted(oracle.feature_ids)
        for explanation in expected["explanations"].values():
            assert set(explanation) == EXPLANATION_KEYS


def test_stored_explanations_reconcile(golden: dict) -> None:
    tolerance = golden["tolerance"]
    for entry in _normal(golden):
        provided = entry["input"]["providedFeatures"]
        unprovided = {fid for fid, keep in provided.items() if not keep}
        for target_id, explanation in entry["expected"]["explanations"].items():
            residual = abs(explanation["efficiencyResidual"])
            assert residual <= tolerance["efficiency"], (
                f"{entry['id']}/{target_id} residual {residual:.3e}"
            )
            feature_sum = sum(
                item["contribution"] for item in explanation["featureAttributions"]
            )
            group_sum = sum(item["contribution"] for item in explanation["displayGroups"])
            modality_sum = sum(
                item["contribution"] for item in explanation["modalityContributions"]
            )
            assert abs(feature_sum - group_sum) <= 1e-9
            assert abs(feature_sum - modality_sum) <= 1e-9
            attributed = {item["featureId"] for item in explanation["featureAttributions"]}
            assert not (attributed & unprovided)
            assert explanation["caveats"]


def test_decision_states_are_covered(golden: dict) -> None:
    states = {
        entry["expected"]["targets"][target_id]["decision"]
        for entry in _normal(golden)
        for target_id in CONTRACT_TARGETS
    }
    assert {"above", "below", "indeterminate"} <= states


def test_every_normal_fixture_recomputes(golden: dict, oracle: Oracle) -> None:
    tolerance = golden["tolerance"]
    for entry in _normal(golden):
        values = entry["input"]["values"]
        provided = entry["input"]["providedFeatures"]
        expected = entry["expected"]
        evaluation = oracle.evaluate_case(values, provided)
        assert evaluation["observedFeatureIds"] == [
            fid for fid in oracle.feature_ids if provided[fid]
        ]
        assert evaluation["rangeFlags"] == expected["rangeFlags"]
        assert evaluation["headlineCad"]["valueSourceTargetId"] == expected["headlineCad"][
            "valueSourceTargetId"
        ]
        assert evaluation["headlineCad"]["decision"] == expected["headlineCad"]["decision"]
        assert evaluation["headlineCad"]["reliability"] == expected["headlineCad"][
            "reliability"
        ]
        assert evaluation["headlineCad"]["probability"] == pytest.approx(
            expected["headlineCad"]["probability"], abs=tolerance["probability"]
        )
        for target_id in CONTRACT_TARGETS:
            fresh = evaluation["targets"][target_id]
            stored = expected["targets"][target_id]
            assert fresh["targetId"] == stored["targetId"] == target_id
            assert fresh["decision"] == stored["decision"], entry["id"]
            assert fresh["reliability"] == stored["reliability"]
            assert fresh["probability"] == pytest.approx(
                stored["probability"], abs=tolerance["probability"]
            ), f"{entry['id']}/{target_id}"
            assert fresh["calibratedMargin"] == pytest.approx(
                stored["calibratedMargin"], abs=tolerance["margin"]
            )
            assert fresh["thresholdProbability"] == pytest.approx(
                stored["thresholdProbability"], abs=tolerance["probability"]
            )
            assert fresh["abstention"]["lowerProbability"] == pytest.approx(
                stored["abstention"]["lowerProbability"], abs=tolerance["probability"]
            )
            assert fresh["abstention"]["upperProbability"] == pytest.approx(
                stored["abstention"]["upperProbability"], abs=tolerance["probability"]
            )

            fresh_explanation = oracle.explain_case(values, provided, target_id)
            stored_explanation = expected["explanations"][target_id]
            assert fresh_explanation["targetId"] == target_id
            assert fresh_explanation["caveats"] == stored_explanation["caveats"]
            assert fresh_explanation["referenceMargin"] == pytest.approx(
                stored_explanation["referenceMargin"], abs=tolerance["margin"]
            )
            assert fresh_explanation["outputMargin"] == pytest.approx(
                stored_explanation["outputMargin"], abs=tolerance["margin"]
            )
            assert fresh_explanation["efficiencyResidual"] == pytest.approx(
                stored_explanation["efficiencyResidual"], abs=1e-9
            )
            fresh_by_feature = _by_id(
                fresh_explanation["featureAttributions"], "featureId"
            )
            stored_by_feature = _by_id(
                stored_explanation["featureAttributions"], "featureId"
            )
            assert sorted(fresh_by_feature) == sorted(stored_by_feature)
            for fid, fresh_item in fresh_by_feature.items():
                stored_item = stored_by_feature[fid]
                assert fresh_item["direction"] == stored_item["direction"]
                assert fresh_item["value"] == pytest.approx(
                    stored_item["value"], abs=1e-9
                )
                assert fresh_item["contribution"] == pytest.approx(
                    stored_item["contribution"], abs=tolerance["attribution"]
                )
            for fresh_group, stored_group in zip(
                fresh_explanation["displayGroups"],
                stored_explanation["displayGroups"],
                strict=True,
            ):
                assert fresh_group["groupId"] == stored_group["groupId"]
                assert fresh_group["memberFeatureIds"] == stored_group["memberFeatureIds"]
                assert fresh_group["contribution"] == pytest.approx(
                    stored_group["contribution"], abs=tolerance["attribution"]
                )
            for fresh_modality, stored_modality in zip(
                fresh_explanation["modalityContributions"],
                stored_explanation["modalityContributions"],
                strict=True,
            ):
                assert fresh_modality["modalityId"] == stored_modality["modalityId"]
                assert fresh_modality["memberFeatureIds"] == stored_modality[
                    "memberFeatureIds"
                ]
                assert fresh_modality["contribution"] == pytest.approx(
                    stored_modality["contribution"], abs=tolerance["attribution"]
                )


def test_failure_fixtures_raise_expected_c07_codes(golden: dict, oracle: Oracle) -> None:
    failures = _failures(golden)
    assert failures
    for entry in failures:
        expected = entry["expected"]["failure"]
        with pytest.raises((EncodingError, ForbiddenInputError, OracleError)) as caught:
            oracle.evaluate_case(
                entry["input"]["values"], entry["input"]["providedFeatures"]
            )
        assert c07_error_code(caught.value) == expected["code"], entry["id"]
        feature_id = getattr(caught.value, "feature_id", None) or getattr(
            caught.value, "column_id", None
        )
        assert feature_id == expected["featureId"], entry["id"]


def test_fixture_count_is_stable(golden: dict) -> None:
    assert len(golden["fixtures"]) == 40
