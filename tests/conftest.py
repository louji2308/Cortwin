"""Shared pytest fixtures for CorTwin.

Seed created by the orchestrator so Batch 0 agents have a stable anchor.
Ownership: B0-1 may extend; B0-2/B0-3/B0-4 must not edit (add fixtures via their own test modules).
"""

from pathlib import Path

import pytest


@pytest.fixture(scope="session")
def repo_root() -> Path:
    return Path(__file__).resolve().parents[1]
