"""C-03 model-bundle tests (Contracts §5.3, VC-06 territory).

Validates a freshly exported ``model.json`` against the frozen contract:

* the nine C-03 sections in contract order; metadata identity fields;
* feature/target identity against the registry (54 features, forbidden
  columns absent, target order CAD/LAD/LCX/RCA);
* every serialized tree: node shape, pre-order acyclicity, depth-2 bound
  (at most 7 nodes, at most 3 distinct split features), explicit finite
  ``baseScore`` derived by the inverse-logit link;
* **independent additivity recompute** — a test-local tree walker plus a
  test-local linear formula compared against xgboost/sklearn margins within
  C-06 tolerances (1e-5 tree/ensemble, 1e-9 linear), so a silent change to
  the exporter's numerics fails here rather than in the browser;
* percentile tables (101 quantile points for continuous features, cohort
  shares for binary/categorical) recomputed from the encoded cohort;
* decision parameters and reliability references equal to ``results.json``
  (never recomputed);
* background rows reproducible from their seed and equal to the stored
  rowIndices;
* the >3-distinct-split-feature guard rejecting a synthetic tree;
* determinism: two exports are byte-identical, the root ``model.json`` is
  not stale, and ``modelId`` excludes only identity (version/provenance)
  while changing when any computed content changes.

The module runs one full export plus (in the determinism test) two more;
every number asserted here is derived from artifacts or recomputed, never
typed from a report.
"""

from __future__ import annotations

import hashlib
import json
import math
import re
from pathlib import Path
from types import SimpleNamespace

import joblib
import numpy as np
import pytest
import xgboost as xgb

from pipeline import export_model
from pipeline.config import load_registry
from pipeline.prepare import prepare_dataset

pytestmark = pytest.mark.blocking

TARGET_IDS = ("CAD", "LAD", "LCX", "RCA")
FORBIDDEN_COLUMNS = {"LAD", "LCX", "RCA", "Cath"}
NODE_KEYS = {"featureIndex", "threshold", "left", "right", "leaf"}
MAX_NODES_DEPTH_2 = 7
HEX64 = re.compile(r"^[0-9a-f]{64}$")
MODEL_ID_PATTERN = re.compile(r"^sha256:[0-9a-f]{64}$")


@pytest.fixture(scope="module")
def exported(tmp_path_factory) -> SimpleNamespace:
    """Run one full export into a temp dir and load the written artifact."""
    out = tmp_path_factory.mktemp("c03") / "model.json"
    report = export_model.export(out)
    text = out.read_text(encoding="utf-8")
    return SimpleNamespace(
        path=out, text=text, doc=json.loads(text), report=report
    )


@pytest.fixture(scope="module")
def deployed() -> dict:
    return joblib.load(export_model.DEPLOYED_MODEL_PATH)


@pytest.fixture(scope="module")
def prepared():
    return prepare_dataset()


@pytest.fixture(scope="module")
def results() -> dict:
    return json.loads(export_model.RESULTS_PATH.read_text(encoding="utf-8"))


def _independent_tree_margin(trees_block: dict, rows: np.ndarray) -> np.ndarray:
    """Test-local walker: float32 comparisons, double accumulation."""
    margins = []
    for row in rows:
        total = float(trees_block["baseScore"])
        for tree in trees_block["trees"]:
            nodes = tree["nodes"]
            index = 0
            while True:
                node = nodes[index]
                leaf = node["leaf"]
                if leaf is not None:
                    total += leaf
                    break
                value = np.float32(row[node["featureIndex"]])
                if value < np.float32(node["threshold"]):
                    index = node["left"]
                else:
                    index = node["right"]
        margins.append(total)
    return np.asarray(margins, dtype=np.float64)


def _independent_linear_margin(linear_block: dict, rows: np.ndarray) -> np.ndarray:
    coefficients = np.asarray(linear_block["coefficientByFeature"], dtype=np.float64)
    means = np.asarray(linear_block["meanByFeature"], dtype=np.float64)
    scales = np.asarray(linear_block["scaleByFeature"], dtype=np.float64)
    standardised = (rows - means) / scales
    return linear_block["intercept"] + standardised @ coefficients


def test_nine_c03_sections_in_contract_order(exported):
    assert tuple(exported.doc) == export_model.MODEL_TOP_LEVEL_SECTIONS


def test_metadata_block(exported, results):
    metadata = exported.doc["metadata"]
    assert metadata["schemaVersion"] == "1.0.0"
    assert metadata["modelFamily"] == "additive-ensemble"
    assert metadata["featureCount"] == 54
    assert metadata["targets"] == list(TARGET_IDS)
    package = json.loads(
        (export_model.REPO_ROOT / "web" / "package.json").read_text(encoding="utf-8")
    )
    assert metadata["appVersion"] == package["version"]
    assert MODEL_ID_PATTERN.match(metadata["modelId"])
    assert metadata["modelId"] == export_model.compute_model_id(exported.doc)
    assert results["schemaVersion"] == metadata["schemaVersion"]


def test_features_and_targets_identity(exported):
    registry = load_registry()
    registry_features = [entry["id"] for entry in registry["features"]]
    registry_targets = [entry["id"] for entry in registry["targets"]]
    assert exported.doc["features"] == registry_features
    assert exported.doc["targets"] == registry_targets == list(TARGET_IDS)
    assert len(registry_features) == 54
    overlap = FORBIDDEN_COLUMNS.intersection(registry_features)
    assert not overlap, f"forbidden columns in model inputs: {sorted(overlap)}"
    assert not FORBIDDEN_COLUMNS.intersection(exported.doc["features"])


def test_components_cover_targets_with_sane_structure(exported):
    components = exported.doc["components"]
    assert tuple(components) == TARGET_IDS
    for target_id in TARGET_IDS:
        component = components[target_id]
        assert set(component) == {"trees", "linear", "platt"}
        linear = component["linear"]
        assert len(linear["coefficientByFeature"]) == 54
        assert len(linear["meanByFeature"]) == 54
        assert len(linear["scaleByFeature"]) == 54
        assert math.isfinite(linear["intercept"])
        assert all(value > 0.0 for value in linear["scaleByFeature"])
        platt = component["platt"]
        assert math.isfinite(platt["slope"]) and platt["slope"] > 0.0
        assert math.isfinite(platt["intercept"])


def test_tree_node_invariants_and_depth_bound(exported):
    observed_max_nodes = 0
    for target_id in TARGET_IDS:
        trees_block = exported.doc["components"][target_id]["trees"]
        assert trees_block["targetId"] == target_id
        assert trees_block["treeCount"] == len(trees_block["trees"])
        assert trees_block["treeCount"] > 0
        distinct_counts = []
        for tree in trees_block["trees"]:
            nodes = tree["nodes"]
            assert 1 <= len(nodes) <= MAX_NODES_DEPTH_2, (
                f"{target_id}: tree with {len(nodes)} nodes leaves the depth-2 family"
            )
            observed_max_nodes = max(observed_max_nodes, len(nodes))
            seen_features = set()
            for position, node in enumerate(nodes):
                assert set(node) == NODE_KEYS
                if node["leaf"] is None:
                    feature_index = node["featureIndex"]
                    assert isinstance(feature_index, int)
                    assert 0 <= feature_index < 54
                    assert isinstance(node["threshold"], float)
                    assert math.isfinite(node["threshold"])
                    assert node["left"] > position, "pre-order acyclicity (left)"
                    assert node["right"] > position, "pre-order acyclicity (right)"
                    assert node["left"] < node["right"]
                    assert node["right"] < len(nodes)
                    seen_features.add(feature_index)
                else:
                    assert node["featureIndex"] is None
                    assert node["threshold"] is None
                    assert node["left"] is None and node["right"] is None
                    assert isinstance(node["leaf"], float)
                    assert math.isfinite(node["leaf"])
            distinct_counts.append(len(seen_features))
        assert max(distinct_counts) == trees_block["maxDistinctFeaturesPerTree"]
        assert trees_block["maxDistinctFeaturesPerTree"] <= 3
    assert observed_max_nodes == MAX_NODES_DEPTH_2, (
        "the frozen depth-2 family should still contain a complete 7-node tree"
    )


def test_base_score_is_inverse_logit_of_stored_probability(exported, deployed):
    for target_id in TARGET_IDS:
        booster = deployed["targets"][target_id]["xgb"].get_booster()
        config = json.loads(booster.save_config())
        raw = config["learner"]["learner_model_param"]["base_score"]
        assert config["learner"]["objective"]["name"] == "binary:logistic"
        probability = float(str(raw).strip().strip("[]"))
        assert 0.0 < probability < 1.0
        expected = math.log(probability / (1.0 - probability))
        observed = exported.doc["components"][target_id]["trees"]["baseScore"]
        assert observed == pytest.approx(expected, abs=1e-12)


def test_independent_additivity_recompute(exported, deployed, prepared):
    """A test-local walker/formula must match the training library (C-06)."""
    background_rows = np.asarray(exported.doc["background"]["rows"], dtype=np.float64)
    sample_rows = np.vstack([background_rows, prepared.X[:8]])
    assert sample_rows.shape[0] >= 20
    design = xgb.DMatrix(sample_rows)
    for target_id in TARGET_IDS:
        component = exported.doc["components"][target_id]
        library = deployed["targets"][target_id]

        library_tree = np.asarray(
            library["xgb"].get_booster().predict(design, output_margin=True),
            dtype=np.float64,
        )
        runtime_tree = _independent_tree_margin(component["trees"], sample_rows)
        tree_error = float(np.max(np.abs(runtime_tree - library_tree)))
        assert tree_error <= 1e-5, f"{target_id}: tree additivity {tree_error:.3e}"

        library_linear = np.asarray(
            library["lr"].decision_function(sample_rows), dtype=np.float64
        )
        runtime_linear = _independent_linear_margin(component["linear"], sample_rows)
        linear_error = float(np.max(np.abs(runtime_linear - library_linear)))
        assert linear_error <= 1e-9, f"{target_id}: linear additivity {linear_error:.3e}"

        library_ensemble = 0.5 * library_tree + 0.5 * library_linear
        runtime_ensemble = 0.5 * runtime_tree + 0.5 * runtime_linear
        ensemble_error = float(np.max(np.abs(runtime_ensemble - library_ensemble)))
        assert ensemble_error <= 1e-5, (
            f"{target_id}: ensemble additivity {ensemble_error:.3e}"
        )

        platt = component["platt"]
        probability = 1.0 / (
            1.0 + np.exp(-(platt["slope"] * runtime_ensemble + platt["intercept"]))
        )
        assert np.all(np.isfinite(probability))
        assert np.all(probability > 0.0) and np.all(probability < 1.0)


def test_export_report_additivity_actuals_within_tolerance(exported):
    actuals = exported.report["additivity"]
    assert tuple(actuals) == TARGET_IDS
    for target_id in TARGET_IDS:
        measured = actuals[target_id]
        assert measured["tree"] <= export_model.ADDITIVITY_TOLERANCE
        assert measured["linear"] <= export_model.LINEAR_TOLERANCE
        assert measured["ensemble"] <= export_model.ADDITIVITY_TOLERANCE


def test_percentiles_match_registry_order_and_cohort(exported, prepared):
    registry = load_registry()
    registry_features = registry["features"]
    entries = exported.doc["percentiles"]
    assert [entry["featureId"] for entry in entries] == [
        entry["id"] for entry in registry_features
    ]
    assert len(entries) == 54

    grid = np.linspace(0.0, 1.0, export_model.PERCENTILE_POINTS, dtype=np.float64)
    continuous = binary = categorical = 0
    for index, (feature, entry) in enumerate(zip(registry_features, entries)):
        kind = feature["kind"]
        column = prepared.X[:, index]
        assert entry["kind"] == kind
        if kind == "continuous":
            continuous += 1
            points = np.asarray(entry["points"], dtype=np.float64)
            assert points.shape == (export_model.PERCENTILE_POINTS,)
            assert np.all(np.diff(points) >= 0.0)
            expected = np.quantile(column, grid, method="linear")
            assert np.array_equal(points, expected), (
                f"{entry['featureId']}: quantile points differ from the cohort"
            )
        else:
            if kind == "binary":
                binary += 1
            else:
                categorical += 1
            assert set(entry) == {"featureId", "kind", "levels", "shares"}
            levels = entry["levels"]
            shares = entry["shares"]
            assert len(levels) == len(shares) >= 2
            assert levels == sorted(levels)
            assert all(value >= 0.0 for value in shares)
            assert abs(sum(shares) - 1.0) <= 1e-9
            for level, share in zip(levels, shares):
                observed_share = float(np.mean(column == level))
                assert share == pytest.approx(observed_share, abs=1e-12)
    assert (continuous, binary, categorical) == (21, 29, 4)


def test_decision_parameters_come_from_results(exported, results):
    block = exported.doc["decisionParameters"]
    assert tuple(block) == TARGET_IDS
    for target_id in TARGET_IDS:
        source_entry = results["decisions"][target_id]
        entry = block[target_id]
        assert entry["thresholdProbability"] == source_entry["selectedThreshold"]
        assert entry["abstentionHalfWidthMargin"] == source_entry["abstention"][
            "selectedHalfWidthMargin"
        ]
        assert entry["thresholdSelection"] == {
            "method": "max_f1_inner_validation",
            "source": "validated_pipeline",
        }
        assert 0.0 < entry["thresholdProbability"] < 1.0
        assert entry["abstentionHalfWidthMargin"] > 0.0


def test_reliability_references_classify_only(exported, results):
    references = exported.doc["reliabilityReferences"]
    assert [entry["targetId"] for entry in references] == list(TARGET_IDS)
    for entry in references:
        target_id = entry["targetId"]
        expected_tier = results["reliability"]["targets"][target_id]["tier"]
        assert entry["tier"] == expected_tier
        assert entry["ruleId"] == "RT-1"
        assert entry["evidenceRef"] == f"results.reliability.targets.{target_id}"
        assert set(entry) == {
            "targetId",
            "tier",
            "ruleId",
            "evidenceRef",
        }, "reliability references must not carry performance numbers"


def test_background_rows_reproducible_from_seed(exported, deployed, prepared):
    background = exported.doc["background"]
    assert background["count"] == 60
    rows = np.asarray(background["rows"], dtype=np.float64)
    assert rows.shape == (60, 54)
    assert np.all(np.isfinite(rows))
    expected_indices = np.random.default_rng(background["seed"]).choice(
        prepared.X.shape[0], size=background["count"], replace=False
    )
    stored_indices = np.asarray(deployed["background"]["rowIndices"], dtype=np.int64)
    assert np.array_equal(expected_indices, stored_indices)
    assert np.array_equal(rows, prepared.X[stored_indices])


def test_attribution_bound_rejects_synthetic_four_feature_tree(exported, deployed):
    """A tree splitting on 4 distinct features must be rejected (C-03 bound)."""
    dump = json.dumps(
        {
            "nodeid": 0,
            "split": "f0",
            "split_condition": 0.5,
            "yes": 1,
            "no": 2,
            "children": [
                {
                    "nodeid": 1,
                    "split": "f1",
                    "split_condition": 0.5,
                    "yes": 3,
                    "no": 4,
                    "children": [
                        {
                            "nodeid": 3,
                            "split": "f2",
                            "split_condition": 0.5,
                            "yes": 5,
                            "no": 6,
                            "children": [
                                {
                                    "nodeid": 5,
                                    "split": "f3",
                                    "split_condition": 0.5,
                                    "yes": 7,
                                    "no": 8,
                                    "children": [
                                        {"nodeid": 7, "leaf": -1.0},
                                        {"nodeid": 8, "leaf": 1.0},
                                    ],
                                },
                                {"nodeid": 6, "leaf": 0.5},
                            ],
                        },
                        {"nodeid": 4, "leaf": -0.5},
                    ],
                },
                {"nodeid": 2, "leaf": 0.25},
            ],
        }
    )
    nodes = export_model.parse_tree(dump, 54)
    with pytest.raises(export_model.AttributionBoundExceededError) as excinfo:
        export_model.check_attribution_bound("CAD", 0, nodes)
    assert excinfo.value.feature_indices == [0, 1, 2, 3]
    assert excinfo.value.target_id == "CAD"

    booster = deployed["targets"]["CAD"]["xgb"].get_booster()
    real_nodes = export_model.parse_tree(booster.get_dump(dump_format="json")[0], 54)
    assert export_model.check_attribution_bound("CAD", 0, real_nodes) <= 3


def test_double_export_is_byte_identical(tmp_path):
    first = tmp_path / "first.json"
    second = tmp_path / "second.json"
    report_a = export_model.export(first)
    report_b = export_model.export(second)
    assert first.read_bytes() == second.read_bytes()
    assert report_a["sha256"] == report_b["sha256"]
    assert report_a["modelId"] == report_b["modelId"]
    digest = hashlib.sha256(first.read_bytes()).hexdigest()
    assert report_a["sha256"] == digest


def test_root_model_json_is_fresh_export(exported):
    """The shipped root artifact must be byte-identical to a fresh export."""
    root = export_model.MODEL_PATH
    assert root.is_file(), "root model.json missing - run make export"
    assert root.read_bytes() == exported.path.read_bytes(), (
        "root model.json is stale: re-run python -m pipeline.export_model"
    )


def test_written_bytes_are_canonical(exported):
    payload = exported.path.read_bytes()
    assert payload == export_model.canonical_bytes(exported.doc)
    assert payload.endswith(b"\n")
    assert b'": ' not in payload, "model.json must use compact separators"
    with pytest.raises(ValueError):
        export_model.canonical_bytes({"x": float("nan")})


def test_model_id_rule_excludes_identity_only(exported):
    doc = exported.doc
    model_id = export_model.compute_model_id(doc)
    assert doc["metadata"]["modelId"] == model_id

    without_id = json.loads(exported.text)
    without_id["metadata"].pop("modelId")
    assert export_model.compute_model_id(without_id) == model_id

    bumped_version = json.loads(exported.text)
    bumped_version["metadata"]["appVersion"] = "99.0.0"
    assert export_model.compute_model_id(bumped_version) == model_id

    new_provenance = json.loads(exported.text)
    new_provenance["provenance"]["dataSha256"] = "0" * 64
    new_provenance["provenance"]["resultsSha256"] = "1" * 64
    assert export_model.compute_model_id(new_provenance) == model_id

    changed_platt = json.loads(exported.text)
    changed_platt["components"]["CAD"]["platt"]["slope"] += 1e-6
    assert export_model.compute_model_id(changed_platt) != model_id

    changed_background = json.loads(exported.text)
    changed_background["background"]["rows"][0][0] += 1.0
    assert export_model.compute_model_id(changed_background) != model_id

    dropped_feature = json.loads(exported.text)
    dropped_feature["features"] = dropped_feature["features"][:-1]
    assert export_model.compute_model_id(dropped_feature) != model_id


def test_provenance_block(exported, results):
    provenance = exported.doc["provenance"]
    assert HEX64.match(provenance["dataSha256"])
    assert provenance["dataSha256"] == results["provenance"]["dataSha256"]
    results_bytes = export_model.RESULTS_PATH.read_bytes()
    assert provenance["resultsSha256"] == hashlib.sha256(results_bytes).hexdigest()
    assert provenance["seedSet"]["base"] == 411
    assert provenance["seedSet"]["deployedBackgroundSeed"] == (
        results["provenance"]["seedSet"]["derived"]["deployedBackgroundSeed"]
    )
    assert provenance["generator"] == "pipeline.export_model"
    assert provenance["toolVersions"] == results["provenance"]["toolVersions"]


def test_report_footprint(exported, deployed):
    """The artifact must stay inside the B-06 delivery budget by itself."""
    expected_trees = sum(
        deployed["targets"][target_id]["xgb"].get_booster().num_boosted_rounds()
        for target_id in TARGET_IDS
    )
    assert exported.report["sizeBytes"] == exported.path.stat().st_size
    assert exported.report["sizeBytes"] < 1_500_000
    assert exported.report["sampleRows"] == 68
    assert exported.report["backgroundRows"] == 60
    assert exported.report["treeTotal"] == expected_trees
    assert exported.report["percentileEntries"] == 54
    assert exported.report["continuousEntries"] == 21
    assert exported.report["nodeTotal"] == sum(
        len(tree["nodes"])
        for target_id in TARGET_IDS
        for tree in exported.doc["components"][target_id]["trees"]["trees"]
    )


def test_export_rejects_missing_deployed_artifact(tmp_path, monkeypatch):
    """Missing inputs fail loudly as typed export errors, never silently."""
    monkeypatch.setattr(
        export_model, "DEPLOYED_MODEL_PATH", tmp_path / "absent.joblib"
    )
    with pytest.raises(export_model.ExportError):
        export_model.build_model_document()


def test_path_helpers_are_stable():
    assert export_model.MODEL_PATH.name == "model.json"
    assert export_model.MODEL_PATH.parent == Path(
        export_model.REPO_ROOT
    ), "C-03 canonical model.json lives at the repository root"
