import type { ArchitectureFact } from "./types";

/**
 * Static architecture facts for the System → Architecture pane
 * (Contracts §9, L427: "Static explanatory content plus manifest facts").
 *
 * PROVENANCE — every detail below is a documented invariant, transcribed or
 * closely paraphrased from the cited source; no value is estimated and no
 * hash, version or size is invented here. Manifest-supplied facts (hashes,
 * sizes, versions) are rendered only when the caller passes them.
 *
 *   1. Inference    — Architecture.md opening (static, client-side instrument;
 *                     TypeScript engine in a Web Worker with main-thread
 *                     fallback), Tech_Stack model-runtime rows, C-07.
 *   2. State        — Architecture.md P-3 (one case, one store, one registry),
 *                     INV-04 (UI never recomputes a metric), INV-C01 (one
 *                     authoritative identity registry).
 *   3. Targets      — C-02 / C-03 and Tech_Stack core facts: 54 model
 *                     features, targets CAD/LAD/LCX/RCA, forbidden inputs
 *                     LAD/LCX/RCA/Cath.
 *   4. Network      — C-15 network rule (same-origin static GET only,
 *                     prohibited: cross-origin, telemetry, analytics),
 *                     INV-C18 / INV-C19 (no case egress, no persistence).
 *   5. Presentation — Architecture.md §9.8 (one ramp lookup converts
 *                     probability to colour for 3D, legend, charts and tags).
 *   6. Hosting      — Architecture.md D5 (static hosting, same-origin assets,
 *                     offline-capable build), Tech_Stack zero-cost stack.
 *   7. Extensibility— Idea.md (targets and features live in config files, so
 *                     adding a feature or a structure needs no redesign),
 *                     Final_demo.md §6 (config-edit demo note).
 */
export const ARCHITECTURE_FACTS: readonly ArchitectureFact[] = [
  {
    label: "Inference",
    detail:
      "A pure TypeScript engine evaluates the model artifact inside a Web Worker, with a main-thread adapter running the same engine if the worker fails. Inference never reaches a server.",
    source: "Architecture.md; C-07",
  },
  {
    label: "State",
    detail:
      "One case, one store, one registry: a single store owns state and one identity registry owns vessel and target identity. Views read artifacts; the UI never recomputes a metric.",
    source: "P-3; INV-04; INV-C01",
  },
  {
    label: "Targets",
    detail:
      "CAD, LAD, LCX and RCA are predicted from 54 features. LAD, LCX, RCA and Cath are excluded from the inputs.",
    source: "C-02; C-03",
  },
  {
    label: "Network",
    detail:
      "Only same-origin static GET requests. No third-party requests, no analytics or telemetry, no persistence of case values.",
    source: "C-15; INV-C18; INV-C19",
  },
  {
    label: "Presentation",
    detail:
      "One ramp lookup converts probability to colour; the 3D material, the legend, the charts and the vessel tags all call it, so the same value cannot render differently across views.",
    source: "Architecture.md §9.8",
  },
  {
    label: "Hosting",
    detail:
      "Static assets on static hosting. The build runs offline with no backend, no database and no authentication.",
    source: "D5; Tech_Stack",
  },
  {
    label: "Extensibility",
    detail:
      "Targets and features live in configuration files and the identity registry, so adding a feature or a structure needs no redesign.",
    source: "Idea.md; Final_demo.md §6",
  },
];
