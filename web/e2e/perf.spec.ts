import { expect, test } from "@playwright/test";
import type { CDPSession, Page } from "@playwright/test";
import { settle } from "./support";
import { perfInitSource } from "../src/perf/probe";
import type { PerfProbe, PerfSnapshot } from "../src/perf/probe";
import { frameStats, percentile, summarize } from "../src/perf/stats";
import type { Summary } from "../src/perf/stats";

// Best-effort hardware GL on Windows (D3D11 ANGLE). If the host only offers
// SwiftShader the governor will downgrade to Q3 and Phase 4 records
// `interaction_fps value=not-measurable` — never a fabricated number (law 16).
test.use({
  launchOptions: {
    args: [
      "--enable-gpu",
      "--ignore-gpu-blocklist",
      "--use-angle=d3d11",
      "--enable-webgl",
      "--enable-gpu-rasterization"
    ]
  }
});

/**
 * P8-PERF — Implementation_Plan P8 step 14, measured against the REAL
 * production build (`npm run build` + `vite preview`, no route mocking),
 * in one browser session, with every value logged as a `[perf]` line so
 * `tools/qa/perf-report.md` can quote the raw evidence verbatim.
 *
 * Budgets covered (Contracts C-16 / Architecture §15):
 *   B-01  p95 input → first visual change        probe marks + MutationObserver + stage pixel shift
 *   B-02  four-target evaluation compute         C-07 worker `timing.computeMs` tap (case channel)
 *   B-03  selected-target explanation compute    C-07 worker `timing.computeMs` tap (explain op)
 *   B-04  interaction frame rate / idle frames   probe rAF series under CDP CPU throttle 4×
 *   B-05  triangles / draw calls / textures      probe WebGL draw-call wrappers (per frame)
 *   B-06  critical JS + registry + model bytes   response bodies of the production build
 *   B-07  structure bytes                        response bodies (models/*.glb)
 *   B-08  first coloured heart                   probe pixel thresholds, cold load @4×
 *   B-09  page memory (worker memory is not attachable via Playwright CDP — logged as such)
 *
 * Assertions here are deliberately TOLERANT (finite, sane bounds, p50 ≤ p95,
 * required sample counts, ≥2 s fps window): the budget PASS/BREACH verdicts
 * belong to the report, computed from these same log lines. No number in this
 * spec is tuned toward a budget (AGENTS §7 law 16 — a target is never
 * presented as a measurement; every line below is produced by a run).
 */

type WorkerRecord = {
  operation: string;
  channel: string;
  status: string;
  computeMs: number;
  revision: number;
  t: number;
};

type TrialMetrics = {
  trial: number;
  age: number;
  toRevision: number | null;
  toUpdating: number | null;
  toReady: number | null;
  toReadout: number | null;
  toStage: number | null;
  firstVisual: number | null;
};

const EDITS = [30, 86, 45, 72, 38, 77, 51, 63, 42, 80, 35, 70];
// Vessel cards exist only for LAD/LCX/RCA; CAD is the headline readout and
// is not selectable through the vessel group (ExploreView.tsx).
const VESSEL_CLICK_CYCLE = ["LAD", "LCX", "RCA"] as const;

const r1 = (value: number): number => Math.round(value * 10) / 10;

function logPerf(metric: string, fields: Record<string, string | number>): void {
  const parts = Object.entries(fields)
    .map(([key, value]) => `${key}=${value}`)
    .join(" ");
  console.log(`[perf] metric=${metric} ${parts}`);
}

function logSummary(
  metric: string,
  unit: string,
  values: readonly number[],
  throttle: string | number,
  extra: Record<string, string | number> = {}
): Summary | null {
  const summary = summarize(values);
  if (summary === null) {
    logPerf(metric, { value: "not-measurable", unit, n: 0, throttle, ...extra });
    return null;
  }
  logPerf(metric, {
    value: r1(summary.p95),
    unit,
    n: summary.n,
    p50: r1(summary.p50),
    p95: r1(summary.p95),
    min: r1(summary.min),
    max: r1(summary.max),
    throttle,
    ...extra
  });
  return summary;
}

function expectSane(label: string, summary: Summary | null, ceiling: number): Summary {
  expect(summary, `${label}: samples must exist`).not.toBeNull();
  const value = summary as Summary;
  expect(Number.isFinite(value.p50), `${label}: p50 must be finite`).toBe(true);
  expect(Number.isFinite(value.p95), `${label}: p95 must be finite`).toBe(true);
  expect(value.p50, `${label}: p50 <= p95`).toBeLessThanOrEqual(value.p95);
  expect(value.min, `${label}: min >= 0`).toBeGreaterThanOrEqual(0);
  expect(value.max, `${label}: max must stay below ${ceiling} ms`).toBeLessThan(ceiling);
  return value;
}

async function readProbe(page: Page): Promise<PerfSnapshot> {
  const raw = await page.evaluate(() => {
    const holder = window as unknown as { __cortwinPerf?: Record<string, unknown> };
    const probe = holder.__cortwinPerf;
    if (probe === undefined) {
      throw new Error(
        "perf probe missing — addInitScript(perfInitSource()) must run before page.goto()"
      );
    }
    const snapshot: Record<string, unknown> = {};
    for (const key of Object.keys(probe)) {
      const value = probe[key];
      if (typeof value !== "function") snapshot[key] = value;
    }
    return snapshot;
  });
  return raw as unknown as PerfSnapshot;
}

async function readWorkerRecords(page: Page): Promise<WorkerRecord[]> {
  return page.evaluate(() => {
    const holder = window as unknown as { __perfWorker?: WorkerRecord[] };
    return holder.__perfWorker ?? [];
  });
}

test.describe("P8-PERF step 14 — budget measurement on the production build", () => {
  test("measure B-01…B-09: latency, compute, fps, scene cost, transfer, memory", async ({
    page,
    context
  }) => {
    test.setTimeout(300_000);

    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => pageErrors.push(String(error)));

    const byteByUrl = new Map<string, number>();
    const bodyFailures: string[] = [];
    const bodyTasks: Promise<void>[] = [];
    page.on("response", (response) => {
      const path = response.url().split("?")[0];
      if (!/\.(?:js|css|json|glb)$/.test(path)) return;
      bodyTasks.push(
        response
          .body()
          .then((body) => {
            byteByUrl.set(response.url(), body.length);
          })
          .catch(() => {
            bodyFailures.push(response.url());
          })
      );
    });

    await page.addInitScript(perfInitSource());
    await page.addInitScript(() => {
      const records: WorkerRecord[] = [];
      const NativeWorker = window.Worker;
      class TappedWorker extends NativeWorker {
        constructor(scriptURL: string | URL, options?: WorkerOptions) {
          super(scriptURL, options);
          this.addEventListener("message", (event: MessageEvent) => {
            const data = event.data as {
              operation?: unknown;
              channel?: unknown;
              status?: unknown;
              revision?: unknown;
              timing?: { computeMs?: unknown };
            } | null;
            if (
              data !== null &&
              typeof data === "object" &&
              typeof data.operation === "string" &&
              data.timing !== undefined &&
              typeof data.timing.computeMs === "number"
            ) {
              records.push({
                operation: data.operation,
                channel: typeof data.channel === "string" ? data.channel : "",
                status: typeof data.status === "string" ? data.status : "",
                computeMs: data.timing.computeMs,
                revision: typeof data.revision === "number" ? data.revision : -1,
                t: performance.now()
              });
            }
          });
        }
      }
      window.Worker = TappedWorker;
      (window as unknown as { __perfWorker: WorkerRecord[] }).__perfWorker = records;
    });

    const cdp: CDPSession = await context.newCDPSession(page);
    await cdp.send("Performance.enable");
    const readHeap = async (phase: string, throttle: string | number): Promise<number> => {
      const response = await cdp.send("Performance.getMetrics");
      const used = response.metrics.find((metric) => metric.name === "JSHeapUsedSize");
      const mb = used === undefined ? Number.NaN : used.value / 1_048_576;
      logPerf("page_js_heap", { value: r1(mb), unit: "MB", n: 1, throttle, phase, budget: "B-09" });
      return mb;
    };

    const pageNow = async (): Promise<number> => page.evaluate(() => performance.now());
    const stage = page.locator(".ct-stage");
    const stageTier = async (phase: string): Promise<string> => {
      const tier = await stage.getAttribute("data-tier");
      logPerf("stage_tier", { value: tier ?? "unknown", unit: "tier", n: 1, phase });
      return tier ?? "unknown";
    };

    /* ================= PHASE 1 — cold boot @4× (B-08, boot context) ================= */
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    const navigation = await page.goto("/", { waitUntil: "load" });
    expect(navigation, "navigation must return a response").toBeTruthy();
    expect(navigation?.status(), "document must load with HTTP 200").toBe(200);

    const shell = page.locator('[data-testid="shell-root"]');
    const explore = page.locator('[data-testid="explore"]');
    const form = page.locator('[data-testid="profile-form"]');
    const headlineGroup = page.locator(
      '[data-testid="headline-readout"] [role="group"][data-target-id="CAD"]'
    );
    const whyView = page.locator('[data-view="why"]');
    const ageInput = page.locator('[data-feature-id="Age"] input[data-role="value-input"]');

    await expect(shell).toHaveAttribute("data-boot-phase", "ready", { timeout: 45_000 });
    await expect(explore).toHaveAttribute("data-eval-status", "ready", { timeout: 45_000 });
    await expect(headlineGroup, "the first real readout must be on screen").toBeVisible({
      timeout: 30_000
    });
    await expect(page.locator('[data-testid="boot-failure"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="eval-error"]')).toHaveCount(0);
    await settle(page, 900);

    const bootProbe = await readProbe(page);
    expect(bootProbe.glOk, "the probe must observe real WebGL draw calls").toBe(true);
    expect(bootProbe.webgl2, "the production build must reach WebGL2").toBe(true);
    expect(
      bootProbe.firstColouredAt,
      "cold load must paint a chromatic heart (B-08 probe threshold)"
    ).not.toBeNull();
    const firstPaintedMs = bootProbe.firstPaintedAt === null ? null : bootProbe.firstPaintedAt - bootProbe.navStart;
    const firstColouredMs = bootProbe.firstColouredAt === null ? null : bootProbe.firstColouredAt - bootProbe.navStart;
    expect(firstPaintedMs, "first painted frame must be finite and positive").not.toBeNull();
    expect(firstColouredMs !== null && firstColouredMs >= 0 && firstColouredMs < 60_000).toBe(true);
    logPerf("first_painted", {
      value: firstPaintedMs === null ? "not-measurable" : r1(firstPaintedMs),
      unit: "ms",
      n: 1,
      throttle: 4,
      budget: "B-08"
    });
    logPerf("first_coloured", {
      value: firstColouredMs === null ? "not-measurable" : r1(firstColouredMs),
      unit: "ms",
      n: 1,
      throttle: 4,
      budget: "B-08"
    });
    logPerf("boot_context", {
      value: bootProbe.glPatched.length,
      unit: "gl-wrappers",
      n: 1,
      throttle: 4,
      webgl2: String(bootProbe.webgl2),
      canvas_seen: bootProbe.canvasSeen,
      gpu: `"${bootProbe.gpu}"`,
      workers: page.workers().length
    });
    await stageTier("boot");
    const heapBoot = await readHeap("boot", 4);

    const tEditsStart = await pageNow();

    /* ================= PHASE 2 — edit loop @1× (B-01, B-02 raw samples) ================= */
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    await expect(ageInput, "the Age value input must be editable").toBeVisible({ timeout: 15_000 });

    const trials: TrialMetrics[] = [];
    let invalidTrials = 0;
    let currentValue = await ageInput.inputValue();
    for (let trial = 0; trial < EDITS.length; trial += 1) {
      let age = EDITS[trial];
      if (String(age) === currentValue) age = age === 30 ? 86 : 30;
      currentValue = String(age);

      const revisionBefore = Number(await form.getAttribute("data-revision"));
      await page.evaluate(() => {
        const holder = window as unknown as { __cortwinPerf?: PerfProbe };
        const probe = holder.__cortwinPerf;
        if (probe === undefined) throw new Error("perf probe missing");
        probe.resetMarks();
        probe.armStage();
      });
      await ageInput.fill(String(age));
      await expect
        .poll(() => form.getAttribute("data-revision").then((value) => Number(value)), {
          message: `editing Age to ${age} must increment the case revision (C-09)`,
          timeout: 15_000
        })
        .toBeGreaterThan(revisionBefore);
      await expect(explore, "evaluation must settle back to ready").toHaveAttribute(
        "data-eval-status",
        "ready",
        { timeout: 25_000 }
      );
      await settle(page, 550);

      const snapshot = await readProbe(page);
      const delta = (t: number | null): number | null => {
        if (t === null || snapshot.lastInputAt === null) return null;
        const value = t - snapshot.lastInputAt;
        return value >= 0 && value < 30_000 ? r1(value) : null;
      };
      const candidates = [delta(snapshot.tUpdating), delta(snapshot.tReadout), delta(snapshot.tStage)];
      const visible = candidates.filter((value): value is number => value !== null);
      const firstVisual = visible.length > 0 ? Math.min(...visible) : null;
      const metrics: TrialMetrics = {
        trial: trial + 1,
        age,
        toRevision: delta(snapshot.tRev),
        toUpdating: delta(snapshot.tUpdating),
        toReady: delta(snapshot.tReady),
        toReadout: delta(snapshot.tReadout),
        toStage: delta(snapshot.tStage),
        firstVisual
      };
      if (firstVisual === null) invalidTrials += 1;
      trials.push(metrics);
      logPerf("edit_trial", {
        value: firstVisual === null ? "invalid" : firstVisual,
        unit: "ms",
        n: 1,
        trial: trial + 1,
        age,
        throttle: 1,
        input_to_revision: metrics.toRevision ?? "n/a",
        input_to_updating: metrics.toUpdating ?? "n/a",
        input_to_ready: metrics.toReady ?? "n/a",
        input_to_readout: metrics.toReadout ?? "n/a",
        input_to_stage: metrics.toStage ?? "n/a"
      });
      currentValue = await ageInput.inputValue();
    }

    const validTrials = trials.filter((entry) => entry.firstVisual !== null);
    const firstVisualSeries = validTrials.map((entry) => entry.firstVisual as number);
    const readoutSeries = trials.map((entry) => entry.toReadout).filter((v): v is number => v !== null);
    const stageSeries = trials.map((entry) => entry.toStage).filter((v): v is number => v !== null);
    const readySeries = trials.map((entry) => entry.toReady).filter((v): v is number => v !== null);
    const revisionSeries = trials.map((entry) => entry.toRevision).filter((v): v is number => v !== null);
    logPerf("edit_trials", {
      value: validTrials.length,
      unit: "valid",
      n: trials.length,
      throttle: 1,
      invalid: invalidTrials
    });
    const firstVisual = logSummary("input_to_first_visual", "ms", firstVisualSeries, 1, {
      budget: "B-01"
    });
    logSummary("input_to_readout", "ms", readoutSeries, 1, { budget: "B-01" });
    logSummary("input_to_stage_colour", "ms", stageSeries, 1, { budget: "B-01" });
    logSummary("input_to_revision_commit", "ms", revisionSeries, 1);
    logSummary("input_to_eval_ready", "ms", readySeries, 1);

    /* ================= PHASE 3 — explanations @1× (B-03 samples) ================= */
    const selectVessel = async (id: string): Promise<void> => {
      await page
        .locator(`[aria-label="Vessel probabilities"] > button[data-target-id="${id}"]`)
        .click();
      await expect(whyView, `Why view must render for ${id}`).toBeVisible({ timeout: 20_000 });
      await expect(
        whyView.locator("li.ct-ins-attr-row"),
        `${id} explanation must carry attribution rows`
      ).not.toHaveCount(0, { timeout: 20_000 });
      await settle(page, 250);
    };
    for (const id of VESSEL_CLICK_CYCLE) await selectVessel(id);
    const revisionBeforeExtraEdit = Number(await form.getAttribute("data-revision"));
    const extraAge = (await ageInput.inputValue()) === "64" ? "66" : "64";
    await ageInput.fill(extraAge);
    await expect
      .poll(() => form.getAttribute("data-revision").then((value) => Number(value)), {
        message: "the B-03 warm-up edit must increment the revision",
        timeout: 15_000
      })
      .toBeGreaterThan(revisionBeforeExtraEdit);
    await expect(explore).toHaveAttribute("data-eval-status", "ready", { timeout: 25_000 });
    await settle(page, 300);
    await selectVessel("LAD");
    const tEditsEnd = await pageNow();

    /* ================= PHASE 4 — interaction fps @4× (B-04, B-05) ================= */
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await page.evaluate(() => {
      const holder = window as unknown as { __cortwinPerf?: PerfSnapshot };
      const probe = holder.__cortwinPerf;
      if (probe === undefined) throw new Error("perf probe missing");
      probe.pixelArmed = false;
    });
    await settle(page, 800);
    const tierPreFps = await stageTier("pre-fps");

    const rendersLength = async (): Promise<number> => (await readProbe(page)).renders.length;
    const rendersSince = async (mark: number): Promise<number[]> => {
      const probe = await readProbe(page);
      return probe.renders.slice(mark);
    };

    const box = await stage.boundingBox();
    expect(box, ".ct-stage must have a bounding box to drive interaction").not.toBeNull();
    const bounds = box as NonNullable<typeof box>;
    const cx = bounds.x + bounds.width / 2;
    const cy = bounds.y + bounds.height / 2;
    const radiusX = Math.min(140, bounds.width / 4);
    const radiusY = Math.min(70, bounds.height / 4);

    const fpsMark = await rendersLength();
    let fpsSource = "orbit-drag";
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    let iteration = 0;
    for (; iteration < 40; iteration += 1) {
      const angle = (iteration / 40) * Math.PI * 2;
      await page.mouse.move(cx + Math.cos(angle) * radiusX, cy + Math.sin(angle) * radiusY, {
        steps: 3
      });
      await page.waitForTimeout(100);
      if (iteration % 8 === 7) {
        const spanSamples = await rendersSince(fpsMark);
        if (spanSamples.length >= 2 && spanSamples[spanSamples.length - 1] - spanSamples[0] >= 2200) break;
      }
    }
    await page.mouse.up();

    let activity = await rendersSince(fpsMark);
    if (activity.length < 2 || activity[activity.length - 1] - activity[0] < 2000) {
      fpsSource = "drag+edits";
      const fallbackAges = [58, 68, 48];
      for (const age of fallbackAges) {
        const revisionBefore = Number(await form.getAttribute("data-revision"));
        await ageInput.fill(String(age));
        await expect
          .poll(() => form.getAttribute("data-revision").then((value) => Number(value)), {
            message: `fps fallback edit ${age} must commit`,
            timeout: 20_000
          })
          .toBeGreaterThan(revisionBefore);
        await expect(explore).toHaveAttribute("data-eval-status", "ready", { timeout: 25_000 });
        await settle(page, 350);
        activity = await rendersSince(fpsMark);
        if (activity.length >= 2 && activity[activity.length - 1] - activity[0] >= 2000) break;
      }
    }

    const glWindowOk = activity.length >= 2 && activity[activity.length - 1] - activity[0] >= 2000;
    let fps = Number.NaN;
    let windowMs = 0;
    let frameP50 = 0;
    let frameP95 = 0;
    let activeFps = Number.NaN;
    let activeSamples = 0;
    let fpsStats: Summary | null = null;

    if (glWindowOk) {
      const fpsStart = activity[0];
      const fpsEnd = activity[activity.length - 1];
      fpsStats = frameStats(activity, fpsStart, fpsEnd);
      expect(fpsStats, "frameStats must produce a window for the interaction sample").not.toBeNull();
      const frameDeltas: number[] = [];
      for (let index = 1; index < activity.length; index += 1) {
        frameDeltas.push(activity[index] - activity[index - 1]);
      }
      frameP50 = percentile(frameDeltas, 0.5) as number;
      frameP95 = percentile(frameDeltas, 0.95) as number;
      windowMs = fpsEnd - fpsStart;
      fps = fpsStats === null ? Number.NaN : fpsStats.fps;
      // Render-on-demand: eval waits and idle sit inside the same window as
      // active rendering. B-04 pacing is judged on consecutive-frame deltas
      // that belong to one rendering run (≤250 ms apart); the window average
      // is logged as context, never as the budget figure.
      const activeDeltas = frameDeltas.filter((delta) => delta > 0 && delta <= 250);
      activeSamples = activeDeltas.length;
      if (activeSamples > 0) {
        const activeMean = activeDeltas.reduce((sum, delta) => sum + delta, 0) / activeSamples;
        activeFps = 1000 / activeMean;
      }
      logPerf("interaction_fps", {
        value: r1(fps),
        unit: "fps",
        n: activity.length,
        p50: r1(frameP50),
        p95: r1(frameP95),
        throttle: 4,
        window_ms: r1(windowMs),
        source: fpsSource,
        tier: tierPreFps,
        budget: "B-04-context"
      });
      logPerf("interaction_active_fps", {
        value: activeSamples === 0 ? "not-measurable" : r1(activeFps),
        unit: "fps",
        n: activeSamples,
        throttle: 4,
        tier: tierPreFps,
        budget: "B-04",
        method: "consecutive-frame-deltas-le-250ms"
      });
      if (fpsStats !== null && fpsStats.minBucketFps !== null) {
        logPerf("interaction_fps_bucket_min", {
          value: r1(fpsStats.minBucketFps),
          unit: "fps",
          n: fpsStats.buckets.length,
          throttle: 4,
          bucket_ms: 500,
          tier: tierPreFps,
          budget: "B-04-bucket"
        });
      }
      // Measurement-integrity guards only. The 30 fps figure is a design
      // target — its PASS/MISS verdict is computed in tools/qa/perf-report.md
      // from these logged numbers (AGENTS §7 law 16), never enforced here by
      // tuning an assertion floor toward the budget.
      expect(Number.isFinite(fps), "window fps must be finite when a GL window exists").toBe(true);
      expect(frameP50, "frame-time p50 <= p95").toBeLessThanOrEqual(frameP95);
      expect(
        activity.length,
        "a GL window needs ≥2 real frames to exist at all"
      ).toBeGreaterThanOrEqual(2);
    } else {
      // No GL frame window: the quality governor has taken the stage to Q3
      // (software rasterizer or context loss) — the 2D schematic path. Never
      // fabricate a fps number for a tier that does not run a GL loop (law 16).
      // Instead measure real interaction responsiveness at Q3 @4× throttle.
      fpsSource = `no-gl-window@${tierPreFps}`;
      logPerf("interaction_fps", {
        value: "not-measurable",
        unit: "fps",
        n: activity.length,
        throttle: 4,
        source: fpsSource,
        tier: tierPreFps,
        budget: "B-04",
        reason: "governor-degraded-to-Q3-or-no-gl-draws-in-window"
      });
      const q3Ages = [61, 44, 79];
      const q3Readout: number[] = [];
      for (const age of q3Ages) {
        await page.evaluate(() => {
          const holder = window as unknown as { __cortwinPerf?: PerfSnapshot };
          const probe = holder.__cortwinPerf;
          if (probe !== undefined) probe.resetMarks();
        });
        const revisionBefore = Number(await form.getAttribute("data-revision"));
        await ageInput.fill(String(age));
        await expect
          .poll(() => form.getAttribute("data-revision").then((value) => Number(value)), {
            message: `Q3 responsiveness edit ${age} must commit`,
            timeout: 20_000
          })
          .toBeGreaterThan(revisionBefore);
        await expect(explore, "Q3 edit must settle to ready").toHaveAttribute(
          "data-eval-status",
          "ready",
          { timeout: 25_000 }
        );
        const snap = await readProbe(page);
        if (snap.tReadout !== null && snap.lastInputAt !== null) {
          const deltaMs = snap.tReadout - snap.lastInputAt;
          if (deltaMs >= 0 && deltaMs < 30_000) q3Readout.push(r1(deltaMs));
        }
      }
      const q3Summary = logSummary("q3_input_to_readout", "ms", q3Readout, 4, {
        tier: tierPreFps,
        budget: "B-01"
      });
      expect(
        q3Readout.length,
        "Q3 responsiveness needs ≥2 real input→readout samples"
      ).toBeGreaterThanOrEqual(2);
      expect(q3Summary, "Q3 readout summary must exist").not.toBeNull();
      if (q3Summary !== null) {
        expect(q3Summary.p95, "Q3 input→readout p95 must stay sane @4×").toBeLessThan(5_000);
      }
    }

    await settle(page, 2500);
    const idleMark = await rendersLength();
    await settle(page, 1000);
    const idleFrames = (await rendersLength()) - idleMark;
    logPerf("idle_frames", {
      value: idleFrames,
      unit: "frames",
      n: 1,
      window_ms: 1000,
      throttle: 4,
      budget: "B-04"
    });
    expect(idleFrames, "render-on-demand: an idle second must not run an unconditional loop").toBeLessThan(60);
    await stageTier("post-fps");
    const heapFps = await readHeap("post-fps", 4);

    /* ================= PHASE 5 — scene cost, worker timings, transfer, memory ================= */
    const fullProbe = await readProbe(page);
    const maxOfSeries = (values: readonly number[]): number =>
      values.reduce((best, value) => (value > best ? value : best), 0);
    const drawCallsMax = maxOfSeries(fullProbe.callSeries);
    const trianglesMax = maxOfSeries(fullProbe.triSeries);
    logPerf("draw_calls", {
      value: drawCallsMax,
      unit: "calls",
      n: fullProbe.callSeries.length,
      throttle: "mixed",
      budget: "B-05"
    });
    logPerf("triangles", {
      value: trianglesMax,
      unit: "triangles",
      n: fullProbe.triSeries.length,
      throttle: "mixed",
      budget: "B-05"
    });
    logPerf("texture_creates", {
      value: fullProbe.texCreates,
      unit: "textures",
      n: fullProbe.callSeries.length,
      throttle: "mixed",
      budget: "B-05"
    });
    logPerf("texture_uploads", {
      value: fullProbe.texUploads,
      unit: "textures",
      n: fullProbe.callSeries.length,
      throttle: "mixed",
      budget: "B-05"
    });
    const tierFinal = await stage.getAttribute("data-tier");
    if ((tierFinal ?? "Q0") === "Q3" || fullProbe.callSeries.length === 0) {
      // Q3 schematic path: no GL scene exists, so B-05 scene-cost budgets do
      // not apply — record why instead of asserting GL numbers that cannot
      // exist (law 16: a target is never presented as a measurement).
      logPerf("scene_cost", {
        value: "not-applicable",
        unit: "tier",
        n: 0,
        throttle: "mixed",
        tier: tierFinal ?? "unknown",
        budget: "B-05",
        reason: "Q3-schematic-no-GL-scene"
      });
    } else {
      expect(drawCallsMax, "draw calls must be positive (scene really rendered)").toBeGreaterThan(0);
      expect(drawCallsMax, "draw calls sane upper bound").toBeLessThanOrEqual(500);
      expect(trianglesMax, "triangles must be positive").toBeGreaterThan(0);
      expect(trianglesMax, "triangles sane upper bound").toBeLessThan(2_000_000);
    }
    expect(fullProbe.pixelErrors, "the pixel probe must not error").toBe(0);

    const records = await readWorkerRecords(page);
    const inPhase = (record: WorkerRecord): boolean => record.t >= tEditsStart && record.t < tEditsEnd;
    const bootEvaluates = records.filter(
      (record) =>
        record.operation === "evaluate" &&
        record.channel === "case" &&
        record.status === "ok" &&
        record.t < tEditsStart
    );
    const phaseEvaluates = records.filter(
      (record) =>
        inPhase(record) &&
        record.operation === "evaluate" &&
        record.channel === "case" &&
        record.status === "ok"
    );
    const phaseExplains = records.filter(
      (record) => inPhase(record) && record.operation === "explain" && record.status === "ok"
    );
    const fpsEvaluates = records.filter(
      (record) =>
        record.t >= tEditsEnd &&
        record.operation === "evaluate" &&
        record.channel === "case" &&
        record.status === "ok"
    );
    const errorResponses = records.filter((record) => record.status === "error");
    logPerf("worker_records", {
      value: records.length,
      unit: "responses",
      n: 1,
      evaluate_ok: phaseEvaluates.length,
      explain_ok: phaseExplains.length,
      errors: errorResponses.length
    });
    const evaluateSummary = logSummary(
      "evaluate_compute",
      "ms",
      phaseEvaluates.map((record) => record.computeMs),
      1,
      { budget: "B-02" }
    );
    logSummary(
      "explain_compute",
      "ms",
      phaseExplains.map((record) => record.computeMs),
      1,
      { budget: "B-03" }
    );
    logSummary(
      "evaluate_compute_boot",
      "ms",
      bootEvaluates.map((record) => record.computeMs),
      4,
      { budget: "B-02" }
    );
    logSummary(
      "evaluate_compute_fps_window",
      "ms",
      fpsEvaluates.map((record) => record.computeMs),
      4,
      { budget: "B-02" }
    );
    expect(phaseEvaluates.length, "B-02 needs ≥5 real worker evaluations").toBeGreaterThanOrEqual(5);
    expect(phaseExplains.length, "B-03 needs ≥5 real worker explanations").toBeGreaterThanOrEqual(5);

    await Promise.allSettled(bodyTasks);
    const bytesOf = (predicate: (path: string) => boolean): { bytes: number; files: number } => {
      let bytes = 0;
      let files = 0;
      for (const [url, size] of byteByUrl) {
        if (predicate(url.split("?")[0])) {
          bytes += size;
          files += 1;
        }
      }
      return { bytes, files };
    };
    const js = bytesOf((path) => path.endsWith(".js"));
    const css = bytesOf((path) => path.endsWith(".css"));
    const model = bytesOf((path) => path.endsWith("/model.json"));
    const registry = bytesOf((path) => path.endsWith("/registry.json"));
    const results = bytesOf((path) => path.endsWith("/results.json"));
    const cases = bytesOf((path) => path.endsWith("/cases.json"));
    const structures = bytesOf((path) => path.endsWith(".glb"));
    const b06Total = js.bytes + model.bytes + registry.bytes;
    logPerf("critical_js_bytes", { value: js.bytes, unit: "B", n: js.files, throttle: "n/a", budget: "B-06" });
    logPerf("model_bytes", { value: model.bytes, unit: "B", n: model.files, throttle: "n/a", budget: "B-06" });
    logPerf("registry_bytes", { value: registry.bytes, unit: "B", n: registry.files, throttle: "n/a", budget: "B-06" });
    logPerf("b06_total_bytes", { value: b06Total, unit: "B", n: js.files + model.files + registry.files, throttle: "n/a", budget: "B-06" });
    logPerf("structure_bytes", { value: structures.bytes, unit: "B", n: structures.files, throttle: "n/a", budget: "B-07" });
    logPerf("results_bytes", { value: results.bytes, unit: "B", n: results.files, throttle: "n/a" });
    logPerf("cases_bytes", { value: cases.bytes, unit: "B", n: cases.files, throttle: "n/a" });
    logPerf("css_bytes", { value: css.bytes, unit: "B", n: css.files, throttle: "n/a" });
    logPerf("body_capture_failures", { value: bodyFailures.length, unit: "responses", n: 1, throttle: "n/a" });
    expect(js.bytes, "critical JS must be captured from real responses").toBeGreaterThan(0);
    expect(model.bytes, "model.json must be captured from a real response").toBeGreaterThan(0);
    expect(registry.bytes, "registry.json must be captured from a real response").toBeGreaterThan(0);
    expect(structures.bytes, "the structure asset must be captured from a real response").toBeGreaterThan(0);
    expect(bodyFailures, "response bodies for budget files must be readable").toEqual([]);

    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    const heapEdits = await readHeap("post-edits", 1);
    logPerf("worker_memory", {
      value: "NOT-MEASURABLE",
      unit: "MB",
      n: 0,
      throttle: "n/a",
      budget: "B-09",
      reason: "playwright-cdp-cannot-attach-worker-targets"
    });
    logPerf("memory_peak", {
      value: r1(Math.max(heapBoot, heapEdits, heapFps)),
      unit: "MB",
      n: 3,
      throttle: "mixed",
      budget: "B-09"
    });

    logPerf("run_context", {
      value: 1,
      unit: "run",
      n: 1,
      console_errors: consoleErrors.length,
      page_errors: pageErrors.length,
      workers: page.workers().length,
      tier_final: await stage.getAttribute("data-tier") ?? "unknown"
    });

    await test.info().attach("perf-measurements", {
      body: JSON.stringify(
        {
          firstPaintedMs,
          firstColouredMs,
          trials,
          validTrials: validTrials.length,
          fps: {
            fps,
            activeFps,
            activeSamples,
            windowMs,
            frames: activity.length,
            frameP50,
            frameP95,
            source: fpsSource,
            idleFrames
          },
          scene: { drawCallsMax, trianglesMax, texCreates: fullProbe.texCreates, texUploads: fullProbe.texUploads },
          worker: {
            total: records.length,
            evaluateBoot: bootEvaluates.length,
            evaluatePhase: phaseEvaluates.length,
            explainPhase: phaseExplains.length,
            evaluatePhaseMs: phaseEvaluates.map((record) => r1(record.computeMs)),
            explainPhaseMs: phaseExplains.map((record) => r1(record.computeMs))
          },
          transfer: { js: js.bytes, model: model.bytes, registry: registry.bytes, b06Total, structures: structures.bytes, results: results.bytes, cases: cases.bytes },
          memory: { boot: heapBoot, postEdits: heapEdits, postFps: heapFps },
          consoleErrors,
          pageErrors
        },
        null,
        2
      ),
      contentType: "application/json"
    });

    expect(consoleErrors, "zero console errors during the measured run").toEqual([]);
    expect(pageErrors, "zero unhandled page errors during the measured run").toEqual([]);
    expectSane("B-01 input→first visual", firstVisual, 30_000);
    expect(readoutSeries.length, "B-01 needs ≥10 readout samples").toBeGreaterThanOrEqual(10);
    expectSane("B-02 evaluate compute", evaluateSummary, 5_000);
    expect(firstVisualSeries.length, "≥10 valid edits for the p95 input→visual series").toBeGreaterThanOrEqual(10);
    logPerf("run_complete", { value: "ok", unit: "status", n: 1, throttle: "n/a" });
  });
});
