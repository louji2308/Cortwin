import type { CorTwinStoreState } from "../contracts";
import type { CorTwinStore } from "../store";

/**
 * P1-a2 — a committed-stable subscription snapshot for the Explore
 * composition (AGENTS §6.1 / Architecture P-4: displayed animation never
 * rides React re-renders).
 *
 * `sampleDisplay` writes a fresh top-level state object on every animation
 * frame (a new `display.current`, `running` unchanged mid-tween).
 * Subscribing `ExploreView` to the whole state therefore re-rendered the
 * entire workspace — profile form, inspector, rail, shell — ~60×/s per
 * 400 ms transition. This module caches a projection whose identity changes
 * only when a committed/structural slice changes (`case`, `eval`,
 * `selection`, `view`, `bundle`, `cases`) or when the display channel
 * crosses a commit/settle boundary (`running`, `durationMs`,
 * `startedAtMs`).
 *
 * `useSyncExternalStore` re-renders exactly when the snapshot reference
 * changes, so per-frame easing now yields the SAME snapshot identity and the
 * parent bails out; the eased numbers still reach the number readouts
 * through their own narrow per-target subscription (`TweeningReadout`).
 * Data truth and displayed animation remain two surfaces (P-4): the channel
 * still settles exactly on the payload (`sampleDisplay` snaps `current` onto
 * `to`), and nothing in this module derives, rounds or formats a probability.
 */
const SNAPSHOT_CACHE = new WeakMap<
  CorTwinStore,
  { last: CorTwinStoreState; snapshot: CorTwinStoreState }
>();

/** The Explore subscription snapshot: stable across display frames,
 *  rebuilt when a committed slice or a display boundary changes. */
export function stableCorTwinSnapshot(store: CorTwinStore): CorTwinStoreState {
  const state = store.getState();
  const entry = SNAPSHOT_CACHE.get(store);
  if (entry === undefined) {
    const first = { last: state, snapshot: composeSnapshot(state) };
    SNAPSHOT_CACHE.set(store, first);
    return first.snapshot;
  }
  if (state === entry.last) return entry.snapshot;
  if (!projectionChanged(entry.last, state)) {
    // Same committed content: keep the SAME snapshot object identity so
    // React skips the parent render (per-frame display easing only).
    entry.last = state;
    return entry.snapshot;
  }
  entry.last = state;
  entry.snapshot = composeSnapshot(state);
  return entry.snapshot;
}

/**
 * A shallow copy with its own `display` object: the snapshot must never
 * alias a slot that per-frame easing replaces (the store never mutates in
 * place, but the copy keeps the identity contract independent of that).
 */
function composeSnapshot(state: CorTwinStoreState): CorTwinStoreState {
  return { ...state, display: { ...state.display } };
}

/**
 * True when a committed/structural slice or a display boundary changed.
 * Slices are compared by reference (the store updates them immutably);
 * boundary fields are compared by value. `display.current`/`from`/`to` are
 * deliberately absent — they are per-frame presentation, never composition
 * truth.
 */
function projectionChanged(prev: CorTwinStoreState, next: CorTwinStoreState): boolean {
  if (prev.case !== next.case) return true;
  if (prev.eval !== next.eval) return true;
  if (prev.selection !== next.selection) return true;
  if (prev.view !== next.view) return true;
  if (prev.bundle !== next.bundle) return true;
  if (prev.cases !== next.cases) return true;
  return (
    prev.display.running !== next.display.running ||
    prev.display.durationMs !== next.display.durationMs ||
    prev.display.startedAtMs !== next.display.startedAtMs
  );
}
