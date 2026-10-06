/**
 * Synthetic fixture contract (Implementation_Plan P7 step 8; AGENTS §6.5).
 *
 * The fixture is the pane suite's C-04-shaped test double. These tests lock:
 *   - the fixture is visibly marked as synthetic on its first line;
 *   - it carries every C-04 top-level key, and every key the five panes read,
 *     with populated sections (requirement d);
 *   - variant B differs from variant A on every number the panes render, so
 *     the prop-driven tests in panes.test.tsx can fail on hardcoding;
 *   - the excluded-column list carries the forbidden model inputs.
 *
 * No artifact is read here — assertions run against the hand-authored fixture
 * module only.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { C04_TOP_LEVEL_KEYS, TRUST_RESULTS_KEYS_PANES_READ } from "./types";
import { syntheticResults, syntheticResultsVariantB } from "./__fixtures__/syntheticResults";

const FIXTURE_PATH = fileURLToPath(new URL("./__fixtures__/syntheticResults.ts", import.meta.url));

describe("synthetic fixture", () => {
  it("is marked synthetic on its first line", () => {
    const firstLine = readFileSync(FIXTURE_PATH, "utf8").split(/\r?\n/, 1)[0];
    expect(firstLine).toContain("// SYNTHETIC FIXTURE");
    expect(firstLine).toContain("NOT model output");
    expect(firstLine).toContain("Never rendered in the product");
  });

  it("carries every C-04 top-level key (requirement d)", () => {
    for (const key of C04_TOP_LEVEL_KEYS) {
      expect(syntheticResults).toHaveProperty(key);
    }
    expect(Object.keys(syntheticResults).sort()).toEqual([...C04_TOP_LEVEL_KEYS].sort());
  });

  it("carries every C-04 key the panes consume, each with populated content", () => {
    for (const key of TRUST_RESULTS_KEYS_PANES_READ) {
      expect(syntheticResults[key]).toBeDefined();
    }

    expect(syntheticResults.protocol?.patientCount).toBe(300);
    expect(syntheticResults.protocol?.featureCount).toBe(54);
    expect(syntheticResults.protocol?.noSmote).toBe(true);

    const perf = syntheticResults.performance;
    expect(perf?.CAD?.rocAuc).toBeDefined();
    expect(perf?.LAD?.f1).toBeDefined();
    expect(perf?.LCX?.rocAucCI).toBeDefined();
    expect(perf?.RCA?.majorityBaseline).toBeDefined();

    const cal = syntheticResults.calibration?.CAD;
    expect(cal?.brierRaw).toBeDefined();
    expect(cal?.brierPlatt).toBeDefined();
    expect(cal?.reliabilityCurve.raw.length).toBeGreaterThan(0);
    expect(cal?.reliabilityCurve.platt.length).toBe(cal?.reliabilityCurve.raw.length);

    const dec = syntheticResults.decisions?.CAD;
    expect(dec?.points.length).toBeGreaterThan(0);
    expect(dec?.selectedThreshold).toBeDefined();
    expect(dec?.abstention?.sweeps?.length).toBeGreaterThan(0);

    expect(syntheticResults.subgroups?.length).toBeGreaterThanOrEqual(13);
    expect(syntheticResults.subgroups?.some((row) => row.caveat != null)).toBe(true);

    expect(syntheticResults.leakageLab?.probes.map((probe) => probe.probeId)).toEqual([
      "honest",
      "smote_before_cv",
      "feature_selection_before_cv",
      "target_leakage",
      "seed_sensitivity"
    ]);
    expect(syntheticResults.leakageLab?.excludedColumns).toEqual([
      "LAD",
      "LCX",
      "RCA",
      "Cath",
      "Exertional CP"
    ]);

    expect(syntheticResults.reliability?.targets.CAD?.tier).toBe("strong");
    expect(syntheticResults.reliability?.targets.LCX?.tier).toBe("limited");
  });

  it("variant B differs from variant A wherever the panes show a number", () => {
    const a = syntheticResults;
    const b = syntheticResultsVariantB;

    expect(b.protocol?.patientCount).not.toBe(a.protocol?.patientCount);
    expect(b.performance?.CAD?.f1).not.toBe(a.performance?.CAD?.f1);
    expect(b.performance?.CAD?.rocAuc).not.toBe(a.performance?.CAD?.rocAuc);
    expect(b.calibration?.CAD?.brierRaw).not.toBe(a.calibration?.CAD?.brierRaw);
    expect(b.calibration?.CAD?.eceRaw).not.toBe(a.calibration?.CAD?.eceRaw);
    expect(b.decisions?.CAD?.selectedThreshold).not.toBe(a.decisions?.CAD?.selectedThreshold);
    expect(b.reliability?.targets.CAD?.tier).not.toBe(a.reliability?.targets.CAD?.tier);
    expect(b.leakageLab?.probes[1].metricValue).not.toBe(a.leakageLab?.probes[1].metricValue);

    const subgroupA = a.subgroups?.find((row) => row.targetId === "CAD" && row.groupId === "age_lt_60");
    const subgroupB = b.subgroups?.find((row) => row.targetId === "CAD" && row.groupId === "age_lt_60");
    expect(subgroupB?.n).not.toBe(subgroupA?.n);
    expect(subgroupB?.rocAuc).not.toBe(subgroupA?.rocAuc);

    // Everything variant B did not override stays identical, so a failing
    // pane test points at the pane, not at fixture drift.
    expect(b.performance?.LAD).toEqual(a.performance?.LAD);
    expect(b.leakageLab?.excludedColumns).toEqual(a.leakageLab?.excludedColumns);
  });
});
