import { useId, type KeyboardEvent as ReactKeyboardEvent } from "react";
import type {
  DecisionState,
  SchematicVesselView,
  SchematicViewModel,
  VesselId
} from "../scene";
import { formatColour, parseColour } from "./colours";
import { presentationalColour } from "./materials";
import "./stage.css";

/**
 * 2D schematic stage view (`C-11` Q3, Implementation_Plan P5 step 15): the
 * degradation fallback and the Q3 renderer. It draws the SAME
 * `SchematicViewModel` the scene projects — same registry ids, same paths,
 * same ramp colour — so 2D and 3D can never disagree (one truth per thing).
 *
 * Laws:
 * - **Colour carries probability only.** The stroke is
 *   {@link schematicStroke} = ramp colour → the identical
 *   `presentationalColour` transform the 3D materials use (below-intensity,
 *   dim-by-desaturation, never opacity).
 * - **Nothing is encoded by colour alone**: every vessel also shows its
 *   decision glyph (▲/△/▨) and its registry label as text.
 * - **No probability numbers** (`INV-C13`): only `ProbabilityReadout` renders
 *   probability values — this component never receives one.
 * - **Store-free**: renders props only; interaction leaves through callbacks.
 */
export type StageSchematicProps = {
  model: SchematicViewModel;
  onVesselHover?: (id: VesselId | null) => void;
  onVesselSelect?: (id: VesselId | null) => void;
  /**
   * `"stage"` (default) renders the interactive full-stage schematic (Q3 / G4):
   * vessel paths are `role="button"` picks with `aria-pressed` state — exactly
   * three presses, the count `exploreRender` pins.
   *
   * `"mirror"` renders the compact non-interactive minimap inside the 3D stage
   * (C-11 §8.1). The root takes `ct-stage-schematic--minimap` — NOT
   * `ct-stage-schematic`, so the page-wide and stage-scoped
   * `svg.ct-stage-schematic` locators the degraded-mode e2e specs use keep
   * counting only the full schematic; paths carry no role, no tabindex and no
   * press state, so they never enter the tab order (a11y T1) or the pressed
   * count (exploreRender); the whole minimap is `aria-hidden` because every
   * vessel is already announced identically by the vessel cards and the 3D
   * tags — a decorative orientation aid, never a second identity registry.
   */
  variant?: "stage" | "mirror";
};

/** Plain-language decision wording shared with `ProbabilityReadout`. */
const DECISION_WORD: Record<DecisionState, string> = {
  above: "at or above threshold",
  below: "below threshold",
  indeterminate: "indeterminate"
};

/**
 * The stroke colour for one schematic vessel: the exact ramp colour from the
 * view-model, passed through the same presentation transform as the 3D stage.
 * For `"above"` + not dimmed the result is the input string unchanged (the
 * identity the one-ramp tests assert).
 */
export function schematicStroke(vessel: Pick<SchematicVesselView, "stroke" | "decisionLabel" | "dimmed">): string {
  return formatColour(presentationalColour(parseColour(vessel.stroke), vessel.decisionLabel, vessel.dimmed));
}

/** Stroke width: selection outranks hover; both widen, neither recolours. */
export function schematicStrokeWidth(vessel: Pick<SchematicVesselView, "strokeWidth" | "selected" | "hovered">): number {
  if (vessel.selected) return vessel.strokeWidth + 3;
  if (vessel.hovered) return vessel.strokeWidth + 1.5;
  return vessel.strokeWidth;
}

export function StageSchematic({ model, onVesselHover, onVesselSelect, variant = "stage" }: StageSchematicProps) {
  const hatchId = `ct-stage-hatch-${useId().replace(/:/g, "")}`;
  const anyHatch = model.vessels.some((vessel) => vessel.hatch);
  const mirror = variant === "mirror";

  const select = (id: VesselId) => onVesselSelect?.(id);

  return (
    <svg
      className={mirror ? "ct-stage-schematic--minimap" : "ct-stage-schematic"}
      viewBox={`0 0 ${model.viewBox.width} ${model.viewBox.height}`}
      role={mirror ? undefined : "group"}
      aria-hidden={mirror ? "true" : undefined}
      aria-label={mirror ? undefined : "Coronary artery schematic"}
      data-tier={model.tier}
      onPointerLeave={mirror ? undefined : () => onVesselHover?.(null)}
      onClick={
        mirror
          ? undefined
          : (event) => {
              // Clicking empty space clears the selection; vessel paths handle their
              // own selection and stop here only as bubbles (target !== currentTarget).
              if (event.target === event.currentTarget) onVesselSelect?.(null);
            }
      }
    >
      {anyHatch ? (
        <defs>
          <pattern
            id={hatchId}
            width="10"
            height="10"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <line x1="0" y1="0" x2="0" y2="10" className="ct-stage-schematic__hatch-line" />
          </pattern>
        </defs>
      ) : null}

      {model.vessels.map((vessel) => (
        <g
          key={vessel.structureId}
          data-structure-id={vessel.structureId}
          data-selected={vessel.selected ? "true" : "false"}
          data-hovered={vessel.hovered ? "true" : "false"}
          data-dimmed={vessel.dimmed ? "true" : "false"}
          data-decision={vessel.decisionLabel}
        >
          <path
            className="ct-stage-schematic__vessel"
            data-structure-id={vessel.structureId}
            d={vessel.d}
            stroke={schematicStroke(vessel)}
            strokeWidth={schematicStrokeWidth(vessel)}
            {...(mirror
              ? {}
              : {
                  role: "button" as const,
                  tabIndex: 0,
                  "aria-pressed": vessel.selected,
                  "aria-label": `${vessel.label} vessel, ${DECISION_WORD[vessel.decisionLabel]}`,
                  onPointerEnter: () => onVesselHover?.(vessel.structureId),
                  onFocus: () => onVesselHover?.(vessel.structureId),
                  onBlur: () => onVesselHover?.(null),
                  onClick: () => select(vessel.structureId),
                  onKeyDown: (event: ReactKeyboardEvent<SVGPathElement>) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      select(vessel.structureId);
                    }
                  }
                })}
          />
          {vessel.hatch ? (
            <path
              className="ct-stage-schematic__hatch"
              d={vessel.d}
              strokeWidth={schematicStrokeWidth(vessel)}
              stroke={`url(#${hatchId})`}
            />
          ) : null}
          <text
            className="ct-stage-schematic__label"
            x={vessel.labelAnchor.x}
            y={vessel.labelAnchor.y}
            aria-hidden="true"
          >
            <tspan className="ct-stage-schematic__glyph">{vessel.glyph}</tspan>
            <tspan className="ct-stage-schematic__name">{` ${vessel.label}`}</tspan>
          </text>
        </g>
      ))}
    </svg>
  );
}
