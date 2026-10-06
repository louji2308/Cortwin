"""C-03 model bundle export — builds the canonical root ``model.json``.

``pipeline/artifacts/deployed_model.joblib`` (written by ``pipeline.reproduce``)
is a build-only container of fitted estimators; the browser can never load it.
This module converts it into the runtime-form document defined by Contracts
§5.3 (C-03) with exactly these top-level sections, in this order::

    metadata, features, targets, components, decisionParameters,
    reliabilityReferences, background, percentiles, provenance

Numerical rules implemented here (C-03 numerics + Architecture §8):

* ``baseScore`` is explicit per target. xgboost stores ``base_score`` as a
  *probability* for ``binary:logistic`` and applies the inverse-logit link to
  obtain the initial margin. This module derives the margin with that link so
  that ``baseScore + sum(leaf values)`` equals the library's
  ``output_margin`` prediction.
* Split comparisons are float32 (browser ``Math.fround`` semantics, C-04
  numerics); leaf accumulation is double precision.
* Additivity is asserted at export time against the training library on the
  60 background rows plus cohort rows, tolerance ``1e-5`` (C-06 margin
  tolerance); a breach raises :class:`AdditivityError` — the export never
  writes a model that disagrees with its library of record.
* Any tree with more than 3 distinct split features is rejected with
  :class:`AttributionBoundExceededError` (C-03 exact-attribution bound for the
  frozen depth-2 family).

Two serializations, both documented and tested:

* **File bytes** (``model.json``): compact JSON (``separators=(",", ":")``,
  ``ensure_ascii=True``, ``allow_nan=False``) with the nine top-level
  sections emitted **in C-03 contract order** (``MODEL_TOP_LEVEL_SECTIONS``)
  — Contracts §5.3 fixes that order, so a ``sort_keys`` dump would violate
  the contract even though a dict lookup would not notice.
* **``modelId``** (content identity): ``sha256:<hex>`` over canonical compact
  JSON with ``sort_keys=True`` (order-independent pure function of content)
  of the document **minus** ``metadata.modelId``, **minus**
  ``metadata.appVersion`` and **minus** the whole ``provenance`` section.
  Those three are source/environment identity, not model content: Contracts
  §4 Versioning requires code-only changes *not* to alter ``modelId`` (and
  Architecture §6.2 defines ``modelId`` as "anything the model computes
  changes"). Everything that changes what the model computes — trees,
  coefficients, scaler, Platt, thresholds, tiers, background rows,
  percentiles, feature order — changes ``modelId``.

Determinism: no timestamps, no wall-clock, no git state, no dict insertion
dependence (section order is fixed by the contract; ``modelId`` hashing
sorts keys), float repr from the interpreter — two exports of the same
inputs produce byte-identical files (proven by
``tests/test_export_model.py``).

Run as ``python -m pipeline.export_model`` or ``python pipeline/export_model.py``
(the ``make export`` entry point executes the file directly).
"""

from __future__ import annotations

import hashlib
import json
import math
import sys
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import xgboost as xgb

if __package__ in (None, ""):  # direct script execution (``make export``)
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from pipeline.config import load_features, load_registry
    from pipeline.errors import PipelineError
    from pipeline.prepare import prepare_dataset
else:
    from .config import load_features, load_registry
    from .errors import PipelineError
    from .prepare import prepare_dataset

REPO_ROOT = Path(__file__).resolve().parents[1]
DEPLOYED_MODEL_PATH = REPO_ROOT / "pipeline" / "artifacts" / "deployed_model.joblib"
RESULTS_PATH = REPO_ROOT / "results.json"
MODEL_PATH = REPO_ROOT / "model.json"
WEB_PACKAGE_JSON = REPO_ROOT / "web" / "package.json"

SCHEMA_VERSION = "1.0.0"
MODEL_FAMILY = "additive-ensemble"
EXPECTED_OBJECTIVE = "binary:logistic"
MAX_DISTINCT_SPLIT_FEATURES = 3
ADDITIVITY_TOLERANCE = 1e-5
LINEAR_TOLERANCE = 1e-9
PERCENTILE_POINTS = 101
CONTRACT_THRESHOLD_METHOD = "max_f1_inner_validation"
CONTRACT_THRESHOLD_SOURCE = "validated_pipeline"
CONTRACT_RULE_ID = "RT-1"
MODEL_TOP_LEVEL_SECTIONS = (
    "metadata",
    "features",
    "targets",
    "components",
    "decisionParameters",
    "reliabilityReferences",
    "background",
    "percentiles",
    "provenance",
)
SECTIONS_EXCLUDED_FROM_MODEL_ID = ("provenance",)
METADATA_KEYS_EXCLUDED_FROM_MODEL_ID = ("modelId", "appVersion")


class ExportError(PipelineError):
    """The deployed artifact cannot be represented as a valid C-03 bundle."""


class AttributionBoundExceededError(ExportError):
    """A tree exceeds the 3-distinct-split-feature exact-attribution bound."""

    def __init__(self, target_id: str, tree_index: int, feature_indices: list[int]):
        self.target_id = target_id
        self.tree_index = tree_index
        self.feature_indices = list(feature_indices)
        super().__init__(
            f"target {target_id} tree {tree_index} splits on "
            f"{len(feature_indices)} distinct features (indices "
            f"{sorted(feature_indices)}); C-03 exact-attribution bound is "
            f"{MAX_DISTINCT_SPLIT_FEATURES}"
        )


class AdditivityError(ExportError):
    """Runtime-form margins disagree with the training library beyond tolerance."""

    def __init__(self, target_id: str, part: str, observed: float, tolerance: float):
        self.target_id = target_id
        self.part = part
        self.observed = float(observed)
        self.tolerance = float(tolerance)
        super().__init__(
            f"target {target_id} {part} additivity {observed:.3e} exceeds "
            f"tolerance {tolerance:.0e}"
        )


def _finite(value: float, label: str) -> float:
    number = float(value)
    if not math.isfinite(number):
        raise ExportError(f"{label} is not a finite number")
    return number


def _load_json(path: Path, label: str) -> dict:
    try:
        text = path.read_text(encoding="utf-8")
    except OSError as exc:
        raise ExportError(f"cannot read {label} at {path.name}: {exc}") from exc
    try:
        doc = json.loads(text)
    except json.JSONDecodeError as exc:
        raise ExportError(f"{label} is not valid JSON: {exc}") from exc
    if not isinstance(doc, dict):
        raise ExportError(f"{label} must contain a JSON object")
    return doc


def read_app_version(path: Path = WEB_PACKAGE_JSON) -> str:
    """The single source of ``appVersion`` is ``web/package.json``."""
    doc = _load_json(path, "web/package.json")
    version = doc.get("version")
    if not isinstance(version, str) or not version:
        raise ExportError("web/package.json has no non-empty 'version'")
    return version


def _compact_json(doc: dict, *, sort_keys: bool) -> bytes:
    """Compact deterministic JSON bytes (``allow_nan=False`` rejects NaN)."""
    text = json.dumps(
        doc, sort_keys=sort_keys, separators=(",", ":"), ensure_ascii=True, allow_nan=False
    )
    return (text + "\n").encode("utf-8")


def canonical_bytes(doc: dict) -> bytes:
    """Canonical ``model.json`` serialization: C-03 contract section order.

    The nine top-level sections are emitted in the order Contracts §5.3
    prescribes (``MODEL_TOP_LEVEL_SECTIONS``); any unexpected key is kept
    (sorted, appended) so nothing is silently dropped. Compact separators,
    ``ensure_ascii`` and ``allow_nan=False`` keep the bytes a deterministic
    pure function of the content — no timestamps, no git state.
    """
    ordered = {key: doc[key] for key in MODEL_TOP_LEVEL_SECTIONS if key in doc}
    ordered.update({key: doc[key] for key in sorted(doc) if key not in ordered})
    return _compact_json(ordered, sort_keys=False)


def compute_model_id(doc: dict) -> str:
    """Content-derived ``modelId`` — see the module docstring for the rule.

    Hashing sorts keys, so ``modelId`` depends on content only — never on
    section emission order — and a serialization-order fix cannot invalidate
    fixtures that record ``modelId``.
    """
    payload = {
        key: value
        for key, value in doc.items()
        if key not in SECTIONS_EXCLUDED_FROM_MODEL_ID
    }
    metadata = dict(payload.get("metadata") or {})
    for key in METADATA_KEYS_EXCLUDED_FROM_MODEL_ID:
        metadata.pop(key, None)
    payload["metadata"] = metadata
    digest = hashlib.sha256(_compact_json(payload, sort_keys=True)).hexdigest()
    return f"sha256:{digest}"


def parse_base_score_probability(booster: xgb.Booster, target_id: str) -> float:
    """Read xgboost's stored ``base_score`` probability from the booster config."""
    try:
        config = json.loads(booster.save_config())
        raw = config["learner"]["learner_model_param"]["base_score"]
        objective = config["learner"]["objective"]["name"]
    except (json.JSONDecodeError, KeyError, TypeError) as exc:
        raise ExportError(f"target {target_id}: booster config unreadable") from exc
    if objective != EXPECTED_OBJECTIVE:
        raise ExportError(
            f"target {target_id}: objective {objective!r} is not "
            f"{EXPECTED_OBJECTIVE!r}; baseScore derivation is undefined"
        )
    if not isinstance(raw, str):
        raise ExportError(f"target {target_id}: base_score config is not a string")
    try:
        probability = float(raw.strip().strip("[]"))
    except ValueError as exc:
        raise ExportError(
            f"target {target_id}: base_score {raw!r} is not a number"
        ) from exc
    if not (0.0 < probability < 1.0):
        raise ExportError(
            f"target {target_id}: base_score probability {probability} outside (0, 1)"
        )
    return probability


def base_score_margin(probability: float) -> float:
    """Inverse-logit link: xgboost's initial margin for ``binary:logistic``."""
    return float(math.log(probability / (1.0 - probability)))


def parse_tree(dump_json: str, feature_count: int) -> list[dict]:
    """Convert one xgboost JSON dump tree into pre-order C-03 nodes.

    Each node is either a split ``{featureIndex, threshold, left, right,
    leaf: null}`` or a leaf ``{featureIndex: null, threshold: null, left:
    null, right: null, leaf: <finite>}``. Node 0 is the root; ``left``/
    ``right`` are indices into the same ``nodes`` array.
    """
    try:
        root = json.loads(dump_json)
    except json.JSONDecodeError as exc:
        raise ExportError(f"tree dump is not valid JSON: {exc}") from exc
    nodes: list[dict] = []
    index_by_nodeid: dict[int, int] = {}

    def visit(node: dict) -> None:
        node_id = int(node["nodeid"])
        if node_id in index_by_nodeid:
            raise ExportError(f"duplicate tree node id {node_id}")
        index_by_nodeid[node_id] = len(nodes)
        if "leaf" in node:
            nodes.append(
                {
                    "featureIndex": None,
                    "threshold": None,
                    "left": None,
                    "right": None,
                    "leaf": _finite(float(node["leaf"]), "tree leaf"),
                }
            )
            return
        split = node.get("split")
        if not isinstance(split, str) or not split.startswith("f"):
            raise ExportError(f"unexpected split descriptor {split!r}")
        try:
            feature_index = int(split[1:])
        except ValueError as exc:
            raise ExportError(f"unexpected split descriptor {split!r}") from exc
        if not 0 <= feature_index < feature_count:
            raise ExportError(
                f"split featureIndex {feature_index} outside [0, {feature_count})"
            )
        threshold = _finite(float(node["split_condition"]), "split threshold")
        children = {int(child["nodeid"]): child for child in node.get("children", [])}
        yes_id = int(node["yes"])
        no_id = int(node["no"])
        if yes_id not in children or no_id not in children:
            raise ExportError(f"tree node {node_id} references missing children")
        nodes.append(None)  # reserve this index for the split node
        visit(children[yes_id])
        left_index = index_by_nodeid[yes_id]
        visit(children[no_id])
        right_index = index_by_nodeid[no_id]
        nodes[index_by_nodeid[node_id]] = {
            "featureIndex": feature_index,
            "threshold": threshold,
            "left": left_index,
            "right": right_index,
            "leaf": None,
        }

    visit(root)
    if not nodes:
        raise ExportError("tree dump produced no nodes")
    return nodes


def distinct_split_features(nodes: list[dict]) -> list[int]:
    """Distinct ``featureIndex`` values over split nodes of one tree."""
    return sorted(
        {
            int(node["featureIndex"])
            for node in nodes
            if node["leaf"] is None
        }
    )


def check_attribution_bound(target_id: str, tree_index: int, nodes: list[dict]) -> int:
    """Reject trees beyond the C-03 exact-attribution bound; return the count."""
    features = distinct_split_features(nodes)
    if len(features) > MAX_DISTINCT_SPLIT_FEATURES:
        raise AttributionBoundExceededError(target_id, tree_index, features)
    return len(features)


def build_trees_block(
    target_id: str, booster: xgb.Booster, feature_count: int
) -> dict:
    """C-03 trees block for one target, with an explicit ``baseScore``."""
    probability = parse_base_score_probability(booster, target_id)
    margin = base_score_margin(probability)
    dumps = booster.get_dump(dump_format="json")
    if not dumps:
        raise ExportError(f"target {target_id}: booster has no trees")
    trees: list[dict] = []
    distinct_counts: list[int] = []
    for tree_index, dump_json in enumerate(dumps):
        nodes = parse_tree(dump_json, feature_count)
        distinct_counts.append(check_attribution_bound(target_id, tree_index, nodes))
        trees.append({"nodes": nodes})
    return {
        "targetId": target_id,
        "baseScore": _finite(margin, f"{target_id} baseScore"),
        "treeCount": len(trees),
        "trees": trees,
        "maxDistinctFeaturesPerTree": max(distinct_counts),
    }


def build_linear_block(lr_pipeline: Any, feature_order: list[str]) -> dict:
    """C-03 linear block: LR coefficients + StandardScaler statistics, in order."""
    try:
        scaler = lr_pipeline.named_steps["scaler"]
        regression = lr_pipeline.named_steps["lr"]
    except (AttributeError, KeyError) as exc:
        raise ExportError("deployed linear model is not the scaler+LR pipeline") from exc
    feature_count = len(feature_order)
    coefficients = np.asarray(regression.coef_, dtype=np.float64).ravel()
    means = np.asarray(scaler.mean_, dtype=np.float64).ravel()
    scales = np.asarray(scaler.scale_, dtype=np.float64).ravel()
    for name, vector in (
        ("coefficientByFeature", coefficients),
        ("meanByFeature", means),
        ("scaleByFeature", scales),
    ):
        if vector.shape[0] != feature_count:
            raise ExportError(
                f"{name} has {vector.shape[0]} entries, expected {feature_count}"
            )
        if not np.all(np.isfinite(vector)):
            raise ExportError(f"{name} contains non-finite values")
    if np.any(scales == 0.0):
        raise ExportError("scaleByFeature contains a zero scale")
    intercepts = np.asarray(regression.intercept_, dtype=np.float64).ravel()
    if intercepts.shape[0] != 1:
        raise ExportError("logistic regression must have a single intercept")
    return {
        "intercept": _finite(float(intercepts[0]), "linear intercept"),
        "coefficientByFeature": [float(value) for value in coefficients],
        "meanByFeature": [float(value) for value in means],
        "scaleByFeature": [float(value) for value in scales],
    }


def evaluate_tree_margin(trees_block: dict, rows: np.ndarray) -> np.ndarray:
    """Runtime-form tree margin: ``baseScore + sum(leaves)`` per row.

    Split comparisons are float32 (contract numerics); accumulation is double.
    This walks the *serialized* node arrays, so it also proves the exported
    structure is traversable.
    """
    matrix = np.asarray(rows, dtype=np.float64)
    if matrix.ndim != 2:
        raise ExportError("tree evaluation needs a 2D row matrix")
    rows_float32 = matrix.astype(np.float32)
    total = np.zeros(matrix.shape[0], dtype=np.float64)
    for tree in trees_block["trees"]:
        nodes = tree["nodes"]
        for row_index in range(matrix.shape[0]):
            node_index = 0
            while True:
                node = nodes[node_index]
                if node["leaf"] is not None:
                    total[row_index] += node["leaf"]
                    break
                value = rows_float32[row_index, node["featureIndex"]]
                if value < np.float32(node["threshold"]):
                    node_index = node["left"]
                else:
                    node_index = node["right"]
    return total + float(trees_block["baseScore"])


def evaluate_linear_margin(linear_block: dict, rows: np.ndarray) -> np.ndarray:
    """Runtime-form linear margin from the exported block (C-03 formula)."""
    matrix = np.asarray(rows, dtype=np.float64)
    coefficients = np.asarray(linear_block["coefficientByFeature"], dtype=np.float64)
    means = np.asarray(linear_block["meanByFeature"], dtype=np.float64)
    scales = np.asarray(linear_block["scaleByFeature"], dtype=np.float64)
    if matrix.shape[1] != coefficients.shape[0]:
        raise ExportError("linear block width differs from the row width")
    standardised = (matrix - means) / scales
    return float(linear_block["intercept"]) + standardised @ coefficients


def build_background_block(deployed: dict, features: np.ndarray) -> dict:
    """The exact stored 60 background rows in model feature order (C-03)."""
    background = deployed.get("background")
    if not isinstance(background, dict):
        raise ExportError("deployed artifact has no background block")
    row_indices = background.get("rowIndices")
    seed = background.get("seed")
    if not isinstance(row_indices, list) or not isinstance(seed, int):
        raise ExportError("background block must carry rowIndices and an int seed")
    if not row_indices:
        raise ExportError("background block is empty")
    rng = np.random.default_rng(int(seed))
    expected = np.asarray(
        rng.choice(features.shape[0], size=len(row_indices), replace=False),
        dtype=np.int64,
    )
    observed = np.asarray(row_indices, dtype=np.int64)
    if not np.array_equal(expected, observed):
        raise ExportError("background rowIndices are not reproducible from their seed")
    if np.any(observed < 0) or np.any(observed >= features.shape[0]):
        raise ExportError("background rowIndices outside the cohort")
    rows = features[observed]
    if not np.all(np.isfinite(rows)):
        raise ExportError("background rows contain non-finite values")
    return {
        "seed": int(seed),
        "count": int(rows.shape[0]),
        "rows": [[float(value) for value in row] for row in rows],
    }


def _discrete_levels(feature: dict, feature_config: dict) -> list[float]:
    """Encoded levels of a non-continuous feature from its frozen definition."""
    encoding = feature.get("encoding") or {}
    encoding_type = encoding.get("type")
    if encoding_type == "map":
        values = list((encoding.get("map") or {}).values())
    elif encoding_type == "ordinal":
        values = list(encoding.get("levels") or [])
    elif encoding_type == "identity":
        values = list(feature_config.get("allowedValues") or [])
    else:
        raise ExportError(
            f"feature {feature.get('id')!r}: unknown encoding type {encoding_type!r}"
        )
    if not values:
        raise ExportError(f"feature {feature.get('id')!r}: no discrete levels defined")
    levels = sorted({float(value) for value in values})
    if not all(math.isfinite(level) for level in levels):
        raise ExportError(f"feature {feature.get('id')!r}: non-finite level")
    return levels


def build_percentiles(
    features: np.ndarray,
    registry: dict,
    features_doc: dict,
    expected_count: int,
) -> list[dict]:
    """C-03 percentile tables in registry order.

    Continuous features: 101 empirical quantile points (0th–100th) with
    piecewise-linear interpolation. Binary/categorical features: the cohort
    share of each defined level (a percentile is meaningless there —
    Architecture §8.5).
    """
    registry_features = registry["features"]
    config_by_id = {entry["id"]: entry for entry in features_doc["features"]}
    if features.shape[0] != expected_count:
        raise ExportError(
            f"cohort has {features.shape[0]} rows, results protocol says "
            f"{expected_count}"
        )
    if features.shape[1] != len(registry_features):
        raise ExportError("encoded matrix width differs from the registry feature count")
    entries: list[dict] = []
    grid = np.linspace(0.0, 1.0, PERCENTILE_POINTS, dtype=np.float64)
    for index, feature in enumerate(registry_features):
        feature_id = feature["id"]
        kind = feature.get("kind")
        column = features[:, index]
        if kind == "continuous":
            points = np.quantile(column, grid, method="linear")
            if points.shape[0] != PERCENTILE_POINTS:
                raise ExportError(f"{feature_id}: expected 101 quantile points")
            if np.any(np.diff(points) < 0.0):
                raise ExportError(f"{feature_id}: quantile points are not monotonic")
            if float(points[0]) != float(np.min(column)) or float(points[-1]) != float(
                np.max(column)
            ):
                raise ExportError(f"{feature_id}: quantile endpoints are not min/max")
            entries.append(
                {
                    "featureId": feature_id,
                    "kind": kind,
                    "points": [float(value) for value in points],
                }
            )
            continue
        if kind not in ("binary", "categorical"):
            raise ExportError(f"{feature_id}: unknown feature kind {kind!r}")
        config = config_by_id.get(feature_id)
        if config is None:
            raise ExportError(f"{feature_id}: missing from config/features.json")
        if config.get("type") != kind:
            raise ExportError(f"{feature_id}: registry kind differs from features.json")
        levels = _discrete_levels(feature, config)
        level_index = {level: position for position, level in enumerate(levels)}
        counts = [0] * len(levels)
        for value in column:
            level = float(value)
            if level not in level_index:
                raise ExportError(
                    f"{feature_id}: observed value outside the defined levels"
                )
            counts[level_index[level]] += 1
        shares = [count / features.shape[0] for count in counts]
        if abs(sum(shares) - 1.0) > 1e-9:
            raise ExportError(f"{feature_id}: cohort shares do not sum to 1")
        entries.append(
            {
                "featureId": feature_id,
                "kind": kind,
                "levels": levels,
                "shares": shares,
            }
        )
    return entries


def decision_parameters_from_results(results: dict, target_order: list[str]) -> dict:
    """Thresholds and abstention bands are *read* from ``results.json`` (C-04),
    never recomputed here (C-03: learned artifact values)."""
    decisions = results.get("decisions")
    if not isinstance(decisions, dict):
        raise ExportError("results.json has no decisions block")
    block: dict[str, dict] = {}
    for target_id in target_order:
        entry = decisions.get(target_id)
        if not isinstance(entry, dict):
            raise ExportError(f"results.json has no decisions for {target_id}")
        selection = entry.get("thresholdSelection") or {}
        method = selection.get("method")
        source = selection.get("source")
        if method != CONTRACT_THRESHOLD_METHOD or source != CONTRACT_THRESHOLD_SOURCE:
            raise ExportError(
                f"{target_id}: thresholdSelection {method!r}/{source!r} differs "
                f"from the C-03 contract literals"
            )
        threshold = _finite(entry.get("selectedThreshold"), f"{target_id} threshold")
        abstention = entry.get("abstention") or {}
        half_width = _finite(
            abstention.get("selectedHalfWidthMargin"), f"{target_id} half width"
        )
        if not 0.0 < threshold < 1.0:
            raise ExportError(f"{target_id}: threshold outside (0, 1)")
        if half_width <= 0.0:
            raise ExportError(f"{target_id}: abstention half width is not positive")
        block[target_id] = {
            "thresholdProbability": threshold,
            "abstentionHalfWidthMargin": half_width,
            "thresholdSelection": {"method": method, "source": source},
        }
    return block


def reliability_references_from_results(
    results: dict, target_order: list[str], deployed: dict
) -> list[dict]:
    """C-03 reliability references: classification only, numbers stay in results."""
    reliability = results.get("reliability")
    if not isinstance(reliability, dict):
        raise ExportError("results.json has no reliability block")
    rule = reliability.get("rule") or {}
    rule_id = rule.get("ruleId")
    if rule_id != CONTRACT_RULE_ID:
        raise ExportError(f"reliability ruleId {rule_id!r} is not {CONTRACT_RULE_ID!r}")
    targets = reliability.get("targets")
    if not isinstance(targets, dict):
        raise ExportError("results.json has no reliability.targets block")
    allowed_tiers = {"strong", "moderate", "limited"}
    references: list[dict] = []
    for target_id in target_order:
        entry = targets.get(target_id)
        if not isinstance(entry, dict):
            raise ExportError(f"results.json has no reliability entry for {target_id}")
        tier = entry.get("tier")
        if tier not in allowed_tiers:
            raise ExportError(f"{target_id}: reliability tier {tier!r} is invalid")
        deployed_entry = (
            deployed.get("targets", {}).get(target_id, {}).get("reliability") or {}
        )
        if deployed_entry.get("tier") != tier:
            raise ExportError(
                f"{target_id}: joblib reliability tier differs from results.json"
            )
        expected_ref = f"results.reliability.targets.{target_id}"
        if deployed_entry.get("evidenceRef") != expected_ref:
            raise ExportError(f"{target_id}: joblib evidenceRef differs from contract")
        references.append(
            {
                "targetId": target_id,
                "tier": tier,
                "ruleId": rule_id,
                "evidenceRef": expected_ref,
            }
        )
    return references


def verify_against_library(
    document: dict,
    deployed: dict,
    sample_rows: np.ndarray,
) -> dict:
    """Assert runtime-form == training-library margins within tolerance.

    Compares, per target: tree margin (tolerance ``1e-5``), linear margin
    (``1e-9``) and the raw 0.5/0.5 ensemble margin (``1e-5``). Returns the
    actual observed maxima for the evidence report; raises
    :class:`AdditivityError` on any breach.
    """
    if sample_rows.shape[0] < 20:
        raise ExportError("additivity sample needs at least 20 inputs")
    design = xgb.DMatrix(sample_rows)
    actuals: dict[str, dict[str, float]] = {}
    for target_id in document["targets"]:
        components = document["components"][target_id]
        target = deployed["targets"][target_id]
        booster = target["xgb"].get_booster()
        library_tree = np.asarray(
            booster.predict(design, output_margin=True), dtype=np.float64
        )
        runtime_tree = evaluate_tree_margin(components["trees"], sample_rows)
        tree_max = float(np.max(np.abs(runtime_tree - library_tree)))
        if tree_max > ADDITIVITY_TOLERANCE:
            raise AdditivityError(target_id, "tree", tree_max, ADDITIVITY_TOLERANCE)

        library_linear = np.asarray(
            target["lr"].decision_function(sample_rows), dtype=np.float64
        )
        runtime_linear = evaluate_linear_margin(components["linear"], sample_rows)
        linear_max = float(np.max(np.abs(runtime_linear - library_linear)))
        if linear_max > LINEAR_TOLERANCE:
            raise AdditivityError(target_id, "linear", linear_max, LINEAR_TOLERANCE)

        runtime_ensemble = 0.5 * runtime_tree + 0.5 * runtime_linear
        library_ensemble = 0.5 * library_tree + 0.5 * library_linear
        ensemble_max = float(np.max(np.abs(runtime_ensemble - library_ensemble)))
        if ensemble_max > ADDITIVITY_TOLERANCE:
            raise AdditivityError(
                target_id, "raw ensemble", ensemble_max, ADDITIVITY_TOLERANCE
            )

        platt = components["platt"]
        calibrated = platt["slope"] * runtime_ensemble + platt["intercept"]
        probability = 1.0 / (1.0 + np.exp(-calibrated))
        if not np.all(np.isfinite(probability)) or np.any(probability <= 0.0) or np.any(
            probability >= 1.0
        ):
            raise ExportError(f"{target_id}: calibrated probability outside (0, 1)")

        actuals[target_id] = {
            "tree": tree_max,
            "linear": linear_max,
            "ensemble": ensemble_max,
        }
    return actuals


def build_model_document() -> tuple[dict, dict]:
    """Build the C-03 document from joblib + results + registry + cohort.

    Returns ``(document, report)``; ``report`` carries the measured additivity
    actuals and footprint numbers printed by the CLI and asserted by tests.
    """
    registry = load_registry()
    features_doc = load_features()
    feature_order = [entry["id"] for entry in registry["features"]]
    target_order = [entry["id"] for entry in registry["targets"]]
    if len(feature_order) != 54:
        raise ExportError(f"registry has {len(feature_order)} features, expected 54")
    if target_order != ["CAD", "LAD", "LCX", "RCA"]:
        raise ExportError(f"registry target order {target_order} differs from C-03")
    forbidden = {entry["id"] for entry in registry["forbiddenInputColumns"]}
    overlap = forbidden.intersection(feature_order)
    if overlap:
        raise ExportError(f"forbidden columns present in feature order: {sorted(overlap)}")

    results = _load_json(RESULTS_PATH, "results.json")
    if results.get("schemaVersion") != SCHEMA_VERSION:
        raise ExportError("results.json schemaVersion differs from 1.0.0")
    protocol = results.get("protocol") or {}
    if protocol.get("featureCount") != 54:
        raise ExportError("results protocol featureCount is not 54")
    patient_count = protocol.get("patientCount")
    if not isinstance(patient_count, int):
        raise ExportError("results protocol patientCount is not an integer")

    if not DEPLOYED_MODEL_PATH.is_file():
        raise ExportError(f"deployed model missing at {DEPLOYED_MODEL_PATH.name}")
    deployed = joblib.load(DEPLOYED_MODEL_PATH)
    if deployed.get("schemaVersion") != SCHEMA_VERSION:
        raise ExportError("deployed model schemaVersion differs from 1.0.0")
    if list(deployed.get("featureOrder") or []) != feature_order:
        raise ExportError("deployed feature order differs from the registry")
    deployed_targets = deployed.get("targets") or {}
    if set(deployed_targets) != set(target_order):
        raise ExportError("deployed targets differ from the registry targets")

    prepared = prepare_dataset()
    if list(prepared.feature_order) != feature_order:
        raise ExportError("encoded cohort feature order differs from the registry")
    if prepared.n_patients != patient_count:
        raise ExportError("encoded cohort row count differs from results protocol")

    background = build_background_block(deployed, prepared.X)
    percentiles = build_percentiles(
        prepared.X, registry, features_doc, expected_count=patient_count
    )
    decision_parameters = decision_parameters_from_results(results, target_order)
    reliability_references = reliability_references_from_results(
        results, target_order, deployed
    )

    components: dict[str, dict] = {}
    node_total = 0
    for target_id in target_order:
        target = deployed_targets[target_id]
        trees_block = build_trees_block(
            target_id, target["xgb"].get_booster(), len(feature_order)
        )
        linear_block = build_linear_block(target["lr"], feature_order)
        platt = target.get("platt") or {}
        slope = _finite(platt.get("slope"), f"{target_id} Platt slope")
        platt_intercept = _finite(
            platt.get("intercept"), f"{target_id} Platt intercept"
        )
        if slope <= 0.0:
            raise ExportError(f"{target_id}: Platt slope is not strictly positive")
        components[target_id] = {
            "trees": trees_block,
            "linear": linear_block,
            "platt": {"slope": slope, "intercept": platt_intercept},
        }
        node_total += sum(len(tree["nodes"]) for tree in trees_block["trees"])

    sample_rows = np.vstack(
        [np.asarray(background["rows"], dtype=np.float64), prepared.X[:8]]
    )
    actuals = verify_against_library(
        {"targets": target_order, "components": components}, deployed, sample_rows
    )

    results_sha = hashlib.sha256(RESULTS_PATH.read_bytes()).hexdigest()
    seed_set = ((results.get("provenance") or {}).get("seedSet")) or {}
    derived = seed_set.get("derived") or {}
    if "base" not in seed_set or "deployedBackgroundSeed" not in derived:
        raise ExportError("results provenance is missing the export seeds")
    tool_versions = (results.get("provenance") or {}).get("toolVersions")
    if not isinstance(tool_versions, dict):
        raise ExportError("results provenance has no toolVersions block")

    document: dict[str, Any] = {
        "metadata": {
            "schemaVersion": SCHEMA_VERSION,
            "modelFamily": MODEL_FAMILY,
            "featureCount": len(feature_order),
            "targets": list(target_order),
            "appVersion": read_app_version(),
        },
        "features": list(feature_order),
        "targets": list(target_order),
        "components": components,
        "decisionParameters": decision_parameters,
        "reliabilityReferences": reliability_references,
        "background": background,
        "percentiles": percentiles,
        "provenance": {
            "dataSha256": (results.get("provenance") or {}).get("dataSha256"),
            "resultsSha256": results_sha,
            "seedSet": {
                "base": int(seed_set["base"]),
                "deployedBackgroundSeed": int(derived["deployedBackgroundSeed"]),
                "deployedXgbSeedBase": int(derived["deployedXgbSeedBase"]),
            },
            "toolVersions": dict(tool_versions),
            "generator": "pipeline.export_model",
        },
    }
    if not isinstance(document["provenance"]["dataSha256"], str):
        raise ExportError("results provenance has no dataSha256")
    if tuple(document) != MODEL_TOP_LEVEL_SECTIONS:
        raise ExportError(
            f"top-level sections differ from C-03: {list(document)}"
        )
    document["metadata"]["modelId"] = compute_model_id(document)

    report = {
        "additivity": actuals,
        "sampleRows": int(sample_rows.shape[0]),
        "backgroundRows": int(background["count"]),
        "nodeTotal": node_total,
        "treeTotal": sum(
            components[target_id]["trees"]["treeCount"] for target_id in target_order
        ),
        "maxDistinctFeaturesPerTree": max(
            components[target_id]["trees"]["maxDistinctFeaturesPerTree"]
            for target_id in target_order
        ),
        "percentileEntries": len(percentiles),
        "continuousEntries": sum(1 for entry in percentiles if entry["kind"] == "continuous"),
    }
    return document, report


def export(output_path: Path = MODEL_PATH) -> dict:
    """Build and write ``model.json``; returns CLI evidence (paths, hashes, actuals)."""
    document, report = build_model_document()
    payload = canonical_bytes(document)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_bytes(payload)
    digest = hashlib.sha256(payload).hexdigest()
    report["path"] = str(output_path)
    report["sha256"] = digest
    report["sizeBytes"] = len(payload)
    report["modelId"] = document["metadata"]["modelId"]
    report["appVersion"] = document["metadata"]["appVersion"]
    return report


def print_report(report: dict) -> None:
    worst = {
        part: max(report["additivity"][target][part] for target in report["additivity"])
        for part in ("tree", "linear", "ensemble")
    }
    print(
        f"CorTwin export | model.json sha256 {report['sha256']} | "
        f"{report['sizeBytes']} bytes | modelId {report['modelId']}"
    )
    print(
        f"trees: {report['treeTotal']} total, {report['nodeTotal']} nodes, "
        f"max distinct split features {report['maxDistinctFeaturesPerTree']} "
        f"(bound {MAX_DISTINCT_SPLIT_FEATURES})"
    )
    print(
        f"additivity vs xgboost/sklearn over {report['sampleRows']} inputs "
        f"({report['backgroundRows']} background + 8 cohort): "
        f"tree {worst['tree']:.3e} (tol {ADDITIVITY_TOLERANCE:.0e}) | "
        f"linear {worst['linear']:.3e} (tol {LINEAR_TOLERANCE:.0e}) | "
        f"raw ensemble {worst['ensemble']:.3e} (tol {ADDITIVITY_TOLERANCE:.0e})"
    )
    print(
        f"percentiles: {report['percentileEntries']} entries "
        f"({report['continuousEntries']} continuous x {PERCENTILE_POINTS} points, "
        f"{report['percentileEntries'] - report['continuousEntries']} cohort shares) "
        f"| appVersion {report['appVersion']}"
    )


def main() -> int:
    report = export()
    print_report(report)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
