/**
 * D-16 — the SINGLE public entry of the domain engine (frozen interface).
 *
 * Orchestrator-seeded 2026-10-04 at G3 so P4-2 (worker) can typecheck in
 * parallel with P4-1. **P4-1 owns this file and replaces the throwing stub
 * implementations with the real engine, keeping these signatures identical.**
 * No other module may define a second engine entry point (AGENTS §7 law 6).
 *
 * Signatures are projections of C-07 §6.1 operations (evaluate / explain /
 * ladder / integrity) and Architecture §8/§9.3 — never invented fields.
 */
import type { Registry } from "../contracts/artifacts";
import type {
  CaseEncoder,
  ComputeRequest,
  ComputeResponse,
} from "../contracts/compute";
import { buildCaseEncoder } from "./encoder";
import {
  attachFixtureSet as attachToEngine,
  createDomainEngine,
  resolveDomainEngine,
} from "./engine";
import type { FixtureVerificationReport } from "./engine";

/** Artifacts handed to the engine after bundle validation (C-03 + C-02). */
export type EngineArtifacts = {
  /** Parsed `model.json` document; validated by `loadEngine` (throws typed errors). */
  model: unknown;
  registry: Registry;
};

export type Engine = {
  /** Content hash `sha256:…` from the model bundle metadata (C-03). */
  readonly modelId: string;
  /** Executes one C-07 request; never throws — typed `status: "error"` responses. */
  execute(request: ComputeRequest): ComputeResponse;
};

/** Validates artifacts and returns the engine. Throws typed load errors. */
export function loadEngine(artifacts: EngineArtifacts): Engine {
  return createDomainEngine(artifacts.model, artifacts.registry);
}

/** Strict domain encoder (Architecture §8 encoding boundary; ref pipeline/encode.py). */
export function createCaseEncoder(): CaseEncoder {
  return buildCaseEncoder();
}

/**
 * Attach the frozen golden-fixture corpus (`public/fixtures/golden.json`) to
 * an engine produced by `loadEngine`. Required before the C-07 `integrity`
 * operation can run; the parity test uses it for C-06 blocking evidence.
 */
export function attachFixtureSet(engine: Engine, fixtures: unknown): void {
  attachToEngine(engine, fixtures);
}

/**
 * Blocking C-06 verification over the attached corpus: every stored
 * expectation recomputed in TypeScript at the contract tolerances, with the
 * per-bucket maxima a judge can read directly. Throws `ARTIFACT_INVALID`
 * when no fixture set is attached or the handle is not a `loadEngine` engine.
 */
export function verifyFixtures(engine: Engine): FixtureVerificationReport {
  return resolveDomainEngine(engine).verify();
}
