/**
 * Stage entry point (Implementation_Plan P5, `C-11` renderer units).
 *
 * Components only — the pure stage modules (`./colours`, `./materials`,
 * `./picking`, `./cameraPoses`, `./threeParts`, `./governorRuntime`) are
 * imported directly by their tests and by P6 wiring where needed.
 */
export { Stage3D, type Stage3DHandle, type Stage3DProps, type StageLoadState } from "./Stage3D";
export {
  StageSchematic,
  schematicStroke,
  schematicStrokeWidth,
  type StageSchematicProps
} from "./StageSchematic";
