import type { ComputePort, ComputeRequest, ComputeResponse } from "../contracts";
import { createComputeRuntime, type RuntimeErrorInfo } from "./runtime";
import type { DegradeInfo } from "./types";

/**
 * C-07 §6.1 main-thread compute adapter (Architecture §16.1 G3 fallback —
 * "Same domain engine on the main thread"; §9.3 compute subsystem).
 *
 * Wraps the single D-16 engine entry in the SAME `createComputeRuntime` the
 * worker uses: identical lane priority, supersession, envelope echo,
 * validation and typed error paths — the fallback can never behave
 * differently from the worker it replaces (one truth per thing, AGENTS §7
 * law 6). Swap wiring belongs to the app layer via `ComputePort` (the
 * store's `attachCompute`); this unit never touches React, the DOM or the
 * store.
 *
 * `Engine.execute` per D-16 "never throws", so the runtime's throw path is
 * defense-in-depth only.
 */

export type MainComputeEngine = {
  execute(request: ComputeRequest): ComputeResponse;
};

export type MainComputePortOptions = {
  /** Registry feature count (C-07 L222) — same defense as the worker port. */
  featureCount?: number;
  now?: () => number;
  schedule?: (task: () => void) => void;
  onDegrade?: (info: DegradeInfo) => void;
  onError?: (info: RuntimeErrorInfo) => void;
};

export function createMainComputePort(
  engine: MainComputeEngine,
  options: MainComputePortOptions = {}
): ComputePort {
  return createComputeRuntime({
    execute: (request) => engine.execute(request),
    featureCount: options.featureCount,
    now: options.now,
    schedule: options.schedule,
    onDegrade: options.onDegrade,
    onError: options.onError,
  });
}
