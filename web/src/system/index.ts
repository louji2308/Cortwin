/**
 * System view (C-10 `#/system/*`) — pane components, typed data and the
 * shared C-10 href grammar (Contracts §9).
 *
 * Fixtures are deliberately NOT exported here: they are test-only inputs
 * (see fixtures.ts) and application code must never import them.
 */
export { ArchitecturePane } from "./ArchitecturePane";
export type { ArchitecturePaneProps } from "./ArchitecturePane";
export { IntegrityPane } from "./IntegrityPane";
export type { IntegrityPaneProps } from "./IntegrityPane";
export { ModelCardPane } from "./ModelCardPane";
export type { ModelCardPaneProps } from "./ModelCardPane";
export { RequirementsPane } from "./RequirementsPane";
export type { RequirementsPaneProps } from "./RequirementsPane";
export { SystemPaneShell } from "./SystemPaneShell";
export type { SystemPaneId, SystemPaneShellProps } from "./SystemPaneShell";
export { C10_HREF_PATTERN } from "./c10";
export { ARCHITECTURE_FACTS } from "./architectureData";
export { REQUIREMENT_ENTRIES } from "./requirementsData";
export type {
  ArchitectureFact,
  ArtifactIntegrity,
  ArtifactIntegrityRow,
  ModelCardData,
  ParityCheck,
  ParityReport,
  ParityTolerance,
  RequirementEntry,
} from "./types";
