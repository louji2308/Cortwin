"""C-05 cases artifact (web/public/cases.json) — canonical builder + blocking tests.

Contract: Project/Contracts.md §5.5 (C-05), provenance badges §9 (C-13), case
chips from Project/Final_demo.md §3, decision D-13 (Progress.md §4).

Representation decisions (C-05 fixes the shape, this unit fixes the internals;
every choice below is asserted by a test, so the artifact is self-verifying):

* providedFeatures / providedModalities are COMPLETE boolean maps covering
  every registry feature id / modality id — no implicit defaults anywhere.
* An unprovided feature is BOTH providedFeatures[fid] = false AND absent from
  values; it is never given a default or fabricated value (INV-C08/C09).
  Invariant asserted for every case:
  set(values) == {fid : providedFeatures[fid] is true}.
* values carry SOURCE spellings (pre-encoding): exact strings for "map"
  encodings (case-sensitive: Fmale, LBBB, mild), numbers for "identity" and
  "ordinal" encodings — exactly what pipeline.encode consumes and
  decode_value round-trips.
* Cohort rows use a fixed, outcome-blind rule: the FIRST TWO data rows of the
  canonical CSV in stable file order (COHORT_ROW_INDICES = (0, 1)), selected by
  position only; outcome columns are never consulted (no cherry-picking).
* Hypothetical profiles are hand-authored demo content; the suite asserts
  their value maps duplicate NO cohort row (C-05) and that BMI obeys the
  registry identity BMI = Weight / (Length/100)^2 whenever it is provided.
* Canonical serialization: json.dumps(sort_keys=True, indent=2,
  allow_nan=False, ensure_ascii=False) + one trailing newline, written as
  UTF-8 BYTES (binary write — a Windows text-mode newline translation can
  never change the sha256). The on-disk file must equal this serialization
  byte for byte.

Regenerate (never hand-edit — AG-12), from the repo root:

    .venv/Scripts/python.exe tests/test_cases.py
    .venv/Scripts/python.exe -m pytest tests/test_cases.py -q
"""

import csv
import hashlib
import json
import math
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:  # allow `python tests/test_cases.py` directly
    sys.path.insert(0, str(REPO_ROOT))

import pytest

from pipeline.config import (
    feature_index,
    feature_list,
    forbidden_ids,
    load_registry,
)
from pipeline.dataset import verify_checksums
from pipeline.encode import (
    MISSING_MARKER,
    decode_value,
    encode_case,
    encode_value,
)

pytestmark = pytest.mark.blocking

CASES_PATH = REPO_ROOT / "web" / "public" / "cases.json"
CSV_PATH = REPO_ROOT / "data" / "raw" / "extention-of-z-alizadeh-sani.csv"
SCHEMA_VERSION = "1.0.0"

# Deterministic, outcome-blind cohort selection: data rows 1 and 2 of the
# canonical CSV in stable file order (file lines 2 and 3). Fixed before any
# target column is read; never chosen by outcome, prognosis or appearance.
COHORT_ROW_INDICES = (0, 1)

# hypo2 masks exactly these two modalities (labs 14 + echo 3 = 17 features).
HYPO2_MASKED_MODALITIES = frozenset({"labs", "echo"})

_NOTE_HYPOTHETICAL = (
    "Hypothetical demo content: an illustrative profile for the demo, not a "
    "real patient record; no value here is measured from any person."
)
_NOTE_COHORT_IN_SAMPLE = (
    "In-sample cohort record: this row was part of the training cohort, so "
    "its agreement with the model is optimistic, not an out-of-sample estimate."
)
_NOTE_COHORT_RULE = (
    "Values copied verbatim from the cohort dataset CSV; selected by a fixed "
    "file-order rule (the first data rows in stable file order), never by outcome."
)

# C-13 copy lint minimum, applied to every user-visible case string.
BANNED_PATTERNS = (
    r"\bdiagnos\w*",
    r"\bdetect\w*",
    r"\brecommend\w*",
    r"treatment impact",
    r"treatment effect",
    r"\bcaused by\b",
    r"\bcauses?\b",
    r"\bproves?\b",
    r"\bproven\b",
    r"lesion location",
    r"plaque location",
)


# --------------------------------------------------------------------------------------
# Builder (the only writer of web/public/cases.json; AG-12: regenerate, never hand-edit)
# --------------------------------------------------------------------------------------


def _hypothetical_values() -> dict[str, object]:
    """One hand-authored demo profile with all 54 model features provided.

    Registry-legal: every map/ordinal spelling is a source-level key, every
    numeric value is finite and inside the cohort range, and BMI is recomputed
    from Weight/Length with the exact registry identity.
    """
    weight = 82
    length = 172
    return {
        # History (17)
        "Age": 58,
        "Weight": weight,
        "Length": length,
        "Sex": "Fmale",
        "BMI": weight / ((length / 100.0) ** 2),
        "DM": 1,
        "HTN": 1,
        "Current Smoker": 0,
        "EX-Smoker": 0,
        "FH": 0,
        "Obesity": "Y",
        "CRF": "N",
        "CVA": "N",
        "Airway disease": "N",
        "Thyroid Disease": "N",
        "CHF": "N",
        "DLP": "Y",
        # Exam & symptoms (13)
        "BP": 138,
        "PR": 76,
        "Edema": 0,
        "Weak Peripheral Pulse": "N",
        "Lung rales": "N",
        "Systolic Murmur": "N",
        "Diastolic Murmur": "N",
        "Typical Chest Pain": 1,
        "Dyspnea": "Y",
        "Function Class": 1,
        "Atypical": "N",
        "Nonanginal": "N",
        "LowTH Ang": "N",
        # ECG (7)
        "Q Wave": 1,
        "St Elevation": 0,
        "St Depression": 1,
        "Tinversion": 1,
        "LVH": "N",
        "Poor R Progression": "N",
        "BBB": "LBBB",
        # Labs (14)
        "FBS": 118,
        "CR": 1.1,
        "TG": 190,
        "LDL": 128,
        "HDL": 41,
        "BUN": 19,
        "ESR": 24,
        "HB": 13.8,
        "K": 4.1,
        "Na": 139,
        "WBC": 6800,
        "Lymph": 36,
        "Neut": 57,
        "PLT": 231,
        # Echo (3)
        "EF-TTE": 50,
        "Region RWMA": 1,
        "VHD": "mild",
    }


def _cohort_cell_to_source(feature: dict, cell: str) -> object:
    """CSV cell -> source-space value, without reformatting or rounding.

    "map" encodings keep the exact case-sensitive cell string; "identity" and
    "ordinal" encodings keep the numeric literal (int for integer literals,
    else float) — the same value pipeline.encode would read from the CSV.
    """
    if feature["encoding"]["type"] == "map":
        return cell
    try:
        return int(cell)
    except ValueError:
        return float(cell)


def _read_cohort_rows() -> list[dict[str, str]]:
    """Checksum-verified canonical CSV rows as exact cell strings (file order)."""
    verify_checksums()
    with CSV_PATH.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def build_cases() -> dict:
    """Build the C-05 cases document from config + the canonical dataset."""
    features = feature_list()
    registry = load_registry()
    registry_feature_ids = [f["id"] for f in registry["features"]]
    modality_ids = [m["id"] for m in registry["modalities"]]
    modality_of = {f["id"]: f["modality"] for f in features}

    hypo_values = _hypothetical_values()
    hypo2_values = {
        fid: value
        for fid, value in hypo_values.items()
        if modality_of[fid] not in HYPO2_MASKED_MODALITIES
    }

    rows = _read_cohort_rows()
    cohort_values = [
        {
            f["id"]: _cohort_cell_to_source(f, rows[index][f["id"]])
            for f in features
        }
        for index in COHORT_ROW_INDICES
    ]

    all_true = {fid: True for fid in registry_feature_ids}
    modalities_all_true = {mid: True for mid in modality_ids}

    def _cohort_case(position: int, case_id: str, label: str) -> dict:
        return {
            "id": case_id,
            "label": label,
            "provenance": "cohort-record",
            "values": cohort_values[position],
            "providedFeatures": dict(all_true),
            "providedModalities": dict(modalities_all_true),
            "notes": [_NOTE_COHORT_IN_SAMPLE, _NOTE_COHORT_RULE],
        }

    cases = [
        {
            "id": "hypo1",
            "label": "Hypothetical · Complete",
            "provenance": "hypothetical",
            "values": dict(hypo_values),
            "providedFeatures": dict(all_true),
            "providedModalities": dict(modalities_all_true),
            "notes": [
                _NOTE_HYPOTHETICAL,
                "Complete profile: all 54 model features are provided.",
            ],
        },
        {
            "id": "hypo2",
            "label": "Hypothetical · No labs/echo",
            "provenance": "hypothetical",
            "values": dict(hypo2_values),
            "providedFeatures": {
                fid: fid in hypo2_values for fid in registry_feature_ids
            },
            "providedModalities": {
                mid: mid not in HYPO2_MASKED_MODALITIES for mid in modality_ids
            },
            "notes": [
                _NOTE_HYPOTHETICAL,
                (
                    "Labs and Echo are not provided: their 17 features are excluded "
                    "from values and marked provided=false, so they are marginalised "
                    "over the cohort and never defaulted to a measured value."
                ),
            ],
        },
        _cohort_case(0, "cohortA", "Cohort record A"),
        _cohort_case(1, "cohortB", "Cohort record B"),
        {
            "id": "blank",
            "label": "Blank profile",
            "provenance": "blank",
            "values": {},
            "providedFeatures": {fid: False for fid in registry_feature_ids},
            "providedModalities": {mid: False for mid in modality_ids},
            "notes": [
                (
                    "No information provided: every feature and every modality is "
                    "unprovided."
                ),
                (
                    "Output is v(∅) (reference/cohort-average behaviour); nothing "
                    "is defaulted to a measured value."
                ),
            ],
        },
    ]
    return {"schemaVersion": SCHEMA_VERSION, "cases": cases}


def serialize_cases(doc: dict) -> bytes:
    """Canonical bytes: sorted keys, 2-space indent, no NaN, UTF-8, trailing \\n."""
    text = json.dumps(doc, sort_keys=True, indent=2, allow_nan=False, ensure_ascii=False)
    return (text + "\n").encode("utf-8")


def _validate(doc: dict) -> None:
    """Generator-side validation (the full contract suite lives in the tests)."""
    feats = feature_index()
    for case in doc["cases"]:
        provided = case["providedFeatures"]
        assert set(case["values"]) == {
            fid for fid, ok in provided.items() if ok
        }, case["id"]
        encoded = encode_case(case["values"], provided=provided)
        for fid, model_value in encoded.items():
            if provided[fid]:
                assert model_value is not None and math.isfinite(model_value), (
                    case["id"],
                    fid,
                )
            else:
                assert model_value is None, (case["id"], fid)
        values = case["values"]
        if "BMI" in values:
            assert values["BMI"] == values["Weight"] / ((values["Length"] / 100.0) ** 2)
        assert set(case["values"]) <= set(feats)


def regenerate_cases_file() -> bytes:
    """(Re)write web/public/cases.json; creates web/public/ with exist_ok semantics."""
    doc = build_cases()
    _validate(doc)
    payload = serialize_cases(doc)
    assert payload == serialize_cases(build_cases()), "non-deterministic serialization"
    CASES_PATH.parent.mkdir(parents=True, exist_ok=True)
    CASES_PATH.write_bytes(payload)
    return payload


# --------------------------------------------------------------------------------------
# Fixtures
# --------------------------------------------------------------------------------------


def _by_id(doc: dict, case_id: str) -> dict:
    return next(case for case in doc["cases"] if case["id"] == case_id)


@pytest.fixture(scope="module")
def on_disk() -> bytes:
    assert CASES_PATH.is_file(), (
        f"missing C-05 artifact {CASES_PATH}; regenerate with "
        "`python tests/test_cases.py`"
    )
    return CASES_PATH.read_bytes()


@pytest.fixture(scope="module")
def cases_doc(on_disk) -> dict:
    """The ON-DISK artifact as parsed JSON — what the manifest hashes and the
    loader fetches. Semantic tests run against it, so a hand-edited or
    corrupted file fails the precise contract test, not just the byte check."""
    return json.loads(on_disk)


@pytest.fixture(scope="module")
def registry_doc() -> dict:
    return load_registry()


@pytest.fixture(scope="module")
def feats() -> dict:
    return feature_index()


@pytest.fixture(scope="module")
def cohort_rows() -> list[dict[str, str]]:
    return _read_cohort_rows()


# --------------------------------------------------------------------------------------
# Schema / shape
# --------------------------------------------------------------------------------------


def test_top_level_schema_and_version(cases_doc):
    assert set(cases_doc) == {"schemaVersion", "cases"}
    assert cases_doc["schemaVersion"] == SCHEMA_VERSION == "1.0.0"
    assert isinstance(cases_doc["cases"], list)
    assert len(cases_doc["cases"]) == 5


def test_case_ids_labels_and_provenance_exact(cases_doc):
    # Final_demo.md §3 chips + C-05 / C-13 badge wording. Kept verbatim and
    # independent of the builder on purpose: a builder regression must fail here.
    expected = [
        ("hypo1", "Hypothetical · Complete", "hypothetical"),
        ("hypo2", "Hypothetical · No labs/echo", "hypothetical"),
        ("cohortA", "Cohort record A", "cohort-record"),
        ("cohortB", "Cohort record B", "cohort-record"),
        ("blank", "Blank profile", "blank"),
    ]
    actual = [
        (case["id"], case["label"], case["provenance"]) for case in cases_doc["cases"]
    ]
    assert actual == expected
    assert len({case["id"] for case in cases_doc["cases"]}) == 5
    # No row index / patient identifier ever leaks into ids or labels.
    for case in cases_doc["cases"]:
        assert "row" not in case["id"].lower()
        assert "row" not in case["label"].lower()


def test_case_objects_have_exactly_the_c05_keys(cases_doc):
    for case in cases_doc["cases"]:
        assert set(case) == {
            "id",
            "label",
            "provenance",
            "values",
            "providedFeatures",
            "providedModalities",
            "notes",
        }
        assert isinstance(case["notes"], list) and case["notes"]
        assert all(isinstance(note, str) and note for note in case["notes"])


def test_provided_maps_cover_registry_ids_and_values_match_provided(
    cases_doc, registry_doc, feats
):
    feature_ids = {f["id"] for f in registry_doc["features"]}
    modality_ids = {m["id"] for m in registry_doc["modalities"]}
    # One identity truth: registry and features.json agree on all 54 ids.
    assert len(feature_ids) == 54
    assert feature_ids == set(feats)
    assert modality_ids == {f["modality"] for f in feats.values()}
    for case in cases_doc["cases"]:
        assert set(case["providedFeatures"]) == feature_ids
        assert set(case["providedModalities"]) == modality_ids
        assert set(case["values"]) <= feature_ids
        # values are exactly the provided features — nothing fabricated, nothing absent
        assert set(case["values"]) == {
            fid for fid, ok in case["providedFeatures"].items() if ok
        }
        assert all(isinstance(ok, bool) for ok in case["providedFeatures"].values())
        assert all(isinstance(ok, bool) for ok in case["providedModalities"].values())


def test_no_forbidden_input_columns_anywhere(cases_doc):
    forbidden = set(forbidden_ids())
    assert forbidden == {"LAD", "LCX", "RCA", "Cath", "Exertional CP"}
    for case in cases_doc["cases"]:
        assert forbidden.isdisjoint(case["values"]), case["id"]
        assert forbidden.isdisjoint(case["providedFeatures"]), case["id"]
        assert case["id"] not in forbidden
        assert case["label"] not in forbidden


# --------------------------------------------------------------------------------------
# hypo1 — complete hypothetical
# --------------------------------------------------------------------------------------


def test_hypo1_provides_all_54_and_round_trips_through_encode(cases_doc, feats):
    case = _by_id(cases_doc, "hypo1")
    assert set(case["values"]) == set(feats) and len(case["values"]) == 54
    assert all(ok for ok in case["providedFeatures"].values())
    assert all(ok for ok in case["providedModalities"].values())
    encoded = encode_case(case["values"], provided=case["providedFeatures"])
    assert set(encoded) == set(feats)
    for fid, model_value in encoded.items():
        assert model_value is not None, fid
        assert math.isfinite(model_value), fid
        # round-trip: source spelling in == source spelling out
        assert decode_value(feats[fid], model_value) == case["values"][fid], fid


def test_hypo1_continuous_values_are_inside_cohort_range(cases_doc, feats):
    case = _by_id(cases_doc, "hypo1")
    for fid, value in case["values"].items():
        feat = feats[fid]
        if feat["type"] == "continuous":
            assert feat["range"]["min"] <= float(value) <= feat["range"]["max"], fid


def test_hypo1_required_categorical_and_ordinal_source_spellings(cases_doc, feats):
    values = _by_id(cases_doc, "hypo1")["values"]
    for fid in ("Sex", "BBB", "VHD"):  # the case-sensitive map encodings (C-02)
        table = feats[fid]["encoding"]["map"]
        assert isinstance(values[fid], str)
        assert values[fid] in table
        assert encode_value(feats[fid], values[fid]) == float(table[values[fid]])
    for fid in ("Function Class", "Region RWMA"):  # numeric ordinal levels
        levels = feats[fid]["encoding"]["levels"]
        assert isinstance(values[fid], int)
        assert values[fid] in levels
        assert encode_value(feats[fid], values[fid]) == float(levels.index(values[fid]))


# --------------------------------------------------------------------------------------
# hypo2 — labs + echo unprovided
# --------------------------------------------------------------------------------------


def test_hypo2_masks_exactly_labs_and_echo(cases_doc, feats):
    case = _by_id(cases_doc, "hypo2")
    masked = {fid for fid, feat in feats.items() if feat["modality"] in {"labs", "echo"}}
    assert len(masked) == 17  # labs 14 + echo 3
    assert case["providedModalities"] == {
        "history": True,
        "exam": True,
        "ecg": True,
        "labs": False,
        "echo": False,
    }
    assert {fid for fid, ok in case["providedFeatures"].items() if not ok} == masked
    # Representation rule: unprovided features are absent from values AND false
    assert set(case["values"]) == set(feats) - masked
    assert set(case["values"]).isdisjoint(masked)
    encoded = encode_case(case["values"], provided=case["providedFeatures"])
    assert all(encoded[fid] is None for fid in masked)
    assert all(encoded[fid] is not None for fid in set(feats) - masked)
    # masked features are "not provided", never a defaulted measured value
    assert all(decode_value(feats[fid], None) == MISSING_MARKER for fid in masked)


# --------------------------------------------------------------------------------------
# blank
# --------------------------------------------------------------------------------------


def test_blank_case_is_fully_unprovided(cases_doc, feats):
    case = _by_id(cases_doc, "blank")
    assert case["values"] == {}
    assert not any(case["providedFeatures"].values())
    assert not any(case["providedModalities"].values())
    encoded = encode_case({}, provided=case["providedFeatures"])
    assert set(encoded) == set(feats)
    assert all(value is None for value in encoded.values())
    assert all(decode_value(feats[fid], None) == MISSING_MARKER for fid in feats)


# --------------------------------------------------------------------------------------
# Derived-value identity (BMI)
# --------------------------------------------------------------------------------------


def test_bmi_identity_holds_whenever_bmi_is_provided(cases_doc):
    for case in cases_doc["cases"]:
        values = case["values"]
        if "BMI" in values:
            recomputed = values["Weight"] / ((values["Length"] / 100.0) ** 2)
            assert values["BMI"] == recomputed, case["id"]
        else:
            # absent-unprovided: BMI must not appear, and must be flagged false
            assert "BMI" not in values
            assert case["providedFeatures"]["BMI"] is False


# --------------------------------------------------------------------------------------
# Cohort records
# --------------------------------------------------------------------------------------


def test_cohort_values_byte_match_source_csv_rows(cases_doc, cohort_rows, feats):
    for case_id, row_index in zip(
        ("cohortA", "cohortB"), COHORT_ROW_INDICES, strict=True
    ):
        case = _by_id(cases_doc, case_id)
        row = cohort_rows[row_index]
        assert set(case["values"]) == set(feats) and len(case["values"]) == 54
        assert all(ok for ok in case["providedFeatures"].values())
        for fid, value in case["values"].items():
            feat = feats[fid]
            cell = row[fid]
            if feat["encoding"]["type"] == "map":
                # byte-exact, case-sensitive source spelling
                assert value == cell, f"{case_id}.{fid}: {value!r} != CSV {cell!r}"
            else:
                # exact numeric equality with the CSV cell (no rounding/format drift)
                assert isinstance(value, (int, float)), f"{case_id}.{fid}"
                assert float(value) == float(cell), f"{case_id}.{fid}: {value!r} vs {cell!r}"
                # literal byte-match: the JSON number token IS the CSV cell text
                assert json.dumps(value) == cell, (
                    f"{case_id}.{fid}: {json.dumps(value)!r} != CSV {cell!r}"
                )
            # the stored value encodes identically to the raw CSV cell
            source = cell if feat["encoding"]["type"] == "map" else float(cell)
            assert encode_value(feat, source) == encode_value(feat, value), (
                case_id,
                fid,
            )


def test_cohort_selection_rule_is_re_derivable_from_the_csv(
    cases_doc, cohort_rows
):
    # Documented rule: first two data rows, stable file order, position only.
    assert COHORT_ROW_INDICES == (0, 1)
    assert len(cohort_rows) == 303
    by_id = {case["id"]: case for case in cases_doc["cases"]}
    # Independent positional derivation (rule literals, not the constant):
    for case_id, index in (("cohortA", 0), ("cohortB", 1)):
        row = cohort_rows[index]
        values = by_id[case_id]["values"]
        assert float(row["Age"]) == values["Age"]
        assert float(row["BMI"]) == values["BMI"]
        assert float(row["EF-TTE"]) == values["EF-TTE"]
        assert row["Sex"] == values["Sex"]
        assert row["VHD"] == values["VHD"]
        notes = " ".join(by_id[case_id]["notes"]).lower()
        assert "in-sample" in notes and "optimistic" in notes  # C-05 caveat
        assert "file order" in notes and "never by outcome" in notes  # rule disclosed
    assert by_id["cohortA"]["values"] != by_id["cohortB"]["values"]


# --------------------------------------------------------------------------------------
# C-05 independence: hypotheticals duplicate no cohort row
# --------------------------------------------------------------------------------------


def test_hypothetical_cases_duplicate_no_cohort_row(cases_doc, cohort_rows, feats):
    hypo1 = _by_id(cases_doc, "hypo1")
    hypo2 = _by_id(cases_doc, "hypo2")
    hypo2_ids = set(hypo2["values"])
    hypo1_encoded = encode_case(hypo1["values"], provided=hypo1["providedFeatures"])
    hypo2_encoded = encode_case(hypo2["values"], provided=hypo2["providedFeatures"])
    for index, row in enumerate(cohort_rows):
        row_values = {
            fid: row[fid] if feats[fid]["encoding"]["type"] == "map" else float(row[fid])
            for fid in feats
        }
        assert hypo1["values"] != row_values, f"hypo1 duplicates data row {index + 1}"
        assert hypo2["values"] != {
            fid: row_values[fid] for fid in hypo2_ids
        }, f"hypo2 duplicates data row {index + 1}"
        # same claim in model space (type-normalised)
        row_encoded = encode_case(row_values)
        assert hypo1_encoded != row_encoded, f"hypo1 duplicates data row {index + 1}"
        assert hypo2_encoded != encode_case(
            row_values, provided=hypo2["providedFeatures"]
        ), f"hypo2 duplicates data row {index + 1}"


# --------------------------------------------------------------------------------------
# Copy (C-13) + required caveats
# --------------------------------------------------------------------------------------


def test_labels_and_notes_keep_approved_vocabulary_and_caveats(cases_doc):
    by_id = {case["id"]: case for case in cases_doc["cases"]}
    for cid in ("hypo1", "hypo2"):
        assert any("Hypothetical" in note for note in by_id[cid]["notes"])
    for cid in ("cohortA", "cohortB"):
        notes = " ".join(by_id[cid]["notes"]).lower()
        assert "in-sample" in notes and "optimistic" in notes
    assert any("v(∅)" in note for note in by_id["blank"]["notes"])
    for case in cases_doc["cases"]:
        text = f"{case['label']} {' '.join(case['notes'])}"
        for pattern in BANNED_PATTERNS:
            assert re.search(pattern, text, flags=re.IGNORECASE) is None, (
                case["id"],
                pattern,
            )


# --------------------------------------------------------------------------------------
# Artifact integrity (AG-12): on-disk == builder, byte-stable sha256
# --------------------------------------------------------------------------------------


def test_on_disk_artifact_matches_builder_byte_for_byte(cases_doc, on_disk):
    # builder (the only writer) reproduces the artifact exactly — AG-12
    assert on_disk == serialize_cases(build_cases())
    # and the artifact itself is in canonical form (parse -> dump is a no-op)
    assert on_disk == serialize_cases(cases_doc)
    assert on_disk.endswith(b"\n")


def test_serialization_is_byte_stable_across_two_builds(cases_doc, on_disk):
    first = serialize_cases(build_cases())
    second = serialize_cases(build_cases())
    assert first == second
    assert hashlib.sha256(first).hexdigest() == hashlib.sha256(second).hexdigest()
    assert hashlib.sha256(on_disk).hexdigest() == hashlib.sha256(first).hexdigest()
    # the parsed on-disk doc serializes to the same bytes (stable sha256)
    assert serialize_cases(cases_doc) == on_disk


if __name__ == "__main__":
    payload = regenerate_cases_file()
    print(f"wrote {CASES_PATH.relative_to(REPO_ROOT)} ({len(payload)} bytes)")
    print(f"sha256 {hashlib.sha256(payload).hexdigest()}")
    print("validate: .venv/Scripts/python.exe -m pytest tests/test_cases.py -q")
