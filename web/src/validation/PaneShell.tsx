/**
 * Shared pane chrome for the five Trust panes: heading, cohort subtitle and
 * the three designed non-ready states (loading / empty / error). Never a blank
 * panel, never a fabricated default metric (AGENTS §6.1, §6.6).
 */

import { useId, type ReactNode } from "react";
import { TRUST_COPY } from "./copy";
import "./panes.css";

export type PaneShellProps = {
  title: string;
  subtitle: string;
  /** Results prop absent → true; drives the designed empty state. */
  hasData: boolean;
  loading?: boolean;
  error?: string | null;
  /**
   * G5 inline retry (Architecture §16.1, Contracts §11 "Results unavailable →
   * Trust offers retry"). Supplied by the shell when a real reload action
   * exists; without it the pane shows the designed state and never a button
   * that would do nothing (no fake affordance).
   */
  onRetry?: (() => void) | null;
  children: ReactNode;
};

export type PaneStateKind = "loading" | "empty" | "error" | "ready";

export function resolvePaneState(props: {
  hasData: boolean;
  loading?: boolean;
  error?: string | null;
}): PaneStateKind {
  if (props.error) return "error";
  if (!props.hasData) return props.loading ? "loading" : "empty";
  return "ready";
}

export function PaneShell({
  title,
  subtitle,
  hasData,
  loading,
  error,
  onRetry,
  children
}: PaneShellProps) {
  const headingId = useId();
  const state = resolvePaneState({ hasData, loading, error });
  const retryButton =
    typeof onRetry === "function" ? (
      <button
        type="button"
        className="ct-state__retry"
        data-testid="pane-retry"
        onClick={() => onRetry()}
      >
        {TRUST_COPY.retryLabel}
      </button>
    ) : null;

  return (
    <section
      className="ct-pane"
      aria-labelledby={headingId}
      data-testid="trust-pane"
      data-pane-state={state}
    >
      <header className="ct-pane__header">
        <h2 className="ct-pane__title" id={headingId}>
          {title}
        </h2>
        <p className="ct-pane__subtitle">{subtitle}</p>
      </header>

      {state === "loading" && (
        <div className="ct-state ct-state--loading" role="status" aria-busy="true">
          <h3 className="ct-state__heading">{TRUST_COPY.loadingHeading}</h3>
          <div className="ct-skeleton" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <p className="ct-state__body">{TRUST_COPY.loadingBody}</p>
        </div>
      )}

      {state === "empty" && (
        <div className="ct-state ct-state--empty" role="status">
          <h3 className="ct-state__heading">{TRUST_COPY.emptyHeading}</h3>
          <p className="ct-state__body">{TRUST_COPY.emptyBody}</p>
          {retryButton}
        </div>
      )}

      {state === "error" && (
        <div className="ct-state ct-state--error" role="alert">
          <h3 className="ct-state__heading">{TRUST_COPY.errorHeading}</h3>
          <p className="ct-state__body">
            {TRUST_COPY.errorPrefix} {error} {TRUST_COPY.errorSuffix}
          </p>
          {retryButton}
        </div>
      )}

      {state === "ready" && <div className="ct-pane__body">{children}</div>}

      <footer className="ct-pane__footer">
        <p>{TRUST_COPY.cohortNote}</p>
      </footer>
    </section>
  );
}
