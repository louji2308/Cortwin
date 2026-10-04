"""Blocking encoding tests (C-02 11.3, C-40, C-79, INV-C08/C09).

Proves: full-dataset round-trip fidelity, typed rejections for every invalid
input category, missingness semantics (never a fabricated value), forbidden
keys rejected at the runtime boundary, and range flags that inform without
blocking (Contracts 39.5/40.2/79).
"""

import math

import pytest

from pipeline.config import feature_index, feature_list
from pipeline.dataset import load_dataset
from pipeline.encode import (
    MISSING_MARKER,
    decode_value,
    encode_case,
    encode_value,
    range_flag,
)
from pipeline.errors import EncodingError, ForbiddenInputError

pytestmark = pytest.mark.blocking


@pytest.fixture(scope="module")
def feats() -> dict:
    return feature_index()


@pytest.fixture(scope="module")
def row0():
    return load_dataset().iloc[0]


def test_full_dataset_round_trip_every_row_every_feature():
    df = load_dataset()
    features = feature_list()
    mismatches = []
    for idx in range(len(df)):
        row = df.iloc[idx]
        values = {f["id"]: row[f["id"]] for f in features}
        encoded = encode_case(values)
        for feat in features:
            decoded = decode_value(feat, encoded[feat["id"]])
            if decoded != row[feat["id"]]:
                mismatches.append((idx, feat["id"], row[feat["id"]], decoded))
    assert mismatches == []


def test_unknown_categorical_level_raises(feats):
    with pytest.raises(EncodingError) as exc:
        encode_value(feats["VHD"], "severe")  # case-sensitive: 'Severe' is valid
    assert exc.value.reason == "unknown categorical level"
    with pytest.raises(EncodingError):
        encode_value(feats["BBB"], "XBBB")
    with pytest.raises(EncodingError):
        encode_value(feats["Sex"], "Other")


def test_case_sensitive_source_spelling_preserved(feats):
    assert encode_value(feats["VHD"], "Severe") == 3.0
    assert decode_value(feats["VHD"], 3.0) == "Severe"


def test_malformed_ordinal_raises(feats):
    with pytest.raises(EncodingError) as exc:
        encode_value(feats["Function Class"], 7)
    assert exc.value.reason == "malformed ordinal value"
    with pytest.raises(EncodingError):
        encode_value(feats["Region RWMA"], -1)


def test_discrete_value_out_of_range_raises(feats):
    with pytest.raises(EncodingError) as exc:
        encode_value(feats["DM"], 2)
    assert exc.value.reason == "discrete value out of range"
    with pytest.raises(EncodingError):
        encode_value(feats["Q Wave"], -1)


def test_non_numeric_continuous_raises(feats):
    with pytest.raises(EncodingError) as exc:
        encode_value(feats["Age"], "abc")
    assert exc.value.reason == "non-numeric continuous value"


def test_non_finite_values_raise(feats):
    for bad in (math.inf, -math.inf, math.nan):
        with pytest.raises(EncodingError) as exc:
            encode_value(feats["Age"], bad)
        assert exc.value.reason == "non-finite value", bad


def test_provided_none_value_raises(feats):
    with pytest.raises(EncodingError) as exc:
        encode_value(feats["Age"], None)
    assert exc.value.reason == "provided feature has no value"


def test_missing_feature_encodes_to_none_and_decodes_as_not_provided(feats, row0):
    values = {f["id"]: row0[f["id"]] for f in feature_list()}
    provided = {f["id"]: True for f in feature_list()}
    provided["Age"] = False
    encoded = encode_case(values, provided=provided)
    assert encoded["Age"] is None
    assert decode_value(feats["Age"], encoded["Age"]) == MISSING_MARKER
    assert MISSING_MARKER == "not provided"
    assert encoded["BMI"] is not None  # untouched features remain observed


def test_observed_feature_without_value_raises(feats, row0):
    values = {f["id"]: row0[f["id"]] for f in feature_list()}
    del values["Age"]
    with pytest.raises(EncodingError) as exc:
        encode_case(values)
    assert exc.value.reason == "observed feature missing from case values"
    assert exc.value.feature_id == "Age"


def test_unknown_feature_id_in_payload_raises(feats, row0):
    values = {f["id"]: row0[f["id"]] for f in feature_list()}
    values["Nonsense"] = 1
    with pytest.raises(EncodingError) as exc:
        encode_case(values)
    assert exc.value.reason == "unknown feature id"


def test_forbidden_key_rejected_before_any_encoding(row0):
    values = {f["id"]: row0[f["id"]] for f in feature_list()}
    values["Cath"] = "CAD"
    with pytest.raises(ForbiddenInputError):
        encode_case(values)


def test_range_flag_informational_never_blocks(feats):
    age = feats["Age"]
    lo = age["range"]["min"]
    below = encode_value(age, lo - 10)  # valid for inference (C-40.2)
    assert below == lo - 10
    assert range_flag(age, below) is True
    assert range_flag(age, encode_value(age, lo)) is False
    # non-continuous: flag is defined out of existence
    assert range_flag(feats["Sex"], 1.0) is False


def test_enforce_range_strict_mode_raises_for_non_inference_paths(feats):
    age = feats["Age"]
    with pytest.raises(EncodingError) as exc:
        encode_value(age, age["range"]["min"] - 10, enforce_range=True)
    assert exc.value.reason == "value outside cohort range"
    # default (inference path) never raises:
    assert encode_value(age, age["range"]["min"] - 10) == age["range"]["min"] - 10


def test_round_trip_discrete_spot_checks(feats):
    checks = [
        (feats["Sex"], "Fmale", 0.0),
        (feats["BBB"], "RBBB", 2.0),
        (feats["VHD"], "mild", 1.0),
        (feats["Function Class"], 2, 2.0),
        (feats["Region RWMA"], 4, 4.0),
        (feats["Obesity"], "Y", 1.0),
        (feats["Obesity"], "N", 0.0),
    ]
    for feat, source, model in checks:
        assert encode_value(feat, source) == model, feat["id"]
        assert decode_value(feat, model) == source, feat["id"]
