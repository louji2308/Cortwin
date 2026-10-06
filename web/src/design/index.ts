/**
 * Design entry point: importing anything from `../design` (or `./design`)
 * loads the token sheet once and re-exports THE probability→colour ramp and the
 * shared target identifier type. Consumers: scene material driver, legend,
 * vessel tags, charts, `ProbabilityReadout` — see design/ramp.ts (C-11 L354).
 */
import "./tokens.css";

export { NEUTRAL_PROBABILITY_COLOUR, PROBABILITY_RAMP_ID, probabilityToColour } from "./ramp";
export type { TargetId } from "./types";
