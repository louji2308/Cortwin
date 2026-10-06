"""C-01 manifest tests (Contracts §5.1).

Covers the builder/validator ``pipeline/manifest.py`` end to end against temp
bundles assembled from the real artifacts:

* staging copies each artifact source byte-identically (and leaves
  directly-published targets alone);
* inventory mode reports pending artifacts in contract order and writes
  **no** manifest while the bundle is incomplete;
* strict mode (``--require-all``) raises a typed error listing *every*
  missing artifact at once;
* a complete bundle produces a manifest with exactly the C-01 top-level
  shape, artifact entries ``{path, sha256, sizeBytes}``, a bundleId that is
  a pure function of the digests, provenance cross-checked against
  ``data/CHECKSUMS.txt``/``results.json``/``web/package.json``/git, and the
  BodyParts3D attribution parsed from ``assets/ATTRIBUTION.md`` with its
  recorded mesh digest;
* tampering with either the bundle or the manifest is detected loudly;
* the file written for a complete bundle validates and is deterministic.

All numbers and digests are recomputed from bytes on disk — nothing is typed.
"""

from __future__ import annotations

import json
import re
import shutil
from pathlib import Path
from types import SimpleNamespace

import pytest

from pipeline import manifest as manifest_module
from pipeline.dataset import CANONICAL_CSV, parse_checksums

pytestmark = pytest.mark.blocking

TOP_LEVEL_KEYS = (
    "schemaVersion",
    "appVersion",
    "bundleId",
    "modelId",
    "artifacts",
    "provenance",
    "attributions",
)
ARTIFACT_KEYS = ("registry", "model", "structures", "cases", "results", "fixtures")
STAGED_KEYS = ("registry", "model", "structures", "results")
HEX64 = re.compile(r"^[0-9a-f]{64}$")
GIT_REVISION = re.compile(r"^(unknown|[0-9a-f]{40}(\+dirty)?)$")


@pytest.fixture
def staged(tmp_path) -> SimpleNamespace:
    """Temp bundle containing the four artifact sources that exist today."""
    copied = manifest_module.stage_artifacts(tmp_path)
    return SimpleNamespace(dir=tmp_path, copied=copied)


@pytest.fixture
def complete(staged) -> SimpleNamespace:
    """Staged bundle plus the two directly-published artifacts."""
    shutil.copyfile(
        manifest_module.PUBLIC_DIR / "cases.json", staged.dir / "cases.json"
    )
    (staged.dir / "fixtures").mkdir(exist_ok=True)
    (staged.dir / "fixtures" / "golden.json").write_text(
        '{"schemaVersion":"1.0.0"}', encoding="utf-8"
    )
    entries, pending = manifest_module.collect_artifacts(staged.dir)
    assert pending == []
    staged.entries = entries
    staged.document = manifest_module.build_manifest(entries, staged.dir)
    return staged


def _rehash(path: Path) -> str:
    return manifest_module.sha256_of(path)


def test_stage_copies_sources_byte_identically(staged):
    for spec in manifest_module.SPECS:
        target = staged.dir / spec.target
        if spec.source is None:
            assert not target.exists(), (
                f"{spec.key} must not be staged - it is published directly"
            )
            assert staged.copied[spec.key] is False
            continue
        source = manifest_module.REPO_ROOT / spec.source
        assert source.is_file(), f"artifact source missing: {spec.source}"
        assert target.is_file()
        assert _rehash(target) == _rehash(source)
        assert target.stat().st_size == source.stat().st_size
        assert staged.copied[spec.key] is True


def test_stage_is_idempotent(staged):
    first = {
        spec.key: _rehash(staged.dir / spec.target)
        for spec in manifest_module.SPECS
        if spec.source is not None
    }
    manifest_module.stage_artifacts(staged.dir)
    second = {
        spec.key: _rehash(staged.dir / spec.target)
        for spec in manifest_module.SPECS
        if spec.source is not None
    }
    assert first == second


def test_collect_reports_pending_in_contract_order(staged):
    entries, pending = manifest_module.collect_artifacts(staged.dir)
    assert tuple(entries) == STAGED_KEYS
    assert pending == ["cases", "fixtures"]
    target_by_key = {spec.key: spec.target for spec in manifest_module.SPECS}
    for key, entry in entries.items():
        assert tuple(entry) == ("path", "sha256", "sizeBytes")
        assert HEX64.match(entry["sha256"])
        assert entry["sizeBytes"] > 0
        assert entry["path"] == target_by_key[key]


def test_build_requires_every_artifact(staged):
    entries, _ = manifest_module.collect_artifacts(staged.dir)
    with pytest.raises(manifest_module.MissingArtifactsError) as excinfo:
        manifest_module.build_manifest(entries, staged.dir)
    assert excinfo.value.missing == ["cases", "fixtures"]
    assert isinstance(excinfo.value, manifest_module.ManifestError)
    message = str(excinfo.value)
    assert "cases" in message and "fixtures" in message


def test_missing_artifacts_error_lists_every_gap():
    error = manifest_module.MissingArtifactsError(["results", "fixtures"])
    assert error.missing == ["results", "fixtures"]
    assert "results" in str(error) and "fixtures" in str(error)
    assert isinstance(error, manifest_module.ManifestError)


def test_inventory_mode_writes_no_manifest(
    staged, monkeypatch, capsys
):
    monkeypatch.setattr(manifest_module, "PUBLIC_DIR", staged.dir)
    monkeypatch.setattr(manifest_module, "MANIFEST_PATH", staged.dir / "manifest.json")
    return_code = manifest_module.main([])
    output = capsys.readouterr().out
    assert return_code == 0
    assert "PENDING cases" in output
    assert "PENDING fixtures" in output
    assert "manifest NOT written" in output
    assert not (staged.dir / "manifest.json").exists()


def test_strict_mode_raises_listing_every_missing(monkeypatch, tmp_path, capsys):
    manifest_module.stage_artifacts(tmp_path)
    (tmp_path / "models" / "heart.glb").unlink()
    (tmp_path / "results.json").unlink()
    monkeypatch.setattr(manifest_module, "PUBLIC_DIR", tmp_path)
    monkeypatch.setattr(manifest_module, "MANIFEST_PATH", tmp_path / "manifest.json")
    with pytest.raises(manifest_module.MissingArtifactsError) as excinfo:
        manifest_module.main(["--require-all"])
    assert excinfo.value.missing == ["structures", "cases", "results", "fixtures"]
    assert "PENDING structures" in capsys.readouterr().out
    assert not (tmp_path / "manifest.json").exists()


def test_complete_bundle_manifest_shape(complete):
    document = complete.document
    assert tuple(document) == TOP_LEVEL_KEYS
    assert document["schemaVersion"] == "1.0.0"
    assert tuple(document["artifacts"]) == ARTIFACT_KEYS

    for spec in manifest_module.SPECS:
        entry = document["artifacts"][spec.key]
        assert tuple(entry) == ("path", "sha256", "sizeBytes")
        assert entry["path"] == spec.target
        target = complete.dir / spec.target
        assert entry["sha256"] == _rehash(target)
        assert entry["sizeBytes"] == target.stat().st_size

    assert document["bundleId"] == manifest_module.compute_bundle_id(
        document["artifacts"]
    )
    assert HEX64.match(document["bundleId"].removeprefix("sha256:"))

    model = json.loads((complete.dir / "model.json").read_text(encoding="utf-8"))
    assert document["modelId"] == model["metadata"]["modelId"]
    assert document["modelId"] == f"sha256:{document['modelId'].removeprefix('sha256:')}"

    package = json.loads(
        (manifest_module.REPO_ROOT / "web" / "package.json").read_text(
            encoding="utf-8"
        )
    )
    assert document["appVersion"] == package["version"]


def test_manifest_provenance_cross_checks(complete):
    provenance = complete.document["provenance"]
    checksums = parse_checksums(
        manifest_module.REPO_ROOT / "data" / "CHECKSUMS.txt"
    )
    assert provenance["dataSha256"] == checksums[CANONICAL_CSV]
    assert HEX64.match(provenance["dataSha256"])

    results = json.loads(
        (complete.dir / "results.json").read_text(encoding="utf-8")
    )
    seed_set = results["provenance"]["seedSet"]
    assert provenance["seedSet"]["baseSeed"] == seed_set["base"]
    assert provenance["seedSet"]["backgroundSeed"] == seed_set["derived"][
        "deployedBackgroundSeed"
    ]
    assert provenance["seedSet"]["derived"] == {
        key: value
        for key, value in seed_set["derived"].items()
        if key != "deployedBackgroundSeed"
    }
    assert provenance["toolVersions"] == results["provenance"]["toolVersions"]
    assert GIT_REVISION.match(provenance["sourceRevision"])
    assert provenance["sourceRevision"] == manifest_module.source_revision()


def test_manifest_attribution_parsed_from_record(complete):
    attributions = complete.document["attributions"]
    assert isinstance(attributions, list) and len(attributions) == 1
    entry = attributions[0]
    assert entry["id"] == "bodyparts3d-heart"
    assert entry["artifact"] == "models/heart.glb"
    assert entry["title"].startswith("BodyParts3D")
    assert entry["sourceUrl"].startswith("https://")
    assert "CC BY-SA" in entry["licence"]
    assert len(entry["credits"]) >= 2
    assert all(credit.startswith("BodyParts3D") for credit in entry["credits"])
    assert entry["record"] == "assets/ATTRIBUTION.md"
    assert entry["status"] == "provisional"
    assert entry["openDecision"] == "HD-07"
    staged_mesh_sha = complete.document["artifacts"]["structures"]["sha256"]
    assert staged_mesh_sha == manifest_module.sha256_of(
        manifest_module.REPO_ROOT / "assets" / "ready" / "heart.glb"
    )


def test_read_attributions_rejects_digest_mismatch():
    mesh = manifest_module.REPO_ROOT / "assets" / "ready" / "heart.glb"
    real_sha = manifest_module.sha256_of(mesh)
    entry = manifest_module.read_attributions(real_sha)[0]
    assert entry["id"] == "bodyparts3d-heart"
    with pytest.raises(manifest_module.ManifestError, match="sha256"):
        manifest_module.read_attributions("0" * 64)


def test_validate_detects_tampered_bundle(complete):
    target = complete.dir / "model.json"
    text = target.read_text(encoding="utf-8")
    assert '"featureCount":54' in text
    target.write_text(text.replace('"featureCount":54', '"featureCount":53'), encoding="utf-8")
    with pytest.raises(manifest_module.ManifestError, match="sha256"):
        manifest_module.validate_manifest(complete.document, complete.dir)


def test_validate_detects_tampered_manifest_entry(complete):
    document = json.loads(json.dumps(complete.document))
    document["artifacts"]["results"]["sha256"] = "0" * 64
    with pytest.raises(manifest_module.ManifestError, match="results sha256"):
        manifest_module.validate_manifest(document, complete.dir)

    document = json.loads(json.dumps(complete.document))
    document["modelId"] = "sha256:" + "1" * 64
    with pytest.raises(manifest_module.ManifestError, match="modelId"):
        manifest_module.validate_manifest(document, complete.dir)

    document = json.loads(json.dumps(complete.document))
    document["provenance"]["dataSha256"] = "2" * 64
    with pytest.raises(manifest_module.ManifestError, match="dataSha256"):
        manifest_module.validate_manifest(document, complete.dir)


def test_bundle_id_is_pure_function_of_digests(complete):
    artifacts = complete.document["artifacts"]
    bundle_id = manifest_module.compute_bundle_id(artifacts)
    reversed_entries = dict(reversed(list(artifacts.items())))
    assert manifest_module.compute_bundle_id(reversed_entries) == bundle_id

    altered = json.loads(json.dumps(artifacts))
    altered["results"]["sha256"] = "f" * 64
    assert manifest_module.compute_bundle_id(altered) != bundle_id

    with pytest.raises(manifest_module.ManifestError):
        manifest_module.compute_bundle_id({})


def test_canonical_bytes_are_deterministic_and_ascii(complete):
    payload = manifest_module.canonical_manifest_bytes(complete.document)
    assert payload.endswith(b"\n")
    assert payload.decode("ascii") is not None
    round_trip = json.loads(payload.decode("utf-8"))
    assert manifest_module.canonical_manifest_bytes(round_trip) == payload


def test_main_writes_valid_manifest_for_complete_bundle(
    complete, monkeypatch, capsys
):
    monkeypatch.setattr(manifest_module, "PUBLIC_DIR", complete.dir)
    monkeypatch.setattr(
        manifest_module, "MANIFEST_PATH", complete.dir / "manifest.json"
    )
    return_code = manifest_module.main([])
    output = capsys.readouterr().out
    assert return_code == 0
    assert "manifest written" in output
    assert "pending: 0 of 6" in output

    written = complete.dir / "manifest.json"
    assert written.is_file()
    document = json.loads(written.read_text(encoding="utf-8"))
    assert tuple(document) == TOP_LEVEL_KEYS
    manifest_module.validate_manifest(document, complete.dir)
    assert written.read_bytes() == manifest_module.canonical_manifest_bytes(document)


def test_registry_and_model_feature_order_guard(complete):
    """The C-01 loader rule is enforced at build time, not only at load time."""
    registry = json.loads((complete.dir / "registry.json").read_text(encoding="utf-8"))
    model = json.loads((complete.dir / "model.json").read_text(encoding="utf-8"))
    assert [entry["id"] for entry in registry["features"]] == model["features"]
    assert [entry["id"] for entry in registry["targets"]] == model["targets"]

    mismatched = json.loads(json.dumps(complete.document))
    # simulate a registry/model divergence by breaking the staged registry
    registry_path = complete.dir / "registry.json"
    original = registry_path.read_text(encoding="utf-8")
    reordered = json.loads(original)
    reordered["features"] = list(reversed(reordered["features"]))
    registry_path.write_text(json.dumps(reordered), encoding="utf-8")
    try:
        with pytest.raises(manifest_module.ManifestError, match="feature order"):
            manifest_module.validate_manifest(mismatched, complete.dir)
    finally:
        registry_path.write_text(original, encoding="utf-8")
