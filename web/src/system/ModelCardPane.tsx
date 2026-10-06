import { SystemPaneShell } from "./SystemPaneShell";
import type { ModelCardData } from "./types";

export type ModelCardPaneProps = {
  /**
   * Model card values supplied by artifacts (C-01 manifest, C-06 fixtures,
   * licence and AI-use docs). `null`/omitted shows the designed empty state;
   * blank fields and empty lists read "Not provided" (Contracts §9, L432).
   */
  card?: ModelCardData | null;
  /** Designed loading state while artifacts are being read. */
  loading?: boolean;
};

const NOT_PROVIDED = "Not provided";

function displayText(value: string): string {
  return value.trim().length > 0 ? value : NOT_PROVIDED;
}

function DisplayList({ items }: { items: readonly string[] }) {
  const present = items.filter((item) => item.trim().length > 0);
  if (present.length === 0) {
    return <span>{NOT_PROVIDED}</span>;
  }
  return (
    <ul className="ct-sys-list">
      {present.map((item, index) => (
        <li key={`${index}-${item.slice(0, 24)}`}>{item}</li>
      ))}
    </ul>
  );
}

/**
 * System → Model card (Contracts §9, L432): model and schema identity,
 * dataset provenance, validation protocol, limitations, attribution caveats,
 * licence and attribution, AI-use disclosure, and artifact identity. Every
 * field renders only the value it is given — empty input reads
 * "Not provided" rather than an invented statement.
 */
export function ModelCardPane({ card = null, loading = false }: ModelCardPaneProps) {
  return (
    <SystemPaneShell
      pane="model-card"
      title="Model card"
      subtitle="Model, data, validation and disclosure in one place."
      loadingMessage="Loading model card…"
      state={card === null ? "empty" : "ready"}
      loading={loading}
    >
      {card === null ? (
        <div className="ct-sys-state" role="status">
          <p className="ct-sys-state__heading">No model card in this session.</p>
          <p className="ct-sys-state__body">
            This pane renders only the values it is given; nothing is reconstructed from
            memory.
          </p>
        </div>
      ) : (
        <>
          <dl className="ct-sys-dl" data-testid="model-card-fields">
            <dt>Model identity</dt>
            <dd>{displayText(card.modelIdentity)}</dd>
            <dt>Feature schema</dt>
            <dd>{displayText(card.schemaIdentity)}</dd>
            <dt>Dataset provenance</dt>
            <dd>{displayText(card.datasetProvenance)}</dd>
            <dt>Validation protocol</dt>
            <dd>{displayText(card.validationProtocol)}</dd>
            <dt>Limitations</dt>
            <dd>
              <DisplayList items={card.limitations} />
            </dd>
            <dt>Attribution caveats</dt>
            <dd>
              <DisplayList items={card.attributionCaveats} />
            </dd>
            <dt>Licence and attribution</dt>
            <dd>{displayText(card.licenceAttribution)}</dd>
            <dt>AI-use disclosure</dt>
            <dd>{displayText(card.aiUseDisclosure)}</dd>
            <dt>Artifact identity</dt>
            <dd>{displayText(card.artifactIdentity)}</dd>
          </dl>
          <p className="ct-sys-note">
            Every field renders only the value it is given.
          </p>
        </>
      )}
    </SystemPaneShell>
  );
}
