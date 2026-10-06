"""Runtime-form evaluation and explanation over ``model.json`` only (C-08).

This is the Python reference implementation of the C-08 engine rules.  It
consumes the exported runtime artifact plus the frozen config documents — never
the training library, never ``results.json`` — and returns the exact payloads
the TypeScript engine must reproduce at parity 1e-5 (C-06 golden fixtures).

Arithmetic (C-03 / C-04, unchanged from the validated pipeline):

* ``treeMargin(x) = baseScore + Σ leaves`` walked with float32 split comparisons
  and float64 accumulation.
* ``linearMargin(x) = intercept + Σ coef·(x − mean)/scale``.
* ``rawMargin = 0.5·treeMargin + 0.5·linearMargin``.
* ``calibratedMargin = slope·rawMargin + intercept``; ``p = sigmoid(...)``.
* Decision lives in **raw** ensemble margin space: ``above`` iff
  ``raw > thresholdMargin + h``, ``below`` iff ``raw < thresholdMargin − h``,
  otherwise ``indeterminate`` (the band edges belong to indeterminate).  The
  threshold margin is derived from the exported threshold probability and the
  Platt pair via :func:`pipeline.calibration.raw_margin_from_probability`;
  ``h`` is the exported ``abstentionHalfWidthMargin`` (both read, never fitted).
* Reliability is *looked up* from ``reliabilityReferences`` — a target-level
  property that never varies with the case (C-08).

Missing evidence (the only allowed value function, C-08): with ``O`` the
observed features, ``B`` the 60 shipped background rows and
``g(x) = slope·0.5·(tree+linear) + intercept``::

    v(S) = mean over b∈B of g(x restricted to S, b elsewhere),  S ⊆ O
    p    = sigmoid(v(O));   reference = sigmoid(v(∅))
    φ_i  = exact Shapley value of i in game (O, v), scaled by 0.5·slope
    Σφ + reference = output     (|residual| ≤ 1e-6)

so attributions, reference and output all live in calibrated-margin space.
Display groups and modalities aggregate by summation over observed members;
groups with no observed member are omitted (an unprovided feature must never
receive a zero bar).

Transport rule (C-07): case values reach the engine through a ``Float32Array``,
so the encoded case vector is rounded to float32 on entry here; background rows
stay float64 exactly as the worker loads them from ``model.json``.

Purity: importing this module must never pull ``xgboost``, ``sklearn``,
``joblib`` or ``shap`` into ``sys.modules``; ``tests/test_oracle.py`` asserts
that in a fresh interpreter.  Error messages never carry patient values (C-07),
and ``c07_error_code`` maps every typed failure onto the C-07 error-code enum.
"""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any

import numpy as np

from .calibration import raw_margin_from_probability, sigmoid
from .config import feature_list, load_features, load_registry
from .encode import encode_case, range_flag
from .errors import EncodingError, ForbiddenInputError, PipelineError
from .shap_exact import (
    DecisionTree,
    ShapExactError,
    exact_tree_shapley,
    linear_attributions,
)

ORACLE_REVISION = "1.0.0"
MODEL_PATH = Path(__file__).resolve().parents[1] / "model.json"
CONTRACT_TARGETS = ("CAD", "LAD", "LCX", "RCA")
CONTRACT_TIERS = ("strong", "moderate", "limited")
CAVEATS = (
    "ATTRIBUTION_NOT_CAUSATION",
    "CORRELATED_FEATURES_SHARE_CREDIT",
    "BACKGROUND_SET_DEPENDENT",
)


class OracleError(PipelineError):
    """The runtime-form document or an evaluation request is structurally invalid.

    ``code`` is the C-07 error code the worker should report; request-shaped
    failures use ``INVALID_FEATURE_VECTOR`` / ``NONFINITE_INPUT`` /
    ``MALFORMED_REQUEST``, artifact-shaped failures ``ARTIFACT_INVALID``.
    """

    def __init__(self, message: str, code: str = "ARTIFACT_INVALID") -> None:
        super().__init__(message)
        self.code = code


def c07_error_code(exc: Exception) -> str:
    """Map a typed oracle/encoding failure onto the C-07 ``ComputeError.code``."""
    if isinstance(exc, OracleError):
        return exc.code
    if isinstance(exc, ForbiddenInputError):
        return "MALFORMED_REQUEST"
    if isinstance(exc, EncodingError):
        if exc.reason == "non-finite value":
            return "NONFINITE_INPUT"
        return "INVALID_FEATURE_VECTOR"
    if isinstance(exc, ShapExactError):
        return "ARTIFACT_INVALID"
    if isinstance(exc, PipelineError):
        return "INTERNAL_COMPUTE_FAILURE"
    return "INTERNAL_COMPUTE_FAILURE"


def _sigmoid(value: float) -> float:
    """float64 logistic (C-03), returned as a plain float for JSON parity."""
    return float(sigmoid(float(value)))


def _direction(contribution: float) -> str:
    if contribution > 0.0:
        return "positive"
    if contribution < 0.0:
        return "negative"
    return "neutral"


def decide_state(raw_margin: float, threshold_margin: float, half_width: float) -> str:
    """C-08 decision in raw ensemble-margin space (band edges are indeterminate)."""
    if raw_margin > threshold_margin + half_width:
        return "above"
    if raw_margin < threshold_margin - half_width:
        return "below"
    return "indeterminate"


def _finite_number(value: Any, label: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise OracleError(f"{label} is not numeric")
    number = float(value)
    if not math.isfinite(number):
        raise OracleError(f"{label} is not finite")
    return number


def _float_array(value: Any, size: int, label: str) -> np.ndarray:
    if not isinstance(value, (list, tuple)):
        raise OracleError(f"{label} is not a list")
    try:
        array = np.asarray(value, dtype=np.float64)
    except (TypeError, ValueError) as exc:
        raise OracleError(f"{label} is not numeric") from exc
    if array.shape != (size,):
        raise OracleError(f"{label} does not have {size} entries")
    if not bool(np.all(np.isfinite(array))):
        raise OracleError(f"{label} contains a non-finite entry")
    return array


class Oracle:
    """Evaluation and explanation over one immutable runtime-form document."""

    def __init__(
        self,
        document: dict,
        *,
        registry: dict | None = None,
        features_doc: dict | None = None,
    ) -> None:
        if not isinstance(document, dict):
            raise OracleError("model document root is not an object")

        metadata = document.get("metadata")
        if not isinstance(metadata, dict):
            raise OracleError("model document has no metadata block")
        if metadata.get("schemaVersion") != "1.0.0":
            raise OracleError("model metadata schemaVersion is not 1.0.0")
        model_id = metadata.get("modelId")
        if not isinstance(model_id, str) or not model_id.startswith("sha256:"):
            raise OracleError("model metadata modelId is not a sha256 identity")
        if len(model_id) != 71:
            raise OracleError("model metadata modelId is not a sha256 identity")
        self.model_id = model_id

        features = document.get("features")
        if not isinstance(features, list) or not features:
            raise OracleError("model features block is empty")
        if not all(isinstance(item, str) for item in features):
            raise OracleError("model features block is not a list of ids")
        self.feature_ids: tuple[str, ...] = tuple(features)
        self.n_features = len(self.feature_ids)

        targets = document.get("targets")
        if targets != list(CONTRACT_TARGETS):
            raise OracleError("model target order differs from the C-03 contract")
        self._targets = CONTRACT_TARGETS

        self._features_doc = features_doc if features_doc is not None else load_features()
        self._feature_defs = feature_list(self._features_doc)
        config_ids = tuple(item["id"] for item in self._feature_defs)
        if config_ids != self.feature_ids:
            raise OracleError("config feature order differs from the model")

        self._registry = registry if registry is not None else load_registry()
        registry_ids = tuple(item["id"] for item in self._registry["features"])
        if registry_ids != self.feature_ids:
            raise OracleError("registry feature order differs from the model")
        self._feature_by_id = {
            item["id"]: item for item in self._feature_defs
        }

        self._trees: dict[str, list[DecisionTree]] = {}
        self._base_score: dict[str, float] = {}
        self._linear: dict[str, dict[str, np.ndarray]] = {}
        self._platt: dict[str, tuple[float, float]] = {}
        self._decisions: dict[str, dict[str, float]] = {}
        self._reliability: dict[str, str] = {}
        self._load_targets(document)

        self._load_background(document)
        self._reference_raw = {
            target_id: self._mean_raw_margin(target_id, self._background)
            for target_id in self._targets
        }
        self._load_grouping()

    # ---------------------------------------------------------------- load

    @classmethod
    def load(cls, path: Path = MODEL_PATH) -> Oracle:
        """Read ``model.json`` and validate it as a runtime-form document."""
        try:
            text = Path(path).read_text(encoding="utf-8")
        except OSError as exc:
            raise OracleError(f"cannot read the model document at {path}") from exc
        try:
            document = json.loads(text)
        except json.JSONDecodeError as exc:
            raise OracleError("the model document is not valid JSON") from exc
        return cls(document)

    def _load_targets(self, document: dict) -> None:
        components = document.get("components")
        if not isinstance(components, dict):
            raise OracleError("model document has no components block")
        parameters = document.get("decisionParameters")
        if not isinstance(parameters, dict):
            raise OracleError("model document has no decisionParameters block")
        references = document.get("reliabilityReferences")
        if not isinstance(references, list):
            raise OracleError("model document has no reliabilityReferences block")

        tiers: dict[str, str] = {}
        for entry in references:
            if not isinstance(entry, dict):
                raise OracleError("reliability reference is not an object")
            target_id = entry.get("targetId")
            tier = entry.get("tier")
            if target_id not in CONTRACT_TARGETS:
                raise OracleError("reliability reference names an unknown target")
            if tier not in CONTRACT_TIERS:
                raise OracleError("reliability reference has an unknown tier")
            if target_id in tiers:
                raise OracleError("reliability references name a target twice")
            tiers[target_id] = tier
        if set(tiers) != set(CONTRACT_TARGETS):
            raise OracleError("reliability references do not cover every target")
        self._reliability = tiers

        for target_id in self._targets:
            block = components.get(target_id)
            if not isinstance(block, dict):
                raise OracleError(f"{target_id} has no component block")
            self._load_trees(target_id, block.get("trees"))
            self._load_linear(target_id, block.get("linear"))
            self._load_platt(target_id, block.get("platt"))
            self._load_decision(target_id, parameters.get(target_id))

    def _load_trees(self, target_id: str, block: Any) -> None:
        if not isinstance(block, dict):
            raise OracleError(f"{target_id} has no trees block")
        base_score = _finite_number(block.get("baseScore"), f"{target_id} baseScore")
        entries = block.get("trees")
        tree_count = block.get("treeCount")
        if not isinstance(entries, list):
            raise OracleError(f"{target_id} trees block is not a list")
        if not isinstance(tree_count, int) or tree_count != len(entries):
            raise OracleError(f"{target_id} treeCount differs from the tree list")
        trees: list[DecisionTree] = []
        for index, entry in enumerate(entries):
            nodes = entry.get("nodes") if isinstance(entry, dict) else entry
            if not isinstance(nodes, list):
                raise OracleError(f"{target_id} tree {index} has no node list")
            trees.append(DecisionTree(nodes))
        self._trees[target_id] = trees
        self._base_score[target_id] = base_score

    def _load_linear(self, target_id: str, block: Any) -> None:
        if not isinstance(block, dict):
            raise OracleError(f"{target_id} has no linear block")
        size = self.n_features
        intercept = _finite_number(block.get("intercept"), f"{target_id} linear intercept")
        scale = _float_array(block.get("scaleByFeature"), size, f"{target_id} scaleByFeature")
        if bool(np.any(scale == 0.0)):
            raise OracleError(f"{target_id} scaleByFeature contains a zero")
        self._linear[target_id] = {
            "intercept": np.float64(intercept),
            "coefficientByFeature": _float_array(
                block.get("coefficientByFeature"), size, f"{target_id} coefficientByFeature"
            ),
            "meanByFeature": _float_array(
                block.get("meanByFeature"), size, f"{target_id} meanByFeature"
            ),
            "scaleByFeature": scale,
        }

    def _load_platt(self, target_id: str, block: Any) -> None:
        if not isinstance(block, dict):
            raise OracleError(f"{target_id} has no platt block")
        slope = _finite_number(block.get("slope"), f"{target_id} platt slope")
        intercept = _finite_number(block.get("intercept"), f"{target_id} platt intercept")
        if slope <= 0.0:
            raise OracleError(f"{target_id} platt slope is not positive")
        self._platt[target_id] = (slope, intercept)

    def _load_decision(self, target_id: str, block: Any) -> None:
        if not isinstance(block, dict):
            raise OracleError(f"{target_id} has no decisionParameters entry")
        threshold = _finite_number(
            block.get("thresholdProbability"), f"{target_id} thresholdProbability"
        )
        half_width = _finite_number(
            block.get("abstentionHalfWidthMargin"), f"{target_id} abstentionHalfWidthMargin"
        )
        if not 0.0 < threshold < 1.0:
            raise OracleError(f"{target_id} thresholdProbability is outside (0, 1)")
        if half_width <= 0.0:
            raise OracleError(f"{target_id} abstention half width is not positive")
        slope, intercept = self._platt[target_id]
        threshold_margin = raw_margin_from_probability(threshold, self._platt_dict(target_id))
        self._decisions[target_id] = {
            "thresholdProbability": threshold,
            "thresholdMargin": threshold_margin,
            "halfWidthMargin": half_width,
            "lowerProbability": _sigmoid(slope * (threshold_margin - half_width) + intercept),
            "upperProbability": _sigmoid(slope * (threshold_margin + half_width) + intercept),
        }

    def _platt_dict(self, target_id: str) -> dict[str, float]:
        slope, intercept = self._platt[target_id]
        return {"slope": slope, "intercept": intercept}

    def _load_background(self, document: dict) -> None:
        background = document.get("background")
        if not isinstance(background, dict):
            raise OracleError("model document has no background block")
        rows = background.get("rows")
        count = background.get("count")
        if not isinstance(rows, list) or not rows:
            raise OracleError("background rows are empty")
        if not isinstance(count, int) or count != len(rows):
            raise OracleError("background count differs from the row list")
        try:
            matrix = np.asarray(rows, dtype=np.float64)
        except (TypeError, ValueError) as exc:
            raise OracleError("background rows are not rectangular numbers") from exc
        if matrix.ndim != 2 or matrix.shape[1] != self.n_features:
            raise OracleError("background rows do not match the feature count")
        if not bool(np.all(np.isfinite(matrix))):
            raise OracleError("background rows contain a non-finite entry")
        self._background = matrix
        self._background_mean = matrix.mean(axis=0)

    def _load_grouping(self) -> None:
        index = {fid: position for position, fid in enumerate(self.feature_ids)}
        registry_features = {item["id"]: item for item in self._registry["features"]}

        groups = self._registry.get("displayGroups")
        if not isinstance(groups, list):
            raise OracleError("registry has no displayGroups list")
        group_of: dict[str, str] = {}
        members: dict[str, list[int]] = {}
        for group in groups:
            if not isinstance(group, dict) or not isinstance(group.get("id"), str):
                raise OracleError("registry display group is malformed")
            group_id = group["id"]
            declared = group.get("features")
            if not isinstance(declared, list) or not declared:
                raise OracleError("registry display group has no members")
            for fid in declared:
                if fid not in index:
                    raise OracleError("registry display group names an unknown feature")
                if fid in group_of:
                    raise OracleError("registry feature belongs to two display groups")
                if registry_features[fid].get("displayGroup") != group_id:
                    raise OracleError("registry display group membership disagrees")
                group_of[fid] = group_id

        self._modality_members: dict[str, list[int]] = {}
        for position, fid in enumerate(self.feature_ids):
            feature = registry_features[fid]
            declared_group = feature.get("displayGroup")
            if declared_group is not None and group_of.get(fid) != declared_group:
                raise OracleError("registry display group membership disagrees")
            group_of.setdefault(fid, fid)
            members.setdefault(group_of[fid], []).append(position)
            modality = feature.get("modality")
            if not isinstance(modality, str):
                raise OracleError("registry feature has no modality")
            self._modality_members.setdefault(modality, []).append(position)
        self._group_of = group_of
        self._group_members = {gid: sorted(items) for gid, items in members.items()}

        modalities = self._registry.get("modalities")
        if not isinstance(modalities, list):
            raise OracleError("registry has no modalities list")
        ordered = []
        for entry in modalities:
            if not isinstance(entry, dict) or not isinstance(entry.get("id"), str):
                raise OracleError("registry modality is malformed")
            ordered.append((int(entry.get("order", 0)), entry["id"]))
        ordered.sort()
        self._modality_order = [modality_id for _, modality_id in ordered]

    # ------------------------------------------------------------- encoding

    def encode(
        self,
        values: dict[str, Any],
        provided: dict[str, bool] | None = None,
    ) -> tuple[np.ndarray, np.ndarray]:
        """Source-space case → ``(featureVector, observedMask)`` in registry order.

        Unprovided features encode to ``NaN`` in the vector — the mask, never the
        stored value, decides participation (INV-C08/C09).
        """
        encoded = encode_case(
            values,
            provided=provided,
            features_doc=self._features_doc,
            enforce_range=False,
        )
        vector = np.full(self.n_features, np.nan, dtype=np.float64)
        mask = np.zeros(self.n_features, dtype=bool)
        for position, fid in enumerate(self.feature_ids):
            value = encoded[fid]
            if value is None:
                continue
            vector[position] = float(value)
            mask[position] = True
        return self._round_case(vector, mask), mask

    @staticmethod
    def _round_case(vector: np.ndarray, mask: np.ndarray) -> np.ndarray:
        """C-07 transport: the case vector travels as a ``Float32Array``."""
        return vector.astype(np.float32).astype(np.float64)

    def _coerce(self, vector: Any, observed: Any) -> tuple[np.ndarray, np.ndarray]:
        mask_array = np.asarray(observed)
        if mask_array.shape != (self.n_features,):
            raise OracleError(
                f"observed mask must have {self.n_features} entries",
                code="INVALID_FEATURE_VECTOR",
            )
        if mask_array.dtype != bool:
            try:
                numeric = np.asarray(mask_array, dtype=np.float64)
            except (TypeError, ValueError) as exc:
                raise OracleError(
                    "observed mask must be 0 or 1", code="INVALID_FEATURE_VECTOR"
                ) from exc
            if bool(np.any(np.isnan(numeric))) or not bool(np.all(np.isin(numeric, (0.0, 1.0)))):
                raise OracleError("observed mask must be 0 or 1", code="INVALID_FEATURE_VECTOR")
        mask = mask_array.astype(bool)
        try:
            case = np.asarray(vector, dtype=np.float64)
        except (TypeError, ValueError) as exc:
            raise OracleError(
                "feature vector is not numeric", code="INVALID_FEATURE_VECTOR"
            ) from exc
        if case.shape != (self.n_features,):
            raise OracleError(
                f"feature vector must have {self.n_features} entries",
                code="INVALID_FEATURE_VECTOR",
            )
        case = self._round_case(case, mask)
        if not bool(np.all(np.isfinite(case[mask]))):
            raise OracleError(
                "observed feature value is not finite", code="NONFINITE_INPUT"
            )
        return case, mask

    # ------------------------------------------------------------ margins

    def _coalition_matrix(self, vector: np.ndarray, mask: np.ndarray) -> np.ndarray:
        """Rows evaluated for ``v(S)``: one row when fully observed, else 60."""
        if bool(mask.all()):
            return vector.reshape(1, -1)
        matrix = self._background.copy()
        matrix[:, mask] = vector[mask]
        return matrix

    def _tree_margins(self, target_id: str, matrix: np.ndarray) -> np.ndarray:
        total = np.zeros(matrix.shape[0], dtype=np.float64)
        for tree in self._trees[target_id]:
            total += tree.leaves(matrix)
        return total + self._base_score[target_id]

    def _linear_margins(self, target_id: str, matrix: np.ndarray) -> np.ndarray:
        block = self._linear[target_id]
        standard = (matrix - block["meanByFeature"]) / block["scaleByFeature"]
        return block["intercept"] + standard @ block["coefficientByFeature"]

    def _mean_raw_margin(self, target_id: str, matrix: np.ndarray) -> float:
        tree = self._tree_margins(target_id, matrix)
        linear = self._linear_margins(target_id, matrix)
        return float(np.mean(0.5 * tree + 0.5 * linear))

    def raw_margin(self, target_id: str, vector: Any, observed: Any) -> float:
        """Raw ensemble margin for one target (the space decisions live in)."""
        self._require_target(target_id)
        case, mask = self._coerce(vector, observed)
        return self._mean_raw_margin(target_id, self._coalition_matrix(case, mask))

    def raw_margins(self, vector: Any, observed: Any) -> dict[str, float]:
        """Raw ensemble margin for every target (C-08 / oracle-vs-library checks)."""
        case, mask = self._coerce(vector, observed)
        return {
            target_id: self._mean_raw_margin(
                target_id, self._coalition_matrix(case, mask)
            )
            for target_id in self._targets
        }

    def _require_target(self, target_id: str) -> None:
        if target_id not in self._targets:
            raise OracleError(
                f"unknown target {target_id!r}", code="MALFORMED_REQUEST"
            )

    # ---------------------------------------------------------- evaluation

    def evaluate(self, vector: Any, observed: Any) -> dict:
        """C-08 ``Evaluation`` without ``revision`` (the store assigns that)."""
        case, mask = self._coerce(vector, observed)
        targets = {
            target_id: self._target_evaluation(target_id, case, mask)
            for target_id in self._targets
        }
        return {
            "observedFeatureIds": [
                fid for fid, keep in zip(self.feature_ids, mask) if bool(keep)
            ],
            "targets": targets,
            "headlineCad": self._headline(targets),
            "rangeFlags": self._range_flags(case, mask),
        }

    def evaluate_case(
        self, values: dict[str, Any], provided: dict[str, bool] | None = None
    ) -> dict:
        """Encode a source-space case and evaluate it (``evaluate_case``)."""
        case, mask = self.encode(values, provided)
        return self.evaluate(case, mask)

    def _target_evaluation(
        self, target_id: str, case: np.ndarray, mask: np.ndarray
    ) -> dict:
        raw = self._mean_raw_margin(target_id, self._coalition_matrix(case, mask))
        slope, intercept = self._platt[target_id]
        calibrated = slope * raw + intercept
        probability = _sigmoid(calibrated)
        if not math.isfinite(probability) or not 0.0 <= probability <= 1.0:
            raise OracleError(
                f"{target_id} produced a non-finite probability", code="NONFINITE_INPUT"
            )
        parameters = self._decisions[target_id]
        return {
            "targetId": target_id,
            "probability": probability,
            "calibratedMargin": float(calibrated),
            "thresholdProbability": parameters["thresholdProbability"],
            "decision": decide_state(
                raw, parameters["thresholdMargin"], parameters["halfWidthMargin"]
            ),
            "reliability": self._reliability[target_id],
            "abstention": {
                "lowerProbability": parameters["lowerProbability"],
                "upperProbability": parameters["upperProbability"],
                "halfWidthMargin": parameters["halfWidthMargin"],
            },
        }

    def _headline(self, targets: dict[str, dict]) -> dict:
        source = max(
            self._targets, key=lambda target_id: targets[target_id]["probability"]
        )
        cad = targets["CAD"]
        return {
            "probability": targets[source]["probability"],
            "valueSourceTargetId": source,
            "decisionReferenceTargetId": "CAD",
            "decision": cad["decision"],
            "reliability": cad["reliability"],
            "thresholdProbability": cad["thresholdProbability"],
            "explanationSourceTargetId": source,
        }

    def _range_flags(self, case: np.ndarray, mask: np.ndarray) -> dict[str, bool]:
        return {
            fid: bool(range_flag(self._feature_by_id[fid], float(case[position])))
            if bool(mask[position])
            else False
            for position, fid in enumerate(self.feature_ids)
        }

    # --------------------------------------------------------- explanation

    def explain(self, vector: Any, observed: Any, target_id: str) -> dict:
        """C-08 ``Explanation`` without ``revision`` / ``measurements`` / ``narrative``.

        Those three fields are store- or presentation-owned; C-06 fixes the
        fixture subset (target, margins, attributions, group sums, modality
        sums, residual, caveats), which is what this returns.
        """
        self._require_target(target_id)
        case, mask = self._coerce(vector, observed)
        slope, intercept = self._platt[target_id]

        phi_tree = exact_tree_shapley(self._trees[target_id], self._background, case, mask)
        phi_linear = linear_attributions(
            self._linear[target_id], case, mask, self._background_mean
        )
        phi = (0.5 * slope) * (phi_tree + phi_linear)

        output_margin = slope * self._mean_raw_margin(
            target_id, self._coalition_matrix(case, mask)
        ) + intercept
        reference_margin = slope * self._reference_raw[target_id] + intercept
        residual = float(np.sum(phi)) + reference_margin - output_margin
        if not math.isfinite(residual):
            raise OracleError(
                f"{target_id} produced a non-finite efficiency residual",
                code="NONFINITE_INPUT",
            )

        attributions = [
            {
                "featureId": fid,
                "value": float(case[position]),
                "contribution": float(phi[position]),
                "direction": _direction(float(phi[position])),
            }
            for position, fid in enumerate(self.feature_ids)
            if bool(mask[position])
        ]
        return {
            "targetId": target_id,
            "referenceMargin": float(reference_margin),
            "outputMargin": float(output_margin),
            "efficiencyResidual": residual,
            "featureAttributions": attributions,
            "displayGroups": self._display_groups(phi, mask),
            "modalityContributions": self._modality_contributions(phi, mask),
            "caveats": list(CAVEATS),
        }

    def explain_case(
        self,
        values: dict[str, Any],
        provided: dict[str, bool] | None,
        target_id: str,
    ) -> dict:
        """Encode a source-space case and explain it for one target."""
        case, mask = self.encode(values, provided)
        return self.explain(case, mask, target_id)

    def _display_groups(self, phi: np.ndarray, mask: np.ndarray) -> list[dict]:
        emitted: list[dict] = []
        seen: set[str] = set()
        for position, fid in enumerate(self.feature_ids):
            group_id = self._group_of[fid]
            if group_id in seen:
                continue
            seen.add(group_id)
            members = self._group_members[group_id]
            observed = [member for member in members if bool(mask[member])]
            if not observed:
                continue
            emitted.append(
                {
                    "groupId": group_id,
                    "contribution": float(sum(phi[member] for member in observed)),
                    "memberFeatureIds": [self.feature_ids[member] for member in members],
                }
            )
        return emitted

    def _modality_contributions(self, phi: np.ndarray, mask: np.ndarray) -> list[dict]:
        emitted: list[dict] = []
        for modality_id in self._modality_order:
            members = self._modality_members.get(modality_id, [])
            observed = [member for member in members if bool(mask[member])]
            if not observed:
                continue
            emitted.append(
                {
                    "modalityId": modality_id,
                    "contribution": float(sum(phi[member] for member in observed)),
                    "memberFeatureIds": [self.feature_ids[member] for member in members],
                }
            )
        return emitted
