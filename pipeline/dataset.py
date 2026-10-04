"""Dataset acquisition verification and loading (C-01).

The canonical dataset file is ``data/raw/extention-of-z-alizadeh-sani.csv``
(converted losslessly from the UCI xlsx; see ``data/PROVENANCE.md``). Every
load verifies sha256 against ``data/CHECKSUMS.txt`` first — a checksum mismatch
is a loud :class:`DatasetChecksumError`, never a warning.
"""

from __future__ import annotations

import hashlib
from pathlib import Path

import pandas as pd

from .errors import DatasetChecksumError

DATA_DIR = Path(__file__).resolve().parents[1] / "data"
CANONICAL_CSV = "raw/extention-of-z-alizadeh-sani.csv"


def parse_checksums(checksums_path: Path | None = None) -> dict[str, str]:
    """Parse sha256sum-format ``data/CHECKSUMS.txt``: ``<hash>  <relpath>``."""
    path = checksums_path if checksums_path is not None else DATA_DIR / "CHECKSUMS.txt"
    if not path.is_file():
        raise DatasetChecksumError(str(path), None, None, "checksum file not found")
    entries: dict[str, str] = {}
    for lineno, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split("  ", 1)
        if len(parts) != 2 or len(parts[0]) != 64:
            raise DatasetChecksumError(
                str(path), None, None, f"malformed entry at line {lineno}"
            )
        digest, relpath = parts
        entries[relpath] = digest.lower()
    if not entries:
        raise DatasetChecksumError(str(path), None, None, "checksum file is empty")
    return entries


def sha256_of(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def verify_checksums(data_dir: Path | None = None) -> dict[str, str]:
    """Verify every entry in CHECKSUMS.txt. Raises on the first mismatch/absence."""
    root = data_dir if data_dir is not None else DATA_DIR
    entries = parse_checksums(root / "CHECKSUMS.txt")
    for relpath, expected in entries.items():
        target = root / relpath
        if not target.is_file():
            raise DatasetChecksumError(relpath, expected, None, "file missing")
        observed = sha256_of(target)
        if observed != expected:
            raise DatasetChecksumError(relpath, expected, observed, "sha256 mismatch")
    return entries


def load_dataset(
    data_dir: Path | None = None,
    *,
    verify: bool = True,
    csv_relpath: str = CANONICAL_CSV,
) -> pd.DataFrame:
    """Load the checksum-verified canonical CSV as a DataFrame."""
    root = data_dir if data_dir is not None else DATA_DIR
    if verify:
        entries = verify_checksums(root)
        if csv_relpath not in entries:
            raise DatasetChecksumError(csv_relpath, None, None, "not listed in CHECKSUMS.txt")
    csv_path = root / csv_relpath
    if not csv_path.is_file():
        raise DatasetChecksumError(csv_relpath, None, None, "file missing")
    return pd.read_csv(csv_path)
