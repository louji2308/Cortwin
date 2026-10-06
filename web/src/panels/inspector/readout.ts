import { ProbabilityReadout } from "../../components/ProbabilityReadout";

/**
 * The Inspector's one and only door to the product's single probability
 * renderer (`C-12` / INV-07).
 *
 * It exists so `Inspector.tsx` can be held to a strict whole-file source law
 * with **no carve-outs**: no percentage literal, no probability or threshold
 * wording, no colour ramp import anywhere in that file, not even in an import
 * specifier. A scanner that needs exceptions is a weaker scanner; this keeps
 * it absolute.
 */
export { ProbabilityReadout as Readout };
