"""End-to-end deterministic reproduction: ``results.json`` + deployed model candidate.

Run from the repository root as ``python -m pipeline.reproduce`` (also the
``make reproduce`` / ``.\\make.ps1 reproduce`` entry point). The run:

1. checksum-verifies and encodes the dataset (VC-01/VC-03);
2. fits the frozen nested-validation protocol for all four targets (VC-04);
3. fits the deployed ensembles and derives Platt / threshold / abstention band
   from pooled full-protocol out-of-fold evidence (C-03);
4. assembles the C-04 ``results`` document with provenance and the RT-1
   reliability classification — every number computed at runtime;
5. imports ``pipeline.leakage_lab`` lazily, only here and only after fitting
   (frozen cross-unit interface); if the module is not available yet the run
   warns loudly and omits the ``leakageLab`` key (mandatory at gate time);
6. writes canonical ``results.json`` (sorted keys, indent 2, no NaN, trailing
   newline, no wall-clock timestamps) and
   ``pipeline/artifacts/deployed_model.joblib`` (build-only, never hand-edited
   — AG-12). When ``CORTWIN_REPRODUCE_OUT`` is set, both outputs land under
   that directory instead (sandbox used by the reproduce smoke test so tests
   never mutate committed artifacts — decision D-19).

Two consecutive runs on the same tree produce byte-identical ``results.json``.
"""

from __future__ import annotations

import hashlib
import json
import math
import os
import platform
import subprocess
import sys
import time
from importlib import metadata as importlib_metadata
from pathlib import Path

import numpy as np

from .calibration import fit_platt
from .dataset import CANONICAL_CSV, load_dataset, parse_checksums
from .errors import PipelineError
from .metrics import (
    bootstrap_auc_ci,
    brier_score,
    classification_metrics,
    ece_from_curve,
    majority_baseline,
    reliability_curve,
    roc_auc,
)
from .prepare import SUBGROUP_IDS, prepare_dataset
from .reliability import RULE_ID, reliability_targets, rule_document
from .train import fit_ensemble
from .validate import (
    BACKGROUND_ROWS,
    BASE_SEED,
    LADDER_PROVENANCE,
    STAGE_SEMANTICS,
    THRESHOLD_METHOD,
    THRESHOLD_SOURCE,
    bootstrap_ladder_seed,
    bootstrap_performance_seed,
    bootstrap_subgroup_seed,
    decision_evidence,
    deployed_background_seed,
    deployed_xgb_seed,
    registry_stages,
    run_nested_cv,
)

REPO_ROOT = Path(__file__).resolve().parents[1]
# D-19 test hook: tests/test_results_schema.py redirects reproduce OUTPUT into a
# sandbox via CORTWIN_REPRODUCE_OUT so a mid-suite retrain can never overwrite
# the committed, hash-asserted results.json / deployed_model.joblib. Unset (the
# default, and `make reproduce`) writes the canonical repository paths exactly
# as before — byte-identical output either way.
_OUTPUT_ROOT = Path(os.environ.get("CORTWIN_REPRODUCE_OUT") or REPO_ROOT)
RESULTS_PATH = _OUTPUT_ROOT / "results.json"
ARTIFACTS_DIR = _OUTPUT_ROOT / "pipeline" / "artifacts"
DEPLOYED_MODEL_PATH = ARTIFACTS_DIR / "deployed_model.joblib"
SCHEMA_VERSION = "1.0.0"
SMALL_SUBGROUP_MAX = 50

PROVENANCE_NOTES = [
    ("Protocol: RepeatedStratifiedKFold(5 splits x 3 repeats, seed 411) stratified on "
    "the joint LAD/LCX/RCA 8-pattern outcome label; one shared outer structure for all "
    "targets; inner StratifiedKFold(4, shuffle) seed = 412 + outerFoldIndex."),
    ("Ensemble: 0.5 * XGB raw margin (booster output_margin, log-odds) + 0.5 * logistic "
    "decision_function; XGB hyperparameters fixed a priori, never tuned."),
    ("Seed formulas: inner fold 412+foldIndex; fold XGB 5411+foldIndex*4+targetIndex; "
    "deployed XGB 5471+targetIndex; fold background 6411+foldIndex; deployed background "
    "7411; bootstrap 8411+targetIndex (performance), 8511+targetIndex*4+groupIndex "
    "(subgroups), 8611+targetIndex*5+stageIndex (ladder)."),
    ("Platt: logistic NLL minimised by L-BFGS-B from start (1, 0); per-outer-fold Platt "
    "fitted only on that fold's inner-OOF margins; deployed Platt fitted on pooled "
    "out-of-fold margins; slope asserted strictly positive."),
    ("Threshold: max F1 on out-of-fold calibrated probabilities; ties resolve to the "
    "largest threshold; recorded as method max_f1_inner_validation, source "
    "validated_pipeline. Per-outer-fold thresholds use inner-OOF only; the deployed "
    "threshold uses pooled out-of-fold probabilities (all out-of-sample predictions)."),
    ("Pooled evidence: each patient's 3 repeat-probabilities are averaged into 303 "
    "out-of-fold rows; accuracy, precision, recall, F1, AUC, calibration, decisions and "
    "subgroups all come from that pool. Per-fold AUC uses outer-test raw margins; "
    "foldAucSd is the sample standard deviation (ddof=1) over the 15 outer folds."),
    ("Confidence intervals: 95% percentile bootstrap over patients, 10000 resamples, "
    "seeded per curve; ties credited 0.5 in the bootstrap AUC kernel."),
    ("Reliability curve bins are equal width; an empty bin reports the bin midpoint as "
    "meanPredicted and 0 as fractionPositive with count 0, keeping every value finite."),
    ("Abstention band lives in raw ensemble margin space: thresholdMargin = (logit("
    "thresholdProbability) - intercept) / slope from the deployed Platt; half width = "
    "40th percentile of |margin - thresholdMargin| over pooled out-of-fold margins."),
    ("Evidence ladder: unobserved modalities masked to fold-local background rows (60, "
    "seeded from outer-train only); margin = mean over background rows; AUC on raw "
    "margins; Platt is affine and AUC rank-invariant, so calibration cannot change this "
    "evidence; stage semantics are cumulative information, not a work-up order."),
    ("Reliability RT-1 is an evidence classification from pooled out-of-fold AUC CI and "
    "uplift over the majority baseline; it is not a decision state or confidence claim."),
    ("Deployed XGB/LR are refitted on all 303 rows; their Platt, threshold, band and "
    "background rows are derived from pooled full-protocol out-of-fold evidence."),
]


def _jsonable(obj: object) -> object:
    if isinstance(obj, dict):
        return {str(key): _jsonable(value) for key, value in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_jsonable(value) for value in obj]
    if isinstance(obj, (bool, np.bool_)):
        return bool(obj)
    if isinstance(obj, (int, np.integer)):
        return int(obj)
    if isinstance(obj, (float, np.floating)):
        value = float(obj)
        if not math.isfinite(value):
            raise PipelineError("results contain a non-finite number")
        return value
    if isinstance(obj, str) or obj is None:
        return obj
    raise PipelineError(f"unsupported type in results document: {type(obj).__name__}")


def _tool_versions() -> dict[str, str]:
    return {
        "python": platform.python_version(),
        "numpy": np.__version__,
        "pandas": importlib_metadata.version("pandas"),
        "scikitLearn": importlib_metadata.version("scikit-learn"),
        "xgboost": importlib_metadata.version("xgboost"),
    }


def _source_revision() -> str:
    try:
        completed = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
            timeout=30,
            check=False,
        )
    except (OSError, subprocess.SubprocessError):
        return "unknown"
    revision = completed.stdout.strip()
    if completed.returncode != 0 or not revision:
        return "unknown"
    return revision


def _data_sha256() -> str:
    entries = parse_checksums()
    if CANONICAL_CSV not in entries:
        raise PipelineError("data/CHECKSUMS.txt does not list the canonical CSV")
    return entries[CANONICAL_CSV]


def sample_background(n_patients: int) -> np.ndarray:
    """The single fixed 60-row background set for the deployed model (C-03)."""
    rng = np.random.default_rng(deployed_background_seed())
    chosen = rng.choice(n_patients, size=BACKGROUND_ROWS, replace=False)
    return np.asarray(chosen, dtype=np.int64)


def build_protocol_block(prepared) -> dict:
    return {
        "patientCount": int(prepared.n_patients),
        "featureCount": int(prepared.n_features),
        "outerFolds": 5,
        "outerRepeats": 3,
        "innerFolds": 4,
        "noSmote": True,
        "preprocessingInsideFold": True,
        "calibrationInsideFold": True,
        "thresholdInsideFold": True,
        "abstentionInsideFold": True,
        "stratification": "joint LAD/LCX/RCA 8-pattern",
        "ciMethod": (
            "95% percentile bootstrap over patients, 10000 resamples, seeded per curve "
            "from base 411"
        ),
    }


def build_performance_block(cv: dict, decisions: dict, target_ids: list[str]) -> dict:
    block: dict[str, dict] = {}
    for target_index, target_id in enumerate(target_ids):
        validation = cv[target_id]
        labels = validation.labels
        threshold = decisions[target_id]["selectedThreshold"]
        metrics = classification_metrics(labels, validation.pooled_prob, threshold)
        auc = roc_auc(validation.pooled_prob, labels)
        interval = bootstrap_auc_ci(
            validation.pooled_prob, labels, seed=bootstrap_performance_seed(target_index)
        )
        fold_values = np.asarray(validation.fold_auc, dtype=np.float64)
        block[target_id] = {
            "accuracy": float(metrics["accuracy"]),
            "precision": float(metrics["precision"]),
            "recall": float(metrics["recall"]),
            "f1": float(metrics["f1"]),
            "rocAuc": float(auc),
            "rocAucCI": interval,
            "majorityBaseline": float(majority_baseline(labels)),
            "foldAucMean": float(np.mean(fold_values)),
            "foldAucSd": float(np.std(fold_values, ddof=1)),
        }
    return block


def build_calibration_block(cv: dict, target_ids: list[str]) -> dict:
    block: dict[str, dict] = {}
    for target_id in target_ids:
        validation = cv[target_id]
        labels = validation.labels
        raw_curve = reliability_curve(validation.pooled_raw_prob, labels)
        platt_curve = reliability_curve(validation.pooled_prob, labels)
        base_rate = float(np.mean(labels))
        block[target_id] = {
            "brierRaw": float(brier_score(validation.pooled_raw_prob, labels)),
            "brierPlatt": float(brier_score(validation.pooled_prob, labels)),
            "baseRateBrier": float(
                brier_score(np.full(labels.size, base_rate, dtype=np.float64), labels)
            ),
            "eceRaw": float(ece_from_curve(raw_curve, int(labels.size))),
            "ecePlatt": float(ece_from_curve(platt_curve, int(labels.size))),
            "reliabilityCurve": {"raw": raw_curve, "platt": platt_curve},
        }
    return block


def build_subgroup_block(prepared, cv: dict, target_ids: list[str]) -> list[dict]:
    rows: list[dict] = []
    for target_index, target_id in enumerate(target_ids):
        validation = cv[target_id]
        for group_index, group_id in enumerate(SUBGROUP_IDS):
            mask = prepared.subgroup_masks[group_id]
            labels = validation.labels[mask]
            probabilities = validation.pooled_prob[mask]
            n = int(np.sum(mask))
            if n <= 0:
                raise PipelineError(f"subgroup {group_id} has no rows for {target_id}")
            auc = roc_auc(probabilities, labels)
            interval = bootstrap_auc_ci(
                probabilities,
                labels,
                seed=bootstrap_subgroup_seed(target_index, group_index),
            )
            caveat = (
                f"small subgroup (n={n} < {SMALL_SUBGROUP_MAX}); wide uncertainty"
                if n < SMALL_SUBGROUP_MAX
                else None
            )
            rows.append(
                {
                    "targetId": target_id,
                    "groupId": group_id,
                    "n": n,
                    "rocAuc": float(auc),
                    "rocAucCI": interval,
                    "caveat": caveat,
                }
            )
    return rows


def build_ladder_block(cv: dict, stages: list[dict], target_ids: list[str]) -> dict:
    stage_rows: list[dict] = []
    for stage_index, stage in enumerate(stages):
        targets: dict[str, dict] = {}
        for target_index, target_id in enumerate(target_ids):
            validation = cv[target_id]
            scores = validation.pooled_ladder[:, stage_index]
            labels = validation.labels
            auc = roc_auc(scores, labels)
            interval = bootstrap_auc_ci(
                scores, labels, seed=bootstrap_ladder_seed(target_index, stage_index)
            )
            targets[target_id] = {
                "rocAuc": float(auc),
                "rocAucCI": interval,
                "n": int(labels.size),
            }
        stage_rows.append(
            {
                "stageId": stage["id"],
                "order": int(stage["order"]),
                "modalitiesThrough": list(stage["modalitiesThrough"]),
                "targets": targets,
            }
        )
    return {
        "stageSemantics": STAGE_SEMANTICS,
        "provenance": LADDER_PROVENANCE,
        "stages": stage_rows,
    }


def build_provenance_block() -> dict:
    return {
        "dataSha256": _data_sha256(),
        "seedSet": {
            "base": BASE_SEED,
            "derived": {
                "outerCv": BASE_SEED,
                "innerFoldSeedBase": BASE_SEED + 1,
                "foldXgbSeedBase": 5000 + BASE_SEED,
                "deployedXgbSeedBase": 5000 + BASE_SEED + 60,
                "foldBackgroundSeedBase": 6000 + BASE_SEED,
                "deployedBackgroundSeed": deployed_background_seed(),
                "bootstrapPerformanceSeedBase": 8000 + BASE_SEED,
                "bootstrapSubgroupSeedBase": 8100 + BASE_SEED,
                "bootstrapLadderSeedBase": 8200 + BASE_SEED,
            },
        },
        "sourceRevision": _source_revision(),
        "toolVersions": _tool_versions(),
        "notes": list(PROVENANCE_NOTES),
    }


def _run_leakage_lab_if_available() -> dict | None:
    """Frozen cross-unit interface: only reproduce.py imports the leakage lab."""
    import importlib
    import importlib.util

    spec = importlib.util.find_spec("pipeline.leakage_lab")
    if spec is None:
        return None
    leakage_lab = importlib.import_module("pipeline.leakage_lab")
    runner = getattr(leakage_lab, "run_leakage_lab", None)
    if not callable(runner):
        raise PipelineError("pipeline.leakage_lab exists but has no run_leakage_lab(df, seed)")
    df = load_dataset()
    lab = runner(df, seed=BASE_SEED)
    if not isinstance(lab, dict):
        raise PipelineError("run_leakage_lab must return a dict for results.leakageLab")
    return lab


def assemble_results(
    *,
    protocol: dict,
    performance: dict,
    calibration: dict,
    decisions: dict,
    subgroups: list[dict],
    evidence_ladder: dict,
    reliability: dict,
    provenance: dict,
) -> dict:
    """Assemble the C-04 document; the leakage lab is imported only after fitting."""
    results: dict[str, object] = {
        "schemaVersion": SCHEMA_VERSION,
        "protocol": protocol,
        "performance": performance,
        "calibration": calibration,
        "decisions": decisions,
        "subgroups": subgroups,
        "evidenceLadder": evidence_ladder,
        "reliability": reliability,
        "provenance": provenance,
    }
    lab = _run_leakage_lab_if_available()
    if lab is None:
        print(
            "WARNING: pipeline.leakage_lab is not available yet — results.json is "
            "written WITHOUT leakageLab. Development only: leakageLab is mandatory at "
            "gate G2.",
            file=sys.stderr,
        )
    else:
        results["leakageLab"] = lab
    return results


def write_results(results: dict) -> str:
    """Write canonical results.json; returns its sha256 hex digest."""
    payload = _jsonable(results)
    text = json.dumps(payload, sort_keys=True, indent=2, allow_nan=False) + "\n"
    RESULTS_PATH.parent.mkdir(parents=True, exist_ok=True)
    RESULTS_PATH.write_text(text, encoding="utf-8", newline="\n")
    digest = hashlib.sha256(text.encode("utf-8")).hexdigest()
    return digest


def save_deployed(payload: dict) -> str:
    """Write the build-only deployed model candidate; returns its sha256."""
    import joblib

    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(payload, DEPLOYED_MODEL_PATH)
    digest = hashlib.sha256(DEPLOYED_MODEL_PATH.read_bytes()).hexdigest()
    return digest


def build_joblib_payload(
    prepared, deployed: dict, platt: dict, decisions: dict, reliability: dict, background: np.ndarray
) -> dict:
    targets_payload: dict[str, dict] = {}
    for target_id in prepared.labels:
        xgb_model, lr_model = deployed[target_id]
        decision_block = decisions[target_id]
        targets_payload[target_id] = {
            "xgb": xgb_model,
            "lr": lr_model,
            "platt": {
                "slope": float(platt[target_id]["slope"]),
                "intercept": float(platt[target_id]["intercept"]),
            },
            "decisionParameters": {
                "thresholdProbability": float(decision_block["selectedThreshold"]),
                "abstentionHalfWidthMargin": float(
                    decision_block["abstention"]["selectedHalfWidthMargin"]
                ),
                "thresholdSelection": {
                    "method": THRESHOLD_METHOD,
                    "source": THRESHOLD_SOURCE,
                },
            },
            "reliability": {
                "targetId": target_id,
                "tier": reliability["targets"][target_id]["tier"],
                "ruleId": RULE_ID,
                "evidenceRef": f"results.reliability.targets.{target_id}",
            },
        }
    return {
        "schemaVersion": SCHEMA_VERSION,
        "baseSeed": BASE_SEED,
        "featureOrder": list(prepared.feature_order),
        "targets": targets_payload,
        "background": {
            "rowIndices": [int(index) for index in background],
            "seed": deployed_background_seed(),
        },
    }


def print_summary(results: dict, results_sha: str, model_sha: str, wall_seconds: float) -> None:
    protocol = results["protocol"]
    print(
        f"CorTwin reproduce | {protocol['patientCount']} patients | "
        f"{protocol['featureCount']} features | outer {protocol['outerFolds']}x"
        f"{protocol['outerRepeats']} / inner {protocol['innerFolds']} | "
        f"base seed {BASE_SEED}"
    )
    header = (
        f"{'target':<7}{'auc':>6} {'95% ci':>18}{'acc':>7}{'prec':>7}"
        f"{'rec':>7}{'f1':>7}{'brier':>14}{'maj':>7}  tier"
    )
    print(header)
    for target_id in sorted(results["performance"]):
        perf = results["performance"][target_id]
        calib = results["calibration"][target_id]
        tier = results["reliability"]["targets"][target_id]["tier"]
        interval = perf["rocAucCI"]
        print(
            f"{target_id:<7}{perf['rocAuc']:>6.3f} "
            f"[{interval[0]:>6.3f},{interval[1]:>6.3f}]"
            f"{perf['accuracy']:>7.3f}{perf['precision']:>7.3f}"
            f"{perf['recall']:>7.3f}{perf['f1']:>7.3f}"
            f"{calib['brierRaw']:>6.3f}>{calib['brierPlatt']:<6.3f}"
            f"{perf['majorityBaseline']:>7.3f}  {tier}"
        )
    print("ladder pooled AUC by stage (CAD / LAD / LCX / RCA):")
    for stage in results["evidenceLadder"]["stages"]:
        cells = " ".join(
            f"{stage['targets'][target_id]['rocAuc']:.3f}"
            for target_id in sorted(stage["targets"])
        )
        print(f"  {stage['stageId']:<8}{cells}")
    leakage_state = "included" if "leakageLab" in results else "OMITTED (module unavailable)"
    print(f"leakageLab: {leakage_state}")
    print(f"results.json          sha256 {results_sha}")
    print(f"deployed_model.joblib sha256 {model_sha}")
    print(f"wall time {wall_seconds:.1f} s")


def main() -> int:
    started = time.perf_counter()
    prepared = prepare_dataset()
    stages = registry_stages()
    cv = run_nested_cv(prepared, stages)
    target_ids = list(prepared.labels)
    deployed: dict[str, tuple] = {}
    platt: dict[str, dict] = {}
    for target_index, target_id in enumerate(target_ids):
        xgb_model, lr_model = fit_ensemble(
            prepared.X, prepared.labels[target_id], deployed_xgb_seed(target_index)
        )
        deployed[target_id] = (xgb_model, lr_model)
        platt[target_id] = fit_platt(
            cv[target_id].pooled_margin, prepared.labels[target_id]
        )
    decisions = {
        target_id: decision_evidence(cv[target_id], platt[target_id])
        for target_id in target_ids
    }
    protocol = build_protocol_block(prepared)
    performance = build_performance_block(cv, decisions, target_ids)
    calibration = build_calibration_block(cv, target_ids)
    reliability = {"rule": rule_document(), "targets": reliability_targets(performance)}
    subgroups = build_subgroup_block(prepared, cv, target_ids)
    evidence_ladder = build_ladder_block(cv, stages, target_ids)
    provenance = build_provenance_block()
    background = sample_background(prepared.n_patients)
    payload = build_joblib_payload(
        prepared, deployed, platt, decisions, reliability, background
    )
    results = assemble_results(
        protocol=protocol,
        performance=performance,
        calibration=calibration,
        decisions=decisions,
        subgroups=subgroups,
        evidence_ladder=evidence_ladder,
        reliability=reliability,
        provenance=provenance,
    )
    results_sha = write_results(results)
    model_sha = save_deployed(payload)
    wall_seconds = time.perf_counter() - started
    print_summary(results, results_sha, model_sha, wall_seconds)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
