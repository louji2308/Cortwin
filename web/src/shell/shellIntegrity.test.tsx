/**
 * Shell wiring for System → Integrity (Contracts §9 L429, C-01 §5.1, AG-04).
 *
 * Shows the production path end to end without a browser: the shell's own
 * recorder digests the bytes it fetches from web/public, the shell hands that
 * record to the pane, and the pending notice disappears only when an artifact
 * record exists. A server render never runs effects, so the parity side stays
 * in its designed not-run state — no verdict appears before a run.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { BootReady } from "../boot";
import { ARTIFACT_KEYS } from "../boot/manifest";
import type { Manifest } from "../contracts";
import { createCorTwinStore } from "../store";
import type { BootLifecycle, BootPhase } from "./bootLifecycle";
import { createArtifactRecorder, type ArtifactRecorder } from "./paneData";
import type { RouterHost } from "./router";
import { ShellApp, type ShellAppDeps } from "./ShellApp";

const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(HERE, "..", "..", "public");

const MANIFEST = JSON.parse(readFileSync(join(PUBLIC_DIR, "manifest.json"), "utf8")) as Manifest;

const diskFetch = (path: string): Promise<Uint8Array> =>
  Promise.resolve(new Uint8Array(readFileSync(join(PUBLIC_DIR, path))));

function readyPhase(): BootPhase {
  const ready = {
    status: "ready",
    manifest: MANIFEST,
    modelId: MANIFEST.modelId,
    artifacts: { results: null, fixtures: {}, structureNodeNames: [] },
    dispose: () => undefined,
    notices: []
  } as unknown as BootReady;
  return { status: "ready", ready, failure: null };
}

function fakeHost(hash: string): RouterHost {
  let current = hash;
  const listeners = new Set<() => void>();
  return {
    read: () => current,
    write: (href) => {
      current = href;
    },
    listen: (onChange) => {
      listeners.add(onChange);
      return () => {
        listeners.delete(onChange);
      };
    }
  };
}

function fakeLifecycle(phase: BootPhase): BootLifecycle {
  return {
    getPhase: () => phase,
    getNotices: () => [],
    start: () => Promise.resolve(phase),
    retry: () => Promise.resolve(phase),
    dispose: () => undefined,
    isDisposed: () => false
  };
}

async function recorderThatBooted(): Promise<ArtifactRecorder> {
  const recorder = createArtifactRecorder(diskFetch);
  for (const key of ARTIFACT_KEYS) {
    await recorder.fetch(MANIFEST.artifacts[key].path);
  }
  return recorder;
}

function renderIntegrity(recorder: ArtifactRecorder): string {
  const deps: ShellAppDeps = {
    host: fakeHost("#/system/integrity"),
    store: createCorTwinStore(),
    lifecycle: fakeLifecycle(readyPhase()),
    recorder
  };
  return renderToString(<ShellApp deps={deps} />).replace(/<!-- -->/g, "");
}

describe("System → Integrity shows what this boot observed", () => {
  it("renders the artifact table from the recorder and drops the pending notice", async () => {
    const html = renderIntegrity(await recorderThatBooted());

    expect(html).toContain('data-testid="artifact-table"');
    expect(html).toContain('data-testid="artifact-identity"');
    expect(html).toContain("✓ All 6 artifacts matched their manifest SHA-256 digest");
    expect(html).not.toContain('data-testid="pane-pending"');

    expect(html).toContain(MANIFEST.bundleId);
    expect(html).toContain(MANIFEST.modelId);
    expect(html).toContain(MANIFEST.artifacts.registry.path);
    expect(html).toContain(MANIFEST.artifacts.fixtures.path);
    expect(html).toContain(MANIFEST.artifacts.results.sha256);

    for (const key of ARTIFACT_KEYS) {
      expect(html, key).toContain(`>${key}</th>`);
      expect(html, key).toContain("✓ verified");
    }
  });

  it("shows no verdict before the in-browser run has happened", async () => {
    const html = renderIntegrity(await recorderThatBooted());

    expect(html).toContain('data-state="not-run"');
    expect(html).not.toContain('data-testid="pane-pending"');
    expect(html).not.toContain("within tolerance");
    expect(html).not.toContain('data-testid="parity-checks"');
    expect(html).not.toContain('role="alert"');
  });
});

describe("System → Integrity stays pending when nothing was observed", () => {
  it("keeps the designed pending and not-run states with an empty record", () => {
    const html = renderIntegrity(createArtifactRecorder(diskFetch));

    expect(html).toContain('data-testid="pane-pending"');
    expect(html).toContain('data-state="not-run"');
    expect(html).not.toContain('data-testid="artifact-table"');
    expect(html).not.toContain("✓ All 6 artifacts matched");
    expect(html).not.toContain("within tolerance");
    expect(html).not.toContain('role="alert"');
  });
});
