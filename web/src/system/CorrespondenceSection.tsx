import { useSyncExternalStore } from "react";
import { ProbabilityReadout } from "../components/ProbabilityReadout";
import { NEUTRAL_PROBABILITY_COLOUR, probabilityToColour } from "../design/ramp";
import { VESSEL_TARGET_IDS, identityChainTable } from "../registry";
import { store as singletonStore, type CorTwinStore } from "../store";
import { focusVesselInScene } from "./correspondenceFocus";

/**
 * System → Architecture → vessel correspondence (D-22, C-02 §5.2).
 *
 * The judge-visible proof of registry identity: one row per probability-
 * driven vessel showing every hop of the contract's chain — vessel ID →
 * target ID → model key → structure ID → mesh node → camera preset → UI card
 * → explanation target → Trust target — resolved by calling the registry's
 * own functions, never by a local table. Beside each row sit the colour the
 * stage paints (the single probability ramp, C-11 L354) and the full
 * probability readout, both fed from this session's evaluation payload, so a
 * viewer can match the pane against the 3D scene at a glance.
 *
 * Laws honoured here: one store (reads the C-09 singleton, injectable for
 * tests), one registry (INV-C15 — no second mapping table), one ramp
 * (D-202), a bare probability is never rendered (ProbabilityReadout carries
 * value, threshold, decision and reliability together), and no clinical
 * number is written in this file — probabilities, thresholds and colours are
 * all read from artifacts and the store.
 */

export type CorrespondenceSectionProps = {
  /** Store to read from. The app uses the singleton; tests inject an isolated one. */
  store?: CorTwinStore;
};

type HopProps = { label: string; value: string };

function Hop({ label, value }: HopProps) {
  return (
    <li className="ct-sys-chain__hop">
      <span className="ct-sys-chain__label">{label}</span>
      <code>{value}</code>
    </li>
  );
}

function Swatch({ colour }: { colour: string }) {
  return <span className="ct-sys-swatch" style={{ backgroundColor: colour }} aria-hidden="true" />;
}

export function CorrespondenceSection({ store = singletonStore }: CorrespondenceSectionProps) {
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState);
  const registry = state.bundle.registry;
  const evaluation = state.eval.current;

  if (registry === null) {
    return (
      <div data-testid="correspondence-section" data-state="registry-unavailable">
        <h3>Vessel correspondence</h3>
        <div className="ct-sys-state" role="status">
          <p className="ct-sys-state__heading">Registry not available in this session.</p>
          <p className="ct-sys-state__body">
            Every hop below is resolved from the C-02 registry. The rows appear only once the
            registry has been verified and loaded — nothing here is written from memory.
          </p>
        </div>
      </div>
    );
  }

  const table = identityChainTable(registry);
  const identities = VESSEL_TARGET_IDS.map((vesselId) => table[vesselId]);
  const linkedStructures = new Set(
    registry.targets.filter((target) => target.kind === "vessel").map((target) => target.structureId)
  );
  const neutralStructures = registry.structures.filter(
    (structure) => !linkedStructures.has(structure.id)
  );
  const overallTargets = registry.targets.filter((target) => target.kind === "overall");

  return (
    <div data-testid="correspondence-section" data-state="ready">
      <h3>Vessel correspondence</h3>
      <p className="ct-sys-note">
        One row per probability-driven vessel. Every hop is read from the registry with the same
        functions the stage, cards, explanations and Trust filter use, so the three surfaces can
        never disagree about which vessel is which.
      </p>

      <div className="ct-sys-tablewrap">
        <table className="ct-sys-table" data-testid="correspondence-table">
          <caption>
            Identity chain, stage colour and probability readout for each vessel (C-02 §5.2).
          </caption>
          <thead>
            <tr>
              <th scope="col">Vessel</th>
              <th scope="col">Identity chain</th>
              <th scope="col">Colour and probability</th>
              <th scope="col">Scene</th>
            </tr>
          </thead>
          <tbody>
            {identities.map((identity) => {
              const selected = state.selection.targetId === identity.targetId;
              const payload =
                evaluation === null
                  ? null
                  : (evaluation.targets[identity.targetId] ?? null);
              return (
                <tr
                  key={identity.vesselId}
                  data-vessel-id={identity.vesselId}
                  data-selected={selected ? "true" : "false"}
                >
                  <th scope="row">
                    <span className="ct-sys-vessel">{identity.cardLabel}</span>
                    {selected ? <span className="ct-sys-chip">selected</span> : null}
                    <span className="ct-sys-source">{identity.cardLabelDefinition}</span>
                  </th>
                  <td>
                    <ul
                      className="ct-sys-chain"
                      aria-label={`${identity.cardLabel} identity chain`}
                    >
                      <Hop label="vessel" value={identity.vesselId} />
                      <Hop label="target" value={identity.targetId} />
                      <Hop label="model" value={identity.modelKey} />
                      <Hop label="structure" value={identity.structureId} />
                      <Hop label="mesh node" value={identity.meshNode} />
                      <Hop label="camera" value={identity.cameraPreset} />
                      <Hop label="card" value={identity.cardLabel} />
                      <Hop label="explanation" value={identity.explanationTargetId} />
                      <Hop label="trust" value={identity.trustTargetId} />
                    </ul>
                  </td>
                  <td>
                    {payload === null ? (
                      <div className="ct-sys-state" role="status" data-state="no-evaluation">
                        <p className="ct-sys-state__body">
                          No evaluation in this session yet. The stage colour and the readout
                          appear with the first computed probability — never before it.
                        </p>
                      </div>
                    ) : (
                      <div className="ct-sys-colour">
                        <span className="ct-sys-colour__row">
                          <Swatch colour={probabilityToColour(payload.probability)} />
                          <span className="ct-sys-source">
                            the colour this vessel carries on the stage, from the one
                            probability-to-colour ramp (C-11 L354)
                          </span>
                        </span>
                        <ProbabilityReadout
                          value={payload.probability}
                          targetId={identity.targetId}
                          targetLabel={identity.cardLabel}
                          threshold={payload.thresholdProbability}
                          decision={payload.decision}
                          reliability={payload.reliability}
                          size="compact"
                        />
                      </div>
                    )}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="ct-sys-btn"
                      onClick={() => focusVesselInScene(store, identity)}
                      aria-label={`Focus ${identity.cardLabel} in the 3D scene`}
                      data-testid={`focus-in-scene-${identity.vesselId}`}
                    >
                      Focus in scene
                    </button>
                    <span className="ct-sys-source">
                      selects this target and sets the camera preset; the stage applies both
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h3>Structures without a prediction target</h3>
      <p className="ct-sys-note">
        Named nodes the registry publishes with no vessel target linked to them. They carry no
        probability, so the stage paints them in the neutral colour outside the ramp — never a low
        value on it.
      </p>
      <ul className="ct-sys-list" data-testid="neutral-structures">
        {neutralStructures.map((structure) => (
          <li key={structure.id}>
            <Swatch colour={NEUTRAL_PROBABILITY_COLOUR} />
            <code>{structure.meshNode}</code>
            <span className="ct-sys-source">{structure.label} — no prediction target</span>
          </li>
        ))}
      </ul>

      <h3>Overall target</h3>
      {overallTargets.map((target) => (
        <p className="ct-sys-note" key={target.id} data-testid="overall-target-note">
          <code>{target.id}</code> is the overall target (kind: {target.kind}). Its structure and
          mesh node are <em>not provided</em>: the headline is a probability over the cohort, not a
          named node in the scene.
        </p>
      ))}

      <p className="ct-sys-note" data-testid="correspondence-evidence">
        Evidence: every hop above is resolved by <code>registry/identityChain.ts</code> and
        asserted end to end by <code>registry/identityChain.test.ts</code> (C-02 §5.2), and the
        stage reads the same rows (INV-C15). This pane holds no mapping table of its own.
      </p>
    </div>
  );
}
