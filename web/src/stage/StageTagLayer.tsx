import { DECISION_GLYPH, type SchematicViewModel, type VesselId } from "../scene";
import { formatColour } from "./colours";
import "./stage.css";

/**
 * Vessel tag layer — the DOM labels that float over the 3D canvas, one per
 * probability-driven vessel (C-11 §8.1 "vessel tags"; AGENTS §6.1).
 *
 * Laws:
 * - **Pure presentational**: this component receives already-projected screen
 *   positions and per-vessel colours/selection. It computes nothing clinical
 *   and never reads the store.
 * - **Colour carries probability only**: the dot's colour is the exact
 *   descriptor colour the 3D material shows (tweened ramp output). Identity is
 *   the registry label, never the colour.
 * - **Nothing is encoded by colour alone**: every tag also carries its registry
 *   label and its decision glyph (▲/△/▨), the same glyph system as
 *   `ProbabilityReadout` and `StageSchematic`.
 * - **No probability numbers** (`INV-C13`): the tag shows identity + glyph +
 *   colour; the number belongs to `ProbabilityReadout`.
 * - **Tags are not interactive controls**: they are `aria-hidden` and
 *   `pointer-events: none` — the stage container is the single tab stop, and
 *   selection happens through the canvas, the vessel cards or the arrow-key
 *   cycle. Keeping them out of the tab order preserves the a11y T1 budget
 *   (stage container → toolbar → vessel cards) and the T6 target sweep.
 */

export type StageTagLayoutEntry = {
  readonly id: VesselId;
  readonly x: number;
  readonly y: number;
  readonly visible: boolean;
};

export type StageTagContentEntry = {
  readonly id: VesselId;
  readonly label: string;
  readonly colour: string | null;
  readonly glyph: string | null;
  readonly selected: boolean;
};

export type StageTagLayerProps = {
  readonly layouts: readonly StageTagLayoutEntry[];
  readonly content: readonly StageTagContentEntry[];
  readonly registerTag?: (id: VesselId, element: HTMLDivElement | null) => void;
};

export function StageTagLayer({ layouts, content, registerTag }: StageTagLayerProps) {
  const layoutById = new Map(layouts.map((entry) => [entry.id, entry]));
  return (
    <div className="ct-stage__tags" aria-hidden="true">
      {content.map((entry) => {
        const layout = layoutById.get(entry.id);
        const visible = layout !== undefined && layout.visible;
        return (
          <div
            key={entry.id}
            className="ct-stage__tag"
            data-structure-id={entry.id}
            data-selected={entry.selected ? "true" : "false"}
            ref={(element) => registerTag?.(entry.id, element)}
            style={{
              transform: `translate3d(${layout?.x ?? 0}px, ${layout?.y ?? 0}px, 0)`,
              visibility: visible ? "visible" : "hidden"
            }}
          >
            <span className="ct-stage__tag-dot" style={{ background: entry.colour ?? "transparent" }} />
            <span className="ct-stage__tag-glyph">{entry.glyph ?? ""}</span>
            <span className="ct-stage__tag-label">{entry.label}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Colour for one tag: the descriptor colour the 3D material renders. */
export function tagColour(colour: readonly [number, number, number] | null): string | null {
  return colour === null ? null : formatColour(colour);
}

/** Decision glyph for a schematic-decision, or null when the model is absent. */
export function tagGlyph(decision: "above" | "below" | "indeterminate" | null): string | null {
  return decision === null ? null : DECISION_GLYPH[decision];
}

/** Convenience: the vessel ids a schematic view-model names, in order. */
export function tagVesselIds(model: SchematicViewModel | null): VesselId[] {
  return model === null ? [] : model.vessels.map((vessel) => vessel.structureId);
}
