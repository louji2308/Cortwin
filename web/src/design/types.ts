/**
 * Target identifiers shared by design, components and every view.
 *
 * Mirrors `config/targets.json` / `config/registry.json` (the four model
 * targets: CAD, LAD, LCX, RCA) and the `TargetId` references used throughout
 * `Project/Contracts.md` (C-04, C-09, C-11, C-12). Declared here because this
 * unit may not import from `store`/`worker`/`domain`; downstream units MUST
 * re-use (re-export) this alias rather than declaring a second one.
 */
export type TargetId = "CAD" | "LAD" | "LCX" | "RCA";
