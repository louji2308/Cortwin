import { useId, type ReactNode } from "react";
import "../design/tokens.css";
import "./system.css";

/** C-10 system sub-panes. */
export type SystemPaneId = "requirements" | "architecture" | "integrity" | "model-card";

export type SystemPaneShellProps = {
  /** Which C-10 system pane this is — rendered as `data-pane` for deep-link and e2e tests. */
  pane: SystemPaneId;
  /** Pane heading (h2). */
  title: string;
  /** One-line subtitle under the heading. */
  subtitle: string;
  /** Loading copy shown in a role="status" block while `loading` is true. */
  loadingMessage: string;
  /**
   * Pane state for `data-state`, e.g. "ready" | "empty" | "not-run" |
   * "no-checks". Overridden to "loading" while `loading`.
   */
  state: string;
  /** When true, replaces content with a designed loading state. */
  loading?: boolean;
  children: ReactNode;
};

/**
 * Shared chrome for the four System panes (Contracts §9, Architecture §12.2):
 * graphite surface, h2 + subtitle header, designed loading state, and
 * data attributes used by the pane tests and the future C-10 router.
 * Tokens are imported here so every pane is self-sufficient even when the
 * pane is rendered alone in a test.
 */
export function SystemPaneShell({
  pane,
  title,
  subtitle,
  loadingMessage,
  state,
  loading = false,
  children,
}: SystemPaneShellProps) {
  const headingId = useId();
  return (
    <section
      className="ct-sys-pane"
      data-testid="system-pane"
      data-pane={pane}
      data-state={loading ? "loading" : state}
      aria-labelledby={headingId}
      aria-busy={loading ? "true" : undefined}
    >
      <header className="ct-sys-pane__header">
        <h2 className="ct-sys-pane__title" id={headingId}>
          {title}
        </h2>
        <p className="ct-sys-pane__subtitle">{subtitle}</p>
      </header>
      {loading ? (
        <div className="ct-sys-state" role="status">
          <p className="ct-sys-state__heading">{loadingMessage}</p>
          <div className="ct-sys-skeleton" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        </div>
      ) : (
        <div className="ct-sys-pane__body">{children}</div>
      )}
    </section>
  );
}
