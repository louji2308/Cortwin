import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseAccent } from "./accent";

/**
 * Node-safe accent tests. `parseAccent` is pure, so we feed it text we read
 * ourselves via `node:fs` — sidestepping the vitest limitation where
 * `import … from "./tokens.css?raw"` resolves to an empty string. This still
 * guards the REAL token sheet: a typo or removal of `--ct-color-accent` in
 * tokens.css fails here, not silently at runtime.
 */

const tokensCss = readFileSync(
  fileURLToPath(new URL("./tokens.css", import.meta.url)),
  "utf8"
);

describe("parseAccent", () => {
  it("extracts the accent from the real token sheet", () => {
    expect(parseAccent(tokensCss)).toBe("#38bdf8");
  });

  it("accepts 8-digit hex and a trailing selector boundary", () => {
    expect(parseAccent("--ct-color-accent: #ABCDEF12 &{")).toBe("#ABCDEF12");
  });

  it("throws when the token is absent", () => {
    expect(() => parseAccent(":root { --ct-color-bg: #000; }")).toThrow(
      /--ct-color-accent not found/
    );
  });

  it("throws on empty input (the vitest ?raw shape)", () => {
    expect(() => parseAccent("")).toThrow(/--ct-color-accent not found/);
  });
});
