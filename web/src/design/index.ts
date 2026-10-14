/**
 * Design entry point: importing anything from `../design` (or `./design`)
 * loads the token sheet once and re-exports THE probability→colour ramp and the
 * shared target identifier type. Consumers: scene material driver, legend,
 * vessel tags, charts, `ProbabilityReadout` — see design/ramp.ts (C-11 L354).
 */
import "./fonts.css";
import "./tokens.css";

export { NEUTRAL_PROBABILITY_COLOUR, PROBABILITY_RAMP_ID, probabilityToColour } from "./ramp";
// NOTE: SELECTION_ACCENT_COLOUR (design/accent.ts) is intentionally NOT
// re-exported here. accent.ts parses tokens.css via `?raw`, which only
// resolves in the browser build; importing it from this barrel would pull it
// into every Node-side consumer (scene/, schematicViewModel). Import it
// directly from "../design/accent" in the browser-only WebGL path.
export type { TargetId } from "./types";
