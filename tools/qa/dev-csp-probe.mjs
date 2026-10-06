#!/usr/bin/env node
/**
 * tools/qa/dev-csp-probe.mjs — evidence tool for the DEV-mode CSP caveat.
 *
 * The C-15 CSP meta tag lives in web/index.html, so it is also served by
 * `npm run dev`. @vitejs/plugin-react injects an INLINE react-refresh preamble
 * script in dev, which `script-src 'self'` blocks (CSP has no 'unsafe-inline'
 * for scripts — by contract). This probe measures that deviation on a running
 * dev server so the caveat is documented with evidence, not assumed.
 *
 * Usage:  node tools/qa/dev-csp-probe.mjs [url]     (default http://localhost:5173/)
 * The suite that matters (`npm run test:e2e`) targets the PRODUCTION build
 * (`npm run build` + `npm run preview`), which must be — and is — clean.
 */
import { createRequire } from "node:module";

// playwright is installed under web/node_modules; resolve it from the app root
// so this probe works from anywhere in the repository.
const require = createRequire(new URL("../../web/package.json", import.meta.url));
const { chromium } = require("playwright");

const target = process.argv[2] ?? "http://localhost:5173/";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

const consoleMessages = [];
page.on("console", (message) => {
  if (message.type() === "error") {
    consoleMessages.push(message.text());
  }
});
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(String(error)));

await page.addInitScript(() => {
  const target = window;
  target.__cspViolations = [];
  document.addEventListener("securitypolicyviolation", (event) => {
    target.__cspViolations.push({
      directive: event.violatedDirective,
      effectiveDirective: event.effectiveDirective,
      blockedURI: event.blockedURI,
      sourceFile: event.sourceFile,
      sample: event.sample
    });
  });
});

let navigationError = null;
try {
  await page.goto(target, { waitUntil: "load", timeout: 20_000 });
} catch (error) {
  navigationError = String(error);
}
await page.waitForTimeout(2_000);

let violations = null;
let renderedText = null;
let h1Text = null;
let cspMetaContent = null;
let scriptTags = [];
let inlineProbe = null;
if (!navigationError) {
  violations = await page.evaluate(() => window.__cspViolations ?? null);
  renderedText = await page
    .evaluate(() => document.body?.innerText?.slice(0, 300) ?? null)
    .catch(() => null);
  h1Text = await page
    .locator("h1")
    .first()
    .textContent()
    .catch(() => null);
  const docInfo = await page.evaluate(() => {
    const meta = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
    const scripts = Array.from(document.scripts).map((script) => ({
      src: script.src || null,
      inline: !script.src && (script.textContent ?? "").length > 0,
      type: script.type || null
    }));
    return { csp: meta ? meta.getAttribute("content") : null, scripts };
  });
  cspMetaContent = docInfo.csp;
  scriptTags = docInfo.scripts;

  // Mutation probe: is the CSP actually enforced on this dev page?
  const before = (violations ?? []).length;
  await page.evaluate(() => {
    const script = document.createElement("script");
    script.textContent = "window.__devInlineProbe = true;";
    document.head.appendChild(script);
  });
  await page.waitForTimeout(300);
  violations = await page.evaluate(() => window.__cspViolations ?? null);
  const executed = await page.evaluate(() => window.__devInlineProbe === true);
  inlineProbe = {
    violationsBefore: before,
    violationsAfter: violations ? violations.length : null,
    inlineScriptExecuted: executed,
    newViolations: (violations ?? []).slice(before)
  };
}

const result = {
  target,
  capturedAt: new Date().toISOString(),
  navigationError,
  violationCount: violations ? violations.length : null,
  violations,
  cspMetaContent,
  scriptTags,
  inlineProbe,
  consoleErrors: consoleMessages,
  pageErrors,
  renderedText,
  h1Text
};

console.log(JSON.stringify(result, null, 2));
await browser.close();
