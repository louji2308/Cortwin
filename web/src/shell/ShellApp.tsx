import type { MouseEvent, ReactElement } from "react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { BootReady } from "../boot";
import { internalFailure } from "../boot/errors";
import type { Results, TargetId, ViewRoute } from "../contracts";
import { ExploreWorkspace } from "../explore";
import {
  DEFAULT_SYSTEM_PANE,
  DEFAULT_TRUST_PANE,
  SYSTEM_PANES,
  TRUST_PANES
} from "../navigation";
import { store as singletonStore, type CorTwinStore } from "../store";
import {
  ArchitecturePane,
  IntegrityPane,
  ModelCardPane,
  RequirementsPane,
  type ArtifactIntegrity
} from "../system";
import {
  CalibrationPane,
  DecisionsPane,
  LeakagePane,
  PerformancePane,
  SubgroupsPane
} from "../validation";
import {
  createBootLifecycle,
  LOADING_PHASE,
  type BootLifecycle,
  type BootPhase
} from "./bootLifecycle";
import { createBrowserRouterHost } from "./browserHost";
import {
  Announcer,
  BootFailureScreen,
  BootLoadingScreen,
  DegradedNotice,
  NoticeList,
  PaneTabs,
  PendingNotice,
  SafetyBanner,
  ShellHeader,
  SkipLink
} from "./chrome";
import { SHELL_COPY, urlNoticeMessage } from "./copy";
import {
  createArtifactRecorder,
  manifestFacts,
  PARITY_IDLE,
  parityRunning,
  paritySettle,
  toArtifactIntegrity,
  toTrustResults,
  type ArtifactRecorder,
  type ParityRunState
} from "./paneData";
import { bindRouterToStore, createShellRouter, type RouterHost, type ShellRouter } from "./router";
import { ZoneBoundary } from "./ZoneBoundary";
import "./shell.css";

const PARSE_LEVEL_NOTICE_CODES: ReadonlySet<string> = new Set([
  "UNKNOWN_ROUTE",
  "UNKNOWN_PANE",
  "MALFORMED_QUERY"
]);

export type ShellAppDeps = {
  host?: RouterHost;
  store?: CorTwinStore;
  lifecycle?: BootLifecycle;
  /** Artifact recorder; the app creates one, tests inject a prepared one. */
  recorder?: ArtifactRecorder;
};

export type ShellAppProps = {
  deps?: ShellAppDeps;
};

function samePhase(a: BootPhase, b: BootPhase): boolean {
  return a.status === b.status && a.ready === b.ready && a.failure === b.failure;
}

function defaultPaneFor(route: ViewRoute): string | null {
  if (route === "explore") return null;
  return route === "trust" ? DEFAULT_TRUST_PANE : DEFAULT_SYSTEM_PANE;
}

function normalizePane<T extends string>(
  pane: string | null,
  allowed: readonly T[],
  fallback: T
): T {
  return pane !== null && (allowed as readonly string[]).includes(pane)
    ? (pane as T)
    : fallback;
}

type TrustViewProps = {
  results: Results | null;
  pane: string | null;
  targetId: TargetId | null;
  onTargetChange: (targetId: TargetId) => void;
  onPaneChange: (pane: string) => void;
};

function TrustView({
  results,
  pane,
  targetId,
  onTargetChange,
  onPaneChange
}: TrustViewProps): ReactElement {
  const activePane = normalizePane(pane, TRUST_PANES, DEFAULT_TRUST_PANE);
  const trustResults = toTrustResults(results);
  const target = targetId ?? undefined;
  return (
    <section
      className="ct-route"
      data-testid="trust-view"
      data-route="trust"
      data-pane={activePane}
    >
      <PaneTabs
        route="trust"
        panes={TRUST_PANES}
        activePane={activePane}
        titles={SHELL_COPY.trustPaneTitles}
        label={SHELL_COPY.trustPanesLabel}
        onNavigate={onPaneChange}
      />
      {activePane === "performance" && (
        <PerformancePane
          results={trustResults}
          target={target}
          onTargetChange={onTargetChange}
        />
      )}
      {activePane === "calibration" && (
        <CalibrationPane
          results={trustResults}
          target={target}
          onTargetChange={onTargetChange}
        />
      )}
      {activePane === "decisions" && (
        <DecisionsPane
          results={trustResults}
          target={target}
          onTargetChange={onTargetChange}
        />
      )}
      {activePane === "subgroups" && <SubgroupsPane results={trustResults} />}
      {activePane === "leakage" && <LeakagePane results={trustResults} />}
    </section>
  );
}

type SystemViewProps = {
  pane: string | null;
  ready: BootReady | null;
  artifactIntegrity: ArtifactIntegrity | null;
  onPaneChange: (pane: string) => void;
};

function SystemView({
  pane,
  ready,
  artifactIntegrity,
  onPaneChange,
}: SystemViewProps): ReactElement {
  const activePane = normalizePane(pane, SYSTEM_PANES, DEFAULT_SYSTEM_PANE);
  const manifest = ready === null ? null : ready.manifest;
  const [parity, setParity] = useState<ParityRunState>(PARITY_IDLE);

  // The run happens only while the integrity pane is on screen, one tick after
  // the designed loading state has painted, and exactly once per booted
  // engine (paneData caches the verified result).
  useEffect(() => {
    if (ready === null || activePane !== "integrity") return;
    const input = { engine: ready.engine, artifacts: ready.artifacts };
    setParity(parityRunning());
    const timer = setTimeout(() => {
      setParity(paritySettle(input));
    }, 0);
    return () => clearTimeout(timer);
  }, [ready, activePane]);

  return (
    <section
      className="ct-route"
      data-testid="system-view"
      data-route="system"
      data-pane={activePane}
    >
      <PaneTabs
        route="system"
        panes={SYSTEM_PANES}
        activePane={activePane}
        titles={SHELL_COPY.systemPaneTitles}
        label={SHELL_COPY.systemPanesLabel}
        onNavigate={onPaneChange}
      />
      {activePane === "requirements" && <RequirementsPane />}
      {activePane === "architecture" && (
        <ArchitecturePane manifestFacts={manifestFacts(manifest)} />
      )}
      {activePane === "integrity" && (
        <>
          {artifactIntegrity === null && <PendingNotice />}
          <IntegrityPane
            artifacts={artifactIntegrity}
            report={parity.report}
            loading={parity.status === "running"}
            error={parity.error}
          />
        </>
      )}
      {activePane === "model-card" && (
        <>
          <PendingNotice />
          <ModelCardPane card={null} />
        </>
      )}
    </section>
  );
}

type RouteViewProps = {
  route: ViewRoute;
  pane: string | null;
  ready: BootReady | null;
  artifactIntegrity: ArtifactIntegrity | null;
  results: Results | null;
  targetId: TargetId | null;
  onTargetChange: (targetId: TargetId) => void;
  onPaneChange: (route: "trust" | "system", pane: string) => void;
};

function RouteView({
  route,
  pane,
  ready,
  artifactIntegrity,
  results,
  targetId,
  onTargetChange,
  onPaneChange
}: RouteViewProps): ReactElement {
  switch (route) {
    case "trust":
      return (
        <TrustView
          results={results}
          pane={pane}
          targetId={targetId}
          onTargetChange={onTargetChange}
          onPaneChange={(nextPane) => onPaneChange("trust", nextPane)}
        />
      );
    case "system":
      return (
        <SystemView
          pane={pane}
          ready={ready}
          artifactIntegrity={artifactIntegrity}
          onPaneChange={(nextPane) => onPaneChange("system", nextPane)}
        />
      );
    default:
      return <ExploreWorkspace />;
  }
}

export function ShellApp({ deps = {} }: ShellAppProps): ReactElement {
  const store = deps.store ?? singletonStore;
  const [phase, setPhase] = useState<BootPhase>(
    () => deps.lifecycle?.getPhase() ?? LOADING_PHASE
  );
  const phaseRef = useRef<BootPhase>(phase);

  // One recorder for the whole session: it hashes the exact bytes the boot
  // fetches (no second download, no extra request) so the Integrity pane can
  // show declared vs. observed digests from this boot (C-01 §5.1).
  const [recorder] = useState<ArtifactRecorder>(() => deps.recorder ?? createArtifactRecorder());

  const [lifecycle] = useState<BootLifecycle>(() => {
    if (deps.lifecycle !== undefined) return deps.lifecycle;
    return createBootLifecycle({
      store,
      bootOptions: { fetchArtifact: recorder.fetch },
      onPhase: (next) => {
        if (samePhase(phaseRef.current, next)) return;
        phaseRef.current = next;
        setPhase(next);
      }
    });
  });

  const [router] = useState<ShellRouter>(() =>
    createShellRouter(deps.host ?? createBrowserRouterHost())
  );

  const snapshot = useSyncExternalStore(router.subscribe, router.snapshot, router.snapshot);
  const storeState = useSyncExternalStore(store.subscribe, store.getState, store.getState);

  const pendingDispose = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runBoot = (action: () => Promise<BootPhase>): void => {
    action().catch((cause: unknown) => {
      const next: BootPhase = { status: "failed", ready: null, failure: internalFailure(cause) };
      if (samePhase(phaseRef.current, next)) return;
      phaseRef.current = next;
      setPhase(next);
    });
  };

  useEffect(() => {
    if (pendingDispose.current !== null) {
      clearTimeout(pendingDispose.current);
      pendingDispose.current = null;
    }
    const unbind = bindRouterToStore(router, store);
    if (lifecycle.getPhase().status === "loading") {
      runBoot(() => lifecycle.start());
    }
    return () => {
      unbind();
      pendingDispose.current = setTimeout(() => {
        router.dispose();
        lifecycle.dispose();
      }, 0);
    };
  }, [router, store, lifecycle]);

  const handleSkip = (event: MouseEvent<HTMLAnchorElement>): void => {
    event.preventDefault();
    const target = document.getElementById(SHELL_COPY.skipLinkId);
    if (target !== null) target.focus();
  };

  const navigateTo = (nextRoute: ViewRoute, nextPane: string | null): void => {
    store.intents.view.navigate(nextRoute, nextPane);
  };

  const messages: string[] = snapshot.notices.map((notice) => urlNoticeMessage(notice));
  for (const notice of lifecycle.getNotices()) {
    if (notice.level !== "info") continue;
    if (PARSE_LEVEL_NOTICE_CODES.has(notice.code)) continue;
    messages.push(notice.message);
  }

  const currentRoute = snapshot.route.route;
  const currentPane = snapshot.route.pane;
  const paneTitle =
    currentRoute === "trust"
      ? SHELL_COPY.trustPaneTitles[currentPane ?? DEFAULT_TRUST_PANE]
      : currentRoute === "system"
        ? SHELL_COPY.systemPaneTitles[currentPane ?? DEFAULT_SYSTEM_PANE]
        : null;
  const announce =
    paneTitle === null
      ? SHELL_COPY.viewNames[currentRoute]
      : `${SHELL_COPY.viewNames[currentRoute]} \u2014 ${paneTitle}`;

  const ready = phase.status === "ready" ? phase.ready : null;
  const failure = phase.status === "failed" ? phase.failure : null;
  const degraded = ready !== null && lifecycle.getNotices().some((n) => n.level === "G3");

  const artifactIntegrity =
    ready === null
      ? null
      : toArtifactIntegrity(
          { manifest: ready.manifest, engineModelId: ready.modelId },
          recorder.list()
        );

  let content: ReactElement;
  if (failure !== null) {
    content = (
      <BootFailureScreen failure={failure} onRetry={() => runBoot(() => lifecycle.retry())} />
    );
  } else if (ready !== null) {
    content = (
      <>
        {degraded && <DegradedNotice />}
        <ZoneBoundary zone={currentRoute}>
          <RouteView
            route={currentRoute}
            pane={currentPane}
            ready={ready}
            artifactIntegrity={artifactIntegrity}
            results={storeState.bundle.results}
            targetId={storeState.selection.targetId}
            onTargetChange={(next) => store.intents.selection.selectTarget(next)}
            onPaneChange={(nextRoute, nextPane) => navigateTo(nextRoute, nextPane)}
          />
        </ZoneBoundary>
      </>
    );
  } else {
    content = <BootLoadingScreen />;
  }

  return (
    <>
      <SkipLink onSkip={handleSkip} />
      <div
        className="ct-shell"
        data-testid="shell-root"
        data-boot-phase={phase.status}
        data-view={currentRoute}
      >
        <ZoneBoundary zone="header">
          <ShellHeader route={currentRoute} onNavigate={(next) => navigateTo(next, defaultPaneFor(next))} />
        </ZoneBoundary>
        <Announcer message={announce} />
        <main
          className="ct-shell__main"
          id={SHELL_COPY.skipLinkId}
          tabIndex={-1}
          data-testid="shell-main"
          aria-label={SHELL_COPY.mainLabel}
        >
          <NoticeList messages={messages} />
          {content}
        </main>
        <SafetyBanner />
      </div>
    </>
  );
}
