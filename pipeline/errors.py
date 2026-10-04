"""Typed errors for the CorTwin pipeline (AG-06: typed errors at every boundary).

Every error that crosses a module boundary is one of these classes. There are
no bare ``except:`` clauses and no silent catches anywhere in ``pipeline/``.

Privacy note: error *messages* never embed raw feature values, because these
objects may be stringified into worker protocol errors (C-07 forbids patient
values in error messages). Offending values are deliberately not carried on the
exception at all.
"""

from __future__ import annotations


class PipelineError(Exception):
    """Base class for every pipeline error."""


class DatasetChecksumError(PipelineError):
    """A data file's sha256 does not match ``data/CHECKSUMS.txt`` (or is missing)."""

    def __init__(self, relpath: str, expected: str | None, observed: str | None, detail: str):
        self.relpath = relpath
        self.expected = expected
        self.observed = observed
        self.detail = detail
        super().__init__(
            f"checksum failure for {relpath}: {detail}"
            + (f" (expected {expected}, observed {observed})" if expected and observed else "")
        )


class SchemaMismatchError(PipelineError):
    """The dataset frame or a config document violates the strict schema gate."""

    def __init__(self, problems: list[str]):
        self.problems = list(problems)
        super().__init__("schema gate failed: " + "; ".join(self.problems))


class ConfigError(PipelineError):
    """A config JSON is missing, unparseable, or structurally invalid."""


class EncodingError(PipelineError):
    """A feature value is outside the domain defined by C-02 section 11.3."""

    def __init__(self, feature_id: str, reason: str):
        self.feature_id = feature_id
        self.reason = reason
        super().__init__(f"feature {feature_id!r}: {reason}")


class ForbiddenInputError(PipelineError):
    """A forbidden column (LAD/LCX/RCA/Cath or a constant) appeared as an input."""

    def __init__(self, column_id: str, reason: str):
        self.column_id = column_id
        self.reason = reason
        super().__init__(f"forbidden input {column_id!r}: {reason}")
