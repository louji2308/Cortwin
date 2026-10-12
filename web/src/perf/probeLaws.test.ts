import { describe, expect, it } from "vitest";
import { perfInitSource } from "./probe";

/**
 * Source-level laws for the injected perf probe (`probe.ts`).
 *
 * The probe is stringified into the measured page (`perfInitSource()`), so its
 * behaviour cannot be unit-executed without a WebGL context — the e2e harness
 * asserts the runtime behaviour (first_painted/first_coloured non-null,
 * pixel_errors=0). These laws pin the textual invariants the 2026-10-12
 * measurement-integrity fix depends on (perf-report §7):
 *
 * 1. **Duty gating** — rendered-frame probes run only while B-08 marks are
 *    missing (boot capture, ends after 1–2 frames) or while the edit window
 *    is armed (`armStage`); between the two duties the reveal/flight frames
 *    run with zero readback stalls, so the instrument cannot inflate the
 *    frame gaps the quality governor samples.
 * 2. **Readback throttle** — within the edit duty, at most one synchronous
 *    `readPixels` per `PIXEL_PROBE_INTERVAL_MS`, with `armStage()` resetting
 *    the interval so the first frame after every edit still probes
 *    immediately (B-01 stage-colour sensitivity preserved).
 */
describe("perf probe source laws (injected-init invariants)", () => {
  const source = perfInitSource();

  it("pins the readback interval constant at 80 ms", () => {
    expect(source).toContain("const PIXEL_PROBE_INTERVAL_MS = 80");
  });

  it("gates rendered-frame probes on boot duty or armed edit duty", () => {
    expect(source).toContain("const bootDuty =");
    expect(source).toContain("state.firstPaintedAt === null || state.firstColouredAt === null");
    expect(source).toContain("state.editArmed &&");
    expect(source).toContain("if (state.pixelArmed && (bootDuty || editDuty))");
    // The probe call must live inside the gated branch, never outside it.
    const gateAt = source.indexOf("if (state.pixelArmed && (bootDuty || editDuty))");
    const probeAt = source.indexOf("probe(timestamp, true)");
    expect(gateAt).toBeGreaterThanOrEqual(0);
    expect(probeAt).toBeGreaterThan(gateAt);
  });

  it("armStage arms the edit duty and resets the interval", () => {
    const armAt = source.indexOf("armStage()");
    expect(armAt).toBeGreaterThanOrEqual(0);
    const resetAt = source.indexOf("state.lastProbeAt = 0", armAt);
    expect(resetAt).toBeGreaterThan(armAt);
    const armDutyAt = source.indexOf("state.editArmed = true", armAt);
    expect(armDutyAt).toBeGreaterThan(armAt);
  });

  it("keeps the pre-GL cold-start polling path (B-08 first_painted capture)", () => {
    expect(source).toContain("state.pixelArmed && !state.glOk && timestamp - state.lastProbeAt > 50");
  });
});
