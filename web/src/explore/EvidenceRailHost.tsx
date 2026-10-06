import { useEffect, useState, type ReactElement } from "react";
import type { CorTwinStoreState, Registry } from "../contracts";
import { EvidenceRail } from "../panels/evidence/EvidenceRail";
import type { BuildUpState } from "../panels/evidence/types";
import { buildEvidenceRailData, nextBuildUpStep, type ExploreBindings } from "./model";

/**
 * EvidenceRailHost (P7-RAIL) — mounts the presentation-only Evidence Rail
 * docked under the stage (Final_demo 4.5), prop-driven from C-09 truth:
 *
 *   stages / currentStageId / customSubset  <- `buildEvidenceRailData`
 *   chip click                               -> `bindings.onSelectStage`
 *                                               (selectStage + cumulative
 *                                               mask, Contracts 8.4 L386)
 *   Build Up                                 -> one stage per settled real
 *                                               evaluation (`nextBuildUpStep`),
 *                                               never a timer (law F.5), never
 *                                               a prerecorded probability
 *                                               (Contracts 8.4 L388)
 *
 * The only state this host owns is the Build Up machine, kept in its own
 * component so `ExploreView` keeps its single typed `useState` (law F.5) and
 * stays free of hooks past the registry gate. Pause (idle) stops the run —
 * pressing again restarts the ladder from stage one — and `done` unlocks when
 * a stage chip is pressed. Every stage selection writes the case through the
 * store, so real masked evaluations pace the scrub.
 */
type EvidenceRailHostProps = {
  state: CorTwinStoreState;
  registry: Registry;
  bindings: ExploreBindings;
};

export function EvidenceRailHost({
  state,
  registry,
  bindings
}: EvidenceRailHostProps): ReactElement {
  const [buildUp, setBuildUp] = useState<BuildUpState>("idle");
  const data = buildEvidenceRailData(state, registry);
  const { stages, currentStageId, customSubset } = data;
  const evalStatus = state.eval.status;
  const displayRunning = state.display.running;

  // Advance one stage per settled evaluation. Each pass re-reads live truth;
  // `nextBuildUpStep` decides (wait / advance / done / abort), so a compute
  // error falls back to the designed idle state instead of skipping ahead.
  useEffect(() => {
    if (buildUp !== "playing") return;
    const step = nextBuildUpStep(stages, currentStageId, evalStatus, displayRunning);
    if (step.kind === "advance") {
      bindings.onSelectStage(step.stageId);
    } else if (step.kind === "done") {
      setBuildUp("done");
    } else if (step.kind === "abort") {
      setBuildUp("idle");
    }
  }, [buildUp, stages, currentStageId, evalStatus, displayRunning, bindings]);

  const handleToggle = (): void => {
    if (buildUp === "playing") {
      setBuildUp("idle"); // pause stops; pressing again restarts from stage one
      return;
    }
    if (buildUp === "done") return; // the rail disables the control until a chip restarts it
    const first = stages[0];
    if (first === undefined) return; // no ladder: the rail's control is disabled
    setBuildUp("playing");
    bindings.onSelectStage(first.id);
  };

  const handleSelectStage = (stageId: string): void => {
    setBuildUp("idle"); // a chip click takes over from Build Up (or restarts after done)
    bindings.onSelectStage(stageId);
  };

  return (
    <EvidenceRail
      stages={stages}
      currentStageId={currentStageId}
      customSubset={customSubset}
      buildUp={{ state: buildUp }}
      onSelectStage={handleSelectStage}
      onBuildUpToggle={handleToggle}
    />
  );
}
