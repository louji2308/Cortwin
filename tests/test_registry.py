"""Blocking registry tests (C-02, C-01 39.x, C-81 identity chain).

The registry is the sole correspondence authority: modalities, features,
stages, targets, structures, display groups, forbidden columns. Nothing else
may define identity (C-02 11.5: "No second mapping table may be introduced").
"""

import pytest

from pipeline.config import (
    feature_index,
    feature_list,
    load_features,
    load_registry,
    load_targets,
)

pytestmark = pytest.mark.blocking

C02_TOP_KEYS = {
    "schemaVersion", "modalities", "features", "targets", "structures",
    "displayGroups", "stages", "forbiddenInputColumns",
}
VESSEL_TARGETS = {"LAD", "LCX", "RCA"}
ALL_TARGETS = {"CAD", "LAD", "LCX", "RCA"}
NAMED_NODES = {"HEART", "AORTA", "LAD", "LCX", "RCA"}
LABEL_DEFINITION = "\u226550% stenosis under the cohort label"
MODALITY_ORDER = ["history", "exam", "ecg", "labs", "echo"]
MODALITY_COUNTS = {"history": 17, "exam": 13, "ecg": 7, "labs": 14, "echo": 3}


@pytest.fixture(scope="module")
def reg() -> dict:
    return load_registry()


def test_top_level_keys_are_exactly_c02(reg):
    assert set(reg) == C02_TOP_KEYS
    assert len(reg) == 8


def test_schema_version_is_1_0_0(reg):
    assert reg["schemaVersion"] == "1.0.0"


def test_targets_are_exactly_the_four_models(reg):
    ids = [t["id"] for t in reg["targets"]]
    assert set(ids) == ALL_TARGETS
    assert len(ids) == 4
    by_id = {t["id"]: t for t in reg["targets"]}
    assert by_id["CAD"]["kind"] == "overall"
    assert by_id["CAD"]["modelKey"] == "CAD"
    for vessel in VESSEL_TARGETS:
        assert by_id[vessel]["kind"] == "vessel"
        assert by_id[vessel]["modelKey"] == vessel
    for t in reg["targets"]:
        assert t["labelDefinition"] == LABEL_DEFINITION


def test_targets_match_targets_json_on_contract_fields(reg):
    external = {t["id"]: t for t in load_targets()["targets"]}
    for t in reg["targets"]:
        src = external[t["id"]]
        for key in ("id", "label", "kind", "modelKey", "structureId", "labelDefinition"):
            assert t[key] == src[key], f"{t['id']}.{key}"


def test_vessel_identity_chain_complete(reg):
    structures = {s["id"]: s for s in reg["structures"]}
    for t in reg["targets"]:
        if t["id"] in VESSEL_TARGETS:
            # C-02 11.5 / C-81: target id == modelKey == structureId == meshNode
            assert t["structureId"] == t["id"]
            structure = structures[t["structureId"]]
            assert structure["meshNode"] == t["id"]
            assert structure["cameraPreset"] == t["id"]
        else:
            assert t["structureId"] is None  # CAD has no vessel structure


def test_structures_are_exactly_the_five_named_nodes(reg):
    ids = [s["id"] for s in reg["structures"]]
    assert set(ids) == NAMED_NODES
    assert len(ids) == 5  # no ribs, no lungs, no decorative anatomy
    for s in reg["structures"]:
        assert s["meshNode"] in NAMED_NODES
        assert s["cameraPreset"] in {"Overview"} | VESSEL_TARGETS
        assert "schematicPath" in s  # B0-3 owns the value; key is contract-fixed
        assert s["label"]


def test_neutral_structures_are_heart_and_aorta_only(reg):
    by_id = {s["id"]: s for s in reg["structures"]}
    assert by_id["HEART"]["cameraPreset"] == "Overview"
    assert by_id["AORTA"]["cameraPreset"] == "Overview"


def test_modalities_orders_labels_and_counts(reg):
    assert [m["id"] for m in reg["modalities"]] == MODALITY_ORDER
    assert [m["order"] for m in reg["modalities"]] == [0, 1, 2, 3, 4]
    labels = {m["id"]: m["label"] for m in reg["modalities"]}
    assert labels["exam"] == "Exam & symptoms"
    assert labels["ecg"] == "ECG"


def test_stages_are_cumulative_modality_prefixes(reg):
    assert [s["order"] for s in reg["stages"]] == [0, 1, 2, 3, 4]
    for stage, modality in zip(reg["stages"], MODALITY_ORDER):
        assert stage["id"] == modality
        assert stage["modalitiesThrough"] == MODALITY_ORDER[: stage["order"] + 1]


def test_registry_features_cover_54_with_modality_counts(reg):
    feats = reg["features"]
    assert len(feats) == 54
    observed = {}
    for f in feats:
        observed[f["modality"]] = observed.get(f["modality"], 0) + 1
    assert observed == MODALITY_COUNTS


def test_registry_features_match_features_json(reg):
    cfg = {f["id"]: f for f in feature_list(load_features())}
    reg_ids = [f["id"] for f in reg["features"]]
    assert reg_ids == [f["id"] for f in feature_list()]  # same order (C-01 39.4)
    for rf in reg["features"]:
        cf = cfg[rf["id"]]
        assert rf["modality"] == cf["modality"], rf["id"]
        assert rf["kind"] == cf["type"], rf["id"]
        assert rf["encoding"] == cf["encoding"], rf["id"]
        assert rf["displayGroup"] == cf["displayGroup"], rf["id"]
        if cf["type"] == "continuous":
            assert rf["range"] == cf["range"], rf["id"]


def test_every_feature_has_valid_kind_and_unique_id(reg):
    valid = {"binary", "categorical", "continuous"}
    seen = set()
    index = feature_index()  # raises ConfigError on duplicates
    for f in reg["features"]:
        assert f["kind"] in valid, f["id"]
        assert f["id"] not in seen, f["id"]
        seen.add(f["id"])
    assert set(seen) == set(index)


def test_display_groups_reference_existing_features_bidirectionally(reg):
    feat_ids = {f["id"] for f in reg["features"]}
    groups = {g["id"]: g for g in reg["displayGroups"]}
    assert set(groups) == {"body-size"}
    assert groups["body-size"]["features"] == ["Weight", "Length", "BMI"]
    for g in reg["displayGroups"]:
        for fid in g["features"]:
            assert fid in feat_ids, fid
    for f in reg["features"]:
        if f["displayGroup"] is not None:
            assert f["id"] in groups[f["displayGroup"]]["features"], f["id"]


def test_forbidden_input_columns_are_all_five(reg):
    entries = {e["id"]: e["reason"] for e in reg["forbiddenInputColumns"]}
    assert set(entries) == {"LAD", "LCX", "RCA", "Cath", "Exertional CP"}
    for lid in ("LAD", "LCX", "RCA", "Cath"):
        assert entries[lid] == "target leakage"
    assert entries["Exertional CP"] == "constant column"
    reg_feats = {f["id"] for f in reg["features"]}
    assert reg_feats & set(entries) == set()  # disjoint (C-02 11.4)


def test_structure_ids_do_not_collide(reg):
    ids = [s["id"] for s in reg["structures"]]
    assert len(ids) == len(set(ids))
