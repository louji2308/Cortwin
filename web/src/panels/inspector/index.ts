/**
 * P6-INSPECTOR-R3 — the frozen integration point that
 * `explore/inspectorHost.tsx` imports.
 *
 * `Inspector` is prop-driven and store-free: it renders only from the
 * `ExploreInspectorProps` contract (Registry + C-08 evaluation/explanation +
 * selection + status + the four callbacks), so the host stays the single
 * owner of where the data comes from (Implementation_Plan P6 step 13).
 */
export { Inspector, InspectorView } from "./Inspector";
