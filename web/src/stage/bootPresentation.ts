/**
 * Boot presentation gate — decides, per frame, whether the stage is still in
 * its one-time prepare window (Architecture §10.4: the governor "measures only
 * while frames are actually being produced (idle time is not slowness)").
 *
 * The boot sequence is: WebGL context creation + clear frames → async structure
 * parse/upload → first frame with the structure in the scene → colour reveal
 * tween + camera flight. Under CPU throttle the prepare frames (context
 * creation, shader compile, buffer upload) cost 100–400 ms each — one-time
 * asset cost, not interactive rendering quality. If their gaps reach the
 * governor while a tween/flight asks for continuation, three consecutive slow
 * prepare frames cascade Q0→Q1→Q2→Q3 and the session never recovers
 * (downgrade-only), dropping a healthy GPU to the 2D schematic before the
 * first interaction. Measured on this defect, 2026-10-12 (perf-report §7).
 *
 * The gate keeps that cost out of the evidence stream, honestly:
 * - Frames before the structure is in the scene are *not measured at all*
 *   (`gate` — the caller skips `bridge.tick`, so no sample AND no idle event
 *   is invented; the runtime clock simply does not run yet).
 * - The first frame that presents the structure is also gated, but it kicks
 *   the next frame and rebases any pending camera flight to its own time, so
 *   the 700 ms flight arc (and the reveal tween) run on post-prepare frames
 *   whose cost is genuine interactive evidence.
 * - Every later frame is measured normally — a slow machine still downgrades
 *   during flight, tween, orbit or edits, exactly as before.
 *
 * Pure decision data — no timers, no three.js, no React.
 */

export type BootFrameDecision = {
  /** Mark the boot window as presented after this frame. */
  presented: boolean;
  /** This frame is prepare cost: skip `bridge.tick` (measured as nothing). */
  gate: boolean;
  /** A pending camera flight must be rebased to this frame's time. */
  rebaseFlight: boolean;
  /** Request the next frame so flight/tween can start on measured time. */
  kickNextFrame: boolean;
};

/**
 * Decide how to treat one frame of the stage's render loop.
 *
 * @param hasPresented A frame that presented the structure has already run.
 * @param hasStructure The parsed structure is in the scene for this frame.
 * @param hasPendingFlight A camera flight is waiting to run.
 */
export function decideBootFrame(
  hasPresented: boolean,
  hasStructure: boolean,
  hasPendingFlight: boolean
): BootFrameDecision {
  if (hasPresented) {
    return { presented: true, gate: false, rebaseFlight: false, kickNextFrame: false };
  }
  if (!hasStructure) {
    // Context creation / clear frames while the GLB parses: neither measured
    // nor allowed to schedule work — the load chain invalidates when ready.
    return { presented: false, gate: true, rebaseFlight: false, kickNextFrame: false };
  }
  // First structure-present frame: draw as-is (prepare cost), rebase the
  // flight so its arc is measured from here, and kick the loop once so the
  // flight/tween sequence cannot deadlock behind this gate.
  return {
    presented: true,
    gate: true,
    rebaseFlight: hasPendingFlight,
    kickNextFrame: true
  };
}
