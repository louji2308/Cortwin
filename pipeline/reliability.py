"""RT-1 reliability evidence classification (C-03 reliability references, C-04).

RT-1 turns regenerated validation evidence into one of three tiers per target.
It is an *evidence classification* of the published protocol — never a
confidence interval, decision state or diagnostic claim — and the browser reads
the tier, it never recomputes it (INV-C12/C17).
"""

from __future__ import annotations

import math

from .errors import PipelineError

RULE_ID = "RT-1"
TIERS = ("strong", "moderate", "limited")
THRESHOLDS = {
    "strongCiLowMin": 0.90,
    "strongUpliftMin": 0.20,
    "moderateAucMin": 0.80,
    "moderateUpliftMin": 0.15,
}
RATIONALE_CODES = {
    "strong": "ci_low_at_least_0.90_and_uplift_at_least_0.20",
    "moderate": "auc_at_least_0.80_and_uplift_at_least_0.15",
    "limited": "below_moderate_criteria",
}
DESCRIPTION = (
    "RT-1 classifies pooled out-of-fold validation evidence per target: strong when "
    "the 95% CI lower bound of ROC-AUC is at least 0.90 and the uplift over the "
    "majority-class baseline is at least 0.20; moderate when ROC-AUC is at least 0.80 "
    "and uplift is at least 0.15; otherwise limited. It is an evidence classification "
    "under the published protocol, not a confidence statement, decision state or "
    "diagnostic claim."
)


def classify(auc: float, ci_low: float, majority_baseline: float) -> str:
    """Apply the RT-1 rule to one target's pooled evidence."""
    values = [float(auc), float(ci_low), float(majority_baseline)]
    if not all(math.isfinite(value) for value in values):
        raise PipelineError("RT-1 received non-finite evidence")
    uplift = float(auc) - float(majority_baseline)
    if float(ci_low) >= THRESHOLDS["strongCiLowMin"] and uplift >= THRESHOLDS["strongUpliftMin"]:
        return "strong"
    if float(auc) >= THRESHOLDS["moderateAucMin"] and uplift >= THRESHOLDS["moderateUpliftMin"]:
        return "moderate"
    return "limited"


def rule_document() -> dict:
    """The ``results.reliability.rule`` block."""
    return {
        "ruleId": RULE_ID,
        "description": DESCRIPTION,
        "thresholds": {key: float(value) for key, value in THRESHOLDS.items()},
    }


def reliability_targets(performance: dict) -> dict:
    """Per-target ``{tier, rationaleCode, evidenceRefs}`` from measured performance."""
    targets: dict[str, dict] = {}
    for target_id in sorted(performance):
        block = performance[target_id]
        try:
            auc = float(block["rocAuc"])
            ci_low = float(block["rocAucCI"][0])
            baseline = float(block["majorityBaseline"])
        except (KeyError, TypeError, IndexError) as exc:
            raise PipelineError(f"RT-1 cannot read performance for {target_id}") from exc
        tier = classify(auc, ci_low, baseline)
        if tier not in TIERS:
            raise PipelineError(f"RT-1 produced an unknown tier for {target_id}")
        targets[target_id] = {
            "tier": tier,
            "rationaleCode": RATIONALE_CODES[tier],
            "evidenceRefs": [
                f"results.performance.{target_id}.rocAuc",
                f"results.performance.{target_id}.rocAucCI",
                f"results.performance.{target_id}.majorityBaseline",
            ],
        }
    return targets
