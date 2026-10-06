"""Fetch or verify the UCI Extension of Z-Alizadeh Sani dataset (owner: B0-2).

`make data` runs this module. The three checksummed files in ``data/raw/``
are committed in-repo (CC BY 4.0 — see ``data/PROVENANCE.md``) so a fresh
clone and CI can run the blocking pytest chain without network access.
When the files are already present this module verifies them against
``data/CHECKSUMS.txt`` and exits 0. When any file is missing it downloads
the UCI zip, extracts the xlsx, converts the CSV, then verifies every
checksum. Any mismatch or unreachable source is a loud failure, never a
silent skip (AG-04 / CI rule: a missing dataset fails loudly).
"""

from __future__ import annotations

import hashlib
import urllib.request
import zipfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = REPO_ROOT / "data"
RAW_DIR = DATA_DIR / "raw"

ZIP_NAME = "extention-of-z-alizadeh-sani-uci411.zip"
XLSX_NAME = "extention of Z-Alizadeh sani dataset.xlsx"
CSV_NAME = "extention-of-z-alizadeh-sani.csv"

UCI_URL = (
    "https://archive.ics.uci.edu/static/public/411/"
    "extention+of+z+alizadeh+sani+dataset.zip"
)


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _parse_checksums(path: Path) -> dict[str, str]:
    if not path.is_file():
        raise SystemExit(f"fetch_data: checksum file not found: {path}")
    entries: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        digest, relpath = line.split("  ", 1)
        entries[relpath] = digest.lower()
    return entries


def _convert_csv() -> None:
    try:
        import pandas as pd
    except ImportError as exc:
        raise SystemExit(
            "fetch_data: pandas required for CSV conversion — "
            "pip install -r requirements.lock.txt"
        ) from exc
    try:
        frame = pd.read_excel(RAW_DIR / XLSX_NAME)
    except ImportError as exc:
        raise SystemExit(
            "fetch_data: openpyxl required to read the UCI xlsx — "
            "pip install openpyxl (only needed on the download path)"
        ) from exc
    frame.to_csv(RAW_DIR / CSV_NAME, index=False)


def verify_or_fetch() -> None:
    checksums = _parse_checksums(DATA_DIR / "CHECKSUMS.txt")
    required = {
        f"raw/{ZIP_NAME}": RAW_DIR / ZIP_NAME,
        f"raw/{XLSX_NAME}": RAW_DIR / XLSX_NAME,
        f"raw/{CSV_NAME}": RAW_DIR / CSV_NAME,
    }
    missing = [rel for rel, path in required.items() if not path.is_file()]
    if missing:
        print(f"fetch_data: missing {len(missing)} file(s): {missing}")
        print(f"fetch_data: downloading UCI zip from {UCI_URL}")
        RAW_DIR.mkdir(parents=True, exist_ok=True)
        zip_path = RAW_DIR / ZIP_NAME
        urllib.request.urlretrieve(UCI_URL, zip_path)
        with zipfile.ZipFile(zip_path) as archive:
            xlsx_member = next(
                (name for name in archive.namelist() if name.lower().endswith(".xlsx")),
                None,
            )
            if xlsx_member is None:
                raise SystemExit("fetch_data: no .xlsx member inside the UCI zip")
            (RAW_DIR / XLSX_NAME).write_bytes(archive.read(xlsx_member))
        _convert_csv()
        print("fetch_data: download + CSV conversion done; verifying checksums")
    for rel, path in required.items():
        expected = checksums[rel]
        observed = _sha256(path)
        if observed != expected:
            raise SystemExit(
                f"fetch_data: sha256 MISMATCH for {rel}\n"
                f"  expected {expected}\n"
                f"  observed {observed}\n"
                "  The committed file is authoritative; restore it with "
                "`git checkout -- \"data/raw\"` or re-download from UCI and "
                "re-verify against data/CHECKSUMS.txt."
            )
        print(f"fetch_data: OK {rel} sha256={observed[:16]}…")


if __name__ == "__main__":
    verify_or_fetch()
