"""Blocking schema-gate tests (VC-01).

Guards: 54-feature config integrity, modality partition 17/13/7/14/3,
dataset-vs-config column equality, encoding metadata sanity (C-02 11.3),
derived-BMI metadata (C-02 11.3 / C-40.3), unverified units (C-39.6), and the
copy-law missing marker (C-13).
"""

import pytest

from pipeline.config import feature_index, feature_list, load_features
from pipeline.dataset import load_dataset
from pipeline.errors import SchemaMismatchError
from pipeline.schema import (
    EXPECTED_FEATURE_COUNT,
    MODALITY_COUNTS,
    missing_cell_report,
    validate_dataset,
)

pytestmark = pytest.mark.blocking

VALID_TYPES = {"binary", "categorical", "continuous"}
VALID_ENCODINGS = {"identity", "map", "ordinal"}


def test_feature_count_is_exactly_54():
    doc = load_features()
    assert doc["featureCount"] == EXPECTED_FEATURE_COUNT
    assert len(feature_list(doc)) == EXPECTED_FEATURE_COUNT


def test_modality_counts_are_17_13_7_14_3():
    doc = load_features()
    declared = {m["id"]: m["count"] for m in doc["modalities"]}
    assert declared == MODALITY_COUNTS
    feats = feature_list(doc)
    observed: dict[str, int] = {}
    for feat in feats:
        observed[feat["modality"]] = observed.get(feat["modality"], 0) + 1
    assert observed == MODALITY_COUNTS
    assert sum(observed.values()) == EXPECTED_FEATURE_COUNT


def test_feature_ids_unique_and_covered_exactly_once():
    index = feature_index()
    assert len(index) == EXPECTED_FEATURE_COUNT
    assert len(feature_list()) == EXPECTED_FEATURE_COUNT


def test_dataset_passes_schema_gate():
    df = load_dataset()
    assert df.shape == (303, 59)
    assert validate_dataset(df) == []


def test_schema_gate_rejects_missing_column():
    df = load_dataset().drop(columns=["BMI"])
    with pytest.raises(SchemaMismatchError) as exc:
        validate_dataset(df)
    assert "missing columns" in str(exc.value)
    assert "BMI" in str(exc.value)


def test_schema_gate_rejects_extra_column():
    df = load_dataset().copy()
    df["Rogue"] = 1
    with pytest.raises(SchemaMismatchError) as exc:
        validate_dataset(df)
    assert "unexpected columns" in str(exc.value)
    assert "Rogue" in str(exc.value)


def test_config_and_registry_share_feature_order():
    from pipeline.config import load_registry

    cfg_order = [f["id"] for f in feature_list()]
    reg_order = [f["id"] for f in load_registry()["features"]]
    assert cfg_order == reg_order  # C-01 39.4: registry is the order authority


def test_feature_types_and_encodings_are_valid():
    for feat in feature_list():
        assert feat["type"] in VALID_TYPES, feat["id"]
        enc = feat["encoding"]
        assert enc["type"] in VALID_ENCODINGS, feat["id"]
        if feat["type"] == "continuous":
            assert enc["type"] == "identity", feat["id"]
            assert feat["allowedValues"] is None, feat["id"]
            assert isinstance(feat["range"], dict), feat["id"]
            assert feat["range"]["min"] < feat["range"]["max"], feat["id"]
        else:
            assert feat["allowedValues"], feat["id"]
            if enc["type"] == "identity":
                # source columns already in {0,1} stay identity-encoded
                assert feat["type"] == "binary", feat["id"]
                assert feat["allowedValues"] == [0, 1], feat["id"]
            else:
                assert enc["type"] in {"map", "ordinal"}, feat["id"]


def test_encoding_contract_matches_c02_11_3():
    feats = feature_index()
    assert feats["Sex"]["encoding"]["map"] == {"Male": 1, "Fmale": 0}
    assert feats["BBB"]["encoding"] == {"type": "map", "map": {"N": 0, "LBBB": 1, "RBBB": 2}}
    assert feats["VHD"]["encoding"] == {
        "type": "map",
        "map": {"N": 0, "mild": 1, "Moderate": 2, "Severe": 3},
    }
    for feat in feature_list():
        enc = feat["encoding"]
        if enc["type"] == "map" and feat["id"] not in {"Sex", "BBB", "VHD"}:
            assert enc["map"] == {"Y": 1, "N": 0}, feat["id"]
            assert feat["allowedValues"] == ["Y", "N"], feat["id"]


def test_ordinal_levels_are_ordered_per_contract():
    feats = feature_index()
    assert feats["Function Class"]["encoding"]["levels"] == [0, 1, 2, 3]
    assert feats["Region RWMA"]["encoding"]["levels"] == [0, 1, 2, 3, 4]


def test_bmi_is_the_only_derived_feature():
    feats = feature_index()
    bmi = feats["BMI"]
    assert bmi["derived"] == {
        "formula": "BMI = Weight / (Length / 100)^2",
        "inputs": ["Weight", "Length"],
    }
    for fid, feat in feats.items():
        if fid != "BMI":
            assert feat["derived"] is None, fid


def test_units_remain_unverified():
    for feat in feature_list():
        assert feat["unit"] is None, feat["id"]
        assert feat["unitStatus"] == "unverified", feat["id"]


def test_missing_marker_is_copy_law_not_provided():
    doc = load_features()
    assert doc["missingSemantics"]["marker"] == "not provided"
    for feat in feature_list(doc):
        assert feat["missing"] == "not provided", feat["id"]


def test_canonical_dataset_has_zero_missing_cells():
    df = load_dataset()
    report = missing_cell_report(df)
    assert len(report) == EXPECTED_FEATURE_COUNT
    assert {k: v for k, v in report.items() if v} == {}
