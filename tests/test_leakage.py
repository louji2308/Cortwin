"""Blocking leakage tests (VC-02).

The forbidden set is {LAD, LCX, RCA, Cath} (target leakage) plus the constant
column {Exertional CP}. These tests prove the columns may exist as *labels* in
the dataset but can never enter the model feature set, the registry, or a case
payload at encode time.

Proxy detection method (documented here as the audit trail):

1. exact match of a feature id against the forbidden ids;
2. normalised match — casefold, strip ``_``/``-``/whitespace;
3. substring containment of the normalised forbidden tokens
   ``lad / lcx / rca / cath / cad`` (length >= 3) inside a normalised feature id.

All three must find nothing. See AGENTS.md disqualifier: "target leakage
(LAD/LCX/RCA/Cath as inputs)".
"""

import re

import pytest

from pipeline.config import (
    feature_index,
    feature_list,
    load_features,
    load_forbidden,
    load_registry,
    load_targets,
)
from pipeline.dataset import load_dataset
from pipeline.encode import encode_case
from pipeline.errors import ForbiddenInputError, SchemaMismatchError
from pipeline.schema import OUTCOME_COLUMNS, assert_no_leakage, validate_dataset

pytestmark = pytest.mark.blocking

LEAKAGE_IDS = {"LAD", "LCX", "RCA", "Cath"}
CONSTANT_IDS = {"Exertional CP"}
PROXY_TOKENS = ("lad", "lcx", "rca", "cath", "cad")


def _normalise(name: str) -> str:
    return re.sub(r"[\s_-]+", "", str(name).casefold())


def test_forbidden_columns_are_exactly_documented_sets():
    doc = load_forbidden()
    leakage = {e["id"] for e in doc["forbiddenInputColumns"]}
    constants = {e["id"] for e in doc["constantColumns"]}
    assert leakage == LEAKAGE_IDS
    assert constants == CONSTANT_IDS
    for e in doc["forbiddenInputColumns"]:
        assert e["reason"] == "target leakage"
    for e in doc["constantColumns"]:
        assert e["reason"] == "constant column"


def test_forbidden_absent_from_model_features_exact_and_casefold():
    ids = [f["id"] for f in feature_list()]
    assert set(ids) & LEAKAGE_IDS == set()
    assert set(ids) & CONSTANT_IDS == set()
    folded = {i.casefold() for i in ids}
    assert {t.casefold() for t in LEAKAGE_IDS} - folded == {t.casefold() for t in LEAKAGE_IDS}


def test_forbidden_absent_from_registry_features():
    reg = load_registry()
    reg_ids = {f["id"] for f in reg["features"]}
    assert reg_ids & LEAKAGE_IDS == set()
    assert reg_ids & CONSTANT_IDS == set()
    reg_forbidden = {e["id"] for e in reg["forbiddenInputColumns"]}
    assert LEAKAGE_IDS | CONSTANT_IDS <= reg_forbidden


def test_no_proxy_names_in_feature_ids():
    for fid in (f["id"] for f in feature_list()):
        norm = _normalise(fid)
        for token in PROXY_TOKENS:
            assert token not in norm, f"{fid!r} contains forbidden token {token!r}"


def test_targets_disjoint_from_features():
    target_ids = {t["id"] for t in load_targets()["targets"]}
    feat_ids = {f["id"] for f in feature_list()}
    assert target_ids == {"CAD", "LAD", "LCX", "RCA"}
    assert target_ids & feat_ids == set()
    # Cath is not a target *id* but is the CAD label column, and stays forbidden
    for t in load_targets()["targets"]:
        if t["id"] == "CAD":
            assert t["labelColumn"] == "Cath"


def test_label_columns_exist_only_as_outcomes_in_dataset():
    df = load_dataset()
    feat_ids = {f["id"] for f in feature_list()}
    for col in OUTCOME_COLUMNS:
        assert col in df.columns, col  # labels stay available for training/eval
        assert col not in feat_ids, col  # but never as an input


def test_assert_no_leakage_rejects_doctored_config():
    feats = feature_list()
    doctored = {
        "schemaVersion": "1.0.0",
        "featureCount": 54,
        "modalities": load_features()["modalities"],
        "features": feats + [dict(feats[0], id="RCA", label="RCA")],
        "missingSemantics": {},
    }
    with pytest.raises(SchemaMismatchError) as exc:
        assert_no_leakage(doctored, load_forbidden())
    assert "RCA" in str(exc.value)


def test_encode_case_rejects_every_forbidden_key():
    df = load_dataset()
    row = df.iloc[0]
    base = {f["id"]: row[f["id"]] for f in feature_list()}
    for key in sorted(LEAKAGE_IDS | CONSTANT_IDS):
        payload = dict(base, **{key: "Stenotic"})
        with pytest.raises(ForbiddenInputError) as exc:
            encode_case(payload)
        assert key == exc.value.column_id


def test_schema_gate_accepts_real_dataset_and_stays_disjoint():
    df = load_dataset()
    validate_dataset(df)
    feat_ids = set(feature_index())
    assert feat_ids & set(df.columns) <= feat_ids - LEAKAGE_IDS - CONSTANT_IDS
    assert not (feat_ids & (LEAKAGE_IDS | CONSTANT_IDS))
