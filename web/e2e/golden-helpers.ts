import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import { SAFETY_BANNER_TEXT } from "../src/shell/copy";

/**
 * P6-E2E golden-path helpers (own file: no shared e2e file is modified).
 *
 * Everything here is *falsifiable by construction*:
 *  - `parseProbabilitySnapshot` refuses a readout that is missing ANY of the
 *    C-12 parts (value / threshold / decision / reliability), so a bare number
 *    can never satisfy the spec (INV-07, AGENTS §6.1);
 *  - `assertDisplayedProbabilitiesChanged` throws when the before/after probes
 *    are identical and the raw fill width did not move, so the edit-loop
 *    assertion cannot pass on a mocked or inert evaluator;
 *  - `assertExactlyOne` removes any `.first()` tolerance, so a missing banner
 *    (INV-12) fails loudly instead of silently passing.
 *
 * The safety banner text is imported from the single copy of record
 * (`src/shell/copy`) — the spec never rewords safety language (HD-02).
 */

export type ProbabilitySnapshot = {
  targetId: string | null;
  valueText: string;
  thresholdText: string;
  decision: string;
  reliability: string;
  fillStyle: string | null;
};

export type ProbabilityProbe = {
  key: string;
  before: string;
  after: string;
};

const DECISIONS: readonly string[] = ["above", "below", "indeterminate"];
const RELIABILITIES: readonly string[] = ["strong", "moderate", "limited"];

/**
 * Parse one rendered `ProbabilityReadout` group. Throws a typed message when
 * the structure is incomplete — the assertion is in the parser, so no caller
 * can skip it.
 */
export function parseProbabilitySnapshot(input: {
  targetId: string | null;
  text: string;
  decision: string | null;
  reliability: string | null;
  fillStyle: string | null;
}): ProbabilitySnapshot {
  const { targetId, text, decision, reliability, fillStyle } = input;

  const valueMatch = /^(\d{1,3})%$/m.exec(text);
  if (valueMatch === null) {
    throw new Error(
      `probability snapshot [${targetId}]: no "<value>%" line — a real probability value is required. text=${JSON.stringify(text)}`
    );
  }

  const thresholdMatch = /Threshold (\d{1,3})%/.exec(text);
  if (thresholdMatch === null) {
    throw new Error(
      `probability snapshot [${targetId}]: threshold line missing — value, threshold, decision and reliability must all render. text=${JSON.stringify(text)}`
    );
  }

  const decisionMatch = /Decision: (above|below|indeterminate)/.exec(text);
  if (decisionMatch === null) {
    throw new Error(
      `probability snapshot [${targetId}]: decision line missing. text=${JSON.stringify(text)}`
    );
  }

  const reliabilityMatch = /Reliability: (strong|moderate|limited)/.exec(text);
  if (reliabilityMatch === null) {
    throw new Error(
      `probability snapshot [${targetId}]: reliability (tier) line missing. text=${JSON.stringify(text)}`
    );
  }

  if (decision !== decisionMatch[1]) {
    throw new Error(
      `probability snapshot [${targetId}]: data-decision "${decision}" disagrees with rendered text "${decisionMatch[1]}"`
    );
  }
  if (reliability !== reliabilityMatch[1]) {
    throw new Error(
      `probability snapshot [${targetId}]: data-reliability "${reliability}" disagrees with rendered text "${reliabilityMatch[1]}"`
    );
  }
  if (fillStyle === null || !fillStyle.includes("width")) {
    throw new Error(
      `probability snapshot [${targetId}]: the probability bar fill is missing (no inline width) — incomplete readout. fillStyle=${JSON.stringify(fillStyle)}`
    );
  }

  return {
    targetId,
    valueText: `${valueMatch[1]}%`,
    thresholdText: `Threshold ${thresholdMatch[1]}%`,
    decision: decisionMatch[1],
    reliability: reliabilityMatch[1],
    fillStyle
  };
}

/**
 * The edit-loop gate: at least one displayed probability (headline or vessel)
 * must differ, OR the unrounded bar width must have moved. Equal probes with
 * an unchanged fill MUST throw — proven by the mutation test in golden.spec.
 */
export function assertDisplayedProbabilitiesChanged(
  probes: ProbabilityProbe[],
  fillChanged: boolean,
  context: string
): void {
  const changed = probes.filter((entry) => entry.before !== entry.after);
  if (changed.length === 0 && !fillChanged) {
    const detail = probes.map((entry) => `${entry.key}: "${entry.before}" -> "${entry.after}"`).join(" | ");
    throw new Error(
      `${context}: displayed probability did not change (${detail}; fillChanged=${fillChanged}) — real inference must change what the judge sees`
    );
  }
}

/** No `.first()` tolerance anywhere it matters. */
export function assertExactlyOne(count: number, what: string): void {
  if (count !== 1) {
    throw new Error(`${what}: expected exactly 1 element, found ${count}`);
  }
}

/** Read one `ProbabilityReadout` group from the DOM (no class-text assumptions). */
export async function readProbabilityGroup(group: Locator): Promise<ProbabilitySnapshot> {
  const text = await group.innerText();
  const targetId = await group.getAttribute("data-target-id");
  const decision = await group.getAttribute("data-decision");
  const reliability = await group.getAttribute("data-reliability");
  const fill = group.locator(".ct-prob-readout__fill");
  const fillStyle = (await fill.count()) > 0 ? await fill.getAttribute("style") : null;
  return parseProbabilitySnapshot({ targetId, text, decision, reliability, fillStyle });
}

/**
 * INV-12 banner check: exactly one banner, visible, carrying the contract
 * sentence verbatim (substring of the single copy of record).
 */
export async function expectSafetyBanner(page: Page, where: string): Promise<void> {
  const banner = page.locator('[data-testid="safety-banner"]');
  const count = await banner.count();
  assertExactlyOne(count, `safety banner at ${where}`);
  await expect(banner, `safety banner must be visible at ${where}`).toBeVisible();
  await expect(
    banner,
    `safety banner must carry the INV-12 contract text at ${where}`
  ).toContainText(SAFETY_BANNER_TEXT);
}

export type GoldenTrace = {
  loadingSeen: number;
  skeletonSeen: number;
  readoutSkeletonSeen: number;
  awaitingEvalSeen: number;
  staleNoticeSeen: number;
  updatingStatusSeen: number;
  errorScreenSeen: number;
  headlineSeenAt: number;
};

/**
 * Install a MutationObserver-based trace before any application script runs.
 *
 * The app's loading skeleton, "Updating…" affordance and first real headline
 * live for far less than a frame, so polling from the outside cannot see them.
 * This observer records that each designed state was *rendered*, which is the
 * thing the spec needs to prove — it observes, it never mutates.
 */
export async function installGoldenTrace(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const trace = {
      loadingSeen: 0,
      skeletonSeen: 0,
      readoutSkeletonSeen: 0,
      awaitingEvalSeen: 0,
      staleNoticeSeen: 0,
      updatingStatusSeen: 0,
      errorScreenSeen: 0,
      headlineSeenAt: 0
    };
    const target = window as unknown as Record<string, unknown>;
    target["__goldenTrace"] = trace;

    const scan = (): void => {
      if (document.querySelector('[data-testid="boot-loading"]') !== null) trace.loadingSeen += 1;
      if (document.querySelector('[data-testid="explore-skeleton"]') !== null) trace.skeletonSeen += 1;
      if (document.querySelector('[data-testid="readout-skeleton"]') !== null) {
        trace.readoutSkeletonSeen += 1;
      }
      if (document.querySelector('[data-testid="awaiting-eval"]') !== null) {
        trace.awaitingEvalSeen += 1;
      }
      if (document.querySelector('[data-testid="stale-notice"]') !== null) {
        trace.staleNoticeSeen += 1;
      }
      if (document.querySelector('[data-eval-status="updating"]') !== null) {
        trace.updatingStatusSeen += 1;
      }
      if (
        document.querySelector(
          '[data-testid="boot-failure"],[data-testid="explore-failed"],[data-testid="eval-error"],[data-testid="intent-error"]'
        ) !== null
      ) {
        trace.errorScreenSeen += 1;
      }
      if (
        trace.headlineSeenAt === 0 &&
        document.querySelector('[data-testid="headline-readout"] [data-target-id="CAD"]') !== null
      ) {
        trace.headlineSeenAt = Date.now();
      }
    };

    const observer = new MutationObserver(scan);
    let started = false;
    const start = (): void => {
      if (started || document.documentElement === null) return;
      started = true;
      observer.observe(document.documentElement, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ["data-eval-status", "data-boot-phase", "data-selected"]
      });
      scan();
    };
    start();
    document.addEventListener("DOMContentLoaded", start);
  });
}

export async function readGoldenTrace(page: Page): Promise<GoldenTrace> {
  const value = await page.evaluate(() => {
    const target = window as unknown as Record<string, unknown>;
    return target["__goldenTrace"] as GoldenTrace | undefined;
  });
  if (value === undefined) {
    throw new Error(
      "golden trace missing — installGoldenTrace(page) must run before page.goto()"
    );
  }
  return value;
}
