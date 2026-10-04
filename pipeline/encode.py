"""Strict feature encoding per C-02 section 11.3 and C-40.

Domain rules (all raise :class:`EncodingError`, never a bare ValueError):

* unknown categorical level (case-sensitive source spellings preserved);
* non-numeric continuous value;
* non-finite value (NaN/Infinity never cross a committed boundary);
* malformed ordinal value;
* discrete value outside its allowed set (binary/map/ordinal domains);
* observed feature with no value.

Continuous cohort-range violations are **not** errors: per Contracts 39.5/40.2
and 79 an out-of-range value stays valid for inference and is reported by
:func:`range_flag` as an informational flag only. ``enforce_range=True`` exists
for strict non-inference validation surfaces (form guard / dataset ingest) and
must never be used on the inference path.

Missingness (INV-C08/C09): ``provided=false`` encodes to ``None`` — the
feature does not participate in evaluation. It is never given a fabricated
measured value; ``decode_value`` reports it as ``"not provided"`` (C-13
approved copy).
"""

from __future__ import annotations

import math
from typing import Any

from .config import feature_index, forbidden_ids, load_forbidden
from .errors import EncodingError, ForbiddenInputError

MISSING_MARKER = "not provided"


def _as_finite_float(feature_id: str, raw: Any, reason_non_numeric: str) -> float:
    if raw is None:
        raise EncodingError(feature_id, "provided feature has no value")
    if isinstance(raw, bool):
        return float(raw)
    try:
        value = float(raw)
    except (TypeError, ValueError) as exc:
        raise EncodingError(feature_id, reason_non_numeric) from exc
    if not math.isfinite(value):
        raise EncodingError(feature_id, "non-finite value")
    return value


def encode_value(feature: dict, raw: Any, *, enforce_range: bool = False) -> float:
    """Encode one source-space value to its model-space float.

    Raises :class:`EncodingError` for every domain violation listed above.
    """
    fid = feature["id"]
    enc = feature.get("encoding") or {}
    etype = enc.get("type")

    if etype == "identity":
        value = _as_finite_float(fid, raw, "non-numeric continuous value")
        allowed = feature.get("allowedValues")
        if allowed is not None and value not in allowed:
            raise EncodingError(fid, "discrete value out of range")
        if enforce_range and feature.get("type") == "continuous" and _outside_range(feature, value):
            raise EncodingError(fid, "value outside cohort range")
        return value

    if etype == "map":
        table = enc.get("map")
        if not isinstance(table, dict) or not table:
            raise EncodingError(fid, "unsupported encoding type")
        try:
            encoded = table[raw]
        except (KeyError, TypeError) as exc:
            raise EncodingError(fid, "unknown categorical level") from exc
        return float(encoded)

    if etype == "ordinal":
        levels = enc.get("levels")
        if not isinstance(levels, list) or not levels:
            raise EncodingError(fid, "unsupported encoding type")
        if raw is None:
            raise EncodingError(fid, "provided feature has no value")
        for index, level in enumerate(levels):
            if raw == level:
                return float(index)
        raise EncodingError(fid, "malformed ordinal value")

    raise EncodingError(fid, "unsupported encoding type")


def _outside_range(feature: dict, value: float) -> bool:
    rng = feature.get("range")
    if not isinstance(rng, dict):
        return False
    return value < float(rng["min"]) or value > float(rng["max"])


def range_flag(feature: dict, value: float) -> bool:
    """Contracts 79: informational 'outside training range' for continuous fields.

    Never modifies the value, probability, attribution or decision. Returns
    ``False`` for non-continuous features; raises on non-finite input.
    """
    fid = feature["id"]
    if feature.get("type") != "continuous":
        return False
    numeric = _as_finite_float(fid, value, "non-numeric continuous value")
    return _outside_range(feature, numeric)


def decode_value(feature: dict, encoded: float | None) -> Any:
    """Inverse of :func:`encode_value`. ``None`` decodes to ``"not provided"``."""
    fid = feature["id"]
    if encoded is None:
        return MISSING_MARKER
    enc = feature.get("encoding") or {}
    etype = enc.get("type")

    if etype == "identity":
        return _as_finite_float(fid, encoded, "non-numeric continuous value")

    if etype == "map":
        table = enc.get("map") or {}
        for source, model in table.items():
            if float(model) == float(encoded):
                return source
        raise EncodingError(fid, "encoded value not in map domain")

    if etype == "ordinal":
        levels = enc.get("levels") or []
        numeric = _as_finite_float(fid, encoded, "non-numeric continuous value")
        index = int(numeric)
        if numeric != index or not 0 <= index < len(levels):
            raise EncodingError(fid, "malformed ordinal value")
        return levels[index]

    raise EncodingError(fid, "unsupported encoding type")


def encode_case(
    values: dict[str, Any],
    *,
    provided: dict[str, bool] | None = None,
    features_doc: dict | None = None,
    forbidden_doc: dict | None = None,
    enforce_range: bool = False,
) -> dict[str, float | None]:
    """Encode a whole case into the registry-ordered feature vector.

    ``provided`` defaults to every feature observed; ``provided[fid] = False``
    marks a feature as *not provided* — it encodes to ``None`` and is never
    given a fabricated value. Observed features must have a value.

    Raises :class:`ForbiddenInputError` if any forbidden column id appears in
    ``values`` (leakage guard at the runtime boundary), and
    :class:`EncodingError` for unknown feature ids or domain violations.
    """
    feats = feature_index(features_doc)
    bdoc = forbidden_doc if forbidden_doc is not None else load_forbidden()

    for key in values:
        if key in forbidden_ids(bdoc):
            raise ForbiddenInputError(key, "target leakage or constant column")

    encoded: dict[str, float | None] = {}
    for fid, feat in feats.items():
        observed = True if provided is None else bool(provided.get(fid, True))
        if not observed:
            encoded[fid] = None
            continue
        if fid not in values:
            raise EncodingError(fid, "observed feature missing from case values")
        encoded[fid] = encode_value(feat, values[fid], enforce_range=enforce_range)

    unknown = [k for k in values if k not in feats]
    if unknown:
        raise EncodingError(min(unknown), "unknown feature id")

    return encoded
