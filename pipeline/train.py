"""Fixed model recipe and ensemble evaluation (Idea.md §4, C-03).

Per target: 0.5 * XGBoost raw margin (log-odds, ``output_margin=True`` — never
probability-then-log) + 0.5 * logistic-regression ``decision_function`` margin.
Hyperparameters are frozen a priori and never tuned here (Implementation_Plan
P2 step 7). No synthetic resampling of any kind exists in this module; the
protocol records that prohibition as ``protocol.noSmote`` in ``results.json``.
"""

from __future__ import annotations

import numpy as np
import xgboost as xgb
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from .errors import PipelineError

XGB_PARAMS: dict[str, object] = {
    "n_estimators": 200,
    "max_depth": 2,
    "learning_rate": 0.05,
    "subsample": 0.8,
    "colsample_bytree": 0.6,
    "reg_lambda": 5,
    "enable_categorical": False,
    "tree_method": "hist",
    "n_jobs": 1,
    "eval_metric": "logloss",
}
LR_C = 0.1
LR_MAX_ITER = 1000
ENSEMBLE_WEIGHT = 0.5


def make_xgb(random_state: int) -> xgb.XGBClassifier:
    """XGB classifier with the frozen hyperparameters and a derived seed."""
    return xgb.XGBClassifier(**XGB_PARAMS, random_state=int(random_state))


def make_lr() -> Pipeline:
    """Standardised logistic regression with the frozen hyperparameters."""
    return Pipeline(
        [
            ("scaler", StandardScaler()),
            ("lr", LogisticRegression(C=LR_C, solver="lbfgs", max_iter=LR_MAX_ITER)),
        ]
    )


def _checked_matrix(name: str, matrix: np.ndarray) -> np.ndarray:
    arr = np.asarray(matrix, dtype=np.float64)
    if arr.ndim != 2:
        raise PipelineError(f"{name} must be a 2D matrix")
    if not np.all(np.isfinite(arr)):
        raise PipelineError(f"{name} contains non-finite values")
    return arr


def fit_ensemble(
    features: np.ndarray, labels: np.ndarray, random_state: int
) -> tuple[xgb.XGBClassifier, Pipeline]:
    """Fit the XGB + LR pair on the rows it is given (and only those rows)."""
    x = _checked_matrix("training matrix", features)
    y = np.asarray(labels, dtype=np.int64).ravel()
    if x.shape[0] != y.shape[0]:
        raise PipelineError("training matrix and labels differ in length")
    if x.shape[0] < 2:
        raise PipelineError("training needs at least 2 rows")
    if np.unique(y).size < 2:
        raise PipelineError("training needs both classes present")
    xgb_model = make_xgb(random_state)
    xgb_model.fit(x, y)
    lr_model = make_lr()
    lr_model.fit(x, y)
    return xgb_model, lr_model


def ensemble_raw_margin(
    xgb_model: xgb.XGBClassifier, lr_model: Pipeline, features: np.ndarray
) -> np.ndarray:
    """0.5 * tree log-odds + 0.5 * linear margin, in raw margin space."""
    x = _checked_matrix("scoring matrix", features)
    dmat = xgb.DMatrix(x)
    tree_margin = np.asarray(xgb_model.get_booster().predict(dmat, output_margin=True), dtype=np.float64)
    linear_margin = np.asarray(lr_model.decision_function(x), dtype=np.float64)
    margins = ENSEMBLE_WEIGHT * tree_margin + ENSEMBLE_WEIGHT * linear_margin
    if not np.all(np.isfinite(margins)):
        raise PipelineError("ensemble produced non-finite margins")
    return margins
