export const PERF_GLOBAL_KEY = "__cortwinPerf";

export type PixelSample = {
  t: number;
  painted: number;
  coloured: number;
  r: number;
  g: number;
  b: number;
  fromRender: boolean;
};

export type StageStats = {
  painted: number;
  coloured: number;
  r: number;
  g: number;
  b: number;
};

export type PerfProbe = {
  navStart: number;
  renders: number[];
  callSeries: number[];
  triSeries: number[];
  pixelSamples: PixelSample[];
  pixelArmed: boolean;
  firstPaintedAt: number | null;
  firstColouredAt: number | null;
  lastPainted: number;
  lastColoured: number;
  lastR: number;
  lastG: number;
  lastB: number;
  stageBaseline: StageStats | null;
  watchStage: boolean;
  tStage: number | null;
  texUploads: number;
  texCreates: number;
  glOk: boolean;
  glPatched: string[];
  frameCalls: number;
  frameTris: number;
  lastInputAt: number | null;
  inputEvents: number;
  lastClickAt: number | null;
  tRev: number | null;
  tUpdating: number | null;
  tReady: number | null;
  tReadout: number | null;
  tWhy: number | null;
  mutations: number;
  canvasSeen: number;
  pixelErrors: number;
  lastProbeAt: number;
  gpu: string;
  webgl2: boolean;
  resetMarks(): void;
  armStage(): void;
};

export type PerfSnapshot = Omit<PerfProbe, "resetMarks" | "armStage">;

export function perfInitSource(): string {
  return "(" + perfProbeInit.toString() + ")()";
}

export function perfProbeInit(): void {
  const store = window as unknown as { __cortwinPerf?: PerfProbe };
  if (store.__cortwinPerf !== undefined) return;

  const TRIANGLES = 4;
  const PROBE_SIZE = 256;
  const PAINTED_MIN = 400;
  const COLOURED_MIN = 150;
  const MARK_INPUT = "perf:input";
  const MARK_REVISION = "perf:revision";
  const MARK_READOUT = "perf:readout";
  const MARK_WHY = "perf:why";

  const state: PerfProbe = {
    navStart: performance.now(),
    renders: [],
    callSeries: [],
    triSeries: [],
    pixelSamples: [],
    pixelArmed: true,
    firstPaintedAt: null,
    firstColouredAt: null,
    lastPainted: 0,
    lastColoured: 0,
    lastR: 0,
    lastG: 0,
    lastB: 0,
    stageBaseline: null,
    watchStage: false,
    tStage: null,
    texUploads: 0,
    texCreates: 0,
    glOk: false,
    glPatched: [],
    frameCalls: 0,
    frameTris: 0,
    lastInputAt: null,
    inputEvents: 0,
    lastClickAt: null,
    tRev: null,
    tUpdating: null,
    tReady: null,
    tReadout: null,
    tWhy: null,
    mutations: 0,
    canvasSeen: 0,
    pixelErrors: 0,
    lastProbeAt: 0,
    gpu: "",
    webgl2: false,
    resetMarks(): void {
      state.tRev = null;
      state.tUpdating = null;
      state.tReady = null;
      state.tReadout = null;
      state.tWhy = null;
      state.lastInputAt = null;
      state.lastClickAt = null;
      state.tStage = null;
      state.watchStage = false;
      if (typeof performance.clearMarks === "function") {
        performance.clearMarks(MARK_INPUT);
        performance.clearMarks(MARK_REVISION);
        performance.clearMarks(MARK_READOUT);
        performance.clearMarks(MARK_WHY);
      }
    },
    armStage(): void {
      state.stageBaseline = {
        painted: state.lastPainted,
        coloured: state.lastColoured,
        r: state.lastR,
        g: state.lastG,
        b: state.lastB
      };
      state.tStage = null;
      state.watchStage = state.lastPainted > PAINTED_MIN;
    }
  };
  store.__cortwinPerf = state;

  const mark = (name: string): void => {
    if (typeof performance.mark === "function") performance.mark(name);
  };

  const probe = (timestamp: number, fromRender: boolean): void => {
    try {
      const stage = document.querySelector(".ct-stage");
      const found =
        stage === null ? document.querySelector("canvas") : stage.querySelector("canvas");
      if (!(found instanceof HTMLCanvasElement)) return;
      state.canvasSeen += 1;
      const gl = found.getContext("webgl2") as WebGL2RenderingContext | null;
      if (gl === null) return;
      if (!state.webgl2) {
        state.webgl2 = true;
        const extension = gl.getExtension("WEBGL_debug_renderer_info");
        state.gpu =
          extension === null
            ? "unreported"
            : String(gl.getParameter(extension.UNMASKED_RENDERER_WEBGL));
      }
      const bufferWidth = gl.drawingBufferWidth;
      const bufferHeight = gl.drawingBufferHeight;
      if (bufferWidth === 0 || bufferHeight === 0) return;
      const width = Math.min(PROBE_SIZE, bufferWidth);
      const height = Math.min(PROBE_SIZE, bufferHeight);
      const originX = Math.max(0, Math.floor((bufferWidth - width) / 2));
      const originY = Math.max(0, Math.floor((bufferHeight - height) / 2));
      const pixels = new Uint8Array(width * height * 4);
      gl.readPixels(originX, originY, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      let painted = 0;
      let coloured = 0;
      let sumR = 0;
      let sumG = 0;
      let sumB = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        if (pixels[index + 3] <= 8) continue;
        const r = pixels[index];
        const g = pixels[index + 1];
        const b = pixels[index + 2];
        painted += 1;
        sumR += r;
        sumG += g;
        sumB += b;
        const chroma = Math.max(r, g, b) - Math.min(r, g, b);
        if (chroma > 24) coloured += 1;
      }
      const meanR = painted > 0 ? sumR / painted : 0;
      const meanG = painted > 0 ? sumG / painted : 0;
      const meanB = painted > 0 ? sumB / painted : 0;
      state.pixelSamples.push({
        t: timestamp,
        painted,
        coloured,
        r: meanR,
        g: meanG,
        b: meanB,
        fromRender
      });
      state.lastPainted = painted;
      state.lastColoured = coloured;
      state.lastR = meanR;
      state.lastG = meanG;
      state.lastB = meanB;
      if (state.firstPaintedAt === null && painted > PAINTED_MIN) {
        state.firstPaintedAt = timestamp;
      }
      if (state.firstColouredAt === null && coloured > COLOURED_MIN) {
        state.firstColouredAt = timestamp;
      }
      if (state.watchStage && state.tStage === null && state.stageBaseline !== null) {
        const base = state.stageBaseline;
        const shift =
          Math.abs(meanR - base.r) + Math.abs(meanG - base.g) + Math.abs(meanB - base.b);
        const area = Math.abs(painted - base.painted);
        if (shift >= 2 || area >= 250) state.tStage = timestamp;
      }
    } catch {
      state.pixelErrors += 1;
    }
  };

  const ownerPrototype = (name: string): object | null => {
    const roots: object[] = [];
    if (typeof WebGL2RenderingContext !== "undefined") roots.push(WebGL2RenderingContext.prototype);
    if (typeof WebGLRenderingContext !== "undefined") roots.push(WebGLRenderingContext.prototype);
    for (const root of roots) {
      let cursor: object | null = root;
      while (cursor !== null) {
        if (Object.prototype.hasOwnProperty.call(cursor, name)) return cursor;
        cursor = Object.getPrototypeOf(cursor);
      }
    }
    return null;
  };

  const wrap = (name: string, kind: number): void => {
    const prototype = ownerPrototype(name);
    if (prototype === null) return;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
    if (descriptor === undefined || typeof descriptor.value !== "function") return;
    const original = descriptor.value as (...args: number[]) => unknown;
    const wrapped = function (this: unknown, ...args: number[]): unknown {
      if (kind <= 3) {
        let items = 0;
        if (kind === 0) items = args[2];
        else if (kind === 1) items = args[1];
        else if (kind === 2) items = args[2] * args[3];
        else items = args[1] * args[4];
        state.frameCalls += 1;
        if (args[0] === TRIANGLES) state.frameTris += items / 3;
        state.glOk = true;
      } else if (kind === 4) {
        state.texUploads += 1;
      } else {
        state.texCreates += 1;
      }
      return original.apply(this, args);
    };
    Object.defineProperty(prototype, name, {
      configurable: descriptor.configurable,
      enumerable: descriptor.enumerable,
      writable: descriptor.writable,
      value: wrapped
    });
    state.glPatched.push(name);
  };

  wrap("drawArrays", 0);
  wrap("drawElements", 1);
  wrap("drawArraysInstanced", 2);
  wrap("drawElementsInstanced", 3);
  wrap("texImage2D", 4);
  wrap("texSubImage2D", 4);
  wrap("texStorage2D", 4);
  wrap("compressedTexImage2D", 4);
  wrap("compressedTexSubImage2D", 4);
  wrap("createTexture", 5);

  if (typeof window.requestAnimationFrame === "function") {
    const originalRaf = window.requestAnimationFrame.bind(window);
    const patched = function (callback: FrameRequestCallback): number {
      return originalRaf((timestamp: number) => {
        const outcome = callback(timestamp);
        if (state.frameCalls > 0 || state.frameTris > 0) {
          state.renders.push(timestamp);
          state.callSeries.push(state.frameCalls);
          state.triSeries.push(state.frameTris);
          state.frameCalls = 0;
          state.frameTris = 0;
          if (state.pixelArmed) {
            state.lastProbeAt = timestamp;
            probe(timestamp, true);
          }
        } else if (state.pixelArmed && !state.glOk && timestamp - state.lastProbeAt > 50) {
          state.lastProbeAt = timestamp;
          probe(timestamp, false);
        }
        return outcome;
      }) as unknown as number;
    };
    window.requestAnimationFrame = patched as typeof window.requestAnimationFrame;
  }

  const timeOrigin = (): number => performance.now();

  document.addEventListener(
    "input",
    (event) => {
      const target = event.target;
      if (target instanceof HTMLInputElement && target.getAttribute("data-role") === "value-input") {
        state.lastInputAt = timeOrigin();
        state.inputEvents += 1;
        mark(MARK_INPUT);
      }
    },
    true
  );

  document.addEventListener(
    "click",
    () => {
      state.lastClickAt = timeOrigin();
    },
    true
  );

  const observe = (records: MutationRecord[]): void => {
    const now = timeOrigin();
    state.mutations += records.length;
    for (const record of records) {
      const target = record.target;
      const element = target.nodeType === 1 ? (target as Element) : target.parentElement;
      if (element === null) continue;
      const attribute = record.attributeName;
      if (attribute === "data-revision") {
        const form = element.closest('[data-testid="profile-form"]');
        if (form !== null && state.tRev === null && state.lastInputAt !== null) {
          state.tRev = now;
          mark(MARK_REVISION);
        }
      }
      if (attribute === "data-eval-status") {
        const holder = element.closest("[data-eval-status]");
        if (holder !== null) {
          const value = holder.getAttribute("data-eval-status");
          if (value === "updating" && state.tUpdating === null && state.lastInputAt !== null) {
            state.tUpdating = now;
          }
          if (value === "ready" && state.tReady === null && state.lastInputAt !== null) {
            state.tReady = now;
          }
        }
      }
      if (element.closest('[data-testid="headline-readout"]') !== null) {
        if (state.tReadout === null && state.lastInputAt !== null) {
          state.tReadout = now;
          mark(MARK_READOUT);
        }
      }
      if (element.closest('[data-view="why"]') !== null) {
        if (state.tWhy === null && (state.lastInputAt !== null || state.lastClickAt !== null)) {
          state.tWhy = now;
          mark(MARK_WHY);
        }
      }
    }
  };

  const observer = new MutationObserver(observe);
  let started = false;
  const start = (): void => {
    if (started || document.documentElement === null) return;
    started = true;
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: [
        "data-revision",
        "data-eval-status",
        "data-decision",
        "data-reliability",
        "style"
      ]
    });
  };
  start();
  document.addEventListener("DOMContentLoaded", start);
}
