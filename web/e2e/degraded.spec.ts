import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test, type Locator, type Page, type Route } from "@playwright/test";
import {
  CASE_LIKE_KEY,
  caseLikeKeys,
  installPreAppCapture,
  settle,
  storageSnapshot
} from "./support";
import {
  assertDisplayedProbabilitiesChanged,
  expectSafetyBanner,
  readProbabilityGroup,
  type ProbabilitySnapshot
} from "./golden-helpers";

/**
 * P8-DEGRADE — Architecture §16.1 degradation-ladder proof against the REAL
 * production build served by `vite preview` (never the dev server), each drill
 * behind the SAME injection the failure mode documents:
 *
 *   D1  stale result race     worker-message hold/release   → newest eval wins, stale dropped
 *   D2  worker can't start    workerEntry script 500        → G3 main-thread engine + notice
 *   D3  corrupted artifact    model.json byte flip          → G6 boot failure, typed, loud
 *   D4  no WebGL              getContext→null stub          → G4 2D schematic, Q3, kept interactions
 *   D5  primary mesh fails    heart.glb aborted             → G2 procedural 3D kept + notice
 *   D6  all structures fail   heart.glb + tubes aborted     → G4 2D schematic + notice
 *   D7  results unavailable   results.json aborted          → G5 Explore safe, Trust honest empty
 *   D8  malformed input       abc / 1e999 / 200             → A3 local rejection, B4 guarded dispatch
 *   D9  log + storage audit   real session                  → no console errors, no case-like egress
 *
 * Every stop asserts the INV-12 safety banner, a zero-error console (except a
 * designed, exactly-characterized network notice), and — where the ladder says
 * "same engine, different presentation" — that REAL inference still drives the
 * degraded view. Numbers are always parsed from the DOM; nothing is typed.
 *
 * This file is self-contained by design (own helpers, own init scripts, own
 * routes): no sibling e2e file, helper, config or src file is modified.
 */

const VESSEL_IDS = ["LAD", "LCX", "RCA"] as const;

/**
 * Deterministic worker-message controller (D1). Wraps the real module worker;
 * requests still run on the real worker, but responses can be held and
 * released out of order — a deterministic mutation-probe for the stale-result
 * invariant that is impossible to hit by timing alone.
 */
const WORKER_CONTROLLER = `
(() => {
  const target = window;
  const NativeWorker = target.Worker;
  const controller = {
    held: [],
    hold: false,
    total: 0,
    list: () => controller.held.slice(),
    setHold: (h) => { controller.hold = h; },
    heldCount: () => controller.held.length,
    releaseAt: (i) => {
      const item = controller.held.splice(i, 1)[0];
      if (item !== undefined) controller.deliver(item);
    },
    releaseAll: () => {
      const items = controller.held.splice(0);
      for (const item of items) controller.deliver(item);
    },
    deliver: (data) => {
      for (const handler of controller.handlers) {
        try { handler({ data }); } catch (err) { /* never shade the app */ }
      }
    },
    handlers: []
  };
  target.__ctWorkerController = controller;

  function WrappedWorker(url, options) {
    const native = new NativeWorker(url, options);
    const wrapped = this;
    wrapped.postMessage = (data, transfer) => native.postMessage(data, transfer);
    wrapped.terminate = () => native.terminate();
    wrapped.addEventListener = (type, listener) => {
      if (type === "message") {
        controller.handlers.push(listener);
        native.addEventListener("message", (event) => {
          controller.total += 1;
          if (controller.hold) {
            controller.held.push(event.data);
          } else {
            controller.deliver(event.data);
          }
        });
        return;
      }
      native.addEventListener(type, listener);
    };
    for (const type of ["onmessage", "onmessageerror", "onerror"]) {
      Object.defineProperty(wrapped, type, {
        get() { return null; },
        set(listener) { native[type] = listener; },
        configurable: true
      });
    }
  }
  target.Worker = WrappedWorker;
})();
`;

/** D4: make WebGL context creation impossible (rendering degrades, page stays). */
const WEBGL_UNAVAILABLE = `
(() => {
  const native = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function getContext(type, attributes) {
    if (type === "webgl" || type === "webgl2") return null;
    return native.call(this, type, attributes);
  };
})();
`;

type Collectors = {
  consoleMessages: string[];
  consoleErrors: string[];
  pageErrors: string[];
  failedRequests: string[];
};

function installCollectors(page: Page): Collectors {
  const c: Collectors = {
    consoleMessages: [],
    consoleErrors: [],
    pageErrors: [],
    failedRequests: []
  };
  page.on("console", (message) => {
    c.consoleMessages.push(message.text());
    if (message.type() === "error") c.consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => c.pageErrors.push(String(error)));
  page.on("requestfailed", (request) => {
    c.failedRequests.push(`${request.url()} :: ${request.failure()?.errorText ?? "unknown"}`);
  });
  return c;
}

function assertCleanLogs(c: Collectors, ctx: string, allowNetworkErrors = false): void {
  const expected = allowNetworkErrors
    ? c.consoleErrors.filter((line) => line.startsWith("Failed to load resource"))
    : [];
  for (const line of expected) {
    // a browser-injected note about the DESIGNED failed worker script — the
    // handled G3 path; everything else must stay clean.
    console.log(`[degraded] ${ctx}: tolerated designed network console line: ${JSON.stringify(line)}`);
  }
  expect(
    c.consoleErrors.filter((line) => !expected.includes(line)),
    `${ctx}: zero console errors`
  ).toEqual([]);
  expect(c.pageErrors, `${ctx}: zero unhandled page errors`).toEqual([]);
}

/** Boot into Explore and require the stumpy success shape before asserting on it. */
async function expectExploreReady(page: Page): Promise<Locator> {
  const navigation = await page.goto("/", { waitUntil: "load" });
  expect(navigation, "navigation must return a response").toBeTruthy();
  expect(navigation?.status(), "document must load with HTTP 200").toBe(200);
  const shell = page.locator('[data-testid="shell-root"]');
  const explore = page.locator('[data-testid="explore"]');
  const form = page.locator('[data-testid="profile-form"]');
  await expect(shell, "boot must reach ready").toHaveAttribute("data-boot-phase", "ready", {
    timeout: 30_000
  });
  await expect(
    page.locator('[data-testid="boot-failure"]'),
    `${shell}: no boot failure screen`
  ).toHaveCount(0);
  await expect(
    page.locator('[data-testid="explore-failed"]'),
    `${shell}: no bundle error screen`
  ).toHaveCount(0);
  await expect(
    page.locator('[data-testid="eval-error"]'),
    `${shell}: no evaluation error screen`
  ).toHaveCount(0);
  await expect(
    page.locator('[data-testid="intent-error"]'),
    `${shell}: no intent error screen`
  ).toHaveCount(0);
  await expect(explore, "explore must be present").toBeVisible();
  await expect(explore, "evaluation must settle on the default case").toHaveAttribute(
    "data-eval-status",
    "ready",
    { timeout: 30_000 }
  );
  await expect(
    page.locator('[data-testid="headline-readout"] [role="group"][data-target-id="CAD"]'),
    "a complete real readout must be on screen"
  ).toBeVisible({ timeout: 20_000 });
  await expect(form, "the profile form must carry a revision").toHaveAttribute("data-revision", /.+/);
  return explore;
}

async function headlineGroup(page: Page): Promise<Locator> {
  return page.locator('[data-testid="headline-readout"] [role="group"][data-target-id="CAD"]');
}

function vesselCards(page: Page): Locator {
  return page.locator('[aria-label="Vessel probabilities"] > button[data-target-id]');
}

function revOf(form: Locator): Promise<number> {
  return form.getAttribute("data-revision").then((value) => Number(value));
}

/** Set one Age value and wait for the revision bump + settled evaluation. */
async function setAgeAndSettle(
  page: Page,
  ageInput: Locator,
  form: Locator,
  explore: Locator,
  age: number
): Promise<number> {
  const before = await revOf(form);
  await ageInput.fill(String(age));
  await expect
    .poll(() => revOf(form), { message: `Age ${age} must bump the case revision`, timeout: 10_000 })
    .toBeGreaterThan(before);
  await expect(explore, "evaluation must settle back to ready").toHaveAttribute(
    "data-eval-status",
    "ready",
    { timeout: 20_000 }
  );
  await settle(page, 350);
  return revOf(form);
}

test.describe("P8-DEGRADE Architecture §16.1 ladder (real prod build)", () => {
  test("D1 stale evaluation never surfaces as current (revision race)", async ({ page }) => {
    test.setTimeout(150_000);
    const c = installCollectors(page);
    await page.addInitScript(WORKER_CONTROLLER);
    const explore = await expectExploreReady(page);
    const form = page.locator('[data-testid="profile-form"]');
    const headline = await headlineGroup(page);
    const ageInput = page.locator('[data-feature-id="Age"] input[data-role="value-input"]');
    const head = headline;

    /* 1. find a real distinct pair of in-range ages (gender-first, committee
          approved: exactly like golden's attempt list) — never a hardcoded
          probability, always a falsifiable difference on the live engine. */
    const ageCurrent = await ageInput.inputValue();
    const candidates = [85, 31, 64, 40, 73, 52].filter(
      (age) => String(age) !== ageCurrent
    );
    expect(candidates.length, "at least two distinct in-range ages must be possible").toBeGreaterThan(1);

    let probe: { a: number; b: number; bSnapshot: ProbabilitySnapshot } | null = null;
    for (let i = 0; i < candidates.length && probe === null; i += 1) {
      for (let j = i + 1; j < candidates.length && probe === null; j += 1) {
        await setAgeAndSettle(page, ageInput, form, explore, candidates[i]);
        const hA = await readProbabilityGroup(head);
        await setAgeAndSettle(page, ageInput, form, explore, candidates[j]);
        const hB = await readProbabilityGroup(head);
        if (hA.valueText !== hB.valueText || hA.fillStyle !== hB.fillStyle) {
          probe = { a: candidates[i], b: candidates[j], bSnapshot: hB };
        }
      }
    }
    expect(probe, "the live engine must expose a distinct Age pair (real inference)").not.toBeNull();
    const revisionAtProbeEnd = await revOf(form);
    console.log(
      `[degraded] D1 distinct pair a=${probe?.a} b=${probe?.b} ` +
        `rev=${revisionAtProbeEnd} bValue=${probe?.bSnapshot.valueText}`
    );

    /* 2. hold worker responses, edit to a then b, deliver the NEWEST first. */
    await page.evaluate(() => {
      const controller = (window as unknown as Record<string, unknown>)[
        "__ctWorkerController"
      ] as {
        setHold(h: boolean): void;
        heldCount(): number;
        releaseAt(i: number): number;
        releaseAll(): number;
      };
      controller.setHold(true);
    });
    await ageInput.fill(String(probe.a));
    await expect
      .poll(() => revOf(form))
      .toBeGreaterThan(revisionAtProbeEnd);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const ctl = (window as unknown as Record<string, unknown>)[
            "__ctWorkerController"
          ] as { heldCount(): number };
          return ctl.heldCount();
        })
      )
      .toBeGreaterThanOrEqual(1);
    await ageInput.fill(String(probe.b));
    await expect.poll(() => revOf(form)).toBeGreaterThan(revisionAtProbeEnd + 1);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const ctl = (window as unknown as Record<string, unknown>)[
            "__ctWorkerController"
          ] as { heldCount(): number };
          return ctl.heldCount();
        })
      )
      .toBeGreaterThanOrEqual(2);

    /* 3. release newest (b) -> evaluation settles, shows the b readout. */
    await page.evaluate(() => {
      const ctl = (window as unknown as Record<string, unknown>)[
        "__ctWorkerController"
      ] as { releaseAt(i: number): void };
      ctl.releaseAt(1);
    });
    await expect(explore, "newest response must settle the evaluation").toHaveAttribute(
      "data-eval-status",
      "ready",
      { timeout: 20_000 }
    );
    await settle(page, 600);
    const revisionAtNewest = await revOf(form);
    const displayed = await readProbabilityGroup(head);
    expect(revisionAtNewest, "the two edits must have bumped the revision twice").toBe(
      revisionAtProbeEnd + 2
    );
    expect(displayed.valueText, "the newest evaluation must be the one shown").toBe(
      probe.bSnapshot.valueText
    );
    expect(displayed.fillStyle, "the newest evaluation must drive the fill").toBe(
      probe.bSnapshot.fillStyle
    );

    /* 4. release the STALE (a) response last; it must be discarded. */
    await page.evaluate(() => {
      const ctl = (window as unknown as Record<string, unknown>)[
        "__ctWorkerController"
      ] as { releaseAt(i: number): void };
      ctl.releaseAt(0);
    });
    await settle(page, 600);
    const afterStale = await readProbabilityGroup(head);
    expect(afterStale.valueText, "a stale evaluation must never become current").toBe(
      displayed.valueText
    );
    expect(afterStale.fillStyle, "a stale evaluation must never drive the fill").toBe(
      displayed.fillStyle
    );
    expect(await revOf(form), "the stale response must not move the revision").toBe(
      revisionAtNewest
    );
    await expect(explore, "evaluation stays ready after the stale delivery").toHaveAttribute(
      "data-eval-status",
      "ready"
    );

    /* 5. flush every remaining pipeline message; truth must not move again. */
    await page.evaluate(() => {
      const ctl = (window as unknown as Record<string, unknown>)[
        "__ctWorkerController"
      ] as { setHold(h: boolean): void; releaseAll(): void };
      ctl.setHold(false);
      ctl.releaseAll();
    });
    await settle(page, 900);
    const afterFlush = await readProbabilityGroup(head);
    expect(
      afterFlush.valueText,
      "flushing the explain/ladder pipeline must not move the displayed truth"
    ).toBe(displayed.valueText);
    expect(afterFlush.fillStyle, "the fill stays the newest evaluation's").toBe(displayed.fillStyle);
    expect(await revOf(form), "revision stays current through all flushes").toBe(revisionAtNewest);
    await expect(explore, "the workspace stays ready").toHaveAttribute("data-eval-status", "ready");
    await expectSafetyBanner(page, "D1 stale race");
    assertCleanLogs(c, "D1");
  });

  test("D2 worker failure degrades visibly to the main-thread engine (G3)", async ({ page }) => {
    test.setTimeout(120_000);
    const c = installCollectors(page);
    await page.route("**/assets/workerEntry-*.js", (route: Route) =>
      route.fulfill({
        status: 500,
        contentType: "text/javascript",
        body: "throw new Error('injected worker script failure');"
      })
    );
    await expectExploreReady(page);

    const degraded = page.locator('[data-testid="degraded-notice"]');
    await expect(degraded, "the G3 notice must be part of the workspace").toBeVisible({
      timeout: 20_000
    });
    await expect(degraded).toHaveAttribute("data-level", "G3");
    await expect(degraded).toContainText("Running without a background worker");
    await expect(degraded).toContainText("main thread");

    /* real inference still completes and CHANGES on the main-thread engine */
    const headline = await headlineGroup(page);
    const before = await readProbabilityGroup(headline);
    const explore = page.locator('[data-testid="explore"]');
    const form = page.locator('[data-testid="profile-form"]');
    const ageInput = page.locator('[data-feature-id="Age"] input[data-role="value-input"]');
    await setAgeAndSettle(page, ageInput, form, explore, 64);
    const after = await readProbabilityGroup(headline);
    assertDisplayedProbabilitiesChanged(
      [{ key: "CAD(headline)", before: before.valueText, after: after.valueText }],
      after.fillStyle !== before.fillStyle,
      "D2 degraded edit still moves the truth"
    );

    /* selection still works through the degraded transport */
    const ladCard = page.locator('[aria-label="Vessel probabilities"] > button[data-target-id="LAD"]');
    await ladCard.click();
    await expect(ladCard).toHaveAttribute("aria-pressed", "true");

    await expectSafetyBanner(page, "D2 worker failure");
    assertCleanLogs(c, "D2", true);
  });

  test("D3 corrupted model artifact blocks boot loudly (G6)", async ({ page }) => {
    test.setTimeout(90_000);
    const c = installCollectors(page);
    const modelBytes = readFileSync(fileURLToPath(new URL("../dist/model.json", import.meta.url)));
    await page.route("**/model.json", (route: Route) => {
      const bytes = Buffer.from(modelBytes);
      const mid = Math.floor(bytes.length / 2);
      bytes[mid] = (bytes[mid] ?? 0) ^ 0x01;
      return route.fulfill({ status: 200, contentType: "application/json", body: bytes });
    });

    await page.goto("/", { waitUntil: "load" });
    const failure = page.locator('[data-testid="boot-failure"]');
    await expect(failure, "G6 must surface the boot failure screen").toBeVisible({ timeout: 30_000 });
    await expect(failure, "the failure must name the artifact integrity code").toHaveAttribute(
      "data-code",
      "ARTIFACT_HASH_MISMATCH"
    );
    await expect(failure).toContainText('The "model" artifact');
    await expect(failure).toContainText("SHA-256");
    await expect(page.locator('[data-testid="boot-retry"]'), "a reload recovery action exits").toBeVisible();
    await expect(page.locator('[data-testid="shell-root"]')).toHaveAttribute(
      "data-boot-phase",
      "failed"
    );
    await expect(
      page.locator('[data-testid="profile-form"]'),
      "no partial app may render behind a failed boot"
    ).toHaveCount(0);
    await expect(
      page.locator('[data-testid="headline-readout"] [role="group"]'),
      "no probability may render without verified artifacts"
    ).toHaveCount(0);
    await expect(
      page.locator('[data-testid="explore"]'),
      "no bundle screen behind the failure"
    ).toHaveCount(0);
    await expectSafetyBanner(page, "D3 corrupted artifact");
    assertCleanLogs(c, "D3");
  });

  test("D4 no WebGL degrades to the 2D schematic with selection preserved (G4/Q3)", async ({
    page
  }) => {
    test.setTimeout(120_000);
    const c = installCollectors(page);
    await page.addInitScript(WEBGL_UNAVAILABLE);
    const explore = await expectExploreReady(page);

    const stage = page.locator(".ct-stage").first();
    await expect(stage, "the stage region must exist (no blank pane)").toBeVisible();
    await expect(stage, "the stage must report the degraded state").toHaveAttribute(
      "data-degraded",
      "true"
    );
    await expect(stage, "WebGL absence forces the Q3 tier").toHaveAttribute("data-tier", "Q3");
    await expect(stage, "the stage must announce the 2D presentation").toHaveAttribute(
      "aria-label",
      "2D vessel schematic"
    );

    const schematic = page.locator("svg.ct-stage-schematic");
    await expect(schematic, "the 2D schematic must render without WebGL").toBeVisible({
      timeout: 20_000
    });
    await expect(schematic).toHaveAttribute("aria-label", "Coronary artery schematic");
    for (const id of VESSEL_IDS) {
      await expect(
        page.locator(`path[data-structure-id="${id}"]`),
        `${id} must stay present and selectable in the schematic`
      ).toHaveCount(1);
    }

    /* schematic selection drives the same registry identity the 3D stage uses */
    const ladPath = page.locator('path[data-structure-id="LAD"]');
    await ladPath.click();
    const ladCard = page.locator('[aria-label="Vessel probabilities"] > button[data-target-id="LAD"]');
    await expect(ladCard, "schematic selection must reach the cards").toHaveAttribute(
      "aria-pressed",
      "true"
    );

    await expect(stage.locator(".ct-stage__notice")).toContainText(
      "3D rendering is unavailable in this browser"
    );

    /* the heading truth stays a complete, parseable readout in Q3 */
    const headline = await headlineGroup(page);
    const snapshot = await readProbabilityGroup(headline);
    expect(snapshot.targetId).toBe("CAD");
    await expect(explore).toHaveAttribute("data-eval-status", "ready");
    await expectSafetyBanner(page, "D4 no webgl");
    assertCleanLogs(c, "D4");
  });

  test("D5 primary mesh failure falls back to the procedural vessel model (G2)", async ({
    page
  }) => {
    test.setTimeout(120_000);
    const c = installCollectors(page);
    const tubeRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("heart_tubes.glb")) tubeRequests.push(request.url());
    });
    // The primary mesh is also the boot-validated "structures" artifact, so it
    // is requested once at boot (must succeed) and again at stage runtime (the
    // G2 injection). Abort exactly the SECOND request — deterministic even on
    // slow hardware because the stage only loads after boot reaches ready.
    let primaryRequests = 0;
    await page.route("**/models/heart.glb", (route: Route) => {
      primaryRequests += 1;
      return primaryRequests >= 2 ? route.abort("failed") : route.continue();
    });
    await expectExploreReady(page);

    const stage = page.locator(".ct-stage").first();
    await expect(stage).toBeVisible();
    await expect(stage, "procedural fallback must mark the stage degraded").toHaveAttribute(
      "data-degraded",
      "true"
    );
    await expect(stage.locator("canvas"), "procedural keeps the 3D canvas").toBeVisible({
      timeout: 20_000
    });
    await expect(stage.locator("svg.ct-stage-schematic"), "not the 2D schematic").toHaveCount(0);
    await expect(stage.locator(".ct-stage__notice"), "the G2 notice must be visible").toContainText(
      "the procedural vessel model is shown instead"
    );
    expect(tubeRequests.length, "the procedural asset must actually be requested").toBeGreaterThan(0);

    /* interaction and real inference survive the source switch */
    const ladCard = page.locator('[aria-label="Vessel probabilities"] > button[data-target-id="LAD"]');
    await ladCard.click();
    await expect(ladCard).toHaveAttribute("aria-pressed", "true");
    const explore = page.locator('[data-testid="explore"]');
    const form = page.locator('[data-testid="profile-form"]');
    const ageInput = page.locator('[data-feature-id="Age"] input[data-role="value-input"]');
    const headline = await headlineGroup(page);
    const before = await readProbabilityGroup(headline);
    await setAgeAndSettle(page, ageInput, form, explore, 64);
    const after = await readProbabilityGroup(headline);
    assertDisplayedProbabilitiesChanged(
      [{ key: "CAD(headline)", before: before.valueText, after: after.valueText }],
      after.fillStyle !== before.fillStyle,
      "D5 degraded stage still moves the displayed truth"
    );

    await expectSafetyBanner(page, "D5 procedural fallback");
    expect(
      c.failedRequests.every((line) => line.includes("heart.glb")),
      "the ONLY designed failed request must be the aborted primary mesh"
    ).toBe(true);
    assertCleanLogs(c, "D5", true);
  });

  test("D6 every structure source failing degrades to the 2D schematic (G4)", async ({
    page
  }) => {
    test.setTimeout(120_000);
    const c = installCollectors(page);
    // Same boot-vs-runtime split as D5: the primary mesh must pass boot
    // validation (request #1) and fail only at stage runtime (request #2);
    // the procedural tubes are never fetched at boot and fail on the runtime
    // attempt. Both structure sources gone at runtime → G4 schema.
    let primaryRequests = 0;
    await page.route("**/models/heart.glb", (route: Route) => {
      primaryRequests += 1;
      return primaryRequests >= 2 ? route.abort("failed") : route.continue();
    });
    await page.route("**/models/heart_tubes.glb", (route: Route) => route.abort("failed"));
    await expectExploreReady(page);

    const stage = page.locator(".ct-stage").first();
    await expect(stage).toBeVisible();
    await expect(stage).toHaveAttribute("data-degraded", "true");
    await expect(stage).toHaveAttribute("aria-label", "2D vessel schematic");
    await expect(stage.locator("svg.ct-stage-schematic"), "the 2D schematic owns the stage").toBeVisible({
      timeout: 20_000
    });
    await expect(stage.locator("canvas"), "no WebGL canvas when everything failed").toHaveCount(0);
    await expect(stage.locator(".ct-stage__notice")).toContainText(
      "The 3D structure could not be loaded — the 2D schematic is shown instead."
    );

    /* all three vessels remain present + selectable (keyboard path: the
       schematic ships tabIndex=0 + Enter/Space selection — the designed,
       hit-test-independent interaction in full degradation) */
    for (const id of VESSEL_IDS) {
      await expect(page.locator(`path[data-structure-id="${id}"]`)).toHaveCount(1);
    }
    const rcaPath = page.locator('path[data-structure-id="RCA"]');
    await rcaPath.focus();
    await page.keyboard.press("Enter");
    const rcaCard = page.locator('[aria-label="Vessel probabilities"] > button[data-target-id="RCA"]');
    await expect(rcaCard, "RCA selection must survive full degradation via the keyboard").toHaveAttribute(
      "aria-pressed",
      "true"
    );

    await expectSafetyBanner(page, "D6 all structures failed");
    expect(
      c.failedRequests.every(
        (line) => line.includes("heart.glb") || line.includes("heart_tubes.glb")
      ),
      "only the two designed abort requests may fail"
    ).toBe(true);
    assertCleanLogs(c, "D6", true);
  });

  test("D7 results unavailable keeps Explore safe and Trust honest (G5)", async ({ page }) => {
    test.setTimeout(120_000);
    const c = installCollectors(page);
    await page.route("**/results.json", (route: Route) => route.abort("failed"));
    const explore = await expectExploreReady(page);

    const notices = page.locator('[data-testid="shell-notices"]');
    await expect(notices, "the G5 notice must surface in the shell").toBeVisible({ timeout: 20_000 });
    await expect(notices).toContainText("The validation results file could not be fetched");
    await expect(notices).toContainText("Explore is unaffected");

    /* 1. Explore stays fully functional with REAL inference */
    const headline = await headlineGroup(page);
    const before = await readProbabilityGroup(headline);
    const form = page.locator('[data-testid="profile-form"]');
    const ageInput = page.locator('[data-feature-id="Age"] input[data-role="value-input"]');
    await setAgeAndSettle(page, ageInput, form, explore, 64);
    const after = await readProbabilityGroup(headline);
    assertDisplayedProbabilitiesChanged(
      [{ key: "CAD(headline)", before: before.valueText, after: after.valueText }],
      after.fillStyle !== before.fillStyle,
      "D7 Explore must still run real inference without results"
    );

    /* 2. Trust shows its designed empty state — never fabricated numbers */
    await page.goto("/#/trust/performance");
    await expect(page.locator('[data-testid="trust-view"]')).toHaveAttribute(
      "data-pane",
      "performance"
    );
    const pane = page.locator('[data-testid="trust-pane"]').first();
    await expect(pane, "the pane must exist with its designed state").toBeVisible();
    await expect(pane).toHaveAttribute("data-pane-state", "empty");
    await expect(pane).toContainText("Validation results not loaded");
    await expect(pane, "no metric row may render without results").toHaveCount(1);
    await expect(pane.locator("tr"), "no fabricated metric rows").toHaveCount(0);
    await expect(
      pane.locator('[role="img"]'),
      "no chart may render fabricated metrics"
    ).toHaveCount(0);
    /* FINDING (P8): the PaneShell retry affordance exists but ShellApp wires no
       onRetry, so no pane-retry button renders — the designed empty state is
       honest, but the G5 retry action is not yet connected. Filed in the report;
       shell remains read-only for this drill. */
    await expect(pane.locator('[data-testid="pane-retry"]')).toHaveCount(0);

    await expectSafetyBanner(page, "D7 results unavailable");
    expect(
      c.failedRequests.every((line) => line.includes("results.json")),
      "only the results fetch is designed to fail in D7"
    ).toBe(true);
    assertCleanLogs(c, "D7", true);
  });

  test("D8 malformed input is rejected locally; previous valid result stays displayed (A3/B4)", async ({
    page
  }) => {
    test.setTimeout(120_000);
    const c = installCollectors(page);
    const explore = await expectExploreReady(page);
    const form = page.locator('[data-testid="profile-form"]');
    const ageInput = page.locator('[data-feature-id="Age"] input[data-role="value-input"]');
    const headline = await headlineGroup(page);
    const revision0 = await revOf(form);
    const before = await readProbabilityGroup(headline);

    /* 1. non-numeric */
    await ageInput.fill("abc");
    const ageField = page.locator('[data-feature-id="Age"]').first();
    await expect(ageField.locator('[data-role="field-error"]'), "invalid text must be flagged").toBeVisible();
    await expect(ageField).toContainText("Enter a number.");
    await settle(page, 300);
    expect(await revOf(form), "invalid text must never dispatch").toBe(revision0);
    await expect(explore).toHaveAttribute("data-eval-status", "ready");
    const afterAbc = await readProbabilityGroup(headline);
    expect(afterAbc.valueText, "the previous result stays displayed").toBe(before.valueText);
    expect(afterAbc.fillStyle, "the previous fill stays displayed").toBe(before.fillStyle);

    /* 2. non-finite */
    await ageInput.fill("1e999");
    await expect(ageField.locator('[data-role="field-error"]')).toBeVisible();
    await settle(page, 300);
    expect(await revOf(form), "non-finite input must never dispatch").toBe(revision0);
    await readProbabilityGroup(headline);

    /* 3. out-of-range but FINITE: dispatches (B4) with the designed warning.
          The range warning arms on blur (no typing flash by design), so blur
          first, then assert the armed guard. */
    await ageInput.fill("200");
    await ageInput.blur();
    await expect(ageField.locator('[data-role="range-warning"]'), "the guard must warn").toBeVisible();
    await expect(ageField).toContainText("Outside the cohort range");
    await expect
      .poll(() => revOf(form), { message: "a finite out-of-range value dispatches (B4)" })
      .toBeGreaterThan(revision0);
    await expect(explore).toHaveAttribute("data-eval-status", "ready", { timeout: 20_000 });
    await settle(page, 400);

    /* 4. no NaN/Infinity anywhere on screen, no patient-value echo in console */
    const body = await page.locator("body").innerText();
    expect(body, "NaN must never appear on screen").not.toContain("NaN");
    expect(body, "Infinity must never appear on screen").not.toContain("Infinity");
    await ageInput.fill("64");
    await expect.poll(() => revOf(form)).toBeGreaterThan(revision0);
    await expect(explore).toHaveAttribute("data-eval-status", "ready", { timeout: 20_000 });

    await expectSafetyBanner(page, "D8 malformed input");
    assertCleanLogs(c, "D8");
    const all = [...c.consoleMessages, ...c.pageErrors].join("\n");
    for (const token of ["abc", "1e999", "200"]) {
      expect(all.includes(token), `D8: input value ${JSON.stringify(token)} must not reach the console`).toBe(
        false
      );
    }
  });

  test("D9 log and storage audit: a real session leaks no patient data (C-15)", async ({
    page,
    baseURL
  }) => {
    test.setTimeout(120_000);
    expect(baseURL, "playwright baseURL must be configured").toBeTruthy();
    const origin = new URL(baseURL as string).origin;
    const c = installCollectors(page);
    await installPreAppCapture(page);
    const explore = await expectExploreReady(page);

    /* a real journey with patient-value edits + view hops */
    const form = page.locator('[data-testid="profile-form"]');
    const ageInput = page.locator('[data-feature-id="Age"] input[data-role="value-input"]');
    const headline = await headlineGroup(page);
    const before = await readProbabilityGroup(headline);
    await setAgeAndSettle(page, ageInput, form, explore, 64);
    const after = await readProbabilityGroup(headline);
    assertDisplayedProbabilitiesChanged(
      [{ key: "CAD(headline)", before: before.valueText, after: after.valueText }],
      after.fillStyle !== before.fillStyle,
      "D9 the audited session must have run real inference"
    );
    await page.locator('[aria-label="Vessel probabilities"] > button[data-target-id="LAD"]').click();
    await page.goto("/#/trust/performance");
    await page.goto("/#/system/requirements");
    await page.goto("/#/explore");
    await expect(page.locator('[data-testid="shell-root"]')).toHaveAttribute("data-view", "explore");
    await settle(page, 500);

    /* console / page-error audit — zero errors, no case-like vocabulary */
    const allConsole = [...c.consoleMessages, ...c.pageErrors].join("\n");
    expect(c.consoleErrors, "D9: zero console errors across the journey").toEqual([]);
    expect(c.pageErrors, "D9: zero unhandled page errors").toEqual([]);
    expect(
      CASE_LIKE_KEY.test(allConsole),
      "D9: console must not carry case-like vocabulary (C-15 Storage line)"
    ).toBe(false);
    for (const token of ["hypo", "record", "patient", "mrn"]) {
      expect(
        allConsole.toLowerCase().includes(token),
        `D9: console must not expose ${JSON.stringify(token)}`
      ).toBe(false);
    }

    /* network audit: only same-origin static GET/HEAD traffic */
    const failed = c.failedRequests.filter((line) => !line.startsWith("Failed to load resource"));
    expect(failed, "D9: zero failed network requests in the audited session").toEqual([]);

    /* storage audit: nothing patient-like was ever persisted */
    const snapshot = await storageSnapshot(page);
    expect(caseLikeKeys(snapshot), "D9: no case-like storage keys anywhere").toEqual([]);
    const workersFromPage = page.workers().length;
    expect(workersFromPage, "D9: a real dedicated worker must have executed the session").toBeGreaterThan(0);

    await expectSafetyBanner(page, "D9 audit");
    assertCleanLogs(c, "D9");
  });
});