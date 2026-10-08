import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

const WEB_ROOT = dirname(fileURLToPath(import.meta.url));
const ARTIFACTS = join(WEB_ROOT, "..", "tools", "qa", "artifacts");
const PORT = 4173;
// vite preview binds `localhost` (IPv6 ::1 on this host) — 127.0.0.1 refuses.
const BASE_URL = `http://localhost:${PORT}`;

const distIndex = join(WEB_ROOT, "dist", "index.html");

if (!existsSync(distIndex)) {
  throw new Error(
    "[playwright.config] web/dist/index.html not found. The e2e suite never builds " +
      "automatically: run `npm run build` first, then `npm run test:e2e`."
  );
}

const distHtml = readFileSync(distIndex, "utf8");

if (!distHtml.includes("Content-Security-Policy")) {
  throw new Error(
    "[playwright.config] web/dist is STALE (built before the C-15 CSP meta tag landed in " +
      "web/index.html). Run `npm run build` again, then `npm run test:e2e`."
  );
}

export default defineConfig({
  testDir: "./e2e",
  outputDir: join(ARTIFACTS, "test-results"),
  fullyParallel: true,
  forbidOnly: false,
  retries: 0,
  workers: 2,
  timeout: 45_000,
  expect: { timeout: 7_000 },
  reporter: [
    ["list"],
    ["json", { outputFile: join(ARTIFACTS, "playwright-results.json") }]
  ],
  use: {
    baseURL: BASE_URL,
    headless: true,
    viewport: { width: 1280, height: 800 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    // Opt-in extended a11y browser matrix (Progress §9): CT_A11Y_EXTENDED=1 adds
    // firefox + webkit locally. CI stays chromium-only (it installs just chromium).
    ...(process.env.CT_A11Y_EXTENDED === "1"
      ? [
          { name: "firefox", use: { ...devices["Desktop Firefox"] } },
          { name: "webkit", use: { ...devices["Desktop Safari"] } }
        ]
      : [])
  ],
  webServer: {
    command: `npm run preview -- --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 60_000
  }
});
