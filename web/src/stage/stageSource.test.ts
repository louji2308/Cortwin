import { beforeAll, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

/**
 * Source-level laws for `Stage3D.tsx` — the assertions that cannot be made
 * without a WebGL context (Canvas behaviour stays out of vitest) but that the
 * contract requires to hold textually:
 *
 * - **Render on demand** (`C-11` §8.2 / Architecture §10.3): the frame loop is
 *   `demand`, never an unconditional `always`; frames are requested explicitly
 *   through `invalidate()` — zero frames while idle.
 * - **Load chain** (Implementation_Plan P5 step 10 + Architecture §16.1 G2 /
 *   FM-07): structure loading goes through the scene's fallback chain
 *   (`resolveStructureSource`: primary → procedural) with the pinned
 *   GLTFLoader adapter, so a failed primary asset switches source instead of
 *   dropping straight to the schematic.
 * - **Prop-driven, artifact-free** (`C-11`): the stage imports no store, no
 *   domain module and no model/results artifact — it renders the `SceneModel`
 *   it is handed.
 * - **Texture-free scene** (`C-16`): no texture loader or texture slot wiring.
 */

const STAGE_3D = fileURLToPath(new URL("./Stage3D.tsx", import.meta.url));

describe("Stage3D source laws (WebGL-free)", () => {
  let source: string;

  beforeAll(async () => {
    source = await readFile(STAGE_3D, "utf8");
  });

  it("renders on demand: frameloop=\"demand\", never an unconditional frame loop", () => {
    expect(source).toContain('frameloop="demand"');
    expect(source).not.toContain('frameloop="always"');
    expect(source).not.toContain("frameloop=\"always\"");
    expect(source).not.toMatch(/frameloop:\s*["']always["']/);
  });

  it("requests frames explicitly through invalidate()", () => {
    expect(source).toContain("invalidate()");
    expect(source).not.toContain("requestAnimationFrame(");
  });

  it("loads the structure through the scene's fallback chain with the pinned GLTF adapter", () => {
    expect(source).toContain("resolveStructureSource(");
    expect(source).toContain("PROCEDURAL_STRUCTURE_CANDIDATE");
    expect(source).toContain("createGltfLoader(");
  });

  it("stays prop-driven: no store, no domain, no model/results artifact reads", () => {
    expect(source).not.toMatch(/from ["']\.\.\/store/);
    expect(source).not.toMatch(/from ["']\.\.\/domain/);
    expect(source).not.toMatch(/model\.json|results\.json/);
  });

  it("texture-free scene: no texture loaders or texture slots are wired", () => {
    expect(source).not.toMatch(/TextureLoader|useTexture|\.map\s*=|envMap|environment=/);
  });
});
