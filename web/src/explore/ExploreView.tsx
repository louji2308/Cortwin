import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactElement
} from "react";
import { ProbabilityReadout } from "../components/ProbabilityReadout";
import { ColourMeaningExplainer } from "../components/ColourMeaningExplainer";
import { ProfileForm } from "../profile";
import { Stage3D } from "../stage";
import { buildSceneModel } from "../scene";
import { selectCompletion, selectIsStale, type CorTwinStore } from "../store";
import type { ComputeError, CorTwinStoreState, Registry, TargetId } from "../contracts";
import { InspectorPanel } from "./inspectorHost";
import { EvidenceRailHost } from "./EvidenceRailHost";
import { EvalErrorNotice, ExploreSkeleton, IntentErrorNotice, ReadoutSkeleton, StaleNotice } from "./States";
import {
  buildInspectorProps,
  caseLabelOf,
  createBindings,
  cycleTargetId,
  headlineReadout,
  structureUrlOf,
  vesselCardModels,
  vesselTargets,
  type ExploreBindings
} from "./model";
import "./explore.css";

/**
 * ExploreView — the prop-driven Explore composition (Implementation_Plan P6
 * steps 4–18). `store` is the *only* thing this component needs: every child
 * is prop-driven and receives data projected from C-09 state, so there is one
 * store, one registry and one identity source in the workspace.
 *
 * Layering:
 *   `./index`  → binds the C-09 singleton (no props, per the P6 contract)
 *   `ExploreView` → subscribe, project (`./model`), render, route events back
 *                   to store intents only — no local clinical state
 *   children   → `ProfileForm`, `Stage3D`, `ProbabilityReadout`, `Inspector`
 *
 * Choreography (P-4 / AGENTS §6.1): numbers ease through the store's display
 * channel while `useDisplayChannelDriver` samples it on animation frames; the
 * 3D stage runs its own colour tween from the same payload. Nothing animates
 * through React state, and reduced motion collapses every transition to 0 ms
 * with meaning unchanged.
 */
export type ExploreViewProps = {
  store: CorTwinStore;
};

/**
 * Subscribe to the store's current state.
 *
 * Deliberately not `store.useStore`: zustand's bound hook serves
 * `getInitialState()` to server renders, which would render the loading shell
 * forever under `renderToString`. `getState()` is the same snapshot for both
 * environments and is referentially stable between changes.
 */
function useCorTwinState(store: CorTwinStore): CorTwinStoreState {
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}

/** Samples the C-09 display channel while a transition runs; idle = zero frames. */
function useDisplayChannelDriver(store: CorTwinStore, running: boolean): void {
  useEffect(() => {
    if (!running) return;
    if (typeof requestAnimationFrame !== "function") return;
    let frame = 0;
    const loop = (): void => {
      store.sampleDisplay();
      if (store.getState().display.running) frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [running, store]);
}

/** One truth for motion preference: the OS setting drives `view.reducedMotion`. */
function usePrefersReducedMotion(store: CorTwinStore): void {
  useEffect(() => {
    const scope = globalThis as {
      matchMedia?: (query: string) => MediaQueryList;
    };
    if (typeof scope.matchMedia !== "function") return;
    const media = scope.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = (): void => {
      store.intents.view.setReducedMotion(media.matches);
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [store]);
}

export function ExploreView({ store }: ExploreViewProps): ReactElement {
  const state = useCorTwinState(store);
  const [intentError, setIntentError] = useState<ComputeError | null>(null);
  const bindings = useMemo<ExploreBindings>(
    () => createBindings(store, { onIntentError: setIntentError }),
    [store]
  );
  const vesselRowRef = useRef<HTMLDivElement | null>(null);

  useDisplayChannelDriver(store, state.display.running);
  usePrefersReducedMotion(store);

  // A failing intent writes nothing, so a revision change means an edit landed:
  // that is the natural moment to clear the previous failure notice.
  useEffect(() => {
    setIntentError(null);
  }, [state.case.revision]);

  const registry = state.bundle.registry;
  if (registry === null) {
    return state.bundle.status === "error" ? (
      <div className="ct-explore ct-explore--failed" data-testid="explore-failed" role="alert">
        <h2 className="ct-explore__heading">Model bundle unavailable</h2>
        <p>
          The verified model bundle could not be loaded, so no case can be evaluated. Reload the
          page; if this repeats, rebuild the bundle (<code>make reproduce</code>) and reload.
        </p>
      </div>
    ) : (
      <ExploreSkeleton />
    );
  }

  return (
    <ExploreWorkspaceView
      state={state}
      registry={registry}
      bindings={bindings}
      intentError={intentError}
      vesselRowRef={vesselRowRef}
    />
  );
}

type InnerProps = {
  state: CorTwinStoreState;
  registry: Registry;
  bindings: ExploreBindings;
  intentError: ComputeError | null;
  vesselRowRef: React.RefObject<HTMLDivElement | null>;
};

/** Everything below the registry gate: hooks are not allowed past this point. */
function ExploreWorkspaceView({
  state,
  registry,
  bindings,
  intentError,
  vesselRowRef
}: InnerProps): ReactElement {
  const evaluation = state.eval.current;
  const stale = selectIsStale(state);
  const headline = headlineReadout(state, registry);
  const cards = vesselCardModels(state, registry);
  const inspectorProps = buildInspectorProps(state, registry, bindings);
  const completion = selectCompletion(state);
  const caseLabel = caseLabelOf(state);
  const sceneModel = buildSceneModel(state, registry);
  const structureUrl = structureUrlOf(state);
  const forbidden = registry.forbiddenInputColumns.map((column) => column.id).join(", ");

  const onVesselRowKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    const targetIds: TargetId[] = vesselTargets(registry).map((target) => target.id);
    const next = cycleTargetId(targetIds, state.selection.targetId, event.key === "ArrowRight" ? 1 : -1);
    if (next === null) return;
    event.preventDefault();
    bindings.onSelectTarget(next);
    const node = vesselRowRef.current?.querySelector<HTMLElement>(`[data-target-id="${next}"]`);
    node?.focus();
  };

  return (
    <div className="ct-explore" data-testid="explore" data-eval-status={state.eval.status}>
      {intentError !== null ? <IntentErrorNotice error={intentError} /> : null}

      {/* ---- Left: registry-driven inputs (P6 steps 5–7) ---- */}
      <section className="ct-explore__col ct-explore__col--profile" aria-label="Case profile">
        <header className="ct-explore__profile-head">
          <h2 className="ct-explore__heading">{caseLabel}</h2>
          <p className="ct-explore__completion" data-testid="completion">
            {`${completion.provided} / ${completion.total} provided`}
          </p>
          <button
            type="button"
            className="ct-explore__reset"
            onClick={() => {
              bindings.onReset();
            }}
          >
            Reset case
          </button>
        </header>

        <ProfileForm
          registry={registry}
          values={state.case.values}
          providedFeatures={state.case.providedFeatures}
          providedModalities={state.case.providedModalities}
          revision={state.case.revision}
          evalStatus={state.eval.status}
          onSelectFeature={(featureId) => {
            bindings.onSelectFeature(featureId);
          }}
          onSetValue={bindings.onSetValue}
          onSetFeatureProvided={bindings.onSetFeatureProvided}
          onSetModalityProvided={bindings.onSetModalityProvided}
        />

        <p className="ct-explore__lock">{`${forbidden} are never model inputs.`}</p>
      </section>

      {/* ---- Centre: stage + the only probability renderer (P6 steps 8–11) ---- */}
      <section className="ct-explore__col ct-explore__col--stage" aria-label="Vessel stage">
        <div className="ct-explore__stage-frame">
          <Stage3D
            registry={registry}
            model={sceneModel}
            structureUrl={structureUrl}
            cameraPreset={state.view.cameraPreset}
            qualityTier={state.view.qualityTier}
            reducedMotion={state.view.reducedMotion}
            onVesselHover={bindings.onVesselHover}
            onVesselSelect={bindings.onVesselSelect}
            onTierChange={bindings.onTierChange}
          />
        </div>

        <div className="ct-explore__readouts">
          <div className="ct-explore__headline" data-testid="headline-readout">
            {headline !== null ? (
              <ProbabilityReadout {...headline} />
            ) : (
              <ReadoutSkeleton label="CAD" />
            )}
          </div>

          <div
            className="ct-explore__vessels"
            role="group"
            aria-label="Vessel probabilities"
            ref={vesselRowRef}
            onKeyDown={onVesselRowKeyDown}
          >
            {cards.length > 0 ? (
              cards.map((card) => (
                <button
                  key={card.targetId}
                  type="button"
                  className="ct-explore__vessel"
                  data-target-id={card.targetId}
                  data-selected={card.selected ? "true" : "false"}
                  data-hovered={card.hovered ? "true" : "false"}
                  aria-pressed={card.selected}
                  onMouseEnter={() => {
                    bindings.onHoverTarget(card.targetId);
                  }}
                  onMouseLeave={() => {
                    bindings.onHoverTarget(null);
                  }}
                  onFocus={() => {
                    bindings.onHoverTarget(card.targetId);
                  }}
                  onBlur={() => {
                    bindings.onHoverTarget(null);
                  }}
                  onClick={() => {
                    bindings.onSelectTarget(card.targetId);
                  }}
                >
                  <ProbabilityReadout {...card.readout} />
                </button>
              ))
            ) : (
              <ReadoutSkeleton label="Vessels" />
            )}
          </div>

          <ColourMeaningExplainer />
        </div>

        <div className="ct-explore__statusline" role="status" aria-live="polite">
          {stale ? <StaleNotice /> : null}
          {evaluation === null && state.eval.status !== "error" ? (
            <span className="ct-explore__waiting" data-testid="awaiting-eval">
              Waiting for the first model response…
            </span>
          ) : null}
        </div>

        {state.eval.status === "error" && state.eval.error !== null ? (
          <EvalErrorNotice error={state.eval.error} />
        ) : null}

        {/* Evidence Rail docked under the stage (Final_demo 4.5, Contracts 8.4):
            registry ladder + case observation truth only, via this store. */}
        <EvidenceRailHost state={state} registry={registry} bindings={bindings} />
      </section>

      {/* ---- Right: Inspector (P6 steps 10, 12, 13) ---- */}
      <section className="ct-explore__col ct-explore__col--inspector" aria-label="Inspector">
        <InspectorPanel {...inspectorProps} />
      </section>
    </div>
  );
}
