export { createComputeRuntime } from "./runtime";
export type { ComputeRuntimeOptions, RuntimeErrorInfo } from "./runtime";

export { createMainComputePort } from "./mainComputePort";
export type { MainComputeEngine, MainComputePortOptions } from "./mainComputePort";

export { createWorkerComputePort } from "./workerComputePort";
export type {
  WorkerComputePort,
  WorkerComputePortOptions,
  WorkerLike,
} from "./workerComputePort";

export { createWorkerHost } from "./workerHost";
export type { WorkerHost, WorkerHostDeps } from "./workerHost";

export { createStartupWatchdog } from "./startupWatchdog";
export type { StartupWatchdog, StartupWatchdogOptions } from "./startupWatchdog";

export {
  computeError,
  echoEnvelope,
  errorResponse,
  isComputeErrorCode,
  normalizeEngineResponse,
  validateRequest,
} from "./protocol";
export type { ValidationOptions, ValidationOutcome } from "./protocol";

export {
  createDegradeMessage,
  createEngineErrorMessage,
  createInitMessage,
  createReadyMessage,
  isComputeResponseMessage,
  isWorkerControlMessage,
} from "./control";
export type {
  EngineArtifactsPayload,
  WorkerControlMessage,
  WorkerDegradeMessage,
  WorkerEngineErrorMessage,
  WorkerInitMessage,
  WorkerReadyMessage,
} from "./control";

export { COMPATIBILITY_NOTICE, ENGINE_LOAD_NOTICE } from "./types";
export type { ComputeEngine, ComputeListener, DegradeInfo } from "./types";
