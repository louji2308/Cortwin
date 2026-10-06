"""C-04 results-document schema tests (Contracts §6.1 C-04, VC-04).

Validates the regenerated ``results.json`` artifact against the frozen contract:

* top-level shape, protocol constants, per-target performance/calibration/
  decision blocks with range and internal-consistency checks;
* subgroup, evidence-ladder, RT-1 reliability and provenance blocks;
* ``provenance.dataSha256`` matches ``data/CHECKSUMS.txt``;
* ``leakageLab`` present if and only if ``pipeline.leakage_lab`` exists;
* no NaN/Infinity tokens, no banned patient-level keys, no long float arrays;
* a ``slow``-marked smoke test regenerates the artifact with
  ``python -m pipeline.reproduce`` and re-runs every check on the fresh file.
"""

from __future__ import annotations

import importlib.util
import json
import math
import re
import subprocess
import sys

import pytest

from pipeline.dataset import CANONICAL_CSV, parse_checksums
from pipeline.prepare import SUBGROUP_IDS
from pipeline.validate import registry_stages

pytestmark = pytest.mark.blocking

TARGET_IDS = ("CAD", "LAD", "LCX", "RCA")
SCHEMA_VERSION = "1.0.0"
N_PATIENTS = 303
N_FEATURES = 54
EXPECTED_SUBGROUP_N = {"age_lt60": 162, "age_ge60": 141, "female": 127, "male": 176}
EXPECTED_TIERS = {"CAD": "strong", "LAD": "moderate", "LCX": "limited", "RCA": "limited"}
RATIONALE_BY_TIER = {
    "strong": "ci_low_at_least_0.90_and_uplift_at_least_0.20",
    "moderate": "auc_at_least_0.80_and_uplift_at_least_0.15",
    "limited": "below_moderate_criteria",
}
EXPECTED_TOP_KEYS = {
    "schemaVersion",
    "protocol",
    "performance",
    "calibration",
    "decisions",
    "subgroups",
    "evidenceLadder",
    "reliability",
    "provenance",
}
BANNED_KEYS = {
    "predictions",
    "prediction",
    "patientId",
    "patients",
    "rowIndices",
    "indices",
    "rows",
    "oof",
    "oofPredictions",
}
LONG_ARRAY_LENGTHS = {303, 606, 909}
NON_FINITE_TOKEN = re.compile(r"(?<![\w-])(NaN|Infinity|-Infinity)(?![\w-])")
HEX64 = re.compile(r"^[0-9a-f]{64}$")


def _reject_constant(name: str):
    raise AssertionError(f"results.json contains a non-finite token: {name}")


def load_document(path) -> dict:
    text = path.read_text(encoding="utf-8")
    assert text.endswith("\n"), "results.json must end with a newline"
    return json.loads(text, parse_constant=_reject_constant)


@pytest.fixture(scope="module")
def results_path(repo_root):
    path = repo_root / "results.json"
    assert path.is_file(), (
        "results.json is missing — run `python -m pipeline.reproduce` and commit it"
    )
    return path


@pytest.fixture(scope="module")
def results(results_path):
    return load_document(results_path)


def _is_number(value) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _in_unit(value) -> bool:
    return _is_number(value) and 0.0 <= float(value) <= 1.0


def _check_unit_interval(name: str, value) -> None:
    assert _in_unit(value), f"{name} not in [0, 1]: {value!r}"


def _check_interval(name: str, value) -> None:
    assert (
        _is_number(value) and 0.0 <= float(value) <= 1.0
    ), f"{name} not a probability-scale number: {value!r}"


def check_top_level(doc: dict, repo_root) -> None:
    assert set(doc) == EXPECTED_TOP_KEYS | ({"leakageLab"} if "leakageLab" in doc else set())
    assert doc["schemaVersion"] == SCHEMA_VERSION


def check_protocol(doc: dict, repo_root) -> None:
    protocol = doc["protocol"]
    expected = {
        "patientCount": N_PATIENTS,
        "featureCount": N_FEATURES,
        "outerFolds": 5,
        "outerRepeats": 3,
        "innerFolds": 4,
        "noSmote": True,
        "preprocessingInsideFold": True,
        "calibrationInsideFold": True,
        "thresholdInsideFold": True,
        "abstentionInsideFold": True,
        "stratification": "joint LAD/LCX/RCA 8-pattern",
    }
    for key, value in expected.items():
        assert protocol.get(key) == value, f"protocol.{key}: {protocol.get(key)!r} != {value!r}"
    assert isinstance(protocol.get("ciMethod"), str) and protocol["ciMethod"], "ciMethod empty"


def check_performance(doc: dict, repo_root) -> None:
    performance = doc["performance"]
    assert set(performance) == set(TARGET_IDS)
    for target_id in TARGET_IDS:
        block = performance[target_id]
        assert set(block) == {
            "accuracy",
            "precision",
            "recall",
            "f1",
            "rocAuc",
            "rocAucCI",
            "majorityBaseline",
            "foldAucMean",
            "foldAucSd",
        }
        for key in ("accuracy", "precision", "recall", "f1", "rocAuc", "majorityBaseline", "foldAucMean"):
            _check_unit_interval(f"performance.{target_id}.{key}", block[key])
        interval = block["rocAucCI"]
        assert isinstance(interval, list) and len(interval) == 2, f"{target_id} CI shape"
        _check_interval(f"{target_id} CI low", interval[0])
        _check_interval(f"{target_id} CI high", interval[1])
        assert interval[0] <= interval[1], f"{target_id} CI not ordered"
        assert _is_number(block["foldAucSd"]) and block["foldAucSd"] >= 0.0
        assert 0.0 < block["majorityBaseline"] < 1.0


def check_calibration(doc: dict, repo_root) -> None:
    calibration = doc["calibration"]
    assert set(calibration) == set(TARGET_IDS)
    for target_id in TARGET_IDS:
        block = calibration[target_id]
        assert set(block) == {
            "brierRaw",
            "brierPlatt",
            "baseRateBrier",
            "eceRaw",
            "ecePlatt",
            "reliabilityCurve",
        }
        for key in ("brierRaw", "brierPlatt", "baseRateBrier", "eceRaw", "ecePlatt"):
            _check_unit_interval(f"calibration.{target_id}.{key}", block[key])
        curves = block["reliabilityCurve"]
        assert set(curves) == {"raw", "platt"}
        for curve_name, curve in curves.items():
            assert isinstance(curve, list) and len(curve) == 10, f"{target_id}.{curve_name} bins"
            total = 0
            for index, entry in enumerate(curve):
                assert set(entry) == {
                    "binLower",
                    "binUpper",
                    "meanPredicted",
                    "fractionPositive",
                    "count",
                }
                assert entry["binLower"] == pytest.approx(index / 10)
                assert entry["binUpper"] == pytest.approx((index + 1) / 10)
                _check_unit_interval(f"{target_id}.{curve_name}[{index}].meanPredicted", entry["meanPredicted"])
                _check_unit_interval(
                    f"{target_id}.{curve_name}[{index}].fractionPositive", entry["fractionPositive"]
                )
                assert isinstance(entry["count"], int) and entry["count"] >= 0
                total += entry["count"]
            assert total == N_PATIENTS, f"{target_id}.{curve_name} covers {total} rows"


def check_decisions(doc: dict, repo_root) -> None:
    decisions = doc["decisions"]
    assert set(decisions) == set(TARGET_IDS)
    for target_id in TARGET_IDS:
        block = decisions[target_id]
        assert set(block) == {
            "targetId",
            "points",
            "selectedThreshold",
            "thresholdSelection",
            "abstention",
        }
        assert block["targetId"] == target_id
        selection = block["thresholdSelection"]
        assert selection == {"method": "max_f1_inner_validation", "source": "validated_pipeline"}
        threshold = block["selectedThreshold"]
        _check_interval(f"decisions.{target_id}.selectedThreshold", threshold)
        points = block["points"]
        assert isinstance(points, list) and points, f"{target_id} sweep points missing"
        candidate_thresholds = []
        for point in points:
            assert set(point) == {"threshold", "precision", "recall", "f1"}
            _check_interval(f"{target_id}.point.threshold", point["threshold"])
            for key in ("precision", "recall", "f1"):
                _check_unit_interval(f"{target_id}.point.{key}", point[key])
            candidate_thresholds.append(point["threshold"])
        assert threshold in candidate_thresholds, "selectedThreshold absent from sweep points"
        abstention = block["abstention"]
        assert set(abstention) == {"sweeps", "selectedHalfWidthMargin", "selectionRule"}
        half_width = abstention["selectedHalfWidthMargin"]
        assert _is_number(half_width) and math.isfinite(half_width) and half_width > 0.0
        assert isinstance(abstention["selectionRule"], str) and abstention["selectionRule"]
        sweeps = abstention["sweeps"]
        assert isinstance(sweeps, list) and len(sweeps) == 4
        fractions = [0.0, 0.2, 0.4, 0.6]
        previous = -1.0
        for sweep, target_fraction in zip(sweeps, fractions, strict=True):
            assert set(sweep) == {"abstainFraction", "coverage", "accuracyDecided"}
            abstain = sweep["abstainFraction"]
            coverage = sweep["coverage"]
            assert target_fraction - 1.0 / N_PATIENTS - 1e-12 <= abstain <= target_fraction
            assert coverage == pytest.approx(1.0 - abstain, abs=1e-12)
            assert abstain > previous
            previous = abstain
            _check_unit_interval(f"{target_id}.accuracyDecided", sweep["accuracyDecided"])


def check_subgroups(doc: dict, repo_root) -> None:
    subgroups = doc["subgroups"]
    assert isinstance(subgroups, list) and len(subgroups) == len(TARGET_IDS) * len(SUBGROUP_IDS)
    per_target: dict[str, dict[str, dict]] = {}
    for row in subgroups:
        assert set(row) == {"targetId", "groupId", "n", "rocAuc", "rocAucCI", "caveat"}
        assert row["targetId"] in TARGET_IDS
        assert row["groupId"] in SUBGROUP_IDS
        assert isinstance(row["n"], int) and row["n"] > 0
        assert row["n"] == EXPECTED_SUBGROUP_N[row["groupId"]], (
            f"{row['targetId']}/{row['groupId']} n={row['n']}"
        )
        _check_unit_interval(f"subgroup {row['groupId']}.rocAuc", row["rocAuc"])
        interval = row["rocAucCI"]
        assert isinstance(interval, list) and len(interval) == 2
        _check_interval("subgroup CI low", interval[0])
        _check_interval("subgroup CI high", interval[1])
        assert interval[0] <= interval[1]
        assert row["caveat"] is None or (
            isinstance(row["caveat"], str) and row["caveat"].startswith("small subgroup")
        )
        per_target.setdefault(row["targetId"], {})[row["groupId"]] = row
    assert set(per_target) == set(TARGET_IDS)
    for target_id, groups in per_target.items():
        assert set(groups) == set(SUBGROUP_IDS), f"{target_id} subgroup coverage"
        assert groups["age_lt60"]["n"] + groups["age_ge60"]["n"] == N_PATIENTS
        assert groups["female"]["n"] + groups["male"]["n"] == N_PATIENTS


def check_evidence_ladder(doc: dict, repo_root) -> None:
    ladder = doc["evidenceLadder"]
    assert set(ladder) == {"stageSemantics", "provenance", "stages"}
    assert "not a recommended work-up order" in ladder["stageSemantics"]
    assert isinstance(ladder["provenance"], str) and ladder["provenance"]
    stages = ladder["stages"]
    registry = registry_stages()
    assert isinstance(stages, list) and len(stages) == len(registry)
    assert [stage["stageId"] for stage in stages] == [stage["id"] for stage in registry]
    assert [stage["order"] for stage in stages] == [int(stage["order"]) for stage in registry]
    for stage, registry_stage in zip(stages, registry, strict=True):
        assert set(stage) == {"stageId", "order", "modalitiesThrough", "targets"}
        assert stage["modalitiesThrough"] == list(registry_stage["modalitiesThrough"])
        assert set(stage["targets"]) == set(TARGET_IDS)
        for target_id in TARGET_IDS:
            cell = stage["targets"][target_id]
            assert set(cell) == {"rocAuc", "rocAucCI", "n"}
            _check_unit_interval(f"ladder {stage['stageId']}.{target_id}.rocAuc", cell["rocAuc"])
            interval = cell["rocAucCI"]
            assert isinstance(interval, list) and len(interval) == 2
            assert interval[0] <= interval[1]
            _check_interval("ladder CI low", interval[0])
            _check_interval("ladder CI high", interval[1])
            assert cell["n"] == N_PATIENTS


def check_reliability(doc: dict, repo_root) -> None:
    reliability = doc["reliability"]
    assert set(reliability) == {"rule", "targets"}
    rule = reliability["rule"]
    assert set(rule) == {"ruleId", "description", "thresholds"}
    assert rule["ruleId"] == "RT-1"
    assert isinstance(rule["description"], str) and rule["description"]
    assert rule["thresholds"] == {
        "strongCiLowMin": 0.90,
        "strongUpliftMin": 0.20,
        "moderateAucMin": 0.80,
        "moderateUpliftMin": 0.15,
    }
    targets = reliability["targets"]
    assert set(targets) == set(TARGET_IDS)
    for target_id in TARGET_IDS:
        block = targets[target_id]
        assert set(block) == {"tier", "rationaleCode", "evidenceRefs"}
        tier = block["tier"]
        assert tier in ("strong", "moderate", "limited"), f"{target_id} unknown tier {tier!r}"
        assert tier == EXPECTED_TIERS[target_id], f"{target_id} tier {tier}"
        assert block["rationaleCode"] == RATIONALE_BY_TIER[tier]
        refs = block["evidenceRefs"]
        assert isinstance(refs, list) and len(refs) == 3
        expected_refs = [
            f"results.performance.{target_id}.rocAuc",
            f"results.performance.{target_id}.rocAucCI",
            f"results.performance.{target_id}.majorityBaseline",
        ]
        assert refs == expected_refs


def check_reliability_matches_performance(doc: dict, repo_root) -> None:
    from pipeline.reliability import classify

    for target_id in TARGET_IDS:
        perf = doc["performance"][target_id]
        tier = classify(perf["rocAuc"], perf["rocAucCI"][0], perf["majorityBaseline"])
        assert doc["reliability"]["targets"][target_id]["tier"] == tier


def check_provenance(doc: dict, repo_root) -> None:
    provenance = doc["provenance"]
    assert set(provenance) == {
        "dataSha256",
        "seedSet",
        "sourceRevision",
        "toolVersions",
        "notes",
    }
    digest = provenance["dataSha256"]
    assert isinstance(digest, str) and HEX64.match(digest), "dataSha256 is not 64 lowercase hex"
    assert digest == parse_checksums()[CANONICAL_CSV]
    seed_set = provenance["seedSet"]
    assert seed_set["base"] == 411
    derived = seed_set["derived"]
    assert isinstance(derived, dict) and derived, "seedSet.derived empty"
    assert derived["outerCv"] == 411
    revision = provenance["sourceRevision"]
    assert isinstance(revision, str) and revision, "sourceRevision empty"
    versions = provenance["toolVersions"]
    for key in ("python", "numpy", "pandas", "scikitLearn", "xgboost"):
        assert isinstance(versions.get(key), str) and versions[key], f"toolVersions.{key}"
    notes = provenance["notes"]
    assert isinstance(notes, list) and len(notes) >= 5
    assert all(isinstance(note, str) and note for note in notes)


def check_leakage_lab_consistency(doc: dict, repo_root) -> None:
    module_available = importlib.util.find_spec("pipeline.leakage_lab") is not None
    key_present = "leakageLab" in doc
    assert key_present == module_available, (
        "leakageLab key/module mismatch: "
        f"key={key_present}, module={module_available}"
    )
    if key_present:
        lab = doc["leakageLab"]
        assert isinstance(lab, dict) and lab, "leakageLab must be a non-empty dict"


def check_no_patient_level_payload(doc: dict, repo_root) -> None:
    long_arrays = []
    banned = []

    def walk(node, path: str) -> None:
        if isinstance(node, dict):
            for key, value in node.items():
                if key in BANNED_KEYS:
                    banned.append(f"{path}.{key}")
                walk(value, f"{path}.{key}")
        elif isinstance(node, list):
            if node and all(_is_number(item) for item in node) and len(node) in LONG_ARRAY_LENGTHS:
                long_arrays.append(f"{path}[len={len(node)}]")
            for index, value in enumerate(node):
                walk(value, f"{path}[{index}]")

    walk(doc, "$")
    assert not banned, f"patient-level keys present: {banned}"
    assert not long_arrays, f"patient-length numeric arrays present: {long_arrays}"


def check_no_non_finite_numbers(doc: dict, repo_root) -> None:
    def walk(node, path: str) -> None:
        if isinstance(node, dict):
            for key, value in node.items():
                walk(value, f"{path}.{key}")
        elif isinstance(node, list):
            for index, value in enumerate(node):
                walk(value, f"{path}[{index}]")
        elif isinstance(node, float):
            assert math.isfinite(node), f"non-finite number at {path}: {node}"

    walk(doc, "$")


CHECKS = (
    ("top_level", check_top_level),
    ("protocol", check_protocol),
    ("performance", check_performance),
    ("calibration", check_calibration),
    ("decisions", check_decisions),
    ("subgroups", check_subgroups),
    ("evidenceLadder", check_evidence_ladder),
    ("reliability", check_reliability),
    ("reliability_matches_performance", check_reliability_matches_performance),
    ("provenance", check_provenance),
    ("leakageLab_consistency", check_leakage_lab_consistency),
    ("no_patient_level_payload", check_no_patient_level_payload),
    ("no_non_finite_numbers", check_no_non_finite_numbers),
)


def _run_checks(doc: dict, repo_root) -> list[str]:
    problems: list[str] = []
    for name, check in CHECKS:
        try:
            check(doc, repo_root)
        except AssertionError as exc:
            problems.append(f"{name}: {exc}")
    return problems


def test_results_json_has_no_nan_or_infinity_tokens(results_path):
    text = results_path.read_text(encoding="utf-8")
    match = NON_FINITE_TOKEN.search(text)
    assert match is None, f"results.json contains token {match.group(0)!r}"


@pytest.mark.parametrize(("name", "check"), CHECKS, ids=[name for name, _ in CHECKS])
def test_results_document_satisfies_c04(name, check, results, repo_root):
    check(results, repo_root)


def test_expected_tier_ladder(results):
    tiers = {target: results["reliability"]["targets"][target]["tier"] for target in TARGET_IDS}
    assert tiers == EXPECTED_TIERS


@pytest.mark.slow
def test_reproduce_smoke_writes_valid_results(repo_root):
    completed = subprocess.run(
        [sys.executable, "-m", "pipeline.reproduce"],
        cwd=repo_root,
        capture_output=True,
        text=True,
        timeout=1500,
        check=False,
    )
    assert completed.returncode == 0, (
        f"reproduce failed:\nSTDOUT:\n{completed.stdout}\nSTDERR:\n{completed.stderr}"
    )
    assert "results.json" in completed.stdout
    assert "leakageLab" in completed.stdout
    results_file = repo_root / "results.json"
    assert results_file.is_file()
    assert (repo_root / "pipeline" / "artifacts" / "deployed_model.joblib").is_file()
    text = results_file.read_text(encoding="utf-8")
    match = NON_FINITE_TOKEN.search(text)
    assert match is None, f"fresh results.json contains token {match.group(0)!r}"
    doc = json.loads(text, parse_constant=_reject_constant)
    problems = _run_checks(doc, repo_root)
    assert problems == [], "fresh results.json problems: " + "; ".join(problems)
