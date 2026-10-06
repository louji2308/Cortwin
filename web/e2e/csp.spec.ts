import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { EXPECTED_CSP, interact, settle } from "./support";

interface CspViolation {
  directive: string;
  blockedURI: string;
  sourceFile?: string;
  sample?: string;
}

/**
 * Installs a `securitypolicyviolation` collector before any page script runs,
 * so violations raised during parse/boot are captured too.
 */
async function installViolationCollector(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const target = window as unknown as Record<string, unknown>;
    const list: CspViolation[] = [];
    target["__cspViolations"] = list;
    document.addEventListener("securitypolicyviolation", (event) => {
      list.push({
        directive: event.violatedDirective,
        blockedURI: event.blockedURI,
        sourceFile: event.sourceFile,
        sample: event.sample
      });
    });
  });
}

async function readViolations(page: Page): Promise<CspViolation[]> {
  const violations = await page.evaluate(() => {
    const target = window as unknown as Record<string, unknown>;
    return target["__cspViolations"] as CspViolation[] | undefined;
  });
  if (violations === undefined) {
    throw new Error(
      "csp-audit: violation collector missing — installViolationCollector() must run before page.goto()"
    );
  }
  return violations;
}

test.describe("VC-15 / C-15 CSP verification", () => {
  test("built page carries the contract CSP meta tag verbatim", async ({ page }) => {
    await page.goto("/", { waitUntil: "load" });
    const metas = page.locator('meta[http-equiv="Content-Security-Policy"]');
    await expect(metas, "exactly one CSP meta tag is required").toHaveCount(1);
    expect(
      await metas.getAttribute("content"),
      "CSP directives must match Project/Contracts.md line 448 byte for byte"
    ).toBe(EXPECTED_CSP);
  });

  test("zero securitypolicyviolation events from load through interaction", async ({
    page
  }) => {
    await installViolationCollector(page);
    await page.goto("/", { waitUntil: "load" });
    await settle(page);
    await interact(page);
    await settle(page);

    const violations = await readViolations(page);
    await test.info().attach("csp-violations", {
      body: JSON.stringify(violations, null, 2),
      contentType: "application/json"
    });
    expect(violations, "C-15 CSP violations observed").toEqual([]);
  });

  test("violation collector detects a blocked inline script (mutation check)", async ({
    page
  }) => {
    await installViolationCollector(page);
    await page.goto("/", { waitUntil: "load" });

    await page.evaluate(() => {
      const script = document.createElement("script");
      script.textContent = "window.__cspMutationProbe = true;";
      document.head.appendChild(script);
    });

    const violations = await readViolations(page);
    expect(
      violations.length,
      "the collector must observe the deliberately blocked inline script"
    ).toBeGreaterThan(0);
    expect(violations.some((entry) => entry.directive.includes("script-src"))).toBe(true);
    expect(violations.some((entry) => entry.blockedURI === "inline")).toBe(true);
    expect(
      await page.evaluate(() => {
        const target = window as unknown as Record<string, unknown>;
        return target["__cspMutationProbe"] === true;
      }),
      "the blocked inline script must NOT have executed"
    ).toBe(false);
  });
});
