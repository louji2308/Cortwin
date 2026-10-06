"""Build-blocking import-boundary tests for the quarantined leakage lab.

Contract: C-04 "Leakage lab quarantine" (Project/Contracts.md §12) — the probe
model MUST NOT be imported by the production training path; a dedicated
import-boundary test blocks the build on failure. Supporting rules: INV-C07,
VC-02, Architecture §5.4, AGENTS.md §7.

Four blocking properties:

1. **static** — no production ``pipeline/*.py`` (except ``leakage_lab.py``
   itself and ``reproduce.py``, the single sanctioned consumer) contains a
   reference to ``leakage_lab``;
2. **lazy import** — ``import pipeline.reproduce`` leaves ``pipeline.leakage_lab``
   out of ``sys.modules`` (its import is function-local);
3. **no side effects** — importing every existing production module never
   loads ``pipeline.leakage_lab``;
4. **I/O quarantine** — ``leakage_lab.py`` contains no file I/O calls
   (AST call scan) and imports no I/O-capable modules.

Dynamic checks run both in-process (literal behaviour) and in a fresh
interpreter (authoritative, immune to test ordering): ``pytest`` imports every
test module during collection, so this file must not rely on this interpreter
being the only user of ``sys.modules``.
"""

from __future__ import annotations

import ast
import importlib
import subprocess
import sys
from pathlib import Path

import pytest

pytestmark = pytest.mark.blocking

REPO_ROOT = Path(__file__).resolve().parents[1]
PIPELINE_DIR = REPO_ROOT / "pipeline"
LAB_MODULE = "pipeline.leakage_lab"
EXEMPT_SOURCES = {"leakage_lab.py", "reproduce.py"}
IO_CALL_NAMES = {
    "open",
    "write_text",
    "write_bytes",
    "writelines",
    "read_text",
    "read_bytes",
    "dump",
    "load",
    "save",
    "savez",
    "savetxt",
    "to_csv",
    "to_excel",
    "to_pickle",
    "to_hdf",
    "read_csv",
    "read_excel",
    "read_pickle",
    "mkdir",
    "makedirs",
    "remove",
    "unlink",
    "touch",
    "rename",
}
IO_MODULE_ROOTS = {"os", "pathlib", "json", "subprocess", "shutil", "joblib", "pickle"}


def _production_stems() -> list[str]:
    """Existing ``pipeline/*.py`` modules minus the lab itself and ``__init__``."""
    return sorted(
        path.stem
        for path in PIPELINE_DIR.glob("*.py")
        if path.stem not in {"__init__", "leakage_lab"}
    )


def _fresh_interpreter(script: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, "-c", script],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        timeout=600,
        check=False,
    )


def test_no_production_module_references_the_lab() -> None:
    violations: list[str] = []
    for path in sorted(PIPELINE_DIR.glob("*.py")):
        if path.name in EXEMPT_SOURCES:
            continue
        text = path.read_text(encoding="utf-8")
        for lineno, line in enumerate(text.splitlines(), start=1):
            if "leakage_lab" in line:
                violations.append(f"{path.name}:{lineno}: {line.strip()}")
    assert not violations, (
        "production modules must never reference leakage_lab (C-04 quarantine) -> "
        + "; ".join(violations)
    )


def test_reproduce_import_is_function_local() -> None:
    if LAB_MODULE not in sys.modules:
        importlib.import_module("pipeline.reproduce")
        assert LAB_MODULE not in sys.modules, (
            "importing pipeline.reproduce loaded pipeline.leakage_lab "
            "(import must be function-local)"
        )
    process = _fresh_interpreter(
        "import sys\n"
        "import pipeline.reproduce\n"
        "assert 'pipeline.leakage_lab' not in sys.modules, "
        "'fresh interpreter: reproduce loaded the lab'\n"
        "print('lazy-ok')\n"
    )
    assert process.returncode == 0, f"stdout:\n{process.stdout}\nstderr:\n{process.stderr}"
    assert "lazy-ok" in process.stdout


def test_no_production_module_side_imports_the_lab() -> None:
    interpreter_was_clean = LAB_MODULE not in sys.modules
    for stem in _production_stems():
        importlib.import_module(f"pipeline.{stem}")
    if interpreter_was_clean:
        assert LAB_MODULE not in sys.modules, (
            "a production module loaded pipeline.leakage_lab as a side effect"
        )
    process = _fresh_interpreter(
        "import importlib\n"
        "import pathlib\n"
        "import sys\n"
        "stems = sorted(\n"
        "    p.stem for p in pathlib.Path('pipeline').glob('*.py')\n"
        "    if p.stem not in ('__init__', 'leakage_lab')\n"
        ")\n"
        "for stem in stems:\n"
        "    importlib.import_module('pipeline.' + stem)\n"
        "assert 'pipeline.leakage_lab' not in sys.modules, "
        "'fresh interpreter: side-imported while loading ' + ','.join(stems)\n"
        "print('side-effect-free:' + ','.join(stems))\n"
    )
    assert process.returncode == 0, f"stdout:\n{process.stdout}\nstderr:\n{process.stderr}"
    assert "side-effect-free:" in process.stdout


def test_leakage_lab_performs_no_file_io() -> None:
    source_path = PIPELINE_DIR / "leakage_lab.py"
    assert source_path.is_file(), "pipeline/leakage_lab.py is missing"
    source = source_path.read_text(encoding="utf-8")
    tree = ast.parse(source, filename=str(source_path))

    offenders: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            func = node.func
            if isinstance(func, ast.Name):
                name = func.id
            elif isinstance(func, ast.Attribute):
                name = func.attr
            else:
                name = None
            if name in IO_CALL_NAMES:
                offenders.append(f"line {node.lineno}: call to {name}()")
        elif isinstance(node, ast.Import):
            for alias in node.names:
                if alias.name.split(".")[0] in IO_MODULE_ROOTS:
                    offenders.append(f"line {node.lineno}: import {alias.name}")
        elif isinstance(node, ast.ImportFrom):
            root = (node.module or "").split(".")[0]
            if root in IO_MODULE_ROOTS:
                offenders.append(f"line {node.lineno}: from {node.module} import ...")
    assert not offenders, (
        "leakage_lab.py must be pure in-memory (no file I/O of any kind) -> "
        + "; ".join(offenders)
    )
