import { Fragment } from "react";
import { ARCHITECTURE_FACTS } from "./architectureData";
import { CorrespondenceSection } from "./CorrespondenceSection";
import { SceneHealthSection } from "./SceneHealthSection";
import { SystemPaneShell } from "./SystemPaneShell";
import type { ArchitectureFact } from "./types";

export type ArchitecturePaneProps = {
  /** Static explanatory facts. Defaults to the documented invariants in architectureData. */
  facts?: readonly ArchitectureFact[];
  /**
   * Manifest-supplied facts (hashes, sizes, versions, C-01). Rendered only
   * when the manifest exists; `null`/`undefined` shows the designed
   * not-available state — no version or digest is ever invented here.
   */
  manifestFacts?: readonly ArchitectureFact[] | null;
  /** Designed loading state. */
  loading?: boolean;
};

function FactList({ facts, testId }: { facts: readonly ArchitectureFact[]; testId: string }) {
  return (
    <dl className="ct-sys-dl" data-testid={testId}>
      {facts.map((fact) => (
        <Fragment key={fact.label}>
          <dt>{fact.label}</dt>
          <dd>
            {fact.detail}
            <span className="ct-sys-source">Source: {fact.source}</span>
          </dd>
        </Fragment>
      ))}
    </dl>
  );
}

/**
 * System → Architecture (Contracts §9, L427): static explanatory content
 * plus manifest facts. Static facts are documented invariants with their
 * sources shown; manifest facts appear only when supplied by the caller
 * (the artifact manifest), never estimated.
 *
 * D-22 adds two judge-visible sections beneath them: the vessel
 * correspondence proof (registry identity chain, stage colour and probability
 * readout per vessel) and the live 3D health readout (renderer statistics
 * against the C-16 budget targets, each labelled MEASURED or TARGET).
 */
export function ArchitecturePane({
  facts = ARCHITECTURE_FACTS,
  manifestFacts = null,
  loading = false,
}: ArchitecturePaneProps) {
  return (
    <SystemPaneShell
      pane="architecture"
      title="Architecture"
      subtitle="How the system is put together, plus manifest facts when the artifact manifest is available."
      loadingMessage="Loading architecture facts…"
      state={facts.length === 0 ? "empty" : "ready"}
      loading={loading}
    >
      {facts.length === 0 ? (
        <div className="ct-sys-state" role="status">
          <p className="ct-sys-state__heading">No architecture facts in this session.</p>
          <p className="ct-sys-state__body">
            This pane renders only the facts it is given — nothing is described from memory.
          </p>
        </div>
      ) : (
        <FactList facts={facts} testId="architecture-facts" />
      )}

      <h3>Manifest facts</h3>
      {manifestFacts !== null && manifestFacts.length > 0 ? (
        <FactList facts={manifestFacts} testId="manifest-facts" />
      ) : (
        <div className="ct-sys-state" role="status" data-state="manifest-unavailable">
          <p className="ct-sys-state__heading">Manifest not available yet.</p>
          <p className="ct-sys-state__body">
            The C-01 artifact manifest is not loaded in this session. Versions and hashes appear
            only from the manifest itself — nothing is estimated.
          </p>
        </div>
      )}

      <CorrespondenceSection />

      <SceneHealthSection />

      <p className="ct-sys-note">
        Static facts are documented invariants with their sources; manifest facts appear only when
        the C-01 manifest supplies them.
      </p>
    </SystemPaneShell>
  );
}
