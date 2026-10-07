/**
 * Live scene health channel (D-22, C-16 `B-05`) — a read-only publication
 * surface between the WebGL renderer and informational views.
 *
 * Why a channel instead of an import: Architecture §9.1 forbids `system/`
 * from importing `scene`/`stage` internals, and the stage itself must stay
 * prop-driven and free of view knowledge (C-11). The stage therefore
 * *publishes* a plain statistics sample here while the System pane *reads*
 * it; `perf/` imports nothing, so both sides may depend on it without
 * reversing the dependency arrows.
 *
 * Measurement law (C-16 L455 / INV-C28): a sample is read from
 * `WebGLRenderer.info` — three accumulates a frame's draw list and resets it
 * at the *start* of the next `render()` call, so the numbers describe exactly
 * the last rendered frame and never an estimate. A renderer that has not
 * drawn yet publishes `null`, which the reader turns into a designed
 * "not measured yet" state. Nothing here rounds, clamps or defaults a value,
 * and no patient-derived data ever enters this module.
 */

/** One frame's renderer statistics, as `WebGLRenderer.info` reports them. */
export type SceneHealthSample = {
  /** Triangles submitted in the sampled frame (`info.render.triangles`). */
  triangles: number;
  /** Draw calls issued in the sampled frame (`info.render.calls`). */
  drawCalls: number;
  /** Live textures (`info.memory.textures`) — C-16 `B-05` requires zero. */
  textures: number;
  /** Live geometries (`info.memory.geometries`). */
  geometries: number;
  /** Renderer frame counter; `0` means nothing has been drawn yet. */
  frame: number;
};

/**
 * What a reader may display:
 * - `absent`  — no renderer has ever published in this session;
 * - `pending` — a renderer is registered but has not drawn a frame;
 * - `measured` — at least one frame has been drawn; `stageMounted` says
 *   whether the renderer is still alive right now (when false the sample is
 *   the last rendered frame and must be labelled as such).
 */
export type SceneHealthReading =
  | { status: "absent" }
  | { status: "pending" }
  | { status: "measured"; stageMounted: boolean; sample: SceneHealthSample };

/** A registered publisher. Returning `null` means "nothing measured yet". */
export type SceneHealthSource = () => SceneHealthSample | null;

const ABSENT: SceneHealthReading = { status: "absent" };
const PENDING: SceneHealthReading = { status: "pending" };

let source: SceneHealthSource | null = null;
let lastSample: SceneHealthSample | null = null;
let snapshot: SceneHealthReading = ABSENT;
const listeners = new Set<() => void>();

const SAMPLE_FIELDS = [
  "triangles",
  "drawCalls",
  "textures",
  "geometries",
  "frame"
] as const;

/**
 * A publisher outside the contract (or a corrupted `info` object) must never
 * reach a viewer: every field has to be a finite, non-negative number or the
 * whole sample is refused — a partial sample would silently misreport a
 * budget comparison.
 */
function sanitize(value: unknown): SceneHealthSample | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Partial<SceneHealthSample>;
  const sample = {} as SceneHealthSample;
  for (const field of SAMPLE_FIELDS) {
    const entry = candidate[field];
    if (typeof entry !== "number" || !Number.isFinite(entry) || entry < 0) {
      return null;
    }
    sample[field] = entry;
  }
  return sample;
}

function sameSample(a: SceneHealthSample, b: SceneHealthSample): boolean {
  return (
    a.triangles === b.triangles &&
    a.drawCalls === b.drawCalls &&
    a.textures === b.textures &&
    a.geometries === b.geometries &&
    a.frame === b.frame
  );
}

/** Pull once from the publisher and fold the result into a stable reading. */
function capture(): SceneHealthReading {
  const fresh = source === null ? null : sanitize(source());
  if (fresh !== null) lastSample = fresh;

  const reading: SceneHealthReading =
    lastSample === null
      ? source === null
        ? ABSENT
        : PENDING
      : { status: "measured", stageMounted: source !== null, sample: lastSample };

  const previous = snapshot;
  if (previous.status === "measured" && reading.status === "measured") {
    if (
      previous.stageMounted === reading.stageMounted &&
      sameSample(previous.sample, reading.sample)
    ) {
      return previous;
    }
  } else if (previous.status === reading.status) {
    return previous;
  }
  return reading;
}

/**
 * Publish renderer statistics from the stage. Returns the unregister function
 * (an effect cleanup); unregistering keeps the last sample so an informational
 * view can still show what was measured, labelled "stage not mounted".
 */
export function registerSceneHealthSource(next: SceneHealthSource): () => void {
  source = next;
  refreshSceneHealth();
  return () => {
    if (source !== next) return;
    source = null;
    refreshSceneHealth();
  };
}

/** Pull a fresh sample and notify subscribers only when the reading changed. */
export function refreshSceneHealth(): void {
  const next = capture();
  if (next === snapshot) return;
  snapshot = next;
  for (const listener of [...listeners]) listener();
}

/** Stable snapshot for `useSyncExternalStore` — identity changes on truth only. */
export function getSceneHealthSnapshot(): SceneHealthReading {
  return snapshot;
}

export function subscribeSceneHealth(listener: () => void): () => void {
  listeners.add(listener);
  refreshSceneHealth();
  return () => {
    listeners.delete(listener);
  };
}

/** Test-only teardown: Node has no renderer, so each test starts from `absent`. */
export function resetSceneHealth(): void {
  source = null;
  lastSample = null;
  snapshot = ABSENT;
}
