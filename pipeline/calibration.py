"""Platt scaling and margin/probability transforms (C-03 formulas).

The Platt pair ``(slope, intercept)`` maps a raw ensemble margin to a
calibrated margin: ``calibratedMargin = slope * rawMargin + intercept`` and
``probability = sigmoid(calibratedMargin)`` (C-03). Fitting minimises the
logistic negative log-likelihood over margin columns with L-BFGS-B from a
fixed start point, so the result is deterministic; a non-positive slope is a
loud :class:`PipelineError`, never a silent repair.
"""

from __future__ import annotations

import numpy as np
from scipy.optimize import minimize
from scipy.special import expit

from .errors import PipelineError

_PROB_FLOOR = 1e-12


def sigmoid(z: np.ndarray | float) -> np.ndarray | float:
    """Numerically stable logistic function (never returns NaN/Inf for finite z)."""
    return expit(z)


def fit_platt(margins: np.ndarray, labels: np.ndarray) -> dict[str, float]:
    """Fit ``probability = sigmoid(slope * margin + intercept)`` by logistic NLL.

    Deterministic: fixed start ``(1, 0)``, L-BFGS-B, analytic gradient. Raises
    :class:`PipelineError` if optimisation fails or the fitted slope is not
    strictly positive (an anti-monotone calibration would invert decisions).
    """
    m = np.asarray(margins, dtype=np.float64).ravel()
    y = np.asarray(labels, dtype=np.float64).ravel()
    if m.shape != y.shape or m.size < 2:
        raise PipelineError("platt fit needs matching margins and labels with at least 2 rows")
    if not np.all(np.isfinite(m)):
        raise PipelineError("platt fit received non-finite margins")
    if not np.all(np.isfinite(y)):
        raise PipelineError("platt fit received non-finite labels")
    if np.unique(y).size < 2:
        raise PipelineError("platt fit needs both classes present")

    def value_and_gradient(theta: np.ndarray) -> tuple[float, np.ndarray]:
        slope = float(theta[0])
        intercept = float(theta[1])
        z = slope * m + intercept
        nll = float(np.sum(np.logaddexp(0.0, z) - y * z))
        diff = expit(z) - y
        grad = np.array([float(np.dot(diff, m)), float(np.sum(diff))], dtype=np.float64)
        return nll, grad

    result = minimize(value_and_gradient, x0=np.array([1.0, 0.0]), jac=True, method="L-BFGS-B")
    if not result.success:
        raise PipelineError(f"platt optimisation failed: {result.message}")
    slope = float(result.x[0])
    intercept = float(result.x[1])
    if not np.isfinite(slope) or not np.isfinite(intercept):
        raise PipelineError("platt optimisation produced non-finite parameters")
    if slope <= 0.0:
        raise PipelineError("platt slope must be strictly positive")
    return {"slope": slope, "intercept": intercept}


def apply_platt(margins: np.ndarray, platt: dict[str, float]) -> np.ndarray:
    """Calibrated probabilities for raw ensemble margins."""
    m = np.asarray(margins, dtype=np.float64)
    if not np.all(np.isfinite(m)):
        raise PipelineError("calibration received non-finite margins")
    slope = float(platt["slope"])
    intercept = float(platt["intercept"])
    if slope <= 0.0:
        raise PipelineError("platt slope must be strictly positive")
    probs = expit(slope * m + intercept)
    if not np.all(np.isfinite(probs)):
        raise PipelineError("calibration produced non-finite probabilities")
    return probs


def logit(probability: float) -> float:
    """Inverse sigmoid with a guarded interior so float 0/1 never explode."""
    p = float(probability)
    if not np.isfinite(p):
        raise PipelineError("logit received a non-finite probability")
    p = min(max(p, _PROB_FLOOR), 1.0 - _PROB_FLOOR)
    return float(np.log(p / (1.0 - p)))


def raw_margin_from_probability(probability: float, platt: dict[str, float]) -> float:
    """Threshold margin in raw ensemble margin space (C-03: derived, never hand-maintained)."""
    slope = float(platt["slope"])
    if slope <= 0.0:
        raise PipelineError("platt slope must be strictly positive")
    return (logit(probability) - float(platt["intercept"])) / slope
