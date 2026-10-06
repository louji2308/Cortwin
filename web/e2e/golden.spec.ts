import { expect, test } from "@playwright/test";
import type { BrowserContext, Locator, Page, Request } from "@playwright/test";
import { PROHIBITED_RESOURCE_TYPES, isSameOriginUrl, settle } from "./support";
import {
  assertDisplayedProbabilitiesChanged,
  assertExactlyOne,
  expectSafetyBanner,
  installGoldenTrace,
  parseProbabilitySnapshot,
  readGoldenTrace,
  readProbabilityGroup,
  type GoldenTrace,
  type ProbabilityProbe,
  type ProbabilitySnapshot
} from "./golden-helpers";

/**
 * P6-E2E — the CorTwin golden path, executed in a real browser against the
 * production build (`vite preview`), with NO route/network mocking and NO
 * hardcoded probability: every number this spec asserts on is parsed out of
 * the DOM after a real worker evaluation.
 *
 * Judge journey covered (AGENTS §6.5):
 *   boot → default case truth (zero clicks) → deep links + garbage hash + back
 *   → vessel selection → explanation → profile edit → NEW probability
 *   → inspector Why/Measurements → modality withheld → evidence rail mount
 *   + chip mask + custom-subset warning → privacy/console audit.
 *
 * Hard assertions: designed loading state rendered · no error screen ·
 * complete C-12 readout structure · banner on every stop (INV-12) ·
 * revision increments (C-09) · displayed probability changes (real inference)
 * · Evidence Rail mounted with chip-driven masking (C-09/C-02, Contracts 8.4)
 * · zero console/page errors · same-origin-only traffic (C-15) · worker or
 * artifact fetch proof of a real compute path.
 */

const VESSEL_IDS = ["LAD", "LCX", "RCA"] as const;

const REQUIRED_ARTIFACTS = ["registry.json", "model.json", "results.json", "cases.json"];

type SeenRequest = { url: string; method: string; resourceType: string };

test.describe("P6-E2E golden path", () => {
  test("judge journey: boot → default truth → deep links → vessel → edit → inspector → privacy", async ({
    page,
    context,
    baseURL
  }) => {
    test.setTimeout(180_000);
    expect(baseURL, "playwright baseURL must be configured").toBeTruthy();
    const origin = new URL(baseURL as string).origin;

    /* ---- collectors, installed before any navigation ---- */
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const failedRequests: string[] = [];
    const websockets: string[] = [];
    const seen = new Map<string, SeenRequest>();
    const workerUrls: string[] = [];

    const record = (request: Request): void => {
      const key = `${request.method()} ${request.url()}`;
      if (seen.has(key)) return;
      seen.set(key, {
        url: request.url(),
        method: request.method(),
        resourceType: request.resourceType()
      });
      if (request.resourceType() === "worker") workerUrls.push(request.url());
    };

    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => pageErrors.push(String(error)));
    page.on("requestfailed", (request) => {
      failedRequests.push(`${request.url()} :: ${request.failure()?.errorText ?? "unknown"}`);
    });
    page.on("websocket", (socket) => websockets.push(socket.url()));
    context.on("request", record);
    page.on("request", record);

    const bannerStops: string[] = [];
    const banner = async (where: string): Promise<void> => {
      await expectSafetyBanner(page, where);
      bannerStops.push(where);
    };

    await installGoldenTrace(page);

    /* ================= 1. BOOT ================= */
    const navigation = await page.goto("/", { waitUntil: "load" });
    expect(navigation, "navigation must return a response").toBeTruthy();
    expect(navigation?.status(), "document must load with HTTP 200").toBe(200);

    const shell = page.locator('[data-testid="shell-root"]');
    const explore = page.locator('[data-testid="explore"]');
    const inspector = page.locator("section.ct-ins");
    const form = page.locator('[data-testid="profile-form"]');
    const headlineGroup = page.locator(
      '[data-testid="headline-readout"] [role="group"][data-target-id="CAD"]'
    );
    const vesselGroup = (id: string): Locator =>
      page.locator(
        `[aria-label="Vessel probabilities"] > button[data-target-id="${id}"] [role="group"]`
      );
    const vesselCards = page.locator('[aria-label="Vessel probabilities"] > button[data-target-id]');

    await expect(shell).toHaveAttribute("data-boot-phase", "ready", { timeout: 30_000 });
    await expect(shell).toHaveAttribute("data-view", "explore");
    await expect(page.locator('[data-testid="boot-failure"]'), "no boot failure screen").toHaveCount(
      0
    );
    await expect(page.locator('[data-testid="explore-failed"]'), "no bundle error screen").toHaveCount(
      0
    );
    await expect(page.locator('[data-testid="eval-error"]'), "no evaluation error screen").toHaveCount(
      0
    );
    await expect(
      page.locator('[data-testid="intent-error"]'),
      "no intent error screen"
    ).toHaveCount(0);
    await banner("load /");

    /* ================= 2. DEFAULT CASE TRUTH, ZERO INTERACTIONS ================= */
    await expect(explore).toHaveAttribute("data-eval-status", "ready", { timeout: 30_000 });
    await expect(headlineGroup, "the first real readout must be on screen").toBeVisible({
      timeout: 20_000
    });
    await settle(page, 700);

    const headlineBoot = await readProbabilityGroup(headlineGroup);
    expect(headlineBoot.targetId, "headline readout must be the CAD target").toBe("CAD");
    await expect(page.locator('[data-testid="readout-skeleton"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="awaiting-eval"]')).toHaveCount(0);

    await expect(vesselCards, "three separately selectable vessel cards").toHaveCount(3);
    for (const id of VESSEL_IDS) {
      await expect(vesselGroup(id), `${id} readout must be visible without interaction`).toBeVisible();
    }

    const revisionBoot = Number(await form.getAttribute("data-revision"));
    expect(Number.isFinite(revisionBoot), "profile revision must be readable").toBe(true);
    expect(revisionBoot, "the default case must be applied at boot (revision >= 1)").toBeGreaterThan(
      0
    );
    await expect(form, "profile form must carry the evaluation status").toHaveAttribute(
      "data-eval-status",
      "ready"
    );
    // Boot deep-links into the default target (registry.targets[0] = CAD), so
    // the inspector opens at target depth — not case depth.
    await expect(inspector, "inspector opens on the default target").toHaveAttribute(
      "data-inspector-depth",
      "target"
    );
    await expect(inspector.locator('[aria-current="page"]')).toHaveText("CAD");
    await expect(inspector.locator('[data-view="why"]'), "default target explanation").toBeVisible({
      timeout: 20_000
    });

    const bootTrace = await readGoldenTrace(page);
    expect(bootTrace.loadingSeen, "boot must render its designed loading screen").toBeGreaterThan(0);
    expect(bootTrace.headlineSeenAt, "the first real headline readout must appear").toBeGreaterThan(
      0
    );
    console.log(
      `[golden] step2 headline: value=${headlineBoot.valueText} ${headlineBoot.thresholdText} ` +
        `decision=${headlineBoot.decision} reliability=${headlineBoot.reliability} ` +
        `fill=${headlineBoot.fillStyle} revision=${revisionBoot} trace=${JSON.stringify(bootTrace)}`
    );

    /* ================= 3. DEEP LINKS / GARBAGE HASH / BACK ================= */
    await page.goto("/#/trust/performance");
    await expect(page.locator('[data-testid="trust-view"]')).toHaveAttribute(
      "data-pane",
      "performance"
    );
    await banner("deep link #/trust/performance");

    await page.goto("/#/system/requirements");
    await expect(page.locator('[data-testid="system-view"]')).toHaveAttribute(
      "data-pane",
      "requirements"
    );
    await banner("deep link #/system/requirements");

    await page.goto("/#/nowhere");
    await expect(shell, "an unknown route lands on the default view").toHaveAttribute(
      "data-view",
      "explore"
    );
    const notices = page.locator('[data-testid="shell-notices"]');
    await expect(notices, "a garbage hash must show a designed notice").toBeVisible();
    await expect(notices).toContainText("the default view was shown instead");
    await banner("garbage hash #/nowhere");

    await page.goBack();
    await expect(page.locator('[data-testid="system-view"]'), "browser back must restore").toHaveAttribute(
      "data-pane",
      "requirements"
    );
    await banner("browser back -> #/system/requirements");

    await page.goto("/#/explore");
    await expect(shell).toHaveAttribute("data-view", "explore");
    await expect(headlineGroup, "returning to Explore keeps the real readout").toBeVisible();
    await banner("back to #/explore");

    /* ================= 4. VESSEL SELECTION → EXPLANATION ================= */
    const ladCard = page.locator('[aria-label="Vessel probabilities"] > button[data-target-id="LAD"]');
    await ladCard.click();
    await expect(ladCard, "clicked vessel card must be marked selected").toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await expect(ladCard).toHaveAttribute("data-selected", "true");
    await expect(inspector, "inspector depth switches to the selected target").toHaveAttribute(
      "data-inspector-depth",
      "target"
    );
    await expect(inspector.locator('[aria-current="page"]'), "inspector crumb names the target").toHaveText(
      "LAD"
    );

    const whyView = page.locator('[data-view="why"]');
    await expect(whyView, "the Why view must render for the selection").toBeVisible({
      timeout: 20_000
    });
    await expect(whyView.locator("li.ct-ins-attr-row"), "Why must carry attribution rows").not.toHaveCount(
      0
    );
    await expect(whyView.locator('[data-margin="reference"]')).toBeVisible();
    await expect(whyView.locator('[data-margin="output"]')).toBeVisible();
    console.log(
      `[golden] step4 LAD selected: inspectorDepth=target whyRows=${await whyView.locator("li.ct-ins-attr-row").count()}`
    );

    /* ================= 5. INSPECTOR TABS ================= */
    await page.getByRole("tab", { name: "Measurements", exact: true }).click();
    const measurementsView = page.locator('[data-view="measurements"]');
    await expect(measurementsView).toBeVisible();
    const measurementRows = measurementsView.locator("tr[data-feature-id]");
    expect(await measurementRows.count(), "measurements must show real feature rows").toBeGreaterThan(
      0
    );
    expect(
      await measurementsView.locator('tr[data-observed="yes"]').count(),
      "measurements must show observed rows"
    ).toBeGreaterThan(0);
    console.log(`[golden] step5 measurements rows=${await measurementRows.count()}`);

    await page.getByRole("tab", { name: "Why", exact: true }).click();
    await expect(whyView).toBeVisible();

    /* ================= 6. EDIT LOOP — THE MONEY SHOT ================= */
    const ageInput = page.locator('[data-feature-id="Age"] input[data-role="value-input"]');
    await expect(ageInput).toBeVisible();

    const headlineBefore = await readProbabilityGroup(headlineGroup);
    const vesselBefore: Record<string, ProbabilitySnapshot> = {};
    for (const id of VESSEL_IDS) vesselBefore[id] = await readProbabilityGroup(vesselGroup(id));
    const revisionBefore = Number(await form.getAttribute("data-revision"));

    const ageCurrent = await ageInput.inputValue();
    const attempts = [86, 30].filter((age) => String(age) !== ageCurrent);
    expect(attempts.length, "at least one in-range extreme must be available").toBeGreaterThan(0);

    const attemptLog: Array<{ age: string; revision: number; headline: string }> = [];
    let headlineAfter = headlineBefore;
    for (const age of attempts) {
      const revisionNow = Number(await form.getAttribute("data-revision"));
      await ageInput.fill(String(age));
      await expect
        .poll(() => form.getAttribute("data-revision").then((value) => Number(value)), {
          message: `editing Age to ${age} must increment the case revision (C-09)`,
          timeout: 10_000
        })
        .toBeGreaterThan(revisionNow);
      await expect(explore, "evaluation must settle back to ready").toHaveAttribute(
        "data-eval-status",
        "ready",
        { timeout: 20_000 }
      );
      await settle(page, 700);
      headlineAfter = await readProbabilityGroup(headlineGroup);
      attemptLog.push({
        age: String(age),
        revision: Number(await form.getAttribute("data-revision")),
        headline: headlineAfter.valueText
      });
      if (
        headlineAfter.valueText !== headlineBefore.valueText ||
        headlineAfter.fillStyle !== headlineBefore.fillStyle
      ) {
        break;
      }
    }

    expect(await ageInput.inputValue(), "the edited value must be the value on screen").toBe(
      attemptLog[attemptLog.length - 1].age
    );
    expect(
      Number(await form.getAttribute("data-revision")),
      "the edit must leave the revision higher than before"
    ).toBeGreaterThan(revisionBefore);

    const vesselAfter: Record<string, ProbabilitySnapshot> = {};
    for (const id of VESSEL_IDS) vesselAfter[id] = await readProbabilityGroup(vesselGroup(id));

    const probes: ProbabilityProbe[] = [
      { key: "CAD(headline)", before: headlineBefore.valueText, after: headlineAfter.valueText },
      ...VESSEL_IDS.map((id) => ({
        key: id,
        before: vesselBefore[id].valueText,
        after: vesselAfter[id].valueText
      }))
    ];
    const fillChanged = headlineAfter.fillStyle !== headlineBefore.fillStyle;
    assertDisplayedProbabilitiesChanged(probes, fillChanged, "profile Age edit");

    const editTrace = await readGoldenTrace(page);
    console.log(
      `[golden] step6 edit proof: before=${headlineBefore.valueText} after=${headlineAfter.valueText} ` +
        `fill ${headlineBefore.fillStyle} -> ${headlineAfter.fillStyle} attempts=${JSON.stringify(
          attemptLog
        )} probes=${JSON.stringify(probes)}`
    );
    console.log(
      `[golden] step6 updating affordance observed: staleNotice=${editTrace.staleNoticeSeen} updatingStatus=${editTrace.updatingStatusSeen}`
    );

    /* ================= 9a. WITHHELD MODALITY — not-provided state ================= */
    const ecgSection = page.locator('section[data-modality-id="ecg"]');
    await expect(ecgSection).toHaveAttribute("data-provided", "true");
    const revisionBeforeWithhold = Number(await form.getAttribute("data-revision"));
    await ecgSection.locator('input[data-role="modality-provide"]').check();
    await expect
      .poll(() => form.getAttribute("data-revision").then((value) => Number(value)), {
        message: "withholding a modality must increment the case revision (C-09)",
        timeout: 10_000
      })
      .toBeGreaterThan(revisionBeforeWithhold);
    await expect(ecgSection, "the withheld section must read as withheld").toHaveAttribute(
      "data-provided",
      "false"
    );
    const dashed = await ecgSection.evaluate((section) => {
      const field = section.querySelector(".ct-field");
      return field === null ? "missing" : window.getComputedStyle(field).borderStyle;
    });
    expect(dashed, "withheld fields must switch to the dashed withheld style").toBe("dashed");
    await expect(explore).toHaveAttribute("data-eval-status", "ready", { timeout: 20_000 });
    await settle(page, 700);

    await page.getByRole("tab", { name: "Measurements", exact: true }).click();
    const ecgGroup = page.locator('tbody[data-modality="ecg"]');
    await expect(ecgGroup).toHaveAttribute("data-provided", "no", { timeout: 20_000 });
    await expect(ecgGroup).toContainText(/not provided/i);
    expect(
      await ecgGroup.locator('tr[data-feature-id][data-observed="no"]').count(),
      "every withheld feature row must be marked not observed"
    ).toBeGreaterThan(0);

    await page.getByRole("tab", { name: "Why", exact: true }).click();
    const ecgRow = page.locator('li[data-attribution-key="ecg"]');
    await expect(ecgRow).toHaveAttribute("data-observed", "no", { timeout: 20_000 });
    await expect(ecgRow).toContainText(/not provided/i);
    expect(
      await ecgRow.locator(".ct-ins-bar--none").count(),
      "the withheld attribution row must render the hatched (not provided) bar"
    ).toBeGreaterThan(0);

    await page.locator(".ct-ins-crumb button").click();
    await expect(inspector).toHaveAttribute("data-inspector-depth", "case");
    await expect(page.locator('li[data-modality="ecg"][data-provided="no"]')).toContainText(
      /not provided/i
    );
    await banner("explore after withholding ECG");
    console.log(
      `[golden] step9 ECG withheld: section dashed=${dashed} measurementRowsNotObserved=true hatchedBar=true`
    );

    /* ================= 9b. EVIDENCE RAIL — mounted under the stage ================= */
    const rail = page.locator('[data-testid="evidence-rail"]');
    await expect(rail, "the Evidence Rail must be mounted in the Explore workspace").toHaveCount(1);
    await expect(rail).toBeVisible();
    await expect(page.locator('[data-testid="evidence-caveat"]')).toBeVisible();
    await expect(
      page.locator('[data-testid="custom-subset-warning"]'),
      "the off-ladder subset from step 9a must surface the L389 warning"
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="no-stage-selected"]'),
      "the designed empty state before any stage is selected"
    ).toBeVisible();
    await expect(page.locator('[data-testid="build-up-button"]')).toHaveAttribute(
      "data-state",
      "idle"
    );
    await expect(page.locator('[data-testid^="stage-chip-"]')).toHaveCount(5);

    // A chip re-masks the case through Profile's own intent (Contracts 8.4 L386).
    const revisionBeforeChip = Number(await form.getAttribute("data-revision"));
    await page.locator('[data-testid="stage-chip-ecg"]').click();
    await expect
      .poll(() => form.getAttribute("data-revision").then((value) => Number(value)), {
        message: "selecting a stage must re-mask the case (C-09 revision)",
        timeout: 10_000
      })
      .toBeGreaterThan(revisionBeforeChip);
    await expect(page.locator('[data-testid="stage-chip-ecg"]')).toHaveAttribute(
      "aria-current",
      "step"
    );
    await expect(page.locator('[data-testid="stage-panel"]')).toBeVisible();
    expect(
      await page.locator('[data-testid="stage-panel"] li.ct-ev-mod').count(),
      "the selected stage must list exactly its cumulative modalities"
    ).toBe(3);
    // Profile and rail read the same case truth in the same render.
    await expect(page.locator('section[data-modality-id="ecg"]')).toHaveAttribute(
      "data-provided",
      "true"
    );
    await expect(page.locator('section[data-modality-id="labs"]')).toHaveAttribute(
      "data-provided",
      "false"
    );
    await expect(page.locator('section[data-modality-id="echo"]')).toHaveAttribute(
      "data-provided",
      "false"
    );
    const railRowEcg = page
      .locator('[data-testid="stage-panel"] li.ct-ev-mod')
      .filter({ hasText: "ECG" });
    await expect(railRowEcg, "the rail ECG row must read provided after the chip mask").toHaveAttribute(
      "data-provided",
      "yes"
    );
    await expect(explore).toHaveAttribute("data-eval-status", "ready", { timeout: 20_000 });
    await settle(page, 700);

    // Withholding again from the Profile: the rail row flips live, the
    // custom-subset warning stays visible until a reset (Contracts 8.4 L389).
    const revisionBeforeReWithhold = Number(await form.getAttribute("data-revision"));
    await ecgSection.locator('input[data-role="modality-provide"]').check();
    await expect
      .poll(() => form.getAttribute("data-revision").then((value) => Number(value)), {
        message: "re-withholding ECG must increment the case revision (C-09)",
        timeout: 10_000
      })
      .toBeGreaterThan(revisionBeforeReWithhold);
    await expect(railRowEcg, "the rail row must follow the case's withheld state").toHaveAttribute(
      "data-provided",
      "no"
    );
    await expect(
      page.locator('[data-testid="custom-subset-warning"]'),
      "the custom-subset warning stays visible until a reset (Contracts 8.4 L389)"
    ).toBeVisible();
    await expect(explore).toHaveAttribute("data-eval-status", "ready", { timeout: 20_000 });
    await settle(page, 700);
    await banner("explore evidence rail");
    console.log(
      `[golden] step9b evidence rail: mounted=true chips=5 panelRows=3 warningStayed=true rowEcgAfterWithhold=no`
    );

    /* ================= 7/8. TRANSPORT, PRIVACY AND CONSOLE AUDIT ================= */
    const requests = [...seen.values()];
    const crossOrigin = requests.filter((entry) => !isSameOriginUrl(entry.url, origin));
    const prohibitedTypes = requests.filter((entry) =>
      PROHIBITED_RESOURCE_TYPES.has(entry.resourceType)
    );
    const nonGet = requests.filter(
      (entry) => entry.method !== "GET" && entry.method !== "HEAD"
    );
    const urls = requests.map((entry) => entry.url);
    const artifactsSeen = REQUIRED_ARTIFACTS.filter((name) =>
      urls.some((url) => url.endsWith(`/${name}`))
    );
    const workersFromPage = page.workers().length;

    const evidenceRail = await page.locator('[data-testid*="evidence"]').count();
    expect(evidenceRail, "the Evidence Rail must be mounted (judge-visible mount)").toBeGreaterThan(
      0
    );

    const report = {
      origin,
      bannerStops,
      bootTrace,
      headlineBoot,
      edit: { probes, fillChanged, attemptLog, editTrace },
      withheldModality: { dashed },
      network: {
        total: requests.length,
        crossOrigin,
        prohibitedTypes,
        nonGet,
        websockets,
        failedRequests,
        workerUrls,
        workersFromPage,
        artifactsSeen
      },
      consoleErrors,
      pageErrors,
      evidenceRailMounted: evidenceRail
    };
    await test.info().attach("golden-path", {
      body: JSON.stringify(report, null, 2),
      contentType: "application/json"
    });

    console.log(
      `[golden] audit: requests=${requests.length} crossOrigin=${crossOrigin.length} ` +
        `prohibitedTypes=${prohibitedTypes.length} nonGet=${nonGet.length} websockets=${websockets.length} ` +
        `failed=${failedRequests.length} workers(page)=${workersFromPage} workerUrls=${workerUrls.length} ` +
        `artifacts=${artifactsSeen.join(",")} consoleErrors=${consoleErrors.length} ` +
        `pageErrors=${pageErrors.length} evidenceRailMounted=${evidenceRail}`
    );
    console.log(`[golden] banner stops (${bannerStops.length}): ${bannerStops.join(" | ")}`);
    for (const entry of requests) {
      console.log(`[golden]   ${entry.method} ${entry.resourceType} ${entry.url}`);
    }

    expect(bannerStops.length, "every stop in the journey asserted the safety banner").toBeGreaterThanOrEqual(
      7
    );
    expect(requests.length, "the audit must have observed real traffic").toBeGreaterThan(5);
    expect(crossOrigin, "C-15 Network: cross-origin request observed").toEqual([]);
    expect(prohibitedTypes, "C-15 Network: websocket/beacon/analytics-class request").toEqual([]);
    expect(nonGet, "C-15 Network: only same-origin static GET/HEAD").toEqual([]);
    expect(websockets, "C-15 Network: WebSocket connection opened").toEqual([]);
    expect(failedRequests, "zero failed network requests").toEqual([]);
    for (const artifact of REQUIRED_ARTIFACTS) {
      expect(
        artifactsSeen,
        `real inference must fetch the shipped artifact ${artifact} (no mocked bundle)`
      ).toContain(artifact);
    }
    expect(
      workersFromPage + workerUrls.length,
      "a real dedicated worker (or its script request) must exist — no mocked inference"
    ).toBeGreaterThan(0);

    expect(consoleErrors, "zero console errors across the whole journey").toEqual([]);
    expect(pageErrors, "zero unhandled page errors across the whole journey").toEqual([]);
  });

  test("golden helpers are falsifiable (mutation checks)", () => {
    const complete = [
      "CAD",
      "62%",
      "Threshold 50% · at or above threshold",
      "▲ Decision: above",
      "●●● Reliability: strong"
    ].join("\n");

    const snapshot = parseProbabilitySnapshot({
      targetId: "CAD",
      text: complete,
      decision: "above",
      reliability: "strong",
      fillStyle: "width: 62%; background-color: rgb(0,0,0)"
    });
    expect(snapshot.valueText).toBe("62%");
    expect(snapshot.thresholdText).toBe("Threshold 50%");
    expect(snapshot.decision).toBe("above");
    expect(snapshot.reliability).toBe("strong");

    // MUTATION A: identical before/after must throw (the edit gate cannot pass
    // when the displayed probability did not actually change).
    expect(() =>
      assertDisplayedProbabilitiesChanged(
        [{ key: "CAD(headline)", before: "62%", after: "62%" }],
        false,
        "mutation A"
      )
    ).toThrow(/did not change/);
    // ...and must pass when either the rounded value or the raw fill moved.
    expect(() =>
      assertDisplayedProbabilitiesChanged(
        [{ key: "CAD(headline)", before: "62%", after: "63%" }],
        false,
        "mutation A"
      )
    ).not.toThrow();
    expect(() =>
      assertDisplayedProbabilitiesChanged(
        [{ key: "CAD(headline)", before: "62%", after: "62%" }],
        true,
        "mutation A"
      )
    ).not.toThrow();

    // MUTATION B: an incomplete readout (value only) must be rejected — the
    // spec can never pass on a bare probability.
    expect(() =>
      parseProbabilitySnapshot({
        targetId: "CAD",
        text: "CAD\n62%",
        decision: "above",
        reliability: "strong",
        fillStyle: "width: 62%"
      })
    ).toThrow(/threshold/i);
    expect(() =>
      parseProbabilitySnapshot({
        targetId: "CAD",
        text: "CAD",
        decision: "above",
        reliability: "strong",
        fillStyle: null
      })
    ).toThrow(/value/i);
    // Attribute/text disagreement (stale or doctored markup) is rejected too.
    expect(() =>
      parseProbabilitySnapshot({
        targetId: "CAD",
        text: complete,
        decision: "below",
        reliability: "strong",
        fillStyle: "width: 62%"
      })
    ).toThrow(/disagrees/);

    // MUTATION C: a missing or duplicated banner must fail (no first() tolerance).
    expect(() => assertExactlyOne(0, "safety banner")).toThrow(/exactly 1/);
    expect(() => assertExactlyOne(2, "safety banner")).toThrow(/exactly 1/);
    expect(() => assertExactlyOne(1, "safety banner")).not.toThrow();
  });
});
