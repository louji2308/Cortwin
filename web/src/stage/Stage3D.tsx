import {
  Component,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ComponentRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode
} from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Raycaster, Vector2, type MeshStandardMaterial } from "three";
import {
  PRIMARY_STRUCTURE_CANDIDATE,
  PROCEDURAL_STRUCTURE_CANDIDATE,
  REQUIRED_STRUCTURE_IDS,
  buildSchematicViewModel,
  buildStructureSource,
  cameraFlightProgress,
  cameraTargetFromPreset,
  effectiveQualityTier,
  resolveStructureSource,
  vesselStructureIds,
  type CameraPreset,
  type QualityEvent,
  type QualityTier,
  type RegistrySlice,
  type SceneModel,
  type StructureId,
  type StructureSource,
  type VesselId
} from "../scene";
import { createGltfLoader } from "./gltf";
import { StageSchematic } from "./StageSchematic";
import {
  antialiasForTier,
  dprRangeForTier,
  initialRuntimeState,
  pushEvent,
  shouldForceTier,
  tick as tickRuntime,
  type RuntimeState
} from "./governorRuntime";
import {
  OVERVIEW_POSE,
  STAGE_CAMERA,
  cameraPoseFor,
  interpolatePose,
  type CameraPose,
  type Vec3
} from "./cameraPoses";
import { initialTweenState, stepTweens, type TweenState } from "./colours";
import { buildStructureDescriptors, stageColourTargets } from "./materials";
import { isClick, resolvePick, type PickResult } from "./picking";
import {
  STAGE_LIGHTS,
  attachPickProxies,
  buildRenderGroup,
  computeModelExtent,
  computeStructureCentres,
  createStageMaterials,
  disposeStageResources,
  hatchFrequency,
  setHatchFrequency,
  updateStageMaterial,
  type StageRenderGroup
} from "./threeParts";
import "./stage.css";

/**
 * `Stage3D` — the WebGL stage (Implementation_Plan P5, `C-11` L350-L354,
 * `C-16`, Architecture §10). It renders the `SceneModel` it is given; it never
 * computes clinical truth, never reads an artifact, never touches the store.
 *
 * Structure of the unit:
 * - **Parent (`Stage3D`)** owns the governor runtime (it must survive Canvas
 *   unmount), the store-tier echo/force decision, the structure chain
 *   (primary → procedural → `StageSchematic`), the degradation ladder (Q3 /
 *   WebGL failure → `StageSchematic`), the designed notices and the keyboard
 *   vessel cycle.
 * - **`SceneContents`** (inside `<Canvas>`) owns loading, the render group,
 *   picking, the display-channel tween, the camera director and per-frame
 *   material updates — all through the pure stage modules.
 *
 * Rendering laws:
 * - `frameloop="demand"`: zero frames while idle; every state change
 *   invalidates exactly what it needs (tween/flight self-continue).
 * - `flat` (no tone mapping) + alpha compositing onto the token background:
 *   the ramp colour reaches the screen unchanged, no colour literal exists.
 * - DPR comes from the tier table; anti-aliasing is fixed at context creation
 *   (a recorded stage pick — the context cannot be re-created mid-session
 *   without losing the scene; Q0/Q1 remount happens via the Q3 round-trip).
 * - Reduced motion: colour snaps, flights complete immediately (`C-11` L366).
 */
export type Stage3DProps = {
  registry: RegistrySlice;
  model: SceneModel | null;
  /** Structure asset URL; P6 passes the manifest path. */
  structureUrl?: string;
  cameraPreset: CameraPreset;
  /** The store's view tier — forces pin it; echoes of our own publish are ignored. */
  qualityTier: QualityTier;
  reducedMotion: boolean;
  onVesselHover?: (id: VesselId | null) => void;
  onVesselSelect?: (id: VesselId | null) => void;
  onTierChange?: (tier: QualityTier) => void;
  className?: string;
};

export type Stage3DHandle = {
  /** Move focus to the stage (skip-links / P6 toolbar). */
  focus(): void;
};

export type StageLoadState = {
  status: "loading" | "ready" | "failed";
  /**
   * Structure source that actually reached the scene: the primary mesh, the
   * procedural tubes (Architecture §16.1 G2 / FM-07) or `none` when every
   * candidate failed and the 2D schematic owns the stage (G4).
   */
  source: "primary" | "procedural" | "none";
};

/** Governor bridge: the Canvas contents drive the parent-owned runtime. */
type RuntimeBridge = {
  tick(nowMs: number, willContinue: boolean): QualityTier;
  push(event: QualityEvent): QualityTier;
};

type LoadedStructure = {
  renderGroup: StageRenderGroup;
  materials: Record<StructureId, MeshStandardMaterial>;
  source: StructureSource;
  centres: Partial<Record<StructureId, Vec3>>;
};

type SceneContentsProps = {
  registry: RegistrySlice;
  model: SceneModel | null;
  structureUrl: string;
  cameraPreset: CameraPreset;
  reducedMotion: boolean;
  bridge: RuntimeBridge;
  onVesselHover: (id: VesselId | null) => void;
  onVesselSelect: (id: VesselId | null) => void;
  onLoadState: (state: StageLoadState) => void;
  onContextChange: (lost: boolean) => void;
};

const INITIAL_CAMERA_POSITION: [number, number, number] = [
  OVERVIEW_POSE.position[0],
  OVERVIEW_POSE.position[1],
  OVERVIEW_POSE.position[2]
];

const vec = (value: Vec3): [number, number, number] => [value[0], value[1], value[2]];

type Flight = { from: CameraPose; to: CameraPose; startedAt: number };

function SceneContents({
  registry,
  model,
  structureUrl,
  cameraPreset,
  reducedMotion,
  bridge,
  onVesselHover,
  onVesselSelect,
  onLoadState,
  onContextChange
}: SceneContentsProps) {
  const gl = useThree((state) => state.gl);
  const camera = useThree((state) => state.camera);
  const invalidate = useThree((state) => state.invalidate);
  const controlsRef = useRef<ComponentRef<typeof OrbitControls> | null>(null);

  // Latest-callback refs: DOM listeners bind once, props never go stale.
  const registryRef = useRef(registry);
  registryRef.current = registry;
  const hoverRef = useRef(onVesselHover);
  hoverRef.current = onVesselHover;
  const selectRef = useRef(onVesselSelect);
  selectRef.current = onVesselSelect;
  const contextRef = useRef(onContextChange);
  contextRef.current = onContextChange;
  const loadRef = useRef(onLoadState);
  loadRef.current = onLoadState;
  const bridgeRef = useRef(bridge);
  bridgeRef.current = bridge;

  const [structure, setStructure] = useState<LoadedStructure | null>(null);
  const structureRef = useRef<LoadedStructure | null>(null);

  const vesselIds = useMemo(() => vesselStructureIds(registry), [registry]);
  const tweenRef = useRef<TweenState | null>(null);
  const flightRef = useRef<Flight | null>(null);
  const lastHoverRef = useRef<VesselId | null>(null);

  /* --- load → validate → reparent → materials → proxies → measurements --- */
  useEffect(() => {
    let cancelled = false;
    loadRef.current({ status: "loading", source: "none" });

    (async () => {
      try {
        // The C-11 §8.1 fallback chain, in the scene's own order: primary
        // mesh → procedural tubes → 2D schematic (Architecture §16.1 G2 → G4,
        // FM-07 "switch source instead"). One injected GLTF loader serves every
        // candidate; the root object the successful candidate yields is
        // captured for the reparent step below (the scene chain validates
        // names only, it never returns the scene root).
        const loadGltf = createGltfLoader();
        const holder: { root: Awaited<ReturnType<typeof loadGltf>> | null } = { root: null };
        const resolution = await resolveStructureSource(
          registryRef.current,
          async (url) => {
            const root = await loadGltf(url);
            holder.root = root;
            return root;
          },
          [
            { ...PRIMARY_STRUCTURE_CANDIDATE, url: structureUrl },
            PROCEDURAL_STRUCTURE_CANDIDATE
          ]
        );
        if (cancelled) return;
        if (resolution.mode === "schematic") {
          // Every candidate failed: the designed 2D state with a visible
          // notice, never a blank stage (Architecture §16).
          loadRef.current({ status: "failed", source: "none" });
          invalidate();
          return;
        }
        const source = resolution.source;
        const candidate = resolution.candidate;
        if (holder.root === null) {
          throw new Error(`Structure loader for "${candidate.url}" produced no scene root`);
        }
        const root = holder.root;
        const renderGroup = buildRenderGroup(root, source);
        attachPickProxies(renderGroup.meshes, source, registryRef.current);

        // Materials start neutral; the first frame tweens them to colour
        // (Final_demo §4.1 boot reveal), driven entirely by the tween state.
        const materials = createStageMaterials(
          buildStructureDescriptors({
            source,
            registry: registryRef.current,
            model: null,
            displayed: {}
          })
        );
        for (const structureId of REQUIRED_STRUCTURE_IDS) {
          renderGroup.meshes[structureId].material = materials[structureId];
        }

        const extent = computeModelExtent(renderGroup.meshes);
        const frequency = hatchFrequency(extent);
        for (const material of new Set(Object.values(materials))) {
          setHatchFrequency(material, frequency);
        }

        const centres = computeStructureCentres(renderGroup.meshes);
        const loaded: LoadedStructure = { renderGroup, materials, source, centres };
        structureRef.current = loaded;
        if (cancelled) {
          disposeStageResources(renderGroup, materials);
          return;
        }
        setStructure(loaded);
        loadRef.current({ status: "ready", source: candidate.id });
        invalidate();
      } catch {
        // Every load/validation failure (STRUCTURE_LOAD_FAILED,
        // MISSING_REQUIRED_NODE, registry errors) lands in the designed
        // "failed" state — the caller degrades to the 2D schematic with a
        // visible notice, never a blank stage (Architecture §16).
        if (cancelled) return;
        loadRef.current({ status: "failed", source: "none" });
        invalidate();
      }
    })();

    return () => {
      cancelled = true;
      const loaded = structureRef.current;
      structureRef.current = null;
      setStructure(null);
      if (loaded !== null) {
        disposeStageResources(loaded.renderGroup, loaded.materials);
      }
    };
  }, [structureUrl, invalidate]);

  /* --- context loss/restore → governor + designed notice --- */
  useEffect(() => {
    const element = gl.domElement;
    const onLost = (event: Event) => {
      event.preventDefault();
      bridgeRef.current.push({ type: "context-lost", recoverable: true });
      contextRef.current(true);
    };
    const onRestored = () => {
      bridgeRef.current.push({ type: "context-restored" });
      contextRef.current(false);
      invalidate();
    };
    element.addEventListener("webglcontextlost", onLost);
    element.addEventListener("webglcontextrestored", onRestored);
    return () => {
      element.removeEventListener("webglcontextlost", onLost);
      element.removeEventListener("webglcontextrestored", onRestored);
    };
  }, [gl, invalidate]);

  /* --- manual pointer picking (registry identity, nearest hit wins) --- */
  useEffect(() => {
    const element = gl.domElement;
    const raycaster = new Raycaster();
    const pointer = new Vector2();
    let downAt: { x: number; y: number } | null = null;

    const toNdc = (event: { clientX: number; clientY: number }): void => {
      const rect = element.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    };

    const pick = (): PickResult | null => {
      const loaded = structureRef.current;
      if (loaded === null) return null;
      loaded.renderGroup.group.updateWorldMatrix(true, true);
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster
        .intersectObjects(loaded.renderGroup.group.children, true)
        .map((hit) => ({ nodeName: hit.object.name, distance: hit.distance }));
      try {
        return resolvePick(hits, registryRef.current);
      } catch {
        // A name outside the registry contract is not a pick target; a pointer
        // stream never crashes the app (the invariant stays loud in unit tests).
        return null;
      }
    };

    const onMove = (event: PointerEvent): void => {
      if (event.pointerType !== "mouse") return;
      toNdc(event);
      const result = pick();
      const id = result !== null && result.kind === "vessel" ? result.structureId : null;
      if (id !== lastHoverRef.current) {
        lastHoverRef.current = id;
        hoverRef.current(id);
      }
    };
    const onLeave = (): void => {
      if (lastHoverRef.current !== null) {
        lastHoverRef.current = null;
        hoverRef.current(null);
      }
    };
    const onDown = (event: PointerEvent): void => {
      downAt = { x: event.clientX, y: event.clientY };
    };
    const onUp = (event: PointerEvent): void => {
      const from = downAt;
      downAt = null;
      if (from === null) return;
      if (!isClick(from, { x: event.clientX, y: event.clientY })) return;
      toNdc(event);
      const result = pick();
      selectRef.current(result !== null && result.kind === "vessel" ? result.structureId : null);
    };

    element.addEventListener("pointermove", onMove);
    element.addEventListener("pointerleave", onLeave);
    element.addEventListener("pointerdown", onDown);
    element.addEventListener("pointerup", onUp);
    return () => {
      element.removeEventListener("pointermove", onMove);
      element.removeEventListener("pointerleave", onLeave);
      element.removeEventListener("pointerdown", onDown);
      element.removeEventListener("pointerup", onUp);
    };
  }, [gl, camera]);

  /* --- camera director: start a 700 ms flight when the preset changes --- */
  useEffect(() => {
    const target = cameraTargetFromPreset(cameraPreset);
    const to = cameraPoseFor(
      target,
      structure === null ? {} : structure.centres
    );
    if (to === null) return; // centre unknown yet — retried when structure lands
    const controls = controlsRef.current;
    const from: CameraPose = {
      position: [camera.position.x, camera.position.y, camera.position.z],
      target:
        controls === null
          ? OVERVIEW_POSE.target
          : [controls.target.x, controls.target.y, controls.target.z]
    };
    flightRef.current = { from, to, startedAt: performance.now() };
    invalidate();
  }, [cameraPreset, structure, camera, invalidate]);

  /* --- one prop change → exactly one frame (render-on-demand driver) --- */
  useEffect(() => {
    invalidate();
  }, [model, reducedMotion, invalidate]);

  /* --- per frame: display-channel tween, camera flight, materials, governor --- */
  useFrame(() => {
    const now = performance.now();
    const targets = stageColourTargets(model, registry);
    if (tweenRef.current === null) {
      tweenRef.current = initialTweenState(vesselIds);
    }
    const stepped = stepTweens(tweenRef.current, targets, now, { reducedMotion });
    tweenRef.current = stepped.state;
    let willContinue = stepped.active;

    const flight = flightRef.current;
    if (flight !== null) {
      const progress = cameraFlightProgress(now - flight.startedAt, reducedMotion);
      const pose = interpolatePose(flight.from, flight.to, progress);
      camera.position.set(pose.position[0], pose.position[1], pose.position[2]);
      const controls = controlsRef.current;
      if (controls === null) {
        camera.lookAt(pose.target[0], pose.target[1], pose.target[2]);
      } else {
        controls.target.set(pose.target[0], pose.target[1], pose.target[2]);
        controls.enabled = progress >= 1;
        controls.update();
      }
      if (progress >= 1) {
        flightRef.current = null;
        if (controls !== null) controls.enabled = true;
      } else {
        willContinue = true;
      }
    }

    const loaded = structureRef.current;
    if (loaded !== null) {
      const descriptors = buildStructureDescriptors({
        source: loaded.source,
        registry,
        model,
        displayed: stepped.colours
      });
      for (const descriptor of descriptors) {
        updateStageMaterial(loaded.materials[descriptor.structureId], descriptor);
      }
    }

    bridge.tick(now, willContinue);
    if (willContinue) invalidate();
  });

  return (
    <>
      <ambientLight intensity={STAGE_LIGHTS.ambientIntensity} />
      <directionalLight
        intensity={STAGE_LIGHTS.key.intensity}
        position={vec(STAGE_LIGHTS.key.position)}
      />
      <directionalLight
        intensity={STAGE_LIGHTS.fill.intensity}
        position={vec(STAGE_LIGHTS.fill.position)}
      />
      <OrbitControls
        ref={controlsRef}
        makeDefault
        enableDamping={false}
        enablePan={false}
        minDistance={0.04}
        maxDistance={1.5}
      />
      {structure !== null ? <primitive object={structure.renderGroup.group} /> : null}
    </>
  );
}

/**
 * Error boundary: WebGL context creation failure → designed degrade.
 * Re-mounting (Q3 round-trip) retries the context from a clean state.
 */

type BoundaryProps = { onError: () => void; children: ReactNode };
type BoundaryState = { failed: boolean };

class StageCanvasBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { failed: false };

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true };
  }

  componentDidCatch(): void {
    this.props.onError();
  }

  render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}

/* ------------------------------------------------------------------ *
 * Parent: governor ownership, tier echo/force, notices, schematic branch.
 * ------------------------------------------------------------------ */

export const Stage3D = forwardRef<Stage3DHandle, Stage3DProps>(function Stage3D(props, ref) {
  const {
    registry,
    model,
    structureUrl = PRIMARY_STRUCTURE_CANDIDATE.url,
    cameraPreset,
    qualityTier,
    reducedMotion,
    onVesselHover,
    onVesselSelect,
    onTierChange,
    className
  } = props;

  const containerRef = useRef<HTMLDivElement | null>(null);
  useImperativeHandle(ref, () => ({ focus: () => containerRef.current?.focus() }), []);

  const runtimeRef = useRef<RuntimeState>(initialRuntimeState());
  const publishedRef = useRef<QualityTier | null>(null);
  const lastPropTierRef = useRef<QualityTier | null>(null);
  // First paint honours a store tier that already differs from the runtime's
  // initial tier (the mount case of shouldForceTier); the effect below then
  // pushes the matching user-force event so the governor agrees.
  const [effectiveTier, setEffectiveTier] = useState<QualityTier>(() => {
    const runtimeInitial = effectiveQualityTier(initialRuntimeState().governor);
    return qualityTier === runtimeInitial ? runtimeInitial : qualityTier;
  });
  const [loadState, setLoadState] = useState<StageLoadState>({
    status: "loading",
    source: "none"
  });
  const [contextLost, setContextLost] = useState(false);
  const [webglFailed, setWebglFailed] = useState(false);

  const onTierChangeRef = useRef(onTierChange);
  onTierChangeRef.current = onTierChange;

  const handleTier = useCallback((tier: QualityTier): void => {
    publishedRef.current = tier;
    setEffectiveTier((previous) => (previous === tier ? previous : tier));
    onTierChangeRef.current?.(tier);
  }, []);

  const bridge = useMemo<RuntimeBridge>(
    () => ({
      tick(nowMs, willContinue) {
        const result = tickRuntime(runtimeRef.current, nowMs, willContinue);
        runtimeRef.current = result.state;
        if (result.tierChanged) handleTier(result.effectiveTier);
        return result.effectiveTier;
      },
      push(event) {
        const result = pushEvent(runtimeRef.current, event);
        runtimeRef.current = result.state;
        if (result.tierChanged) handleTier(result.effectiveTier);
        return result.effectiveTier;
      }
    }),
    [handleTier]
  );

  /* Store tier → external force (never the echo of our own publication). */
  useEffect(() => {
    const force = shouldForceTier(
      lastPropTierRef.current,
      qualityTier,
      publishedRef.current,
      effectiveQualityTier(runtimeRef.current.governor)
    );
    lastPropTierRef.current = qualityTier;
    if (force) bridge.push({ type: "user-force-tier", tier: qualityTier });
  }, [qualityTier, bridge]);

  const handleWebglFailed = useCallback((): void => {
    setWebglFailed(true);
    bridge.push({ type: "webgl-unavailable" });
  }, [bridge]);

  const handleLoadState = useCallback((state: StageLoadState): void => {
    setLoadState(state);
  }, []);

  const handleContextChange = useCallback((lost: boolean): void => {
    setContextLost(lost);
  }, []);

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    const ids = vesselStructureIds(registry);
    if (ids.length === 0) return;
    event.preventDefault();
    const current = model?.selectedTargetId ?? null;
    const currentIndex = current === null ? -1 : ids.indexOf(current as VesselId);
    const step = event.key === "ArrowRight" ? 1 : -1;
    const next = ids[((currentIndex + step) % ids.length + ids.length) % ids.length];
    onVesselSelect?.(next);
  };

  /* WebGL failure / structure failure / Q3 → the 2D schematic (G4 ladder).
     The procedural source (G2) still renders in 3D, so it degrades the flag
     and the notice without forcing the schematic. */
  const schematicFallback = webglFailed || loadState.status === "failed";
  const showSchematic = effectiveTier === "Q3" || schematicFallback;
  const proceduralOnly = loadState.status === "ready" && loadState.source === "procedural";
  const degraded = schematicFallback || proceduralOnly;

  const schematicVM = useMemo(() => {
    if (model === null || !showSchematic) return null;
    const source = buildStructureSource(PRIMARY_STRUCTURE_CANDIDATE, () => ({}), registry);
    return buildSchematicViewModel(model, source, registry);
  }, [model, registry, showSchematic]);

  const notice = ((): string | null => {
    if (webglFailed) {
      return "3D rendering is unavailable in this browser — the 2D schematic is shown instead.";
    }
    if (!showSchematic) {
      if (loadState.status === "loading") return "Loading the 3D structure…";
      if (proceduralOnly) {
        return "The detailed structure asset could not be loaded — the procedural vessel model is shown instead.";
      }
      if (contextLost) return "3D rendering paused while the graphics context recovers.";
      return null;
    }
    if (loadState.status === "failed") {
      return model === null
        ? "The 3D structure could not be loaded and no evaluation is available yet."
        : "The 3D structure could not be loaded — the 2D schematic is shown instead.";
    }
    if (model === null) return "The 2D schematic appears when an evaluation is available.";
    return null;
  })();

  return (
    <div
      ref={containerRef}
      className={className === undefined ? "ct-stage" : `ct-stage ${className}`}
      data-tier={effectiveTier}
      data-degraded={degraded ? "true" : "false"}
      tabIndex={0}
      aria-label={showSchematic ? "2D vessel schematic" : "3D vessel stage"}
      onKeyDown={onKeyDown}
    >
      {showSchematic ? (
        schematicVM !== null ? (
          <StageSchematic
            model={schematicVM}
            onVesselHover={onVesselHover}
            onVesselSelect={onVesselSelect}
          />
        ) : null
      ) : (
        <StageCanvasBoundary onError={handleWebglFailed}>
          <Canvas
            className="ct-stage__canvas"
            frameloop="demand"
            flat
            dpr={dprRangeForTier(effectiveTier)}
            gl={{ antialias: antialiasForTier(qualityTier), alpha: true, powerPreference: "high-performance" }}
            camera={{
              fov: STAGE_CAMERA.fov,
              near: STAGE_CAMERA.near,
              far: STAGE_CAMERA.far,
              position: INITIAL_CAMERA_POSITION
            }}
          >
            <SceneContents
              registry={registry}
              model={model}
              structureUrl={structureUrl}
              cameraPreset={cameraPreset}
              reducedMotion={reducedMotion}
              bridge={bridge}
              onVesselHover={onVesselHover ?? (() => undefined)}
              onVesselSelect={onVesselSelect ?? (() => undefined)}
              onLoadState={handleLoadState}
              onContextChange={handleContextChange}
            />
          </Canvas>
        </StageCanvasBoundary>
      )}
      {notice !== null ? (
        <div className="ct-stage__notice" role="status">
          {notice}
        </div>
      ) : null}
    </div>
  );
});
