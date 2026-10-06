import type { Object3D } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { LoadedGltf } from "../scene";

/**
 * Integration adapter: three's `GLTFLoader` → a promise-returning loader over
 * the loaded scene object (the shape `web/src/scene`'s loader chain consumes,
 * plus the `Object3D` root the renderer reparents nodes from).
 *
 * `web/src/scene/**` stays free of three.js (it validates any loader); this is
 * the renderer unit that owns the concrete import (loadStructure.ts line 17:
 * "the integration adapter … belongs to the renderer unit"). Every rejection
 * carries the URL so the typed `STRUCTURE_LOAD_FAILED` wrap upstream can name
 * the failed candidate without leaking anything else.
 *
 * The constructor accepts the loader surface for tests — no network, no
 * browser. Production callers just use `createGltfLoader()` with the real
 * `GLTFLoader`.
 */

/** The slice of `GLTFLoader` this adapter uses (injectable for tests). */
export type GltfLoaderLike = {
  load(
    url: string,
    onLoad: (gltf: { scene?: unknown }) => void,
    onProgress?: (event: unknown) => void,
    onError?: (err: unknown) => void
  ): void;
};

/**
 * Wrap a `GLTFLoader` (by default the real one) as a `GltfLoader`.
 *
 * The resolved value is the loaded scene **as an `Object3D`** as well: the
 * real `GLTFLoader` always hands back a `THREE.Group`, and the renderer needs
 * the object root (to reparent nodes into the render group) while the scene
 * chain only needs `getObjectByName`. Structural typing carries both.
 */
export function createGltfLoader(impl?: GltfLoaderLike): (url: string) => Promise<Object3D & LoadedGltf> {
  const loader: GltfLoaderLike = impl ?? new GLTFLoader();
  return (url: string): Promise<Object3D & LoadedGltf> =>
    new Promise<Object3D & LoadedGltf>((resolve, reject) => {
      loader.load(
        url,
        (gltf) => {
          const scene = gltf?.scene;
          if (scene === null || scene === undefined || typeof (scene as LoadedGltf).getObjectByName !== "function") {
            reject(new Error(`glTF "${url}" did not yield a scene with named nodes`));
            return;
          }
          resolve(scene as Object3D & LoadedGltf);
        },
        undefined,
        (error) =>
          reject(error instanceof Error ? error : new Error(`glTF "${url}" failed to load: ${String(error)}`))
      );
    });
}
