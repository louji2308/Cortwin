"""Loading and minimal structural validation for ``config/*.json``.

The JSON files are the single source of truth for feature identity, encoding,
modality grouping, targets and registry correspondence (C-01/C-02). Nothing in
``pipeline/`` hard-codes a feature list; it is always read from here.

Files are read fresh on every call (no caching) so a test that rewrites a
config on disk is always observed by the next load.
"""

from __future__ import annotations

import json
from pathlib import Path

from .errors import ConfigError

CONFIG_DIR = Path(__file__).resolve().parents[1] / "config"

_FEATURE_KEYS = {
    "id", "label", "modality", "type", "encoding", "allowedValues", "range",
    "unit", "unitStatus", "missing", "derived", "displayGroup",
}
_TARGET_KEYS = {
    "id", "label", "kind", "modelKey", "structureId", "labelDefinition",
    "labelColumn", "labelValues",
}


def load_config(name: str) -> dict:
    """Load ``config/<name>.json`` (with or without the ``.json`` suffix)."""
    stem = name.removesuffix(".json")
    path = CONFIG_DIR / f"{stem}.json"
    if not path.is_file():
        raise ConfigError(f"config file not found: {path}")
    try:
        doc = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError) as exc:
        raise ConfigError(f"cannot read {path.name}: {exc}") from exc
    except json.JSONDecodeError as exc:
        raise ConfigError(f"{path.name} is not valid JSON: {exc}") from exc
    if not isinstance(doc, dict):
        raise ConfigError(f"{path.name} must contain a JSON object")
    return doc


def load_features() -> dict:
    doc = load_config("features")
    for key in ("schemaVersion", "featureCount", "modalities", "features", "missingSemantics"):
        if key not in doc:
            raise ConfigError(f"features.json missing required key {key!r}")
    return doc


def load_targets() -> dict:
    doc = load_config("targets")
    for key in ("schemaVersion", "targets"):
        if key not in doc:
            raise ConfigError(f"targets.json missing required key {key!r}")
    return doc


def load_forbidden() -> dict:
    doc = load_config("forbidden")
    for key in ("schemaVersion", "forbiddenInputColumns", "constantColumns"):
        if key not in doc:
            raise ConfigError(f"forbidden.json missing required key {key!r}")
    return doc


def load_registry() -> dict:
    """Load the registry and verify the exact C-02 top-level key set."""
    doc = load_config("registry")
    expected = {
        "schemaVersion", "modalities", "features", "targets", "structures",
        "displayGroups", "stages", "forbiddenInputColumns",
    }
    actual = set(doc)
    if actual != expected:
        raise ConfigError(
            "registry.json top-level keys differ from C-02: "
            f"missing={sorted(expected - actual)}, extra={sorted(actual - expected)}"
        )
    return doc


def feature_list(features_doc: dict | None = None) -> list[dict]:
    """The 54 feature entries, in registry-authoritative order (C-01 39.4)."""
    doc = features_doc if features_doc is not None else load_features()
    feats = doc.get("features")
    if not isinstance(feats, list):
        raise ConfigError("features.json: 'features' must be a list")
    return feats


def feature_index(features_doc: dict | None = None) -> dict[str, dict]:
    """Feature id -> feature entry, order preserved, duplicate ids rejected."""
    index: dict[str, dict] = {}
    for feat in feature_list(features_doc):
        if not isinstance(feat, dict) or "id" not in feat:
            raise ConfigError("every feature entry must be an object with an 'id'")
        fid = feat["id"]
        if fid in index:
            raise ConfigError(f"duplicate feature id {fid!r}")
        missing = _FEATURE_KEYS - set(feat)
        if missing:
            raise ConfigError(f"feature {fid!r} missing keys {sorted(missing)}")
        index[fid] = feat
    return index


def forbidden_ids(forbidden_doc: dict | None = None) -> list[str]:
    """Forbidden input column ids: 4 leakage columns + the constant column."""
    doc = forbidden_doc if forbidden_doc is not None else load_forbidden()
    ids: list[str] = []
    for entry in doc["forbiddenInputColumns"] + doc["constantColumns"]:
        ids.append(entry["id"])
    return ids


def target_ids(targets_doc: dict | None = None) -> list[str]:
    doc = targets_doc if targets_doc is not None else load_targets()
    for target in doc["targets"]:
        missing = _TARGET_KEYS - set(target)
        if missing:
            raise ConfigError(f"target {target.get('id')!r} missing keys {sorted(missing)}")
    return [t["id"] for t in doc["targets"]]
