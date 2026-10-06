import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { createGltfLoader, type GltfLoaderLike } from "./gltf";
import type { LoadedGltf } from "../scene";

const HEART_GLB = fileURLToPath(new URL("../../../assets/ready/heart.glb", import.meta.url));

const namedScene = (): LoadedGltf & Record<string, unknown> => ({
  getObjectByName: (name: string) => (name === "HEART" ? { isObject3D: true } : null)
});

describe("createGltfLoader — adapter to the injected GltfLoader signature", () => {
  it("forwards the URL and resolves with the loaded scene", async () => {
    const seen: string[] = [];
    const scene = namedScene();
    const impl: GltfLoaderLike = {
      load(url, onLoad) {
        seen.push(url);
        onLoad({ scene });
      }
    };
    const loadGltf = createGltfLoader(impl);
    await expect(loadGltf("/models/heart.glb")).resolves.toBe(scene);
    expect(seen).toEqual(["/models/heart.glb"]);
  });

  it("rejects when the load reports an error", async () => {
    const impl: GltfLoaderLike = {
      load(_url, _onLoad, _onProgress, onError) {
        onError?.(new Error("network down"));
      }
    };
    await expect(createGltfLoader(impl)("/models/heart.glb")).rejects.toThrow("network down");
  });

  it("rejects when the payload has no scene with named nodes", async () => {
    const impl: GltfLoaderLike = {
      load(url, onLoad) {
        onLoad({ scene: undefined });
        void url;
      }
    };
    await expect(createGltfLoader(impl)("/models/heart.glb")).rejects.toThrow(
      /did not yield a scene/
    );

    const noNames: GltfLoaderLike = {
      load(_url, onLoad) {
        onLoad({ scene: {} });
      }
    };
    await expect(createGltfLoader(noNames)("/models/heart.glb")).rejects.toThrow(
      /did not yield a scene/
    );
  });

  it("non-Error rejections are wrapped with the URL", async () => {
    const impl: GltfLoaderLike = {
      load(_url, _onLoad, _onProgress, onError) {
        onError?.("boom");
      }
    };
    await expect(createGltfLoader(impl)("/models/heart.glb")).rejects.toThrow(
      /heart\.glb.*boom/
    );
  });
});

describe("the real heart.glb through the adapter (zero textures, parses in Node)", () => {
  it("exposes all five contract nodes via getObjectByName", async () => {
    const bytes = await readFile(HEART_GLB);
    const real = new GLTFLoader();
    const impl: GltfLoaderLike = {
      load(_url, onLoad, _onProgress, onError) {
        real.parse(
          bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
          "",
          onLoad,
          onError as unknown as (event: ErrorEvent) => void
        );
      }
    };

    const scene = await createGltfLoader(impl)("/models/heart.glb");
    for (const node of ["HEART", "AORTA", "LAD", "LCX", "RCA"]) {
      expect(scene.getObjectByName(node), node).toBeTruthy();
    }
    expect(scene.getObjectByName("RIBS")).toBeUndefined();
  });
});
