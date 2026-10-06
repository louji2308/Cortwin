import type { ReactElement } from "react";
import type { ComputeError } from "../contracts";

/**
 * Designed loading / empty / degraded states for the Explore workspace
 * (AGENTS §6.1 "every state is designed", Architecture §16 ladder).
 *
 * Nothing here renders a probability, a decision or a metric: skeletons and
 * notices are chrome. Copy is plain-language, C-13 vocabulary, and always
 * names a recovery action when something failed (AGENTS §6.6).
 */

export function ExploreSkeleton(): ReactElement {
  return (
    <div className="ct-explore ct-explore--skeleton" data-testid="explore-skeleton" aria-busy="true">
      <section className="ct-explore__col ct-explore__col--profile" aria-label="Patient inputs">
        <div className="ct-skeleton ct-skeleton--title" />
        <div className="ct-skeleton ct-skeleton--row" />
        <div className="ct-skeleton ct-skeleton--row" />
        <div className="ct-skeleton ct-skeleton--block" />
        <div className="ct-skeleton ct-skeleton--block" />
      </section>
      <section className="ct-explore__col ct-explore__col--stage" aria-label="Vessel stage">
        <div className="ct-skeleton ct-skeleton--stage" />
        <div className="ct-explore__readouts">
          <div className="ct-skeleton ct-skeleton--card" />
          <div className="ct-skeleton ct-skeleton--card" />
          <div className="ct-skeleton ct-skeleton--card" />
          <div className="ct-skeleton ct-skeleton--card" />
        </div>
      </section>
      <section className="ct-explore__col ct-explore__col--inspector" aria-label="Inspector">
        <div className="ct-skeleton ct-skeleton--title" />
        <div className="ct-skeleton ct-skeleton--row" />
        <div className="ct-skeleton ct-skeleton--block" />
      </section>
      <p className="ct-explore__loading-line" role="status" aria-live="polite">
        Loading the model bundle…
      </p>
    </div>
  );
}

/** Placeholder where a readout will appear once the first evaluation lands. */
export function ReadoutSkeleton({ label }: { label: string }): ReactElement {
  return (
    <div className="ct-readout-skeleton" data-testid="readout-skeleton">
      <span className="ct-readout-skeleton__label">{label}</span>
      <span className="ct-readout-skeleton__bar" aria-hidden="true" />
      <span className="ct-readout-skeleton__note">Waiting for the first model response.</span>
    </div>
  );
}

/** Typed compute failure, surfaced with its contract message + a way out. */
export function EvalErrorNotice({ error }: { error: ComputeError }): ReactElement {
  return (
    <div className="ct-explore__error" role="alert" data-testid="eval-error">
      <strong>Model response unavailable.</strong>{" "}
      <span>{error.message}</span>{" "}
      <span>Editing any field retries automatically; reload the page if this repeats.</span>
      <span className="ct-explore__error-code" data-error-code={error.code}>
        {error.code}
      </span>
    </div>
  );
}

/** Stale-but-visible: previous truth on screen, explicitly not current. */
export function StaleNotice(): ReactElement {
  return (
    <span className="ct-explore__stale" data-testid="stale-notice">
      Updating… Previous values shown while this update settles.
    </span>
  );
}

/**
 * A rejected C-09 intent: nothing was written, so the screen still shows the
 * last truth. The notice names the failure and the way out (AGENTS §6.6).
 */
export function IntentErrorNotice({ error }: { error: ComputeError }): ReactElement {
  return (
    <div className="ct-explore__intent-error" role="alert" data-testid="intent-error">
      <strong>Change not applied.</strong>{" "}
      <span>{error.message}</span>{" "}
      <span>The values already on screen are unchanged; try the edit again.</span>
      <span className="ct-explore__error-code" data-error-code={error.code}>
        {error.code}
      </span>
    </div>
  );
}
