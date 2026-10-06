"""VC-04 validation-protocol tests (Contracts §12 VC-04, AG-04).

Proves the frozen protocol without touching generated artifacts:

* one shared outer structure: 15 folds, disjoint in/out, full coverage,
  exactly 3 test appearances per patient, all 8 joint patterns everywhere;
* cohort anchors: positive-class counts and joint-pattern counts;
* INV-C07: forbidden columns never enter the feature matrix;
* the production modules contain no resampling vocabulary beyond the recorded
  ``protocol.noSmote`` flag (static scan with word boundaries);
* seeded determinism of Platt fitting and of the bootstrap interval;
* the bootstrap AUC kernel is equivalent to scikit-learn on the expanded
  resample (tie credit 0.5);
* train-only fitting: scaler/Platt/threshold consume outer-training rows only,
  the Platt/threshold inputs are exactly the inner-OOF arrays, and ladder
  background rows come from the outer-training fold;
* deterministic max-F1 tie-break and abstention sweep accounting.
"""

from __future__ import annotations

import re

import numpy as np
import pytest
from sklearn.metrics import roc_auc_score

from pipeline.calibration import fit_platt
from pipeline.metrics import bootstrap_auc_values, classification_metrics
from pipeline.prepare import prepare_dataset
from pipeline.validate import (
    OUTER_REPEATS,
    OUTER_SPLITS,
    abstention_sweeps,
    build_outer_folds,
    registry_stages,
    run_outer_fold,
    select_threshold,
    stage_feature_mask,
)

pytestmark = pytest.mark.blocking

PRODUCTION_MODULES = (
    "prepare.py",
    "train.py",
    "validate.py",
    "metrics.py",
    "calibration.py",
    "reliability.py",
    "reproduce.py",
)
POSITIVE_ANCHORS = {"CAD": 216, "LAD": 177, "LCX": 119, "RCA": 114}
JOINT_PATTERN_COUNTS = {0: 86, 1: 17, 2: 13, 3: 10, 4: 57, 5: 24, 6: 33, 7: 63}
FORBIDDEN_IDS = {"LAD", "LCX", "RCA", "Cath", "Exertional CP"}
STAGE_OBSERVED_COUNTS = {"history": 17, "exam": 30, "ecg": 37, "labs": 51, "echo": 54}


@pytest.fixture(scope="module")
def prepared():
    return prepare_dataset()


@pytest.fixture(scope="module")
def folds(prepared):
    return build_outer_folds(prepared.joint)


def test_outer_folds_disjoint_cover_every_patient_three_test_appearances(prepared, folds):
    assert len(folds) == OUTER_SPLITS * OUTER_REPEATS
    test_counts = np.zeros(prepared.n_patients, dtype=np.int64)
    all_rows = set(range(prepared.n_patients))
    for fold in folds:
        train = set(fold.train_idx.tolist())
        test = set(fold.test_idx.tolist())
        assert train & test == set()
        assert train | test == all_rows
        assert fold.repeat == fold.fold_index // OUTER_SPLITS
        for row in fold.test_idx:
            test_counts[int(row)] += 1
    assert np.all(test_counts == OUTER_REPEATS)
    assert int(test_counts.sum()) == prepared.n_patients * OUTER_REPEATS


def test_all_eight_joint_patterns_present_in_every_fold(prepared, folds):
    expected = set(JOINT_PATTERN_COUNTS)
    for fold in folds:
        assert set(np.unique(prepared.joint[fold.train_idx]).tolist()) == expected
        assert set(np.unique(prepared.joint[fold.test_idx]).tolist()) == expected


def test_joint_pattern_counts_match_verified_cohort(prepared):
    observed = {
        int(code): int(count)
        for code, count in zip(*np.unique(prepared.joint, return_counts=True), strict=True)
    }
    assert observed == JOINT_PATTERN_COUNTS


def test_positive_class_anchors(prepared):
    assert prepared.n_patients == 303
    assert prepared.n_features == 54
    for target_id, expected in POSITIVE_ANCHORS.items():
        assert int(prepared.labels[target_id].sum()) == expected


def test_feature_matrix_excludes_forbidden_columns(prepared):
    assert set(prepared.feature_order) & FORBIDDEN_IDS == set()
    assert prepared.X.shape == (303, 54)
    assert not any(
        modality is None for modality in prepared.modality_by_feature.values()
    )


def test_no_smote_word_in_production_modules(repo_root):
    pattern = re.compile(r"\bsmote\b", re.IGNORECASE)
    offenders = []
    for name in PRODUCTION_MODULES:
        text = (repo_root / "pipeline" / name).read_text(encoding="utf-8")
        if pattern.search(text):
            offenders.append(name)
    assert offenders == []


def test_fit_platt_is_deterministic_and_positive():
    rng = np.random.default_rng(7)
    margins = rng.normal(size=64) * 2.0
    labels = (margins + rng.normal(size=64) > 0).astype(np.int64)
    first = fit_platt(margins, labels)
    second = fit_platt(margins, labels)
    assert first == second
    assert first["slope"] > 0.0
    assert np.isfinite(first["intercept"])


def test_bootstrap_auc_ci_is_deterministic():
    rng = np.random.default_rng(11)
    scores = rng.random(80)
    labels = (rng.random(80) > 0.5).astype(np.int64)
    first = bootstrap_auc_values(scores, labels, n_resamples=500, seed=99)
    second = bootstrap_auc_values(scores, labels, n_resamples=500, seed=99)
    assert np.array_equal(first, second)


def test_bootstrap_weighted_auc_equals_sklearn_on_expanded_resample():
    rng = np.random.default_rng(3)
    scores = rng.random(40)
    labels = (rng.random(40) > 0.5).astype(np.int64)
    n_resamples = 8
    seed = 1234
    values = bootstrap_auc_values(scores, labels, n_resamples=n_resamples, seed=seed)
    counts = np.random.default_rng(seed).multinomial(
        40, np.full(40, 1.0 / 40), size=n_resamples
    )
    checked = 0
    for row in range(n_resamples):
        rows = np.repeat(np.arange(40), counts[row])
        if np.unique(labels[rows]).size < 2:
            continue
        expected = roc_auc_score(labels[rows], scores[rows])
        assert values[checked] == pytest.approx(expected, abs=1e-12)
        checked += 1
    assert checked >= 1


def test_stage_masks_cover_cumulative_modalities(prepared):
    stages = registry_stages()
    assert [stage["id"] for stage in stages] == list(STAGE_OBSERVED_COUNTS)
    for stage in stages:
        mask = stage_feature_mask(
            prepared.feature_order, prepared.modality_by_feature, stage["modalitiesThrough"]
        )
        assert int(mask.sum()) == STAGE_OBSERVED_COUNTS[stage["id"]]
        assert mask.dtype == bool
        assert mask.shape == (54,)


def test_fold_fitting_uses_training_rows_only(prepared, folds, monkeypatch):
    import pipeline.validate as validate_module

    fold = folds[0]
    recorded: dict[str, np.ndarray] = {}
    real_platt = validate_module.fit_platt
    real_threshold = validate_module.select_threshold

    def spy_platt(margins, labels):
        recorded["platt_margins"] = np.array(margins, copy=True)
        recorded["platt_labels"] = np.array(labels, copy=True)
        return real_platt(margins, labels)

    def spy_threshold(probabilities, labels):
        recorded["threshold_probs"] = np.array(probabilities, copy=True)
        recorded["threshold_labels"] = np.array(labels, copy=True)
        return real_threshold(probabilities, labels)

    monkeypatch.setattr(validate_module, "fit_platt", spy_platt)
    monkeypatch.setattr(validate_module, "select_threshold", spy_threshold)

    result = run_outer_fold(prepared, "CAD", fold, 0, registry_stages())
    train_rows = {int(row) for row in fold.train_idx}
    test_rows = {int(row) for row in fold.test_idx}
    n_train = len(fold.train_idx)

    assert len(recorded["platt_margins"]) == n_train
    assert len(recorded["threshold_probs"]) == n_train
    assert np.array_equal(recorded["platt_margins"], result.inner_margins)
    assert np.array_equal(recorded["platt_labels"], prepared.labels["CAD"][fold.train_idx])
    assert np.array_equal(recorded["threshold_probs"], result.inner_probs)
    assert np.array_equal(recorded["threshold_labels"], prepared.labels["CAD"][fold.train_idx])

    scaler = result.lr_pipeline.named_steps["scaler"]
    train_mean = prepared.X[fold.train_idx].mean(axis=0)
    full_mean = prepared.X.mean(axis=0)
    np.testing.assert_allclose(scaler.mean_, train_mean, rtol=1e-10, atol=1e-10)
    assert not np.allclose(scaler.mean_, full_mean, rtol=1e-6, atol=1e-6)

    assert result.platt["slope"] > 0.0
    assert {int(row) for row in result.background_idx} <= train_rows
    assert {int(row) for row in result.test_idx} == test_rows
    np.testing.assert_allclose(
        result.ladder_test[:, -1], result.margin_test, rtol=1e-6, atol=1e-9
    )
    assert result.margin_test.shape == (len(fold.test_idx),)
    assert result.inner_margins.shape == (n_train,)


def test_select_threshold_breaks_ties_toward_largest_threshold():
    labels = np.array([1, 0, 1, 1, 0, 0], dtype=np.int64)
    probabilities = np.array([0.9, 0.8, 0.7, 0.6, 0.6, 0.6])
    metrics_top = classification_metrics(labels, probabilities, 0.7)
    metrics_low = classification_metrics(labels, probabilities, 0.6)
    assert metrics_top["f1"] == pytest.approx(metrics_low["f1"])
    assert select_threshold(probabilities, labels) == 0.7


def test_abstention_sweeps_accounting():
    margins = np.array([0.0, 1.0, 2.0, 3.0, 4.0])
    probabilities = np.array([0.1, 0.4, 0.6, 0.9, 0.95])
    labels = np.array([0, 0, 1, 1, 1], dtype=np.int64)
    sweeps = abstention_sweeps(margins, 2.0, probabilities, labels, 0.5)
    assert [entry["abstainFraction"] for entry in sweeps] == [0.0, 0.2, 0.4, 0.6]
    for entry in sweeps:
        assert entry["coverage"] == pytest.approx(1.0 - entry["abstainFraction"])
        assert 0.0 <= entry["accuracyDecided"] <= 1.0
    assert sweeps[0]["coverage"] == 1.0
    assert sweeps[0]["accuracyDecided"] == 1.0
    assert sweeps[2]["coverage"] == 0.6
    assert sweeps[3]["coverage"] == 0.4
