import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ReactElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { BootReady } from "../boot";
import type { BootFailure, BootNotice } from "../boot/errors";
import type { Manifest, Results, TargetId } from "../contracts";
import { SYSTEM_PANES, TRUST_PANES } from "../navigation";
import { createCorTwinStore, type CorTwinStore } from "../store";
import type { BootLifecycle, BootPhase } from "./bootLifecycle";
import { SAFETY_BANNER_TEXT, SHELL_COPY } from "./copy";
import { manifestFacts } from "./paneData";
import type { RouterHost } from "./router";
import { ShellApp, type ShellAppDeps } from "./ShellApp";
import { ZoneBoundary } from "./ZoneBoundary";
import { formatMetric } from "../validation/format";

const SHELL_DIR = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = fileURLToPath(new URL("../../public", import.meta.url));

let cachedResults: Results | null = null;

function realResults(): Results {
  cachedResults ??= JSON.parse(readFileSync(join(PUBLIC_DIR, "results.json"), "utf8")) as Results;
  return cachedResults;
}

type FakeHost = {
  host: RouterHost;
  setHash(next: string): void;
};

function fakeHost(hash: string): FakeHost {
  let current = hash;
  const listeners = new Set<() => void>();
  const host: RouterHost = {
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
  return {
    host,
    setHash(next) {
      current = next;
      for (const listener of [...listeners]) listener();
    }
  };
}

const LOADING: BootPhase = { status: "loading", ready: null, failure: null };

const FAILURE: BootFailure = {
  code: "ARTIFACT_HASH_MISMATCH",
  message: "The shipped results artifact did not match its manifest digest.",
  recovery: "Reload the page; if this repeats, rebuild the bundle and reload."
};

const FAILED: BootPhase = { status: "failed", ready: null, failure: FAILURE };

const TEST_MANIFEST = {
  appVersion: "0.1.0-test",
  bundleId: "sha256:bundle-test",
  modelId: "sha256:model-test",
  provenance: { dataSha256: "sha256:data-test", sourceRevision: "rev-test" }
} as unknown as Manifest;

function fakeReady(results?: Results, manifest?: Manifest | null): BootReady {
  return {
    status: "ready",
    manifest: manifest === undefined ? TEST_MANIFEST : manifest,
    artifacts: {
      results: results ?? realResults(),
      fixtures: {},
      structureNodeNames: []
    },
    dispose: () => undefined,
    notices: []
  } as unknown as BootReady;
}

function readyPhase(results?: Results, manifest?: Manifest | null): BootPhase {
  return { status: "ready", ready: fakeReady(results, manifest), failure: null };
}

function fakeLifecycle(phase: BootPhase, notices: BootNotice[] = []): BootLifecycle {
  return {
    getPhase: () => phase,
    getNotices: () => notices,
    start: () => Promise.resolve(phase),
    retry: () => Promise.resolve(phase),
    dispose: () => undefined,
    isDisposed: () => false
  };
}

function storeWithResults(targetId?: TargetId): CorTwinStore {
  const store = createCorTwinStore();
  store.intents.bundle.setResults(realResults());
  if (targetId !== undefined) store.intents.selection.selectTarget(targetId);
  return store;
}

type ShellRenderOptions = {
  hash?: string;
  store?: CorTwinStore;
  phase?: BootPhase;
  notices?: BootNotice[];
};

function renderShell(options: ShellRenderOptions = {}): string {
  const { host } = fakeHost(options.hash ?? "#/explore");
  const deps: ShellAppDeps = {
    host,
    store: options.store ?? createCorTwinStore(),
    lifecycle: fakeLifecycle(options.phase ?? LOADING, options.notices ?? [])
  };
  return renderToString(<ShellApp deps={deps} />);
}

describe("safety banner (INV-12, Final_demo global frame)", () => {
  it("ships the exact contract wording", () => {
    expect(SAFETY_BANNER_TEXT).toBe(
      "Educational decision-support prototype. Not a substitute for diagnostic imaging."
    );
  });

  const cases: Array<{ label: string; phase: BootPhase; hash: string }> = [];
  for (const [phaseName, phase] of [
    ["loading", LOADING],
    ["failed", FAILED],
    ["ready", readyPhase()]
  ] as const) {
    for (const hash of ["#/explore", "#/trust/performance", "#/system/requirements"]) {
      cases.push({ label: `${phaseName} ${hash}`, phase, hash });
    }
  }

  it.each(cases)("is present, non-dismissible and last on $label", ({ phase, hash }) => {
    const html = renderShell({ hash, phase });
    const start = html.indexOf('<div class="ct-banner"');
    expect(start).toBeGreaterThanOrEqual(0);
    expect(html).toContain('data-testid="safety-banner"');
    expect(html).toContain(SAFETY_BANNER_TEXT);
    const bannerHtml = html.slice(start, html.indexOf("</div>", start));
    expect(bannerHtml).not.toContain("<button");
    expect(bannerHtml).not.toContain("role=\"button\"");
    expect(bannerHtml).toContain('role="note"');
    expect(html.indexOf('data-testid="safety-banner"')).toBeGreaterThan(
      html.indexOf('data-testid="shell-main"')
    );
  });
});

describe("frame: skip link, landmarks, one h1, announcer", () => {
  const html = renderShell({ hash: "#/explore", phase: readyPhase() });

  it("puts the skip link first in the document", () => {
    expect(html.startsWith('<a class="ct-skip" href="#ct-skip-target"')).toBe(true);
    expect(html).toContain('data-testid="skip-link"');
    expect(html).toContain(SHELL_COPY.skipLink);
  });

  it("makes main the focusable skip target", () => {
    expect(html).toContain(
      '<main class="ct-shell__main" id="ct-skip-target" tabindex="-1" data-testid="shell-main"'
    );
    expect(html.split("<main").length - 1).toBe(1);
  });

  it("renders exactly one primary heading, the app name", () => {
    expect(html.split("<h1").length - 1).toBe(1);
    expect(html).toContain(`>${SHELL_COPY.appName}</h1>`);
  });

  it("exposes the shell landmarks", () => {
    expect(html.split('class="ct-header"').length - 1).toBe(1);
    expect(html).toContain(
      `<nav class="ct-header__nav" aria-label="${SHELL_COPY.navLabel}"`
    );
    expect(html).toContain('<main');
  });

  it("announces the current view through a polite live region", () => {
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain(`>${SHELL_COPY.viewNames.explore}</p>`);
    expect(html).toContain('data-testid="shell-announcer"');
  });

  it("names view and pane in the announcer for a deep link", () => {
    const deep = renderShell({
      hash: "#/trust/calibration",
      phase: readyPhase(),
      store: storeWithResults()
    });
    const expected = `${SHELL_COPY.viewNames.trust} \u2014 ${SHELL_COPY.trustPaneTitles.calibration}`;
    expect(deep).toContain(`>${expected}</p>`);
  });
});

describe("boot state machine presentation", () => {
  it("loading: designed skeleton, busy status, no route content", () => {
    const html = renderShell({ phase: LOADING });
    expect(html).toContain('data-boot-phase="loading"');
    expect(html).toContain('data-testid="boot-loading"');
    expect(html).toContain(SHELL_COPY.loadingHeading);
    expect(html).toContain(SHELL_COPY.loadingBody);
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toContain('data-testid="trust-view"');
    expect(html).not.toContain('data-testid="explore-skeleton"');
  });

  it("failed: designed failure screen with reason, recovery and retry", () => {
    const html = renderShell({ phase: FAILED });
    expect(html).toContain('data-boot-phase="failed"');
    expect(html).toContain('data-testid="boot-failure"');
    expect(html).toContain('data-code="ARTIFACT_HASH_MISMATCH"');
    expect(html).toContain(FAILURE.message);
    expect(html).toContain(FAILURE.recovery);
    expect(html).toContain(SHELL_COPY.failureHeading);
    expect(html).toContain(SHELL_COPY.failureWhatToDo);
    expect(html).toContain('data-testid="boot-retry"');
    expect(html).toContain(SHELL_COPY.retry);
    expect(html).toContain('role="alert"');
  });

  it("ready: route content replaces the skeleton", () => {
    const html = renderShell({ hash: "#/explore", phase: readyPhase() });
    expect(html).toContain('data-boot-phase="ready"');
    expect(html).not.toContain('data-testid="boot-loading"');
    expect(html).toContain('data-testid="explore-skeleton"');
    expect(html).toContain('data-view="explore"');
  });

  it("ready with a G3 notice: the degraded banner explains the fallback", () => {
    const notices: BootNotice[] = [
      { level: "G3", code: "worker-error", message: "Inference is running on the main thread." }
    ];
    const html = renderShell({ phase: readyPhase(), notices });
    expect(html).toContain('data-testid="degraded-notice"');
    expect(html).toContain('data-level="G3"');
    expect(html).toContain(SHELL_COPY.degradedHeading);
    expect(html).toContain(SHELL_COPY.degradedBody);
  });

  it("ready without a G3 notice: no degraded banner", () => {
    const html = renderShell({ phase: readyPhase() });
    expect(html).not.toContain('data-testid="degraded-notice"');
  });
});

describe("routes and deep links", () => {
  it("every Trust pane renders from the one artifact bundle", () => {
    for (const pane of TRUST_PANES) {
      const html = renderShell({
        hash: `#/trust/${pane}`,
        phase: readyPhase(),
        store: storeWithResults()
      });
      expect(html, pane).toContain('data-testid="trust-view"');
      expect(html, pane).toContain(`data-pane="${pane}"`);
      expect(html, pane).toContain('data-testid="trust-pane"');
      expect(html, pane).toContain('data-pane-state="ready"');
      expect(html, pane).toContain(
        `data-testid="pane-tab-${pane}" aria-current="page"`
      );
    }
  });

  it("Performance shows artifact numbers, never a typed literal", () => {
    const results = realResults();
    const html = renderShell({
      hash: "#/trust/performance",
      phase: readyPhase(results),
      store: storeWithResults()
    });
    expect(html).toContain('data-testid="performance-table"');
    expect(html).toContain(formatMetric(results.performance.CAD.rocAuc));
  });

  it("Leakage Audit shows the probe rows and the excluded columns", () => {
    const html = renderShell({
      hash: "#/trust/leakage",
      phase: readyPhase(),
      store: storeWithResults()
    });
    expect(html).toContain('data-testid="leakage-probe-table"');
    expect(html).toContain('data-testid="leakage-excluded-columns"');
    expect(html).toContain("probe model");
  });

  it("the store's selected target drives the pane highlight", () => {
    const html = renderShell({
      hash: "#/trust/performance",
      phase: readyPhase(),
      store: storeWithResults("LAD")
    });
    expect(/aria-pressed="true"[^>]*>LAD</.test(html)).toBe(true);
    expect(html).toContain('data-active="true"');
  });

  it("#/system/requirements renders the requirements table", () => {
    const html = renderShell({ hash: "#/system/requirements", phase: readyPhase() });
    expect(html).toContain('data-testid="system-view"');
    expect(html).toContain('data-testid="requirements-table"');
    expect(html).toContain('data-testid="pane-tab-requirements" aria-current="page"');
  });

  it("#/system/architecture renders facts from the booted manifest only", () => {
    const html = renderShell({ hash: "#/system/architecture", phase: readyPhase() });
    expect(html).toContain('data-testid="manifest-facts"');
    expect(html).toContain("0.1.0-test");
    expect(html).toContain("sha256:data-test");
    expect(html).toContain("rev-test");
  });

  it("#/system/architecture without a manifest shows the designed state", () => {
    const html = renderShell({
      hash: "#/system/architecture",
      phase: readyPhase(realResults(), null)
    });
    expect(html).toContain('data-state="manifest-unavailable"');
    expect(html).not.toContain("0.1.0-test");
  });

  it("#/system/integrity shows the pending notice and the not-run state", () => {
    const html = renderShell({ hash: "#/system/integrity", phase: readyPhase() });
    expect(html).toContain('data-testid="pane-pending"');
    expect(html).toContain('data-state="not-run"');
    expect(html).not.toContain("within tolerance");
  });

  it("#/system/model-card shows the pending notice and the empty state", () => {
    const html = renderShell({ hash: "#/system/model-card", phase: readyPhase() });
    expect(html).toContain('data-testid="pane-pending"');
    expect(html).toContain('data-state="empty"');
  });
});

describe("invalid links become visible notices (C-10)", () => {
  it("unknown route: safe default view plus the contract message", () => {
    const html = renderShell({ hash: "#/not-a-view", phase: readyPhase() });
    expect(html).toContain('data-view="explore"');
    expect(html).toContain('data-testid="shell-notices"');
    expect(html).toContain("view does not exist");
    expect(html).toContain("default view was shown instead");
    expect(html).not.toContain('data-testid="zone-error"');
  });

  it("unknown pane: safe default pane plus the contract message", () => {
    const html = renderShell({
      hash: "#/trust/not-a-pane",
      phase: readyPhase(),
      store: storeWithResults()
    });
    expect(html).toContain('data-pane="performance"');
    expect(html).toContain("default pane was shown instead");
  });

  it("boot URL notices are shown once: parse-level codes come from the router", () => {
    const notices: BootNotice[] = [
      { level: "info", code: "UNKNOWN_ROUTE", message: "duplicate parse notice" },
      {
        level: "info",
        code: "UNKNOWN_CASE_ID",
        message: "The linked case is not in this bundle; the default case was shown instead."
      }
    ];
    const html = renderShell({ hash: "#/not-a-view", phase: readyPhase(), notices });
    expect(html).not.toContain("duplicate parse notice");
    expect(html).toContain("The linked case is not in this bundle");
    expect(html.split("default view was shown instead").length - 1).toBe(1);
  });
});

describe("navigation chrome", () => {
  const html = renderShell({
    hash: "#/trust/calibration",
    phase: readyPhase(),
    store: storeWithResults()
  });

  it("primary nav carries canonical hrefs and marks the active view", () => {
    expect(html).toContain('href="#/explore"');
    expect(html).toContain('href="#/trust/performance"');
    expect(html).toContain('href="#/system/requirements"');
    expect(/data-testid="nav-trust" aria-current="page"/.test(html)).toBe(true);
    expect(/data-testid="nav-explore" aria-current/.test(html)).toBe(false);
  });

  it("pane tabs cover every pane of the active route", () => {
    for (const pane of TRUST_PANES) {
      expect(html).toContain(`data-testid="pane-tab-${pane}"`);
      expect(html).toContain(`>${SHELL_COPY.trustPaneTitles[pane]}</a>`);
    }
    expect(/data-testid="pane-tab-calibration" aria-current="page"/.test(html)).toBe(true);
    expect(html).not.toContain('data-testid="pane-tab-requirements"');
  });

  it("the System route swaps in the four System pane tabs", () => {
    const system = renderShell({ hash: "#/system/integrity", phase: readyPhase() });
    for (const pane of SYSTEM_PANES) {
      expect(system).toContain(`data-testid="pane-tab-${pane}"`);
      expect(system).toContain(`>${SHELL_COPY.systemPaneTitles[pane]}</a>`);
    }
    expect(/data-testid="pane-tab-integrity" aria-current="page"/.test(system)).toBe(true);
  });
});

describe("zone error boundaries", () => {
  it("passes children through untouched when nothing has thrown", () => {
    const html = renderToString(
      <ZoneBoundary zone="header">
        <p className="child-mark">child content</p>
      </ZoneBoundary>
    );
    expect(html).toContain("child-mark");
    expect(html).not.toContain('data-testid="zone-error"');
  });

  it("renders the designed fallback card for a thrown zone error", () => {
    const boundary = new ZoneBoundary({ zone: "stage", children: null });
    const derived = ZoneBoundary.getDerivedStateFromError(new Error("zone failure"));
    (boundary as unknown as { state: { error: Error | null } }).state = derived;
    const html = renderToString(boundary.render() as ReactElement);
    expect(html).toContain('data-testid="zone-error"');
    expect(html).toContain('data-zone="stage"');
    expect(html).toContain(SHELL_COPY.zoneErrorHeading);
    expect(html).toContain(SHELL_COPY.zoneErrorBody);
    expect(html).toContain('data-testid="zone-retry"');
    expect(html).toContain(SHELL_COPY.zoneErrorRetry);
    expect(html).toContain('role="alert"');
  });
});

describe("shell source discipline", () => {
  const sources = readdirSync(SHELL_DIR)
    .filter((file) => /\.tsx?$/.test(file))
    .filter((file) => !/\.test\.tsx?$/.test(file))
    .sort();

  it("covers every non-test shell source", () => {
    expect(sources).toEqual([
      "ShellApp.tsx",
      "ZoneBoundary.tsx",
      "bootLifecycle.ts",
      "browserHost.ts",
      "chrome.tsx",
      "copy.ts",
      "paneData.ts",
      "router.ts"
    ]);
  });

  it("no probability, metric or percentage literal appears in shell source", () => {
    for (const file of sources) {
      const text = readFileSync(join(SHELL_DIR, file), "utf8");
      expect(text, file).not.toMatch(/\d+(?:\.\d+)?%/);
      expect(text, file).not.toMatch(/(?:^|[^.\w])0\.\d/);
    }
  });

  it("the shell renders no vessel, case or probability value of its own", () => {
    for (const file of sources) {
      const text = readFileSync(join(SHELL_DIR, file), "utf8");
      expect(text, file).not.toMatch(/\b(shap|SHAP|probability|rocAuc|brier)\b\s*[:=]/);
    }
  });
});

describe("manifestFacts", () => {
  it("maps manifest identity and provenance into pane facts", () => {
    const facts = manifestFacts(TEST_MANIFEST);
    expect(facts).not.toBeNull();
    const details = (facts ?? []).map((fact) => fact.detail);
    expect(details).toContain("0.1.0-test");
    expect(details).toContain("sha256:bundle-test");
    expect(details).toContain("sha256:model-test");
    expect(details).toContain("sha256:data-test");
    expect(details).toContain("rev-test");
  });

  it("an absent manifest yields no facts instead of invented ones", () => {
    expect(manifestFacts(null)).toBeNull();
    expect(manifestFacts(undefined)).toBeNull();
  });
});

describe("history-style fragment re-reads", () => {
  it("renders whichever fragment the host currently reports", () => {
    const { host, setHash } = fakeHost("#/trust/performance");
    const deps: ShellAppDeps = {
      host,
      store: storeWithResults(),
      lifecycle: fakeLifecycle(readyPhase())
    };
    const first = renderToString(<ShellApp deps={deps} />);
    expect(first).toContain('data-view="trust"');
    expect(first).toContain('data-pane="performance"');
    setHash("#/system/architecture");
    const second = renderToString(<ShellApp deps={deps} />);
    expect(second).toContain('data-view="system"');
    expect(second).toContain('data-pane="architecture"');
  });
});
