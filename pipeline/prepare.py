"""Dataset preparation: encoded matrices, labels and the joint stratification label.

Produces the single input structure for the validation protocol (P2 step 1):

* ``X`` — 303 x 54 float64 matrix in registry feature order, built through the
  strict :mod:`pipeline.encode` path after the VC-01 schema gate;
* ``labels`` — one 0/1 vector per target (CAD, LAD, LCX, RCA) from the frozen
  ``config/targets.json`` label columns;
* ``joint`` — the 8-pattern LAD/LCX/RCA stratification code (0..7), an
  *outcome* label used only for fold stratification (INV-C07: never a feature);
* subgroup masks for the reported demographic evidence.

The verified positive-class anchors and the cohort size are asserted at build
time so dataset drift fails loudly instead of shifting every metric.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from .config import (
    feature_index,
    feature_list,
    load_features,
    load_registry,
    load_targets,
)
from .dataset import load_dataset
from .encode import encode_value
from .errors import SchemaMismatchError
from .schema import validate_dataset

POSITIVE_ANCHORS = {"CAD": 216, "LAD": 177, "LCX": 119, "RCA": 114}
EXPECTED_PATIENT_COUNT = 303
FORBIDDEN_FEATURE_IDS = ("LAD", "LCX", "RCA", "Cath", "Exertional CP")
SUBGROUP_IDS = ("age_lt60", "age_ge60", "female", "male")
AGE_SPLIT = 60.0


@dataclass(frozen=True)
class PreparedDataset:
    """Encoded matrices and labels for the frozen validation protocol."""

    X: np.ndarray
    labels: dict[str, np.ndarray]
    joint: np.ndarray
    feature_order: list[str]
    modality_by_feature: dict[str, str]
    subgroup_masks: dict[str, np.ndarray]

    @property
    def n_patients(self) -> int:
        return int(self.X.shape[0])

    @property
    def n_features(self) -> int:
        return int(self.X.shape[1])


def joint_pattern_name(code: int) -> str:
    """Bit order LAD, LCX, RCA — e.g. 5 -> '101'."""
    if not 0 <= int(code) <= 7:
        raise SchemaMismatchError([f"joint pattern code {code!r} outside 0..7"])
    return format(int(code), "03b")


def _feature_order(features_doc: dict) -> list[str]:
    registry = load_registry()
    order = [entry["id"] for entry in registry["features"]]
    config_order = [entry["id"] for entry in feature_list(features_doc)]
    if order != config_order:
        raise SchemaMismatchError(
            ["registry.json feature order differs from features.json feature order"]
        )
    forbidden = [fid for fid in FORBIDDEN_FEATURE_IDS if fid in set(order)]
    if forbidden:
        raise SchemaMismatchError([f"forbidden column in feature order: {forbidden}"])
    if len(order) != len(set(order)):
        raise SchemaMismatchError(["duplicate feature ids in registry order"])
    return order


def _encoded_matrix(df: pd.DataFrame, order: list[str]) -> np.ndarray:
    index = feature_index()
    matrix = np.empty((len(df), len(order)), dtype=np.float64)
    for column, feature_id in enumerate(order):
        feature = index[feature_id]
        values = df[feature_id].to_numpy()
        matrix[:, column] = [encode_value(feature, raw) for raw in values]
    if not np.all(np.isfinite(matrix)):
        raise SchemaMismatchError(["encoded matrix contains non-finite values"])
    return matrix


def _target_labels(df: pd.DataFrame, order: list[str]) -> dict[str, np.ndarray]:
    targets_doc = load_targets()
    labels: dict[str, np.ndarray] = {}
    problems: list[str] = []
    for target in targets_doc["targets"]:
        target_id = target["id"]
        column = target["labelColumn"]
        positive = target["labelValues"]["positive"]
        negative = target["labelValues"]["negative"]
        if column in order:
            problems.append(f"label column {column!r} is a model feature")
            continue
        observed = {str(value) for value in df[column].dropna().unique()}
        if observed != {positive, negative}:
            problems.append(
                f"label column {column!r} holds {observed}, expected {[positive, negative]}"
            )
            continue
        vector = (df[column] == positive).astype(np.int64).to_numpy()
        anchors = POSITIVE_ANCHORS.get(target_id)
        if anchors is not None and int(vector.sum()) != anchors:
            problems.append(
                f"target {target_id} has {int(vector.sum())} positives, expected {anchors}"
            )
        labels[target_id] = vector
    if problems:
        raise SchemaMismatchError(problems)
    return labels


def _joint_label(labels: dict[str, np.ndarray]) -> np.ndarray:
    missing = [tid for tid in ("LAD", "LCX", "RCA") if tid not in labels]
    if missing:
        raise SchemaMismatchError([f"joint label needs vessel targets, missing {missing}"])
    joint = (
        labels["LAD"] * 4 + labels["LCX"] * 2 + labels["RCA"] * 1
    ).astype(np.int64)
    return joint


def _subgroup_masks(X: np.ndarray, order: list[str]) -> dict[str, np.ndarray]:
    position = {feature_id: i for i, feature_id in enumerate(order)}
    if "Age" not in position or "Sex" not in position:
        raise SchemaMismatchError(["subgroup masks need the Age and Sex features"])
    age = X[:, position["Age"]]
    sex = X[:, position["Sex"]]
    masks = {
        "age_lt60": age < AGE_SPLIT,
        "age_ge60": age >= AGE_SPLIT,
        "female": sex == 0.0,
        "male": sex == 1.0,
    }
    problems = [
        f"subgroup {gid!r} is empty" for gid in SUBGROUP_IDS if not bool(masks[gid].any())
    ]
    if problems:
        raise SchemaMismatchError(problems)
    return masks


def prepare_dataset() -> PreparedDataset:
    """Checksum-verify, schema-gate, encode and label the canonical dataset."""
    df = load_dataset()
    validate_dataset(df)
    features_doc = load_features()
    order = _feature_order(features_doc)
    if len(df) != EXPECTED_PATIENT_COUNT:
        raise SchemaMismatchError(
            [f"dataset has {len(df)} rows, expected {EXPECTED_PATIENT_COUNT}"]
        )
    X = _encoded_matrix(df, order)
    labels = _target_labels(df, order)
    for target_id, expected in POSITIVE_ANCHORS.items():
        if target_id not in labels:
            raise SchemaMismatchError([f"missing target labels for {target_id}"])
        if int(labels[target_id].sum()) != expected:
            raise SchemaMismatchError([f"target {target_id} positive anchor moved"])
    joint = _joint_label(labels)
    index = feature_index()
    modality_by_feature = {fid: index[fid]["modality"] for fid in order}
    masks = _subgroup_masks(X, order)
    return PreparedDataset(
        X=X,
        labels=labels,
        joint=joint,
        feature_order=order,
        modality_by_feature=modality_by_feature,
        subgroup_masks=masks,
    )
