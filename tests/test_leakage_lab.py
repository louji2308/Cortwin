"""Behaviour tests for the quarantined leakage laboratory (C-04 ``leakageLab``).

Asserts the frozen cross-unit interface returned by
``pipeline.leakage_lab.run_leakage_lab(df, *, seed=411)``:

* exact shape — 5 probe ids in order, every probe labelled ``probe model``,
  exact ``excludedColumns``, no key named like ``deployed``;
* all metrics finite and inside ``[0, 1]``; no patient-length numeric arrays;
* frozen positive-class anchors (CAD 216 / LAD 177 / LCX 119 / RCA 114);
* directions only (regenerated numbers govern): target-leakage CAD ROC-AUC
  exceeds the honest probe, seed-sensitivity min ≤ median ≤ max with a
  non-zero spread;
* determinism through the internal reduced-cost helper (same seed twice →
  equal dicts).

``pipeline.leakage_lab`` is imported lazily inside tests/fixtures so the
build-blocking import-boundary tests in ``tests/test_leakage_boundary.py``
can observe ``sys.modules`` honestly. The full-cost run is marked ``slow``.
"""

from __future__ import annotations

import json
import math
import re
import time

import pytest

from pipeline.dataset import load_dataset

LAB_IDS = [
    "honest-inside-fold",
    "smote-before-cv",
    "feature-selection-before-cv",
    "target-leakage",
    "seed-sensitivity",
]
CV_PROBE_IDS = LAB_IDS[:3]
EXCLUDED_COLUMNS = ["LAD", "LCX", "RCA", "Cath", "Exertional CP"]
TOP_LEVEL_KEYS = {"label", "kind", "excludedColumns", "probes", "explanation"}
LAB_LABEL = "probe models — quarantined evidence; never merged with deployed-model results"
PROBE_LABEL = "probe model"
TARGET_IDS = ["CAD", "LAD", "LCX", "RCA"]
POSITIVE_ANCHORS = {"CAD": 216, "LAD": 177, "LCX": 119, "RCA": 114}
COHORT_SIZE = 303
FEATURE_COUNT = 54
PATIENT_LENGTHS = {COHORT_SIZE, COHORT_SIZE * 2, COHORT_SIZE * 3}
FULL_RUN_SANITY_CEILING_S = 600.0


@pytest.fixture(scope="module")
def cohort():
    return load_dataset()


@pytest.fixture(scope="module")
def reduced(cohort):
    from pipeline.leakage_lab import _run_leakage_lab_reduced

    return _run_leakage_lab_reduced(cohort)


def _probes(lab: dict) -> dict[str, dict]:
    return {probe["id"]: probe for probe in lab["probes"]}


def _numbers(node, path: str = "$"):
    if isinstance(node, dict):
        for key, value in node.items():
            yield from _numbers(value, f"{path}.{key}")
    elif isinstance(node, list):
        for index, value in enumerate(node):
            yield from _numbers(value, f"{path}[{index}]")
    elif isinstance(node, (int, float)) and not isinstance(node, bool):
        yield path, float(node)


def _numeric_list_lengths(node, path: str = "$"):
    if isinstance(node, dict):
        for key, value in node.items():
            yield from _numeric_list_lengths(value, f"{path}.{key}")
    elif isinstance(node, list):
        if node and all(
            isinstance(value, (int, float)) and not isinstance(value, bool)
            for value in node
        ):
            yield path, len(node)
        for index, value in enumerate(node):
            yield from _numeric_list_lengths(value, f"{path}[{index}]")


def _all_keys(node):
    if isinstance(node, dict):
        for key, value in node.items():
            yield key
            yield from _all_keys(value)
    elif isinstance(node, list):
        for value in node:
            yield from _all_keys(value)


def _assert_shape(lab: dict) -> None:
    assert set(lab) == TOP_LEVEL_KEYS, f"top-level keys: {sorted(lab)}"
    assert lab["kind"] == "leakageLab"
    assert lab["label"] == LAB_LABEL
    assert lab["excludedColumns"] == EXCLUDED_COLUMNS
    assert isinstance(lab["probes"], list)
    assert [probe["id"] for probe in lab["probes"]] == LAB_IDS
    assert isinstance(lab["explanation"], str) and lab["explanation"].strip()
    sentences = [
        part for part in re.split(r"(?<=[.!?])\s+", lab["explanation"].strip()) if part
    ]
    assert 2 <= len(sentences) <= 4, f"explanation has {len(sentences)} sentences"

    banned_keys = [key for key in _all_keys(lab) if "deployed" in str(key).casefold()]
    assert not banned_keys, f"keys named like deployed: {banned_keys}"

    probes = _probes(lab)
    assert set(probes) == set(LAB_IDS)
    for probe in lab["probes"]:
        assert probe["label"] == PROBE_LABEL, probe["id"]
        assert isinstance(probe["protocol"], str) and probe["protocol"]

    for probe_id in CV_PROBE_IDS:
        probe = probes[probe_id]
        assert set(probe) == {
            "id",
            "label",
            "modelFamily",
            "protocol",
            "metrics",
            "inflated",
            "note",
        }, probe_id
        assert probe["modelFamily"] == "random-forest"
        assert isinstance(probe["note"], str) and probe["note"]
        assert set(probe["metrics"]) == set(TARGET_IDS)
        for target_id, metrics in probe["metrics"].items():
            assert set(metrics) == {"accuracy", "rocAuc"}, f"{probe_id}.{target_id}"
    assert probes["honest-inside-fold"]["inflated"] is False
    for probe_id in ("smote-before-cv", "feature-selection-before-cv", "target-leakage"):
        assert probes[probe_id]["inflated"] is True, probe_id

    leak = probes["target-leakage"]
    assert set(leak) == {"id", "label", "protocol", "metrics", "inflated"}
    assert set(leak["metrics"]) == {"CAD"}
    assert set(leak["metrics"]["CAD"]) == {"accuracy", "rocAuc"}

    seeds = probes["seed-sensitivity"]
    assert set(seeds) == {"id", "label", "protocol", "metrics"}
    assert set(seeds["metrics"]) == set(TARGET_IDS)
    for target_id, metrics in seeds["metrics"].items():
        assert set(metrics) == {"accuracyMin", "accuracyMedian", "accuracyMax"}, target_id


def _assert_ranges(lab: dict) -> None:
    for path, value in _numbers(lab):
        assert math.isfinite(value), f"non-finite metric at {path}: {value}"
        assert 0.0 <= value <= 1.0, f"metric outside [0,1] at {path}: {value}"


def test_positive_class_counts_match_frozen_anchors(cohort):
    from pipeline.leakage_lab import _prepare

    X, labels, order = _prepare(cohort)
    assert X.shape == (COHORT_SIZE, FEATURE_COUNT)
    assert len(order) == FEATURE_COUNT
    assert set(order) & set(EXCLUDED_COLUMNS) == set()
    observed = {target_id: int(vector.sum()) for target_id, vector in labels.items()}
    assert observed == POSITIVE_ANCHORS


def test_reduced_shape_matches_frozen_interface(reduced):
    _assert_shape(reduced)
    probes = _probes(reduced)
    assert "n_estimators=32" in probes["honest-inside-fold"]["protocol"]
    assert "3-fold × 1 repeated" in probes["honest-inside-fold"]["protocol"]


def test_reduced_metrics_are_finite_probabilities(reduced):
    _assert_ranges(reduced)


def test_no_patient_length_numeric_arrays(reduced):
    offenders = [
        (path, length)
        for path, length in _numeric_list_lengths(reduced)
        if length in PATIENT_LENGTHS
    ]
    assert not offenders, f"patient-length numeric arrays leaked into the lab: {offenders}"


def test_reduced_run_is_deterministic(reduced, cohort):
    from pipeline.leakage_lab import _run_leakage_lab_reduced

    again = _run_leakage_lab_reduced(cohort)
    assert again == reduced
    json.dumps(reduced, allow_nan=False, sort_keys=True)


@pytest.mark.slow
def test_full_run_shape_directions_and_budget(cohort):
    from pipeline.leakage_lab import run_leakage_lab

    started = time.perf_counter()
    lab = run_leakage_lab(cohort)
    wall_seconds = time.perf_counter() - started

    _assert_shape(lab)
    _assert_ranges(lab)
    offenders = [
        (path, length)
        for path, length in _numeric_list_lengths(lab)
        if length in PATIENT_LENGTHS
    ]
    assert not offenders, f"patient-length numeric arrays leaked into the lab: {offenders}"

    probes = _probes(lab)
    honest_auc = probes["honest-inside-fold"]["metrics"]["CAD"]["rocAuc"]
    leakage_auc = probes["target-leakage"]["metrics"]["CAD"]["rocAuc"]
    assert leakage_auc > honest_auc, (
        f"target-leakage CAD AUC {leakage_auc} must exceed honest {honest_auc}"
    )

    for target_id in TARGET_IDS:
        metrics = probes["seed-sensitivity"]["metrics"][target_id]
        assert metrics["accuracyMin"] <= metrics["accuracyMedian"] <= metrics["accuracyMax"]
        assert metrics["accuracyMax"] - metrics["accuracyMin"] > 0.0, target_id

    assert probes["honest-inside-fold"]["protocol"].startswith(
        "10-fold × 3 repeated stratified CV, SMOTE applied INSIDE training folds only"
    )
    assert probes["target-leakage"]["protocol"].startswith(
        "LAD/LCX/RCA included as CAD inputs — intentionally leaky"
    )
    assert probes["seed-sensitivity"]["protocol"].startswith(
        "30 random 80/20 splits, per-target stratification"
    )
    assert "n_estimators=100" in probes["honest-inside-fold"]["protocol"]

    assert wall_seconds < FULL_RUN_SANITY_CEILING_S, (
        f"full leakage lab took {wall_seconds:.1f}s (ceiling {FULL_RUN_SANITY_CEILING_S}s)"
    )
    print(
        f"[leakage-lab] full run wall={wall_seconds:.1f}s (target <180s) | "
        f"honest CAD AUC={honest_auc:.4f} | target-leakage CAD AUC={leakage_auc:.4f}"
    )
