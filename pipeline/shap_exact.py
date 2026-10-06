"""Exact interventional SHAP for the runtime-form additive ensemble (C-08 §8.3).

Attribution arithmetic over the serialized runtime form only — C-03 node
arrays and the C-03 linear block.  This module never imports xgboost,
sklearn, joblib or shap: shap 0.52 is the *reference oracle* driven by
``tests/test_shap_exact.py``, not a runtime dependency.

Why the values are exact and cheap here (Idea §5, Architecture §8.3):

* Every tree is depth-2 and therefore splits on at most 3 distinct features
  (the C-03 exact-attribution bound, re-checked at export).  A tree's leaf
  depends on case evidence only through those ≤ 3 **observed** split
  features — every other player has zero marginal contribution in every
  coalition of the full 54-player interventional game.  The game factorises
  exactly into the reduced ≤ 3-player game

      f(U) = mean over background rows of the leaf reached when the features
             in U are fixed to the case values and every other feature comes
             from the background row,   U ⊆ (split features ∩ observed)

  and the tree's Shapley values are the exact Shapley values of that reduced
  game (0 for all other features).  With k ≤ 3 this costs ``2^k`` subset
  evaluations per tree — no sampling, no permutation approximation, no
  background truncation.
* The linear part is additive.  With ``ē`` the empirical mean of the shipped
  background rows, the interventional value of a coalition fixes the observed
  members to case values and averages the rest over the background, giving

      φ_j = coef_j · (x_j − ē_j) / scale_j   for observed j, else 0.

  Using the background mean (not the scaler mean) is exactly what makes the
  efficiency identity ``Σφ + v(∅) = v(O)`` hold, because ``v(∅)`` averages
  those same background rows (Idea §5: "φᵢ = coefᵢ/scaleᵢ × (xᵢ − mean_bgᵢ)").

The Platt map is a positive affine transform of the ensemble margin, so both
parts are computed in raw-margin space here; ``pipeline.oracle`` applies the
``0.5·(tree + linear)`` weights and the Platt slope afterwards.

Numerics: split comparisons are float32 (C-04 / browser ``Math.fround``);
leaf means, subset means and all accumulations are float64.  Determinism:
split features sorted ascending, subsets enumerated by bitmask, trees walked
in document order — identical inputs produce identical bytes.

Import purity is enforced by ``tests/test_oracle.py``: ``xgboost``,
``sklearn``, ``joblib`` and ``shap`` must stay out of ``sys.modules`` after
importing ``pipeline.oracle`` (which imports this module).
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from typing import Any

import numpy as np

from .errors import PipelineError

MAX_SPLIT_FEATURES = 3


class ShapExactError(PipelineError):
    """A runtime-form tree is malformed or violates the exact-attribution bound."""


class DecisionTree:
    """One C-03 runtime-form tree: float32 split walk plus reduced-game Shapley.

    Nodes are the serialized C-03 form — each is either a split
    ``{featureIndex, threshold, left, right, leaf: null}`` or a leaf
    ``{featureIndex: null, threshold: null, left: null, right: null, leaf}``.
    Node 0 is the root; ``left``/``right`` index into the same array.
    """

    __slots__ = (
        "_feature",
        "_is_leaf",
        "_leaf_value",
        "_left",
        "_max_feature",
        "_right",
        "_threshold",
        "split_features",
    )

    def __init__(self, nodes: Sequence[dict]) -> None:
        if not nodes:
            raise ShapExactError("tree has no nodes")
        feature: list[int] = []
        threshold: list[float] = []
        left: list[int] = []
        right: list[int] = []
        leaf_value: list[float] = []
        is_leaf: list[bool] = []
        max_feature = -1
        split_features: set[int] = set()
        for index, node in enumerate(nodes):
            if not isinstance(node, dict):
                raise ShapExactError(f"tree node {index} is not an object")
            leaves = node.get("leaf")
            node_feature = node.get("featureIndex")
            if leaves is not None:
                if node_feature is not None or node.get("left") is not None:
                    raise ShapExactError(f"tree node {index} mixes leaf and split fields")
                value = float(leaves)
                if not math.isfinite(value):
                    raise ShapExactError(f"tree node {index} leaf is not finite")
                feature.append(-1)
                threshold.append(0.0)
                left.append(-1)
                right.append(-1)
                leaf_value.append(value)
                is_leaf.append(True)
                continue
            if not isinstance(node_feature, int) or node_feature < 0:
                raise ShapExactError(f"tree node {index} has no valid featureIndex")
            node_threshold = node.get("threshold")
            if not isinstance(node_threshold, (int, float)):
                raise ShapExactError(f"tree node {index} has no numeric threshold")
            numeric_threshold = float(node_threshold)
            if not math.isfinite(numeric_threshold):
                raise ShapExactError(f"tree node {index} threshold is not finite")
            node_left = node.get("left")
            node_right = node.get("right")
            if not isinstance(node_left, int) or not isinstance(node_right, int):
                raise ShapExactError(f"tree node {index} has no child indices")
            feature.append(node_feature)
            threshold.append(float(np.float32(numeric_threshold)))
            left.append(node_left)
            right.append(node_right)
            leaf_value.append(0.0)
            is_leaf.append(False)
            split_features.add(node_feature)
            max_feature = max(max_feature, node_feature)
        size = len(feature)
        for index in range(size):
            if is_leaf[index]:
                continue
            for child in (left[index], right[index]):
                if not 0 <= child < size:
                    raise ShapExactError(
                        f"tree node {index} child {child} outside [0, {size})"
                    )
            if left[index] == index or right[index] == index:
                raise ShapExactError(f"tree node {index} references itself")
        self._reject_cycles(feature, left, right, is_leaf)
        self._feature = feature
        self._threshold = threshold
        self._left = left
        self._right = right
        self._leaf_value = leaf_value
        self._is_leaf = is_leaf
        self._max_feature = max_feature
        self.split_features = tuple(sorted(split_features))
        if len(self.split_features) > MAX_SPLIT_FEATURES:
            raise ShapExactError(
                f"tree splits on {len(self.split_features)} distinct features "
                f"({list(self.split_features)}); the C-03 exact-attribution "
                f"bound is {MAX_SPLIT_FEATURES}"
            )

    @staticmethod
    def _reject_cycles(
        feature: list[int], left: list[int], right: list[int], is_leaf: list[bool]
    ) -> None:
        """Reject any cycle reachable from the root (a cyclic walk would hang).

        XGBoost dumps are acyclic by construction, so a cycle can only come
        from a malformed artifact; the walker must fail loudly, never spin.
        """
        colour = [0] * len(feature)  # 0 unseen, 1 on the DFS stack, 2 finished
        stack: list[tuple[int, int]] = [(0, 0)]
        while stack:
            node_index, stage = stack.pop()
            if stage == 0:
                if colour[node_index] == 1:
                    raise ShapExactError(f"tree node {node_index} is part of a cycle")
                if colour[node_index] == 2 or is_leaf[node_index]:
                    continue
                colour[node_index] = 1
                stack.append((node_index, 1))
                stack.append((right[node_index], 0))
                stack.append((left[node_index], 0))
            else:
                colour[node_index] = 2

    def leaves(self, rows: np.ndarray) -> np.ndarray:
        """Leaf value per row.  Split comparisons are float32 (C-04 numerics)."""
        matrix = np.asarray(rows, dtype=np.float64)
        if matrix.ndim != 2:
            raise ShapExactError("tree walk needs a 2D row matrix")
        if matrix.shape[1] <= self._max_feature:
            raise ShapExactError(
                f"row width {matrix.shape[1]} does not cover split feature "
                f"{self._max_feature}"
            )
        if not np.all(np.isfinite(matrix)):
            raise ShapExactError("tree walk received a non-finite input")
        rounded = matrix.astype(np.float32).tolist()
        feature = self._feature
        threshold = self._threshold
        left = self._left
        right = self._right
        leaf_value = self._leaf_value
        is_leaf = self._is_leaf
        out = np.empty(matrix.shape[0], dtype=np.float64)
        for row_index, row in enumerate(rounded):
            node_index = 0
            while not is_leaf[node_index]:
                value = row[feature[node_index]]
                if value < threshold[node_index]:
                    node_index = left[node_index]
                else:
                    node_index = right[node_index]
            out[row_index] = leaf_value[node_index]
        return out

    def shapley_values(
        self,
        background: np.ndarray,
        case_row: np.ndarray,
        observed: np.ndarray,
    ) -> np.ndarray:
        """Exact Shapley values of this tree's interventional mean-leaf game.

        Returns a length-``n_features`` float64 vector: nonzero only on
        observed split features, in raw ensemble-margin space (no Platt
        scaling, no ensemble weights).  ``observed`` is the boolean case mask
        in registry feature order.
        """
        rows = np.asarray(background, dtype=np.float64)
        case = np.asarray(case_row, dtype=np.float64).ravel()
        mask = np.asarray(observed, dtype=bool).ravel()
        if rows.ndim != 2 or rows.shape[1] != case.shape[0]:
            raise ShapExactError("background and case widths differ")
        if mask.shape[0] != case.shape[0]:
            raise ShapExactError("observed mask width differs from the case")
        if not np.all(np.isfinite(case[mask])):
            raise ShapExactError("case values for observed features are not finite")
        players = [index for index in self.split_features if mask[index]]
        phi = np.zeros(case.shape[0], dtype=np.float64)
        if not players:
            return phi
        subsets = 1 << len(players)
        buffer = np.array(rows, dtype=np.float64, copy=True)
        background_columns = {index: rows[:, index].copy() for index in players}
        subset_values = np.empty(subsets, dtype=np.float64)
        for bits in range(subsets):
            for position, index in enumerate(players):
                if bits & (1 << position):
                    buffer[:, index] = case[index]
                else:
                    buffer[:, index] = background_columns[index]
            subset_values[bits] = float(np.mean(self.leaves(buffer)))
        for position, index in enumerate(players):
            phi[index] = _shapley_coordinate(subset_values, len(players), position)
        return phi


def _shapley_coordinate(subset_values: np.ndarray, player_count: int, position: int) -> float:
    """Exact Shapley value of one player from all ``2^k`` subset values."""
    total = 0.0
    factorial = math.factorial
    normaliser = factorial(player_count)
    for bits in range(1 << player_count):
        if bits & (1 << position):
            continue
        size = bits.bit_count()
        weight = factorial(size) * factorial(player_count - size - 1) / normaliser
        total += weight * (
            float(subset_values[bits | (1 << position)]) - float(subset_values[bits])
        )
    return float(total)


def exact_tree_shapley(
    trees: Sequence[DecisionTree],
    background: np.ndarray,
    case_row: np.ndarray,
    observed: np.ndarray,
) -> np.ndarray:
    """Sum of the exact per-tree Shapley values (raw margin space, unscaled).

    Shapley values are additive over games, so the ensemble tree game — the
    sum of per-tree mean-leaf games — is the sum of their exact values.
    """
    total = None
    for tree in trees:
        phi = tree.shapley_values(background, case_row, observed)
        total = phi if total is None else total + phi
    if total is None:
        total = np.zeros(np.asarray(case_row).ravel().shape[0], dtype=np.float64)
    return total


def linear_attributions(
    linear_block: dict[str, Any],
    case_row: np.ndarray,
    observed: np.ndarray,
    background_mean: np.ndarray,
) -> np.ndarray:
    """Closed-form interventional Shapley values of the linear part.

    ``φ_j = coef_j·(x_j − ē_j)/scale_j`` for observed features, 0 otherwise
    (raw margin space, unscaled).  ``background_mean`` is the empirical mean
    of the shipped background rows — the same rows ``v(∅)`` averages — which
    is what keeps ``Σφ + v(∅) = v(O)`` exact.
    """
    coefficients = np.asarray(linear_block["coefficientByFeature"], dtype=np.float64)
    scales = np.asarray(linear_block["scaleByFeature"], dtype=np.float64)
    case = np.asarray(case_row, dtype=np.float64).ravel()
    mask = np.asarray(observed, dtype=bool).ravel()
    means = np.asarray(background_mean, dtype=np.float64).ravel()
    if not (coefficients.shape == scales.shape == means.shape == case.shape == mask.shape):
        raise ShapExactError("linear block and case widths differ")
    if np.any(scales == 0.0):
        raise ShapExactError("linear block contains a zero scale")
    phi = np.zeros(case.shape[0], dtype=np.float64)
    if not bool(mask.any()):
        return phi
    phi[mask] = coefficients[mask] * (case[mask] - means[mask]) / scales[mask]
    return phi
