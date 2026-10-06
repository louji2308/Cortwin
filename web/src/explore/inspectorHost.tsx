import type { ReactElement } from "react";
import { Inspector } from "../panels/inspector";
import type { ExploreInspectorProps } from "./types";

/**
 * The single integration point between Explore and the sibling-owned Inspector
 * (Implementation_Plan P6 step 13 — "sibling `Inspector` sharing selection").
 *
 * The frozen import lives here, in exactly one file, so the Explore workspace
 * can be typed, rendered and tested independently of the Inspector's delivery:
 * tests mock *this* module, not the sibling's directory. The interface is the
 * `ExploreInspectorProps` contract in `./types` — Explore projects the store
 * truth (case snapshot, evaluation, explanation, selection) and hands the
 * Inspector the same binding functions ProfileForm and the stage receive, so
 * every surface edits through one intent path (C-09).
 */
export function InspectorPanel(props: ExploreInspectorProps): ReactElement {
  return <Inspector {...props} />;
}
