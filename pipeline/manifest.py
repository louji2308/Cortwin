"""C-01 artifact manifest — builder and validator (``pipeline/manifest.py``).

Produces ``web/public/manifest.json``: the single integrity index the browser
loader trusts before it fetches anything (Contracts §5.1, Architecture §6.3).

Two modes:

* **inventory** (default): stage every artifact whose source exists, hash what
  is present, and *report* each required artifact that is still missing as
  ``pending`` — no manifest is written until the bundle is complete, because
  C-01 forbids shipping a manifest that does not list every required artifact.
* **strict** (``--require-all``): the G3 gate mode — every one of the six
  artifacts must be present, otherwise :class:`MissingArtifactsError` is
  raised listing *every* missing artifact at once. Strict mode verifies the
  bundle **as it stands on disk** and never stages: a gate that repaired what
  it is checking would mask a broken bundle.

Layout (D-12): the manifest lives at ``web/public/manifest.json``; artifact
``path`` values are site-relative (``model.json``, ``results.json``,
``registry.json``, ``cases.json``, ``models/heart.glb``,
``fixtures/golden.json``) and each entry carries the exact ``sha256`` and
``sizeBytes`` the loader must verify.

Identity rules:

* ``bundleId`` = ``"sha256:" + sha256`` over the ASCII material
  ``"<digest>\\n"`` for the six artifact digests **sorted ascending**, joined
  by ``"\\n"`` with a trailing ``"\\n"`` — a pure function of artifact content
  (documented and tested).
* ``modelId`` is read from the staged ``model.json`` (content identity owned
  by the exporter, ``pipeline/export_model.py``); it is never recomputed here.
* ``appVersion`` comes from ``web/package.json`` — the single source.

Provenance: ``dataSha256`` from ``data/CHECKSUMS.txt`` (cross-checked against
``results.json``), ``seedSet`` flattened from the seeds actually recorded in
``results.json``, ``sourceRevision`` from read-only ``git rev-parse HEAD`` plus
a ``+dirty`` suffix when the worktree differs, ``toolVersions`` from the
toolchain recorded in ``results.json``. ``attributions`` parses
``assets/ATTRIBUTION.md`` (never re-invents it) and fails loudly if that
record no longer matches the shipped mesh bytes.

Run as ``python -m pipeline.manifest [--require-all]``.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

if __package__ in (None, ""):  # direct script execution
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from pipeline.dataset import CANONICAL_CSV, parse_checksums
    from pipeline.errors import PipelineError
else:
    from .dataset import CANONICAL_CSV, parse_checksums
    from .errors import PipelineError

REPO_ROOT = Path(__file__).resolve().parents[1]
PUBLIC_DIR = REPO_ROOT / "web" / "public"
MANIFEST_PATH = PUBLIC_DIR / "manifest.json"
ATTRIBUTION_PATH = REPO_ROOT / "assets" / "ATTRIBUTION.md"
WEB_PACKAGE_JSON = REPO_ROOT / "web" / "package.json"

SCHEMA_VERSION = "1.0.0"
MANIFEST_TOP_LEVEL_KEYS = (
    "schemaVersion",
    "appVersion",
    "bundleId",
    "modelId",
    "artifacts",
    "provenance",
    "attributions",
)
HASH_PATTERN = re.compile(r"^[0-9a-f]{64}$")
MODEL_ID_PATTERN = re.compile(r"^sha256:[0-9a-f]{64}$")


class ManifestError(PipelineError):
    """The manifest cannot be built or does not validate against the bundle."""


class MissingArtifactsError(ManifestError):
    """Strict mode: at least one required artifact is absent from the bundle."""

    def __init__(self, missing: list[str]):
        self.missing = list(missing)
        super().__init__(
            "manifest requires every artifact; missing: " + ", ".join(self.missing)
        )


@dataclass(frozen=True)
class ArtifactSpec:
    """One required C-01 artifact: site-relative target + optional source.

    ``source`` is a repository-relative file copied byte-identically into the
    bundle during staging. ``source=None`` means the artifact is published
    directly at its target path by its owning unit (cases: P3-3) or by the G3
    gate (fixtures), and staging leaves it alone.
    """

    key: str
    target: str
    source: str | None


SPECS: tuple[ArtifactSpec, ...] = (
    ArtifactSpec("registry", "registry.json", "config/registry.json"),
    ArtifactSpec("model", "model.json", "model.json"),
    ArtifactSpec("structures", "models/heart.glb", "assets/ready/heart.glb"),
    ArtifactSpec("cases", "cases.json", None),
    ArtifactSpec("results", "results.json", "results.json"),
    ArtifactSpec("fixtures", "fixtures/golden.json", None),
)


def sha256_of(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def artifact_entry(spec: ArtifactSpec, public_dir: Path) -> dict:
    """``{path, sha256, sizeBytes}`` for one staged artifact (C-01 shape)."""
    target = public_dir / spec.target
    if not target.is_file():
        raise ManifestError(f"artifact {spec.key} not staged at {spec.target}")
    size_bytes = target.stat().st_size
    if size_bytes <= 0:
        raise ManifestError(f"artifact {spec.key} at {spec.target} is empty")
    digest = sha256_of(target)
    if not HASH_PATTERN.match(digest):
        raise ManifestError(f"artifact {spec.key} produced an invalid digest")
    return {"path": spec.target, "sha256": digest, "sizeBytes": size_bytes}


def stage_artifacts(
    public_dir: Path = PUBLIC_DIR, repo_root: Path = REPO_ROOT
) -> dict[str, bool]:
    """Copy every artifact source into the bundle (byte-identical, exist_ok).

    Returns ``{artifactKey: copied_now}``. Missing sources are *not* an error
    here — inventory mode reports them as pending; strict mode raises later.
    """
    copied: dict[str, bool] = {}
    for spec in SPECS:
        if spec.source is None:
            copied[spec.key] = False
            continue
        source = repo_root / spec.source
        if not source.is_file():
            copied[spec.key] = False
            continue
        target = public_dir / spec.target
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)
        if sha256_of(source) != sha256_of(target):
            raise ManifestError(f"staged copy of {spec.key} is not byte-identical")
        copied[spec.key] = True
    return copied


def collect_artifacts(
    public_dir: Path = PUBLIC_DIR, specs: tuple[ArtifactSpec, ...] = SPECS
) -> tuple[dict[str, dict], list[str]]:
    """Hash every present artifact; return ``(entries, pendingKeys)``."""
    entries: dict[str, dict] = {}
    pending: list[str] = []
    for spec in specs:
        if (public_dir / spec.target).is_file():
            entries[spec.key] = artifact_entry(spec, public_dir)
        else:
            pending.append(spec.key)
    return entries, pending


def compute_bundle_id(entries: dict[str, dict]) -> str:
    """``sha256:<hex>`` over the sorted artifact digests — see module docstring."""
    digests = sorted(entry["sha256"] for entry in entries.values())
    if not digests:
        raise ManifestError("cannot derive bundleId from an empty artifact set")
    material = "".join(f"{digest}\n" for digest in digests)
    return f"sha256:{hashlib.sha256(material.encode('ascii')).hexdigest()}"


def _git(args: list[str], repo_root: Path) -> str | None:
    """Read-only git invocation; ``None`` when git is unavailable."""
    try:
        completed = subprocess.run(
            ["git", *args],
            cwd=repo_root,
            capture_output=True,
            text=True,
            timeout=30,
            check=False,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    if completed.returncode != 0:
        return None
    return completed.stdout


def source_revision(repo_root: Path = REPO_ROOT) -> str:
    """``<commit>`` plus ``+dirty`` when the worktree has uncommitted changes."""
    revision = _git(["rev-parse", "HEAD"], repo_root)
    if revision is None or not revision.strip():
        return "unknown"
    commit = revision.strip()
    status = _git(["status", "--porcelain"], repo_root)
    if status is None:
        return commit
    dirty = bool(status.strip())
    return f"{commit}+dirty" if dirty else commit


def read_app_version(path: Path = WEB_PACKAGE_JSON) -> str:
    try:
        doc = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ManifestError(f"cannot read web/package.json: {exc}") from exc
    version = doc.get("version")
    if not isinstance(version, str) or not version:
        raise ManifestError("web/package.json has no non-empty 'version'")
    return version


def build_provenance(
    results: dict, repo_root: Path = REPO_ROOT
) -> dict:
    """C-01 provenance block: data checksum, seeds, revision, tool versions."""
    try:
        checksums = parse_checksums(repo_root / "data" / "CHECKSUMS.txt")
    except PipelineError as exc:
        raise ManifestError(f"data checksums unreadable: {exc}") from exc
    if CANONICAL_CSV not in checksums:
        raise ManifestError("data/CHECKSUMS.txt does not list the canonical CSV")
    data_sha256 = checksums[CANONICAL_CSV]

    results_provenance = results.get("provenance")
    if not isinstance(results_provenance, dict):
        raise ManifestError("results.json has no provenance block")
    if results_provenance.get("dataSha256") != data_sha256:
        raise ManifestError("results.json dataSha256 differs from CHECKSUMS.txt")
    seed_set = results_provenance.get("seedSet")
    if not isinstance(seed_set, dict):
        raise ManifestError("results.json provenance has no seedSet")
    derived = seed_set.get("derived")
    if not isinstance(derived, dict):
        raise ManifestError("results.json provenance seedSet has no derived block")
    base_seed = seed_set.get("base")
    background_seed = derived.get("deployedBackgroundSeed")
    if not isinstance(base_seed, int) or not isinstance(background_seed, int):
        raise ManifestError("results.json seedSet lacks the base/background seeds")

    remaining_derived = {
        key: value
        for key, value in derived.items()
        if key != "deployedBackgroundSeed" and isinstance(value, int)
    }
    tool_versions = results_provenance.get("toolVersions")
    if not isinstance(tool_versions, dict) or not tool_versions:
        raise ManifestError("results.json provenance has no toolVersions")

    return {
        "dataSha256": data_sha256,
        "seedSet": {
            "baseSeed": int(base_seed),
            "backgroundSeed": int(background_seed),
            "derived": {key: int(value) for key, value in remaining_derived.items()},
        },
        "sourceRevision": source_revision(repo_root),
        "toolVersions": dict(tool_versions),
    }


def read_attributions(structures_sha256: str, path: Path = ATTRIBUTION_PATH) -> list[dict]:
    """Parse the BodyParts3D entry from ``assets/ATTRIBUTION.md`` (C-01).

    The record is authoritative: if the file no longer matches the shipped
    mesh bytes, or the credit lines disappear, the build fails loudly instead
    of inventing an attribution.
    """
    try:
        text = path.read_text(encoding="utf-8")
    except OSError as exc:
        raise ManifestError(f"cannot read assets/ATTRIBUTION.md: {exc}") from exc

    credits = [
        line.strip()
        for line in text.splitlines()
        if line.strip().startswith("BodyParts3D")
    ]
    if len(credits) < 2:
        raise ManifestError(
            "ATTRIBUTION.md does not carry the two required BodyParts3D credits"
        )

    row = re.search(
        r"\|\s*`assets/ready/heart\.glb`\s*\|\s*([\d,]+)\s*\|\s*`([0-9a-f]{64})`"
        r"\s*\|[^|\n]*\|\s*([^|\n]+?)\s*\|",
        text,
    )
    if row is None:
        raise ManifestError("ATTRIBUTION.md has no heart.glb provenance row")
    recorded_sha256 = row.group(2)
    licence = row.group(3).strip()
    if recorded_sha256 != structures_sha256:
        raise ManifestError(
            "ATTRIBUTION.md records a heart.glb sha256 that differs from the "
            "shipped mesh"
        )

    page = re.search(r"Download page[^|\n]*\|\s*`([^`]+)`", text)
    if page is None:
        raise ManifestError("ATTRIBUTION.md has no BodyParts3D download page URL")

    provisional = "HD-07" in text
    entry = {
        "id": "bodyparts3d-heart",
        "artifact": "models/heart.glb",
        "title": "BodyParts3D",
        "sourceUrl": page.group(1).strip(),
        "licence": licence,
        "credits": credits[:2],
        "status": "provisional" if provisional else "recorded",
        "record": "assets/ATTRIBUTION.md",
    }
    if provisional:
        entry["openDecision"] = "HD-07"
    return [entry]


def load_model_identity(public_dir: Path) -> tuple[str, list[str], list[str]]:
    """Read ``(modelId, features, targets)`` from the staged ``model.json``."""
    path = public_dir / "model.json"
    try:
        document = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ManifestError(f"staged model.json unreadable: {exc}") from exc
    metadata = document.get("metadata")
    if not isinstance(metadata, dict):
        raise ManifestError("model.json has no metadata block")
    model_id = metadata.get("modelId")
    if not isinstance(model_id, str) or not MODEL_ID_PATTERN.match(model_id):
        raise ManifestError("model.json metadata.modelId is not 'sha256:<hex>'")
    features = document.get("features")
    targets = document.get("targets")
    if not isinstance(features, list) or not isinstance(targets, list):
        raise ManifestError("model.json must declare features and targets lists")
    return model_id, list(features), list(targets)


def build_manifest(
    entries: dict[str, dict],
    public_dir: Path = PUBLIC_DIR,
    repo_root: Path = REPO_ROOT,
) -> dict:
    """Assemble the C-01 manifest from a *complete* artifact set."""
    missing = [spec.key for spec in SPECS if spec.key not in entries]
    if missing:
        raise MissingArtifactsError(missing)

    results_path = public_dir / "results.json"
    try:
        results = json.loads(results_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ManifestError(f"staged results.json unreadable: {exc}") from exc
    if not isinstance(results, dict):
        raise ManifestError("staged results.json must contain an object")

    model_id, _, _ = load_model_identity(public_dir)

    manifest = {
        "schemaVersion": SCHEMA_VERSION,
        "appVersion": read_app_version(repo_root / "web" / "package.json"),
        "bundleId": compute_bundle_id(entries),
        "modelId": model_id,
        "artifacts": {spec.key: entries[spec.key] for spec in SPECS},
        "provenance": build_provenance(results, repo_root),
        "attributions": read_attributions(
            entries["structures"]["sha256"], repo_root / "assets" / "ATTRIBUTION.md"
        ),
    }
    validate_manifest(manifest, public_dir, repo_root)
    return manifest


def validate_manifest(
    manifest: dict, public_dir: Path = PUBLIC_DIR, repo_root: Path = REPO_ROOT
) -> None:
    """Re-verify every claim in a manifest against the real bundle on disk."""
    problems: list[str] = []
    if tuple(manifest) != MANIFEST_TOP_LEVEL_KEYS:
        problems.append(f"top-level keys differ from C-01: {list(manifest)}")
    if manifest.get("schemaVersion") != SCHEMA_VERSION:
        problems.append("schemaVersion is not 1.0.0")
    model_id = manifest.get("modelId")
    if not isinstance(model_id, str) or not MODEL_ID_PATTERN.match(model_id):
        problems.append("modelId is not 'sha256:<hex>'")
    bundle_id = manifest.get("bundleId")
    if not isinstance(bundle_id, str) or not bundle_id.startswith("sha256:"):
        problems.append("bundleId is not 'sha256:<hex>'")

    artifacts = manifest.get("artifacts")
    if not isinstance(artifacts, dict) or tuple(artifacts) != tuple(
        spec.key for spec in SPECS
    ):
        problems.append(f"artifact keys differ from C-01: {list(artifacts or {})}")
    else:
        for spec in SPECS:
            entry = artifacts[spec.key]
            if tuple(entry) != ("path", "sha256", "sizeBytes"):
                problems.append(f"{spec.key} entry keys differ from C-01")
                continue
            if entry["path"] != spec.target:
                problems.append(f"{spec.key} path is not {spec.target}")
            target = public_dir / spec.target
            if not target.is_file():
                problems.append(f"{spec.key} file missing at {spec.target}")
                continue
            observed_sha256 = sha256_of(target)
            observed_size = target.stat().st_size
            if entry["sha256"] != observed_sha256:
                problems.append(f"{spec.key} sha256 does not match the file")
            if entry["sizeBytes"] != observed_size:
                problems.append(f"{spec.key} sizeBytes does not match the file")
        if not problems and compute_bundle_id(artifacts) != bundle_id:
            problems.append("bundleId does not match the artifact digests")

    staged_model_id, model_features, model_targets = load_model_identity(public_dir)
    if staged_model_id != model_id:
        problems.append("modelId differs from the staged model.json")

    registry_path = public_dir / "registry.json"
    if registry_path.is_file():
        try:
            registry = json.loads(registry_path.read_text(encoding="utf-8"))
            registry_features = [
                entry["id"] for entry in registry.get("features", [])
            ]
            registry_targets = [entry["id"] for entry in registry.get("targets", [])]
        except (json.JSONDecodeError, KeyError, TypeError, AttributeError) as exc:
            problems.append(f"staged registry.json unreadable: {exc}")
        else:
            if registry_features != model_features:
                problems.append("registry/model feature order mismatch")
            if registry_targets != model_targets:
                problems.append("registry/model target identity mismatch")
    else:
        problems.append("registry.json file missing at registry.json")

    try:
        checksums = parse_checksums(repo_root / "data" / "CHECKSUMS.txt")
    except PipelineError as exc:
        problems.append(f"data checksums unreadable: {exc}")
    else:
        expected_data_sha256 = checksums.get(CANONICAL_CSV)
        provenance_block = manifest.get("provenance")
        observed_data_sha256 = (
            provenance_block.get("dataSha256")
            if isinstance(provenance_block, dict)
            else None
        )
        if observed_data_sha256 != expected_data_sha256:
            problems.append("provenance.dataSha256 differs from data/CHECKSUMS.txt")

    provenance = manifest.get("provenance")
    if not isinstance(provenance, dict):
        problems.append("provenance block missing")
    else:
        if not HASH_PATTERN.match(str(provenance.get("dataSha256", ""))):
            problems.append("provenance.dataSha256 is not a hex digest")
        seed_set = provenance.get("seedSet")
        if not isinstance(seed_set, dict) or "baseSeed" not in seed_set:
            problems.append("provenance.seedSet is malformed")
        if not isinstance(provenance.get("sourceRevision"), str) or not provenance[
            "sourceRevision"
        ]:
            problems.append("provenance.sourceRevision is not a string")
        tool_versions = provenance.get("toolVersions")
        if not isinstance(tool_versions, dict) or not tool_versions:
            problems.append("provenance.toolVersions is malformed")

    attributions = manifest.get("attributions")
    if not isinstance(attributions, list) or not attributions:
        problems.append("attributions must be a non-empty list")
    elif not all(isinstance(entry, dict) and entry.get("id") for entry in attributions):
        problems.append("every attribution needs an id")

    if manifest.get("appVersion") != read_app_version(
        repo_root / "web" / "package.json"
    ):
        problems.append("appVersion differs from web/package.json")

    results_path = public_dir / "results.json"
    model_path = public_dir / "model.json"
    if results_path.is_file() and model_path.is_file():
        results = json.loads(results_path.read_text(encoding="utf-8"))
        document = json.loads(model_path.read_text(encoding="utf-8"))
        model_results_sha = (document.get("provenance") or {}).get("resultsSha256")
        results_sha = sha256_of(results_path)
        if model_results_sha != results_sha:
            problems.append("model.json provenance.resultsSha256 differs from results")
        if results.get("schemaVersion") != SCHEMA_VERSION:
            problems.append("results.json schemaVersion is not 1.0.0")

    if problems:
        raise ManifestError("manifest validation failed: " + "; ".join(problems))


def canonical_manifest_bytes(manifest: dict) -> bytes:
    """Deterministic manifest serialization in C-01 contract order.

    Top-level keys are emitted in the order Contracts §5.1 prescribes
    (``MANIFEST_TOP_LEVEL_KEYS``), artifact keys in ``SPECS`` order, and
    each artifact entry as ``{path, sha256, sizeBytes}``; anything else is
    kept in its given order. Indented, ``allow_nan=False``, trailing
    newline — a pure function of the content for manifests this module
    builds, and byte-stable across a JSON round trip.
    """
    ordered = {key: manifest[key] for key in MANIFEST_TOP_LEVEL_KEYS if key in manifest}
    ordered.update({key: manifest[key] for key in sorted(manifest) if key not in ordered})
    artifacts = ordered.get("artifacts")
    if isinstance(artifacts, dict):
        entry_keys = ("path", "sha256", "sizeBytes")
        ordered_artifacts: dict[str, dict] = {}
        for spec in SPECS:
            entry = artifacts.get(spec.key)
            if isinstance(entry, dict):
                packed = {key: entry[key] for key in entry_keys if key in entry}
                packed.update(
                    {key: entry[key] for key in sorted(entry) if key not in entry_keys}
                )
                ordered_artifacts[spec.key] = packed
        for key in sorted(artifacts):
            if key not in ordered_artifacts:
                ordered_artifacts[key] = artifacts[key]
        ordered["artifacts"] = ordered_artifacts
    text = json.dumps(ordered, indent=2, allow_nan=False)
    return (text + "\n").encode("utf-8")


def inventory_report(
    entries: dict[str, dict], pending: list[str], copied: dict[str, bool]
) -> str:
    lines = ["manifest inventory:"]
    for spec in SPECS:
        if spec.key in entries:
            entry = entries[spec.key]
            lines.append(
                f"  OK      {spec.key:<11} {entry['path']} "
                f"sha256 {entry['sha256']} {entry['sizeBytes']} bytes"
            )
        else:
            origin = spec.source or "(published directly at target path)"
            lines.append(
                f"  PENDING {spec.key:<11} expected {spec.target} from {origin}"
            )
    staged = [key for key, did_copy in copied.items() if did_copy]
    if staged:
        lines.append("  staged this run: " + ", ".join(sorted(staged)))
    lines.append(f"  pending: {len(pending)} of {len(SPECS)} artifacts")
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m pipeline.manifest",
        description="Build and validate the C-01 manifest (web/public/manifest.json).",
    )
    parser.add_argument(
        "--require-all",
        action="store_true",
        help="strict mode: fail with every missing artifact listed (G3 gate)",
    )
    args = parser.parse_args(argv)

    # Inventory mode assembles the bundle from its sources; strict mode
    # verifies the bundle *as it stands on disk* and never repairs it — a
    # gate that re-staged what it is checking would mask a broken bundle.
    copied = {} if args.require_all else stage_artifacts(PUBLIC_DIR)
    entries, pending = collect_artifacts(PUBLIC_DIR)
    report = inventory_report(entries, pending, copied)
    if pending:
        print(report)
        if args.require_all:
            raise MissingArtifactsError(pending)
        print(
            "manifest NOT written: bundle incomplete - land the pending artifacts "
            "and re-run (strict: --require-all)"
        )
        return 0

    manifest = build_manifest(entries, PUBLIC_DIR)
    MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST_PATH.write_bytes(canonical_manifest_bytes(manifest))
    print(report)
    try:
        shown = MANIFEST_PATH.relative_to(REPO_ROOT).as_posix()
    except ValueError:  # non-repo location (tests)
        shown = str(MANIFEST_PATH)
    print(
        f"manifest written: {shown} "
        f"sha256 {sha256_of(MANIFEST_PATH)} "
        f"bundleId {manifest['bundleId']} modelId {manifest['modelId']} "
        f"appVersion {manifest['appVersion']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
