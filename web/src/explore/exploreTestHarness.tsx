import type { Evaluation, TargetId } from "../contracts";
import {
  createHarness,
  disposeHarnesses,
  errorResponse,
  evaluationResponse,
  explanationResponse,
  makeEvaluation,
  makeExplanation,
  registry,
  type EvaluationOptions,
  type Harness
} from "../store/testFixtures";

/**
 * Shared Explore test harness (P6-EXPLORE-R, mission F).
 *
 * Wraps the store fixtures' `createHarness` with the two things every Explore
 * test needs: a C-07 happy-path responder for evaluate requests, and a display
 * channel settle that does exactly what `useDisplayChannelDriver` does on an
 * animation frame (`store.sampleDisplay` past the transition window). Neither
 * helper invents data — every payload comes from `makeEvaluation`, the
 * labelled SYNTHETIC fixture double.
 */

export {
  createHarness,
  disposeHarnesses,
  errorResponse,
  evaluationResponse,
  explanationResponse,
  makeEvaluation,
  makeExplanation,
  registry
};
export type { EvaluationOptions, Harness };

const answered = new WeakMap<Harness, Set<string>>();

function answeredSet(h: Harness): Set<string> {
  const existing = answered.get(h);
  if (existing !== undefined) return existing;
  const created = new Set<string>();
  answered.set(h, created);
  return created;
}

/**
 * Answer every not-yet-answered `evaluate` request on the harness port with a
 * well-formed C-08 payload echoed at the request's own revision (C-07 §6.1).
 * Returns how many new responses were dispatched.
 */
export function answerEvaluations(h: Harness, options?: EvaluationOptions): number {
  const seen = answeredSet(h);
  let dispatched = 0;
  for (const request of h.port.requestsFor("evaluate")) {
    if (seen.has(request.requestId)) continue;
    seen.add(request.requestId);
    h.port.respond(evaluationResponse(request, makeEvaluation(request.revision, options)));
    dispatched += 1;
  }
  return dispatched;
}

/** Answer the newest unanswered `explain` request for `targetId`, if any. */
export function answerExplanation(h: Harness, targetId: TargetId): number {
  const requests = h.port
    .requestsFor("explain")
    .filter((request) => request.targetId === targetId);
  const request = requests[requests.length - 1];
  if (request === undefined) return 0;
  h.port.respond(explanationResponse(request, makeExplanation(request.revision, targetId)));
  return 1;
}

/** Deliver a typed compute error for the newest unanswered evaluate request. */
export function failLatestEvaluation(
  h: Harness,
  error: { code: "INTERNAL_COMPUTE_FAILURE" | "MALFORMED_REQUEST"; message: string; recoverable: boolean }
): boolean {
  const requests = h.port.requestsFor("evaluate");
  const request = requests[requests.length - 1];
  if (request === undefined) return false;
  h.port.respond(errorResponse(request, error));
  return true;
}

/**
 * Step the display channel past its transition window - the same call the
 * Explore rAF driver makes when a 400 ms ease finishes. No-op when idle.
 * (`+1` also settles a 0 ms reduced-motion window: elapsed > 0 of 0.)
 */
export function settleDisplay(h: Harness): void {
  const display = h.state().display;
  if (!display.running || display.startedAtMs === null) return;
  h.store.sampleDisplay(display.startedAtMs + display.durationMs + 1);
}

/** Boot a ready harness whose first L0 evaluation has landed (display settled). */
export function readyHarness(options: { tierQ3?: boolean; reducedMotion?: boolean } = {}): Harness {
  const h = createHarness();
  if (options.tierQ3 === true) h.store.intents.view.setQualityTier("Q3");
  if (options.reducedMotion === true) h.store.intents.view.setReducedMotion(true);
  answerEvaluations(h);
  settleDisplay(h);
  return h;
}

/** The payload the default ready harness displays (SYNTHETIC fixture numbers). */
export function currentEvaluation(h: Harness): Evaluation {
  const evaluation = h.state().eval.current;
  if (evaluation === null) throw new Error("harness has no evaluation");
  return evaluation;
}
