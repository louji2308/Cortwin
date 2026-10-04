import re
import sys
import tomllib
from pathlib import Path

TECH_STACK_DIRS = (
    "api",
    "assets",
    "config",
    "data",
    "docs",
    "pipeline",
    "tests",
    "tools",
    "web",
)

PROJECT_DOCS = {
    "Architecture.md",
    "Contracts.md",
    "Final_demo.md",
    "Hackathon.md",
    "Idea.md",
    "Implementation_Plan.md",
    "Tech_Stack & Product Requirements.md",
}

PINNED_REQUIREMENTS = ("numpy", "pandas", "scikit-learn", "xgboost", "shap", "pytest")

PIN_LINE = re.compile(r"^[A-Za-z0-9_.-]+==\d+\.\d+\.\*$")


def test_tech_stack_directories_exist(repo_root: Path) -> None:
    missing = [name for name in TECH_STACK_DIRS if not (repo_root / name).is_dir()]
    assert not missing, f"missing Tech_Stack section 17 directories: {missing}"


def test_pyproject_parses_with_pytest_anchor(repo_root: Path) -> None:
    with open(repo_root / "pyproject.toml", "rb") as handle:
        data = tomllib.load(handle)
    pytest_config = data["tool"]["pytest"]["ini_options"]
    assert pytest_config["pythonpath"] == ["."]
    assert pytest_config["testpaths"] == ["tests"]
    markers = pytest_config["markers"]
    assert any(marker.startswith("blocking") for marker in markers)


def test_python_meets_verified_minimum() -> None:
    assert sys.version_info >= (3, 11), (
        f"Python {sys.version_info[0]}.{sys.version_info[1]} is below the minimum "
        "verified by B0-1 (3.11.9); Tech_Stack section 27 pins 3.12 for CI and reproduce"
    )


def test_project_source_docs_untouched(repo_root: Path) -> None:
    found = {path.name for path in (repo_root / "Project").glob("*.md")}
    assert found == PROJECT_DOCS, (
        "Project/ source document set changed; source docs are read-only. "
        f"only-in-repo={sorted(found - PROJECT_DOCS)} only-expected={sorted(PROJECT_DOCS - found)}"
    )


def test_requirements_pins_follow_tech_stack_style(repo_root: Path) -> None:
    lines = [
        line.strip()
        for line in (repo_root / "requirements.txt").read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.startswith("#")
    ]
    by_name = {line.split("==")[0].lower(): line for line in lines if "==" in line}
    for package in PINNED_REQUIREMENTS:
        assert package in by_name, f"requirements.txt lost the {package} pin"
        assert PIN_LINE.match(by_name[package]), (
            f"pin for {package} must use ==<major>.<minor>.* style, got: {by_name[package]}"
        )
