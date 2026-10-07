import { useState, type ReactElement } from "react";
import "./ColourMeaningExplainer.css";

/**
 * `ColourMeaningExplainer` — the `ⓘ` "what this colour means" disclosure
 * (batch P1 unit b, D-22(b); Contracts C-11 L354, C-13 L407–409;
 * Architecture §9.8).
 *
 * One click teaches what the colour is and is not:
 *   - colour encodes the live calibrated probability on THE single cividis
 *     ramp (`design/ramp.ts`, D-202) and nothing else;
 *   - identity is label + position, never the shade;
 *   - hatch (▨) is indeterminate; the glyph set is ▲ / △ / ▨ with text
 *     always beside it (AGENTS §6.1, D-203);
 *   - threshold, decision state and reliability come from the stored model
 *     artifact through the readout — this component renders NO number,
 *     NO percent sign and NO data colour of its own.
 *
 * Laws kept (each one is a blocking assertion in `ColourMeaningExplainer.test.ts`):
 * - C-12 / INV-07: every percentage token stays inside `ProbabilityReadout`
 *   (exploreLaws F.1), so the copy here is deliberately number-free; the
 *   readout beside this panel shows the live threshold, decision and tier.
 * - C-13 L409: copy uses the approved vocabulary; the single flagged phrase
 *   lives in `COLOUR_EXPLAINER_COPY.limitation`, whose SOURCE line carries
 *   the `c13-allow:` pragma — the contract's explicit limitation statement,
 *   the only way that phrase may appear. The blocking test injects EVERY
 *   banned phrase into EVERY copy line and requires a violation each time.
 * - One ramp (D-202): this module never imports `design/ramp` — it explains
 *   colour with words and glyphs, it never renders probability colour.
 * - A11y: native button (keyboard reachable), aria-expanded + aria-controls
 *   disclosure, `role="group"` panel labelled by the toggle, 44 px targets
 *   and visible focus from `tokens.css`, no animation (reduced-motion safe),
 *   glyph always paired with text so shape never carries meaning alone.
 *
 * Single instance: mounted once by `ExploreView` beneath the vessel
 * readouts, so the element ids are stable (deep-link/e2e targets).
 */
export type ColourMeaningExplainerProps = {
  /** Initial disclosure state; tests use `true` to render the open panel. */
  defaultOpen?: boolean;
};

/** Decision glyphs — must stay identical to `ProbabilityReadout`'s set. */
export const DECISION_GLYPH = {
  above: "▲",
  below: "△",
  indeterminate: "▨"
} as const;

/** Reliability glyphs — must stay identical to `ProbabilityReadout`'s set. */
export const RELIABILITY_GLYPH = {
  strong: "●●●",
  moderate: "●●○",
  limited: "●○○"
} as const;

/**
 * User-visible copy of record (C-13). Every rendered sentence lives here so
 * the blocking copy test scans the exact strings the judge reads, and the
 * mutation case can inject a banned phrase into each of them.
 */
export const COLOUR_EXPLAINER_COPY = {
  toggle: "What this colour means",
  ramp: "Colour carries probability only. One calibrated cividis ramp turns each vessel's whole-vessel probability into a shade — lighter for a lower model probability, darker for a higher one — and the stage, the vessel cards and the charts all read that same ramp, so one value can never appear as two different colours.",
  identity:
    "Colour never identifies a vessel. Identity comes from the label and the position in the anatomy; the shade is always the probability, never the name.",
  limitation: "Colour never encodes lesion location or the severity of a specific lesion.", // c13-allow: limitation statement — C-13 L409: states explicitly that CorTwin makes no such claim
  threshold:
    "Each readout shows the decision threshold learned from the cohort and stored with the model artifact for that target — never a fixed default and never read from colour. The decision state and the reliability tier come from the same model response.",
  glyphAbove: "above the target's own threshold",
  glyphBelow: "below the target's own threshold",
  glyphIndeterminate: "hatched for indeterminate — inside the abstention band or with nothing to compare",
  glyphTail: "Glyphs and text always carry the decision, so colour alone never states one.",
  reliabilityLead: "Reliability dots tier the evidence behind the number:",
  reliabilityStrong: "strong",
  reliabilityModerate: "moderate",
  reliabilityLimited: "limited",
  cohort:
    "Every number is a whole-vessel probability estimated for this cohort under the model's label — a model response, not a measurement. Missing evidence stays not provided; the model answers indeterminate rather than inventing a value."
} as const;

const TOGGLE_ID = "ct-colour-key-toggle";
const PANEL_ID = "ct-colour-key-panel";

export function ColourMeaningExplainer({
  defaultOpen = false
}: ColourMeaningExplainerProps = {}): ReactElement {
  const [open, setOpen] = useState(defaultOpen);
  const copy = COLOUR_EXPLAINER_COPY;

  return (
    <div className="ct-colour-key" data-testid="colour-meaning-explainer">
      <button
        type="button"
        id={TOGGLE_ID}
        className="ct-colour-key__toggle"
        aria-expanded={open}
        aria-controls={PANEL_ID}
        onClick={() => {
          setOpen((value) => !value);
        }}
      >
        <span className="ct-colour-key__info" aria-hidden="true">
          ⓘ
        </span>
        {copy.toggle}
      </button>

      <div
        id={PANEL_ID}
        className="ct-colour-key__panel"
        role="group"
        aria-labelledby={TOGGLE_ID}
        hidden={!open}
      >
        <ul className="ct-colour-key__list">
          <li>{copy.ramp}</li>
          <li>{copy.identity}</li>
          <li>{copy.limitation}</li>
          <li>{copy.threshold}</li>

          <li className="ct-colour-key__row">
            <span className="ct-colour-key__glyph" aria-hidden="true">
              {DECISION_GLYPH.above}
            </span>
            <span>{copy.glyphAbove}</span>
          </li>
          <li className="ct-colour-key__row">
            <span className="ct-colour-key__glyph" aria-hidden="true">
              {DECISION_GLYPH.below}
            </span>
            <span>{copy.glyphBelow}</span>
          </li>
          <li className="ct-colour-key__row">
            <span className="ct-colour-key__glyph" aria-hidden="true">
              {DECISION_GLYPH.indeterminate}
            </span>
            <span>{copy.glyphIndeterminate}</span>
          </li>
          <li>{copy.glyphTail}</li>

          <li>
            {copy.reliabilityLead}{" "}
            <span className="ct-colour-key__glyph" aria-hidden="true">
              {RELIABILITY_GLYPH.strong}
            </span>{" "}
            {copy.reliabilityStrong} ·{" "}
            <span className="ct-colour-key__glyph" aria-hidden="true">
              {RELIABILITY_GLYPH.moderate}
            </span>{" "}
            {copy.reliabilityModerate} ·{" "}
            <span className="ct-colour-key__glyph" aria-hidden="true">
              {RELIABILITY_GLYPH.limited}
            </span>{" "}
            {copy.reliabilityLimited}
          </li>
          <li>{copy.cohort}</li>
        </ul>
      </div>
    </div>
  );
}
