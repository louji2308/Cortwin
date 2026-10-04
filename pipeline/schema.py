"""Strict schema gate and leakage assertions (VC-01, C-01, C-02, C-40).

Gate responsibilities:

* the dataset frame has exactly the 54 model feature columns plus the five
  outcome columns (``LAD``, ``LCX``, ``RCA``, ``Cath``, ``Exertional CP``);
* the feature config covers 54 features, partitioned exactly once across the
  five modalities with counts 17/13/7/14/3;
* forbidden input columns (4 leakage + 1 constant) are disjoint from the
  feature set — at pipeline load, export and runtime encode time.

Anything that fails raises :class:`SchemaMismatchError` listing every problem
found (never just the first).
"""

from __future__ import annotations

import pandas as pd

from .config import (
    feature_index,
    forbidden_ids,
    load_features,
    load_forbidden,
    load_targets,
)
from .errors import SchemaMismatchError

OUTCOME_COLUMNS = ("LAD", "LCX", "RCA", "Cath", "Exertional CP")
MODALITY_COUNTS = {"history": 17, "exam": 13, "ecg": 7, "labs": 14, "echo": 3}
EXPECTED_FEATURE_COUNT = 54


def assert_no_leakage(
    features_doc: dict | None = None,
    forbidden_doc: dict | None = None,
) -> None:
    """Forbidden/constant columns MUST NOT appear among model features."""
    feats = feature_index(features_doc) if features_doc is not None else feature_index()
    fdoc = features_doc if features_doc is not None else load_features()
    bdoc = forbidden_doc if forbidden_doc is not None else load_forbidden()

    problems: list[str] = []
    if fdoc.get("featureCount") != EXPECTED_FEATURE_COUNT:
        problems.append(
            f"featureCount is {fdoc.get('featureCount')!r}, expected {EXPECTED_FEATURE_COUNT}"
        )
    if len(feats) != EXPECTED_FEATURE_COUNT:
        problems.append(f"feature list has {len(feats)} entries, expected {EXPECTED_FEATURE_COUNT}")

    forbidden = forbidden_ids(bdoc)
    for fid in forbidden:
        if fid in feats:
            reason = next(
                (e.get("reason") for e in bdoc["forbiddenInputColumns"] + bdoc["constantColumns"]
                 if e["id"] == fid),
                "forbidden",
            )
            problems.append(f"forbidden column {fid!r} ({reason}) is present in model features")

    if problems:
        raise SchemaMismatchError(problems)


def _validate_modality_partition(feats: dict[str, dict], fdoc: dict, problems: list[str]) -> None:
    modality_ids = {m["id"]: m for m in fdoc.get("modalities", [])}
    declared_counts = {m["id"]: m.get("count") for m in fdoc.get("modalities", [])}
    seen: dict[str, int] = {}
    for fid, feat in feats.items():
        mod = feat.get("modality")
        if mod not in modality_ids:
            problems.append(f"feature {fid!r} references unknown modality {mod!r}")
            continue
        seen[mod] = seen.get(mod, 0) + 1
    for mod, expected in MODALITY_COUNTS.items():
        if seen.get(mod, 0) != expected:
            problems.append(f"modality {mod!r} covers {seen.get(mod, 0)} features, expected {expected}")
        if declared_counts.get(mod) != expected:
            problems.append(
                f"modalities entry {mod!r} declares count {declared_counts.get(mod)!r}, expected {expected}"
            )
    unknown_modality_decls = set(declared_counts) - set(MODALITY_COUNTS)
    if unknown_modality_decls:
        problems.append(f"undeclared modalities in config: {sorted(unknown_modality_decls)}")


def validate_dataset(
    df: pd.DataFrame,
    features_doc: dict | None = None,
    forbidden_doc: dict | None = None,
    targets_doc: dict | None = None,
) -> list[str]:
    """Run the full schema gate. Returns ``[]`` or raises :class:`SchemaMismatchError`."""
    fdoc = features_doc if features_doc is not None else load_features()
    bdoc = forbidden_doc if forbidden_doc is not None else load_forbidden()
    tdoc = targets_doc if targets_doc is not None else load_targets()
    problems: list[str] = []

    feats = feature_index(fdoc)
    assert_no_leakage(fdoc, bdoc)

    columns = list(df.columns)
    if len(columns) != len(set(columns)):
        dupes = sorted({c for c in columns if columns.count(c) > 1})
        problems.append(f"duplicate columns: {dupes}")

    expected = set(feats) | set(OUTCOME_COLUMNS)
    actual = set(columns)
    missing_cols = sorted(expected - actual)
    extra_cols = sorted(actual - expected)
    if missing_cols:
        problems.append(f"missing columns: {missing_cols}")
    if extra_cols:
        problems.append(f"unexpected columns: {extra_cols}")

    for target in tdoc["targets"]:
        col = target.get("labelColumn")
        if col not in actual:
            problems.append(f"label column {col!r} for target {target['id']!r} missing from dataset")

    if "Exertional CP" in actual:
        observed = sorted(str(v) for v in df["Exertional CP"].dropna().unique())
        declared = next(
            (e for e in bdoc["constantColumns"] if e["id"] == "Exertional CP"), None
        )
        if declared is None:
            problems.append("Exertional CP missing from forbidden.json constantColumns")
        elif observed != sorted(str(v) for v in declared.get("observedValues", [])):
            problems.append(
                f"Exertional CP observed values {observed} differ from forbidden.json "
                f"{declared.get('observedValues')}"
            )

    if problems:
        raise SchemaMismatchError(problems)

    _validate_modality_partition(feats, fdoc, problems)
    if problems:
        raise SchemaMismatchError(problems)
    return []


def missing_cell_report(df: pd.DataFrame, features_doc: dict | None = None) -> dict[str, int]:
    """Per-feature missing-cell counts (observed; the canonical snapshot is 0)."""
    feats = feature_index(features_doc)
    return {fid: int(df[fid].isna().sum()) for fid in feats if fid in df}
