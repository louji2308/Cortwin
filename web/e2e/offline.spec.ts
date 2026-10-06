import { expect, test } from "@playwright/test";
import { PROHIBITED_RESOURCE_TYPES, isSameOriginUrl, settle, storageSnapshot } from "./support";
import type { StorageSnapshot } from "./support";
import {
  assertDisplayedProbabilitiesChanged,
  expectSafetyBanner,
  readProbabilityGroup,
  type ProbabilityProbe,
  type ProbabilitySnapshot
} from "./golden-helpers";

/**
 * P8-DEPLOY offline proof (Implementation_Plan P8 step 19, AGENTS section 6.5).
 *
 * What this proves: the production build (`vite preview` of `web/dist`) needs
 * NO network once it has loaded. After boot the network is cut with
 * `context.setOffline(true)` and the real demo path still completes end to end:
 * default truth on screen -> profile edit -> NEW worker inference -> vessel
 * selection -> explanation -> safety banner. A context-wide route aborts (and
 * therefore *records*) any cross-origin attempt for the whole session, so the
 * spec fails on an attempt even if the offline emulation would have hidden it.
 *
 * What this deliberately does NOT do: cold-start offline reload. A reload with
 * the network cut has nothing to serve the document from unless a service
 * worker + Cache API pre-caches it, and the C-15 storage audit
 * (`e2e/storage-audit.spec.ts`) forbids both - zero writes, zero caches. That is
 * a genuine constraint conflict, recorded in `tools/qa/release-checklist.md`:
 * offline is proven at SESSION level (load once, then work offline), never by
 * adding a service worker. No cache, no SW, no storage is touched here either.
 */

const VESSEL_IDS = ["LAD", "LCX", "RCA"] as const;

const EMPTY_SNAPSHOT: StorageSnapshot = {
  localStorage: {},
  sessionStorage: {},
  cookies: "",
  indexedDb: [],
  cacheApi: []
};

test.describe("P8 offline proof (zero external dependency at runtime)", () => {
  test("session-offline: default truth -> edit -> new inference -> vessel -> explanation with the network cut", async ({
    context,
    page,
    baseURL
  }) => {
    test.setTimeout(180_000);
    expect(baseURL, "playwright baseURL must be configured").toBeTruthy();
    const origin = new URL(baseURL as string).origin;

    /* Cross-origin blocker for the WHOLE session, installed before navigation. */
    const crossOriginAttempts: string[] = [];
    await context.route("**/*", async (route) => {
      const url = route.request().url();
      if (isSameOriginUrl(url, origin)) {
        await route.continue();
        return;
      }
      crossOriginAttempts.push(url);
      await route.abort();
    });

    const requests: { url: string; method: string; resourceType: string }[] = [];
    const failed: { url: string; afterOffline: boolean }[] = [];
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    let offline = false;

    context.on("request", (request) => {
      requests.push({
        url: request.url(),
        method: request.method(),
        resourceType: request.resourceType()
      });
    });
    page.on("requestfailed", (request) => {
      failed.push({ url: request.url(), afterOffline: offline });
    });
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => pageErrors.push(String(error)));

    /* ================= BOOT (online: assets must arrive once) ================= */
    const navigation = await page.goto("/", { waitUntil: "load" });
    expect(navigation, "navigation must return a response").toBeTruthy();
    expect(navigation?.status(), "document must load with HTTP 200").toBe(200);

    const shell = page.locator('[data-testid="shell-root"]');
    const explore = page.locator('[data-testid="explore"]');
    const form = page.locator('[data-testid="profile-form"]');
    const inspector = page.locator("section.ct-ins");
    const headlineGroup = page.locator(
      '[data-testid="headline-readout"] [role="group"][data-target-id="CAD"]'
    );
    const vesselCards = page.locator('[aria-label="Vessel probabilities"] > button[data-target-id]');
    const vesselGroup = (id: string) =>
      page.locator(
        `[aria-label="Vessel probabilities"] > button[data-target-id="${id}"] [role="group"]`
      );

    await expect(shell).toHaveAttribute("data-boot-phase", "ready", { timeout: 30_000 });
    await expect(shell).toHaveAttribute("data-view", "explore");
    await expect(explore, "no evaluation error while loading").toHaveAttribute(
      "data-eval-status",
      "ready",
      { timeout: 30_000 }
    );
    await expect(headlineGroup, "the default truth must be on screen").toBeVisible({
      timeout: 20_000
    });
    await expect(
      page.locator('[data-testid="boot-failure"],[data-testid="eval-error"],[data-testid="explore-failed"]'),
      "no error screen during boot"
    ).toHaveCount(0);

    /* Every request the app will ever make (bundle, six artifacts, heart.glb,
     worker script) must be finished BEFORE the cut: after this point a single
     further network attempt is a failure. networkidle throws (never silently)
     if the app keeps talking to the network. */
    await page.waitForLoadState("networkidle", { timeout: 20_000 });
    await settle(page, 500);

    const headlineBoot = await readProbabilityGroup(headlineGroup);
    expect(headlineBoot.targetId, "headline readout must be the CAD target").toBe("CAD");
    const revisionBoot = Number(await form.getAttribute("data-revision"));
    expect(Number.isFinite(revisionBoot), "profile revision must be readable").toBe(true);
    expect(revisionBoot, "the default case must be applied at boot").toBeGreaterThan(0);
    expect(await vesselCards.count(), "three separately selectable vessel cards").toBe(3);
    for (const id of VESSEL_IDS) {
      await expect(vesselGroup(id), `${id} readout visible without interaction`).toBeVisible();
    }

    const workersBeforeCut = page.workers().length;
    expect(
      workersBeforeCut,
      "the compute worker must already be running locally before the network is cut"
    ).toBeGreaterThan(0);
    expect(
      requests.length,
      "the audit must have observed the document + bundle + artifacts"
    ).toBeGreaterThan(5);
    expect(
      requests.some((entry) => entry.url.endsWith("/model.json")),
      "the model artifact must have been fetched from the same origin"
    ).toBe(true);

    console.log(
      `[offline] boot (online): headline=${headlineBoot.valueText} ${headlineBoot.thresholdText} ` +
        `decision=${headlineBoot.decision} reliability=${headlineBoot.reliability} ` +
        `revision=${revisionBoot} workers=${workersBeforeCut} requests=${requests.length}`
    );

    /* ================= CUT THE NETWORK ================= */
    await context.setOffline(true);
    offline = true;
    console.log("[offline] context.setOffline(true) - every further request will fail");

    const serviceWorkersAtCut = await page.evaluate(async () =>
      typeof navigator.serviceWorker === "undefined"
        ? -1
        : (await navigator.serviceWorker.getRegistrations()).length
    );
    expect(
      serviceWorkersAtCut,
      "no service worker may exist (the C-15 storage audit forbids SW + Cache API)"
    ).toBe(0);
    expect(await storageSnapshot(page), "nothing may be stored before the cut").toEqual(
      EMPTY_SNAPSHOT
    );

    await expectSafetyBanner(page, "offline, after boot");

    /* ================= 1. DEFAULT TRUTH, STILL ON SCREEN OFFLINE ================= */
    await expect(headlineGroup, "the default truth must survive the cut").toBeVisible();
    const headlineOffline = await readProbabilityGroup(headlineGroup);
    expect(headlineOffline.valueText, "offline headline must still parse as a full readout").toMatch(
      /^\d{1,3}%$/
    );
    console.log(
      `[offline] default truth with network cut: ${headlineOffline.valueText} ${headlineOffline.thresholdText} decision=${headlineOffline.decision} reliability=${headlineOffline.reliability}`
    );

    /* ================= 2. EDIT -> NEW INFERENCE, FULLY OFFLINE ================= */
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
          message: `editing Age to ${age} offline must increment the case revision (C-09)`,
          timeout: 10_000
        })
        .toBeGreaterThan(revisionNow);
      await expect(explore, "evaluation must settle back to ready while offline").toHaveAttribute(
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

    const revisionAfter = Number(await form.getAttribute("data-revision"));
    expect(revisionAfter, "the offline edit must leave a higher revision").toBeGreaterThan(
      revisionBefore
    );

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
    assertDisplayedProbabilitiesChanged(probes, fillChanged, "offline profile Age edit");
    console.log(
      `[offline] edit proof (real worker inference, network cut): before=${headlineBefore.valueText} ` +
        `after=${headlineAfter.valueText} fill ${headlineBefore.fillStyle} -> ${headlineAfter.fillStyle} ` +
        `revision ${revisionBefore} -> ${revisionAfter} attempts=${JSON.stringify(attemptLog)}`
    );

    /* ================= 3. VESSEL SELECT -> EXPLANATION, FULLY OFFLINE ================= */
    const ladCard = page.locator('[aria-label="Vessel probabilities"] > button[data-target-id="LAD"]');
    await ladCard.click();
    await expect(ladCard, "clicked vessel card must be marked selected").toHaveAttribute(
      "aria-pressed",
      "true"
    );
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
    const whyRows = await whyView.locator("li.ct-ins-attr-row").count();
    expect(whyRows, "the offline explanation must carry attribution rows").toBeGreaterThan(0);
    console.log(`[offline] vessel LAD selected offline: whyRows=${whyRows}`);

    await expectSafetyBanner(page, "offline, after edit and vessel selection");

    /* ================= RESTORE + AUDIT ================= */
    await context.setOffline(false);
    offline = false;
    await settle(page, 300);

    const serviceWorkersAfter = await page.evaluate(async () =>
      typeof navigator.serviceWorker === "undefined"
        ? -1
        : (await navigator.serviceWorker.getRegistrations()).length
    );
    const finalSnapshot = await storageSnapshot(page);
    expect(serviceWorkersAfter, "still no service worker after the journey").toBe(0);
    expect(finalSnapshot, "still zero storage writes after the journey").toEqual(EMPTY_SNAPSHOT);

    const failedOffline = failed.filter((entry) => entry.afterOffline);
    const prohibited = requests.filter((entry) =>
      PROHIBITED_RESOURCE_TYPES.has(entry.resourceType)
    );
    const report = {
      origin,
      offlineCutAfter: { requests: requests.length, workers: workersBeforeCut },
      headlineBoot,
      headlineOffline,
      headlineBefore,
      headlineAfter,
      probes,
      fillChanged,
      attemptLog,
      revision: { boot: revisionBoot, before: revisionBefore, after: revisionAfter },
      whyRows,
      crossOriginAttempts,
      failedOffline,
      failed,
      prohibited,
      consoleErrors,
      pageErrors,
      storage: finalSnapshot,
      serviceWorkers: serviceWorkersAfter
    };
    await test.info().attach("offline-proof", {
      body: JSON.stringify(report, null, 2),
      contentType: "application/json"
    });

    console.log(
      `[offline] audit: requests=${requests.length} crossOriginAttempts=${crossOriginAttempts.length} ` +
        `failedAfterCut=${failedOffline.length} prohibitedTypes=${prohibited.length} ` +
        `consoleErrors=${consoleErrors.length} pageErrors=${pageErrors.length} ` +
        `serviceWorkers=${serviceWorkersAfter} cacheApi=${finalSnapshot.cacheApi.length} ` +
        `localStorage=${Object.keys(finalSnapshot.localStorage).length}`
    );
    for (const entry of requests) {
      console.log(`[offline]   ${entry.method} ${entry.resourceType} ${entry.url}`);
    }

    expect(
      crossOriginAttempts,
      "zero cross-origin attempts during the whole session (blocked + recorded)"
    ).toEqual([]);
    expect(failedOffline, "zero failed requests after the network was cut").toEqual([]);
    expect(prohibited, "no websocket/beacon/eventsource traffic").toEqual([]);
    expect(consoleErrors, "zero console errors across the offline journey").toEqual([]);
    expect(pageErrors, "zero unhandled page errors across the offline journey").toEqual([]);
  });

  test("harness: the cross-origin blocker records and blocks a deliberate attempt (mutation check)", async ({
    context,
    baseURL
  }) => {
    expect(baseURL, "playwright baseURL must be configured").toBeTruthy();
    const origin = new URL(baseURL as string).origin;

    expect(isSameOriginUrl(`${origin}/assets/index.js`, origin)).toBe(true);
    expect(isSameOriginUrl("https://evil.example/collect", origin)).toBe(false);
    expect(isSameOriginUrl("http://127.0.0.1:9/x", origin)).toBe(false);

    const caught: string[] = [];
    await context.route("**/*", async (route) => {
      const url = route.request().url();
      if (isSameOriginUrl(url, origin)) {
        await route.continue();
        return;
      }
      caught.push(url);
      await route.abort();
    });

    const probePage = await context.newPage();
    await expect(
      probePage.goto("http://127.0.0.1:9/offline-blocker-probe", { timeout: 15_000 }),
      "probe navigation must fail: nothing listens on the discard port"
    ).rejects.toThrow(/ERR_|Timeout/);
    expect(
      caught.some((url) => url.includes("offline-blocker-probe")),
      `the blocker must observe the attempt; observed=${JSON.stringify(caught)}`
    ).toBe(true);
    console.log(`[offline] blocker mutation check: caught=${JSON.stringify(caught)}`);
    await probePage.close();
  });
});
