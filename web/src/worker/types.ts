import type { ComputeRequest, ComputeResponse } from "../contracts";

/**
 * P4-2 worker layer — shared types (C-07 §6.1 compute protocol,
 * Architecture §9.1 `worker/` layer, §16.1 degradation ladder).
 *
 * This module holds no domain import: `ComputeEngine` is the structural
 * projection of the frozen D-16 `Engine` interface (`web/src/domain/index.ts`),
 * so the worker, the main-thread adapter and tests all build against one
 * shape while the domain entry stays confined to `workerEntry.ts`.
 * Signatures are identical by construction; a divergence fails `tsc` at the
 * call site that pairs `loadEngine(...)` with these parameters.
 */

/** Structural projection of D-16 `Engine` — `{ modelId, execute }`. */
export type ComputeEngine = {
  readonly modelId: string;
  execute(request: ComputeRequest): ComputeResponse;
};

/**
 * Architecture §16.1 degradation notice text for G3
 * ("Same engine on the main thread → Notice: 'running in compatibility
 * mode'"). The data rides the degrade event; rendering belongs to the app
 * layer (this unit never renders UI).
 */
export const COMPATIBILITY_NOTICE = "running in compatibility mode";

/**
 * Architecture §16.1 G6 text ("model cannot load → boot blocked" with
 * "reason and reload action"): the reason half of that state, carried as
 * the `notice` of a `G6/engine-load-failed` DegradeInfo. Reload actions
 * belong to the app layer (this unit never renders UI).
 */
export const ENGINE_LOAD_NOTICE = "model could not be loaded";

/**
 * Degradation signal payload (Architecture §16.1 ladder + §9.3 compute
 * subsystem state machine). `level` follows the ladder vocabulary; `reason`
 * names the concrete trigger so the app layer can log/assert without
 * re-deriving it.
 */
export type DegradeInfo = {
  level: "G3" | "G6";
  reason:
    | "worker-construction-failed"
    | "worker-startup-timeout"
    | "worker-error"
    | "worker-message-error"
    | "engine-load-failed"
    | "engine-failure";
  notice: string;
  at: number;
};

/** Listener registered through `ComputePort.subscribe`. */
export type ComputeListener = (response: ComputeResponse) => void;
