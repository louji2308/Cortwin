import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const css = readFileSync(fileURLToPath(new URL("./tokens.css", import.meta.url)), "utf8");

const colours: Record<string, string> = Object.fromEntries(
  [...css.matchAll(/--ct-color-([a-z-]+):\s*(#[0-9a-f]{6})/g)].map((match) => [
    match[1],
    match[2]
  ])
);

const luminance = (hex: string): number => {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const [r, g, b] = channels.map((channel) => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrast = (fg: string, bg: string): number => {
  const [l1, l2] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (l1 + 0.05) / (l2 + 0.05);
};

const expectPair = (fg: string, bg: string, minimum: number): void => {
  const ratio = contrast(colours[fg], colours[bg]);
  expect(Number.isFinite(ratio)).toBe(true);
  expect(ratio).toBeGreaterThanOrEqual(minimum);
};

describe("design/tokens — AA contrast evidence (Contracts §9, AGENTS §6.1)", () => {
  it("defines the documented colour tokens", () => {
    for (const name of [
      "bg",
      "surface",
      "surface-raised",
      "border",
      "border-strong",
      "text",
      "text-muted",
      "accent",
      "on-accent",
      "focus"
    ]) {
      expect(colours[name]).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("meets AA (4.5:1) for every text pair the design relies on", () => {
    expectPair("text", "bg", 4.5);
    expectPair("text", "surface", 4.5);
    expectPair("text", "surface-raised", 4.5);
    expectPair("text-muted", "bg", 4.5);
    expectPair("text-muted", "surface", 4.5);
    expectPair("text-muted", "surface-raised", 4.5);
    expectPair("accent", "bg", 4.5);
    expectPair("accent", "surface", 4.5);
    expectPair("on-accent", "accent", 4.5);
  });

  it("meets AA non-text minimums (3:1) for focus ring and strong borders", () => {
    expectPair("focus", "bg", 3);
    expectPair("focus", "surface", 3);
    expectPair("border-strong", "bg", 3);
    expectPair("border-strong", "surface", 3);
  });

  it("documents the ratios in the header comment block", () => {
    expect(css).toContain("WCAG 2.1 AA contrast evidence");
    expect(css).toMatch(/text\s+#14161a on bg\s+#fafaf7 -> 17\.32:1/);
    expect(css).toMatch(/focus ring\s+#0b7c70 on bg\s+#fafaf7 -> 4\.86:1/);
  });
});

describe("design/tokens — motion, focus and reduced-motion contract", () => {
  it("keeps standard transitions within 300-400 ms ease-out and camera at 700 ms", () => {
    const duration = (name: string): number => {
      const match = new RegExp(`--ct-duration-${name}:\\s*(\\d+)ms`).exec(css);
      expect(match).not.toBeNull();
      return Number(match?.[1]);
    };
    expect(duration("fast")).toBeGreaterThanOrEqual(300);
    expect(duration("fast")).toBeLessThanOrEqual(400);
    expect(duration("standard")).toBeGreaterThanOrEqual(300);
    expect(duration("standard")).toBeLessThanOrEqual(400);
    expect(duration("data")).toBeGreaterThanOrEqual(300);
    expect(duration("data")).toBeLessThanOrEqual(400);
    expect(duration("camera")).toBe(700);
    expect(css).toContain("--ct-ease-out:");
    expect(css).toContain("--ct-transition-camera: var(--ct-duration-camera) var(--ct-ease-out)");
  });

  it("collapses every duration to 0 under prefers-reduced-motion", () => {
    const reducedMotionBlock = /@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/.exec(
      css
    );
    expect(reducedMotionBlock).not.toBeNull();
    const block = reducedMotionBlock?.[1] ?? "";
    for (const name of ["fast", "standard", "data", "camera"]) {
      expect(block).toContain(`--ct-duration-${name}: 0ms;`);
    }
  });

  it("provides visible focus tokens, tabular numerals and 44px targets", () => {
    expect(css).toContain(":focus-visible {");
    expect(css).toContain("--ct-focus-outline:");
    expect(css).toContain("--ct-font-variant-numeric: tabular-nums;");
    expect(css).toContain("--ct-target-min: 44px;");
  });
});
