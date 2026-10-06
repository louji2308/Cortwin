import type { ReactElement } from "react";
import { store } from "../store";
import { ExploreView } from "./ExploreView";

/**
 * Implementation_Plan P6 — the Explore workspace entry point.
 *
 * Frozen interface: `export function ExploreWorkspace(): ReactElement`, no
 * props. It binds the one C-09 store singleton and mounts the prop-driven
 * composition; nothing else in the app passes data into Explore (Contract §71,
 * one store / one registry / one case — AGENTS §7 law 6).
 *
 * Mount contract (shell): place it as the `#/explore` route content; it lays
 * out its own three responsive zones (profile · stage+readouts · inspector)
 * from 1280 px down to small screens, and it needs no URL, camera or evaluation
 * props — selection and view state live in the store the URL already drives.
 */
export function ExploreWorkspace(): ReactElement {
  return <ExploreView store={store} />;
}
