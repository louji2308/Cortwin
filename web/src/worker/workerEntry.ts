import { loadEngine } from "../domain";
import { createWorkerHost } from "./workerHost";

/**
 * C-07 §6.1 worker bootstrap — deliberately THIN (Architecture §9.3): the
 * only module in `web/src/worker/**` that imports the domain (AGENTS
 * single-entry law; the D-16 engine is reached exclusively through
 * `loadEngine`). All protocol behaviour lives in `workerHost.ts` +
 * `runtime.ts`, which are fully testable in Node.
 *
 * This file is referenced by `createWorkerComputePort`'s default factory
 * via `new Worker(new URL("./workerEntry.ts", import.meta.url), …)` so
 * Vite bundles it as its own worker entry point.
 *
 * `globalThis` is narrowed structurally instead of using DOM/`lib.webworker`
 * globals so this module typechecks under the app's DOM tsconfig without
 * pulling in `DedicatedWorkerGlobalScope`.
 */

type WorkerScope = {
  postMessage(message: unknown): void;
  addEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
};

const scope = globalThis as unknown as WorkerScope;

const host = createWorkerHost({
  post: (message) => {
    scope.postMessage(message);
  },
  loadEngine: (artifacts) => loadEngine(artifacts),
});

scope.addEventListener("message", (event) => {
  host.handleMessage(event.data);
});
