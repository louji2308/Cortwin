import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as workerApi from "./index";

/**
 * Wiring guard — structural source scans (no browser needed) for the
 * boundaries that must never regress:
 *
 *  - AGENTS §7 law 6 (single entry): only `workerEntry.ts` may import the
 *    domain; the D-16 `loadEngine` is reached through exactly one module;
 *  - layer isolation (Architecture §9.1): worker sources never import the
 *    store, React, the scene or any other app layer, and never touch
 *    node:* (this is browser code);
 *  - privacy (C-15): no network, storage or telemetry APIs, no console
 *    logging anywhere in the runtime sources;
 *  - C-07 L236: `setTimeout` exists only in the startup watchdog and as
 *    the 0 ms pump scheduler — there is no per-request timeout;
 *  - the default worker factory loads `workerEntry.ts` as its own bundle
 *    entry with `type: "module"` (Vite worker pattern);
 *  - `index.ts` publishes the whole public surface.
 */

const here = fileURLToPath(new URL(".", import.meta.url));
const allFiles = readdirSync(here)
  .filter((name) => name.endsWith(".ts"))
  .sort();
const sourceFiles = allFiles.filter((name) => !name.endsWith(".test.ts"));
const texts = new Map(
  sourceFiles.map((name) => [name, readFileSync(join(here, name), "utf8")] as const)
);

function filesMatching(pattern: RegExp): string[] {
  return sourceFiles.filter((name) => pattern.test(texts.get(name) ?? ""));
}

describe("wiring — single domain entry (AGENTS §7 law 6)", () => {
  it("only workerEntry.ts imports from ../domain, and it uses loadEngine", () => {
    const domainImporters = filesMatching(/from\s+["']\.\.\/domain["']/);
    expect(domainImporters).toEqual(["workerEntry.ts"]);

    const entry = texts.get("workerEntry.ts") ?? "";
    expect(entry).toContain('import { loadEngine } from "../domain"');
    expect(entry).toContain("createWorkerHost");
  });

  it("workerEntry stays thin — all protocol logic lives behind the host", () => {
    const entry = texts.get("workerEntry.ts") ?? "";
    expect(entry).not.toContain("createComputeRuntime");
    expect(entry).not.toContain('./runtime"');
    expect(entry).not.toContain("validateRequest");
  });
});

describe("wiring — layer isolation", () => {
  const FORBIDDEN_SPECIFIERS = [
    "react",
    "react-dom",
    "three",
    "@react-three",
    "../store",
    "../components",
    "../scene",
    "../registry",
    "../navigation",
    "../design",
    "../validation",
    "../panels",
    "../copy",
    "../manifest",
    "../system",
    "../hooks",
    "../app",
    "../contracts/copy"
  ];

  it("imports no app layer, no React, no three, no node:*", () => {
    const problems: string[] = [];
    for (const [name, text] of texts) {
      const specifiers = [...text.matchAll(/from\s+["']([^"']+)["']/g)].map((match) => match[1]);
      for (const specifier of specifiers) {
        if (specifier.startsWith("node:")) {
          problems.push(`${name}: node import ${specifier}`);
        }
        if (specifier.startsWith("../domain") && name !== "workerEntry.ts") {
          problems.push(`${name}: domain import outside workerEntry`);
        }
        for (const forbidden of FORBIDDEN_SPECIFIERS) {
          if (specifier === forbidden || specifier.startsWith(`${forbidden}/`)) {
            problems.push(`${name}: forbidden import ${specifier}`);
          }
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it("uses no network, storage, telemetry or console APIs", () => {
    const forbidden: Array<[string, RegExp]> = [
      ["fetch", /\bfetch\s*\(/],
      ["XMLHttpRequest", /XMLHttpRequest/],
      ["WebSocket", /\bWebSocket\b/],
      ["EventSource", /\bEventSource\b/],
      ["localStorage", /\blocalStorage\b/],
      ["sessionStorage", /\bsessionStorage\b/],
      ["indexedDB", /\bindexedDB\b/],
      ["sendBeacon", /\bsendBeacon\b/],
      ["navigator", /\bnavigator\b/],
      ["console", /\bconsole\./]
    ];
    const problems: string[] = [];
    for (const [name, text] of texts) {
      for (const [label, pattern] of forbidden) {
        if (pattern.test(text)) problems.push(`${name}: uses ${label}`);
      }
    }
    expect(problems).toEqual([]);
  });
});

describe("wiring — C-07 L236: only the startup watchdog times anything", () => {
  it("setTimeout appears only in the watchdog and as the 0 ms pump scheduler", () => {
    const problems: string[] = [];
    for (const [name, text] of texts) {
      const calls = [...text.matchAll(/setTimeout\s*\(/g)].length;
      if (calls === 0) continue;
      if (name === "startupWatchdog.ts") continue; // the sanctioned watchdog
      const pumpOnly = /setTimeout\s*\(\s*task\s*,\s*0\s*\)/.test(text);
      const extra = text.replace(/setTimeout\s*\(\s*task\s*,\s*0\s*\)/g, "");
      if (!pumpOnly || /setTimeout\s*\(/.test(extra)) {
        problems.push(`${name}: unexpected setTimeout usage`);
      }
    }
    expect(problems).toEqual([]);
    // and the watchdog itself never touches results — it only signals degrade
    const watchdog = texts.get("startupWatchdog.ts") ?? "";
    expect(watchdog).not.toContain("ComputeResponse");
    expect(watchdog).not.toContain("evaluate");
  });
});

describe("wiring — worker bootstrap and public surface", () => {
  it("the default factory loads workerEntry.ts as a module Worker", () => {
    const portSource = texts.get("workerComputePort.ts") ?? "";
    expect(portSource).toContain('new URL("./workerEntry.ts", import.meta.url)');
    expect(portSource).toContain('type: "module"');
  });

  it("compute traffic and control traffic are discriminated via ./control guards", () => {
    const portSource = texts.get("workerComputePort.ts") ?? "";
    expect(portSource).toContain("isWorkerControlMessage");
    expect(portSource).toContain("isComputeResponseMessage");
    const hostSource = texts.get("workerHost.ts") ?? "";
    expect(hostSource).toContain("isWorkerControlMessage");
  });

  it("index.ts publishes the complete public surface", () => {
    const expected = [
      "createComputeRuntime",
      "createMainComputePort",
      "createWorkerComputePort",
      "createWorkerHost",
      "createStartupWatchdog",
      "validateRequest",
      "computeError",
      "errorResponse",
      "normalizeEngineResponse",
      "echoEnvelope",
      "createInitMessage",
      "createReadyMessage",
      "createEngineErrorMessage",
      "createDegradeMessage",
      "isWorkerControlMessage",
      "isComputeResponseMessage",
      "COMPATIBILITY_NOTICE",
      "ENGINE_LOAD_NOTICE"
    ];
    for (const key of expected) {
      expect(workerApi, `missing export ${key}`).toHaveProperty(key);
    }
  });
});
