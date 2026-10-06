/**
 * Trust pane presentation components (Contracts §9 L418–L424).
 * Consumes C-04-shaped props only; renders no artifact imports and computes
 * no metrics. Integration into the Trust view happens after G3–G5.
 */

export * from "./types";
export { PaneShell, resolvePaneState } from "./PaneShell";
export type { PaneShellProps, PaneStateKind } from "./PaneShell";
export { SegmentedControl } from "./SegmentedControl";
export type { SegmentOption, SegmentedControlProps } from "./SegmentedControl";
export { PerformancePane } from "./PerformancePane";
export type { PerformancePaneProps } from "./PerformancePane";
export { CalibrationPane } from "./CalibrationPane";
export type { CalibrationPaneProps } from "./CalibrationPane";
export { DecisionsPane } from "./DecisionsPane";
export type { DecisionsPaneProps } from "./DecisionsPane";
export { SubgroupsPane } from "./SubgroupsPane";
export type { SubgroupsPaneProps } from "./SubgroupsPane";
export { LeakagePane } from "./LeakagePane";
export type { LeakagePaneProps } from "./LeakagePane";
export { TRUST_COPY } from "./copy";
