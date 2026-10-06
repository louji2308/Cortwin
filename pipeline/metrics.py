"""Runtime-computed performance, calibration and interval metrics (C-04).

Every number written into ``results.json`` originates here, in
:mod:`pipeline.validate` or in :mod:`pipeline.reliability`; nothing is
hard-coded (Contracts §3 numeric-truth rule, AG-04).

Confidence intervals are 95% percentile bootstrap intervals over patients with
10,000 seeded resamples. The resampling draws patients with replacement; it is
generated as multinomial counts and scored with the exact weighted Mann-Whitney
form (0.5 credit for ties), which is mathematically identical to scoring the
expanded resample and is validated against scikit-learn in the protocol tests.
"""

from __future__ import annotations

import numpy as np
from sklearn.metrics import roc_auc_score

from .errors import PipelineError

BOOTSTRAP_RESAMPLES = 10_000
RELIABILITY_BINS = 10
_MIN_VALID_RESAMPLES = 0.99


def _as_finite(name: str, values: np.ndarray) -> np.ndarray:
    arr = np.asarray(values, dtype=np.float64).ravel()
    if not np.all(np.isfinite(arr)):
        raise PipelineError(f"{name} contains non-finite values")
    return arr


def roc_auc(scores: np.ndarray, labels: np.ndarray) -> float:
    """ROC-AUC on scores (margin or probability; rank-invariant)."""
    s = _as_finite("roc_auc scores", scores)
    y = _as_finite("roc_auc labels", labels)
    if s.shape != y.shape:
        raise PipelineError("roc_auc: scores and labels differ in length")
    if s.size == 0:
        raise PipelineError("roc_auc: empty input")
    if np.unique(y).size < 2:
        raise PipelineError("roc_auc: both classes must be present")
    return float(roc_auc_score(y, s))


def classification_metrics(labels: np.ndarray, probabilities: np.ndarray, threshold: float) -> dict:
    """Accuracy/precision/recall/F1 for ``probability >= threshold`` predictions."""
    y = _as_finite("classification labels", labels)
    p = _as_finite("classification probabilities", probabilities)
    if y.shape != p.shape or y.size == 0:
        raise PipelineError("classification metrics need matching non-empty inputs")
    t = float(threshold)
    if not np.isfinite(t):
        raise PipelineError("classification threshold is not finite")
    pred = (p >= t).astype(np.int64)
    truth = (y >= 0.5).astype(np.int64)
    tp = float(np.sum((pred == 1) & (truth == 1)))
    fp = float(np.sum((pred == 1) & (truth == 0)))
    fn = float(np.sum((pred == 0) & (truth == 1)))
    tn = float(np.sum((pred == 0) & (truth == 0)))
    n = float(y.size)
    return {
        "accuracy": (tp + tn) / n,
        "precision": tp / (tp + fp) if (tp + fp) > 0.0 else 0.0,
        "recall": tp / (tp + fn) if (tp + fn) > 0.0 else 0.0,
        "f1": (2.0 * tp) / (2.0 * tp + fp + fn) if (2.0 * tp + fp + fn) > 0.0 else 0.0,
    }


def majority_baseline(labels: np.ndarray) -> float:
    """Accuracy of always predicting the majority class (Idea.md §3 baselines)."""
    y = _as_finite("majority baseline labels", labels)
    if y.size == 0:
        raise PipelineError("majority baseline needs a non-empty label vector")
    positives = int(np.sum(y >= 0.5))
    negatives = int(y.size) - positives
    return float(max(positives, negatives)) / float(y.size)


def brier_score(probabilities: np.ndarray, labels: np.ndarray) -> float:
    """Mean squared error of probabilities against 0/1 labels."""
    p = _as_finite("brier probabilities", probabilities)
    y = _as_finite("brier labels", labels)
    if p.shape != y.shape or p.size == 0:
        raise PipelineError("brier score needs matching non-empty inputs")
    if np.any(p < 0.0) or np.any(p > 1.0):
        raise PipelineError("brier score received probabilities outside [0, 1]")
    return float(np.mean((p - y) ** 2))


def reliability_curve(
    probabilities: np.ndarray, labels: np.ndarray, n_bins: int = RELIABILITY_BINS
) -> list[dict]:
    """Equal-width reliability bins (C-04 ``reliabilityCurve``).

    Empty bins report the bin midpoint as ``meanPredicted`` and 0.0 as
    ``fractionPositive`` with ``count`` 0, so every value stays finite
    (documented in ``results.provenance.notes``).
    """
    p = _as_finite("reliability probabilities", probabilities)
    y = _as_finite("reliability labels", labels)
    if p.shape != y.shape or p.size == 0:
        raise PipelineError("reliability curve needs matching non-empty inputs")
    if np.any(p < 0.0) or np.any(p > 1.0):
        raise PipelineError("reliability curve received probabilities outside [0, 1]")
    curve: list[dict] = []
    for index in range(n_bins):
        lower = index / n_bins
        upper = (index + 1) / n_bins
        if index == n_bins - 1:
            mask = (p >= lower) & (p <= upper)
        else:
            mask = (p >= lower) & (p < upper)
        count = int(np.sum(mask))
        if count == 0:
            mean_predicted = (lower + upper) / 2.0
            fraction_positive = 0.0
        else:
            mean_predicted = float(np.mean(p[mask]))
            fraction_positive = float(np.mean(y[mask]))
        curve.append(
            {
                "binLower": float(lower),
                "binUpper": float(upper),
                "meanPredicted": float(mean_predicted),
                "fractionPositive": float(fraction_positive),
                "count": count,
            }
        )
    total = sum(bin_entry["count"] for bin_entry in curve)
    if total != int(p.size):
        raise PipelineError("reliability curve does not cover every row")
    return curve


def ece_from_curve(curve: list[dict], total_count: int) -> float:
    """Expected calibration error as the count-weighted bin gap."""
    if total_count <= 0:
        raise PipelineError("ece needs a positive row count")
    ece = 0.0
    for bin_entry in curve:
        count = int(bin_entry["count"])
        if count == 0:
            continue
        ece += (count / total_count) * abs(
            float(bin_entry["fractionPositive"]) - float(bin_entry["meanPredicted"])
        )
    return float(ece)


def bootstrap_auc_values(
    scores: np.ndarray, labels: np.ndarray, *, n_resamples: int, seed: int
) -> np.ndarray:
    """Bootstrap AUC values over patient resamples (multinomial counts, ties at 0.5)."""
    s = _as_finite("bootstrap scores", scores)
    y = _as_finite("bootstrap labels", labels)
    if s.shape != y.shape or s.size < 4:
        raise PipelineError("bootstrap needs at least 4 matching rows")
    if np.unique(y).size < 2:
        raise PipelineError("bootstrap needs both classes present")
    n = int(s.size)
    rng = np.random.default_rng(int(seed))
    counts = rng.multinomial(n, np.full(n, 1.0 / n), size=int(n_resamples))
    weights = counts.astype(np.float64)
    positives = (y >= 0.5).astype(np.float64)
    negatives = 1.0 - positives
    diff = s[:, None] - s[None, :]
    kernel = np.where(diff > 0.0, 1.0, np.where(diff < 0.0, 0.0, 0.5))
    weighted = kernel * positives[:, None] * negatives[None, :]
    numerators = np.sum((weights @ weighted) * weights, axis=1)
    pos_counts = weights @ positives
    neg_counts = weights @ negatives
    valid = (pos_counts > 0.0) & (neg_counts > 0.0)
    if int(np.sum(valid)) < int(_MIN_VALID_RESAMPLES * n_resamples):
        raise PipelineError("bootstrap produced too few two-class resamples")
    aucs = numerators[valid] / (pos_counts[valid] * neg_counts[valid])
    if not np.all(np.isfinite(aucs)):
        raise PipelineError("bootstrap produced non-finite AUC values")
    if np.any(aucs < -1e-9) or np.any(aucs > 1.0 + 1e-9):
        raise PipelineError("bootstrap produced AUC values outside [0, 1]")
    return np.clip(aucs, 0.0, 1.0)


def bootstrap_auc_ci(
    scores: np.ndarray, labels: np.ndarray, *, n_resamples: int = BOOTSTRAP_RESAMPLES, seed: int
) -> list[float]:
    """95% percentile bootstrap CI for ROC-AUC: ``[low, high]``."""
    aucs = bootstrap_auc_values(scores, labels, n_resamples=n_resamples, seed=seed)
    low, high = np.percentile(aucs, [2.5, 97.5])
    return [float(low), float(high)]
