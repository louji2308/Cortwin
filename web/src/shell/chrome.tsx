import type { MouseEvent, ReactElement } from "react";
import type { ViewRoute } from "../contracts";
import { serializeUrl } from "../navigation";
import type { BootFailure } from "../boot/errors";
import {
  SAFETY_BANNER_GLYPH,
  SAFETY_BANNER_TEXT,
  SHELL_COPY
} from "./copy";

const NAV_ITEMS: ReadonlyArray<{ route: ViewRoute; path: string }> = [
  { route: "explore", path: "/explore" },
  { route: "trust", path: "/trust/performance" },
  { route: "system", path: "/system/requirements" }
];

function keepModifiedClick(event: MouseEvent<HTMLAnchorElement>): boolean {
  return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
}

export function SkipLink({
  onSkip
}: {
  onSkip: (event: MouseEvent<HTMLAnchorElement>) => void;
}): ReactElement {
  return (
    <a
      className="ct-skip"
      href={`#${SHELL_COPY.skipLinkId}`}
      data-testid="skip-link"
      onClick={onSkip}
    >
      {SHELL_COPY.skipLink}
    </a>
  );
}

export function SafetyBanner(): ReactElement {
  return (
    <div
      className="ct-banner"
      role="note"
      aria-label={SHELL_COPY.bannerLabel}
      data-testid="safety-banner"
    >
      <span className="ct-banner__glyph" aria-hidden="true">
        {SAFETY_BANNER_GLYPH}
      </span>
      <span className="ct-banner__text">{SAFETY_BANNER_TEXT}</span>
    </div>
  );
}

export function Announcer({ message }: { message: string }): ReactElement {
  return (
    <p
      className="ct-sr-only"
      role="status"
      aria-live="polite"
      aria-label={SHELL_COPY.announcerLabel}
      data-testid="shell-announcer"
    >
      {message}
    </p>
  );
}

export type ShellHeaderProps = {
  route: ViewRoute;
  onNavigate: (route: ViewRoute) => void;
};

export function ShellHeader({ route, onNavigate }: ShellHeaderProps): ReactElement {
  return (
    <header className="ct-header" data-testid="shell-header">
      <div className="ct-header__brand">
        <h1 className="ct-header__title" data-testid="shell-title">
          {SHELL_COPY.appName}
        </h1>
        <p className="ct-header__tagline">{SHELL_COPY.tagline}</p>
      </div>
      <nav className="ct-header__nav" aria-label={SHELL_COPY.navLabel} data-testid="shell-nav">
        {NAV_ITEMS.map((item) => (
          <a
            key={item.route}
            className="ct-navlink"
            href={`#${item.path}`}
            data-testid={`nav-${item.route}`}
            aria-current={route === item.route ? "page" : undefined}
            onClick={(event) => {
              if (keepModifiedClick(event)) return;
              event.preventDefault();
              onNavigate(item.route);
            }}
          >
            {SHELL_COPY.viewNames[item.route]}
          </a>
        ))}
      </nav>
    </header>
  );
}

export type PaneTabsProps = {
  route: "trust" | "system";
  panes: readonly string[];
  activePane: string;
  titles: Readonly<Record<string, string>>;
  label: string;
  onNavigate: (pane: string) => void;
};

export function PaneTabs({
  route,
  panes,
  activePane,
  titles,
  label,
  onNavigate
}: PaneTabsProps): ReactElement {
  return (
    <nav className="ct-panetabs" aria-label={label} data-testid="pane-tabs">
      {panes.map((pane) => (
        <a
          key={pane}
          className="ct-panetab"
          href={serializeUrl({ route, pane })}
          data-testid={`pane-tab-${pane}`}
          aria-current={pane === activePane ? "page" : undefined}
          onClick={(event) => {
            if (keepModifiedClick(event)) return;
            event.preventDefault();
            onNavigate(pane);
          }}
        >
          {titles[pane] ?? pane}
        </a>
      ))}
    </nav>
  );
}

export function NoticeList({ messages }: { messages: readonly string[] }): ReactElement | null {
  if (messages.length === 0) return null;
  return (
    <div
      className="ct-notices"
      role="status"
      aria-label={SHELL_COPY.noticeRegionLabel}
      data-testid="shell-notices"
    >
      <ul className="ct-notices__list">
        {messages.map((message, index) => (
          <li key={`${index}-${message}`} className="ct-notices__item">
            {message}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function BootLoadingScreen(): ReactElement {
  return (
    <section
      className="ct-boot"
      data-testid="boot-loading"
      data-state="loading"
      role="status"
      aria-busy="true"
    >
      <h2 className="ct-boot__heading">{SHELL_COPY.loadingHeading}</h2>
      <p className="ct-boot__body">{SHELL_COPY.loadingBody}</p>
      <div className="ct-boot__skeleton" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <p className="ct-boot__note">{SHELL_COPY.loadingSkeletonLabel}</p>
    </section>
  );
}

export function BootFailureScreen({
  failure,
  onRetry
}: {
  failure: BootFailure;
  onRetry: () => void;
}): ReactElement {
  return (
    <section
      className="ct-boot ct-boot--failed"
      data-testid="boot-failure"
      data-state="failed"
      data-code={failure.code}
      role="alert"
    >
      <h2 className="ct-boot__heading">{SHELL_COPY.failureHeading}</h2>
      <p className="ct-boot__message">{failure.message}</p>
      <h3 className="ct-boot__subheading">{SHELL_COPY.failureWhatToDo}</h3>
      <p className="ct-boot__recovery">{failure.recovery}</p>
      <button type="button" className="ct-boot__retry" data-testid="boot-retry" onClick={onRetry}>
        {SHELL_COPY.retry}
      </button>
    </section>
  );
}

export function DegradedNotice(): ReactElement {
  return (
    <section
      className="ct-degraded"
      role="status"
      data-testid="degraded-notice"
      data-level="G3"
    >
      <h2 className="ct-degraded__heading">{SHELL_COPY.degradedHeading}</h2>
      <p className="ct-degraded__body">{SHELL_COPY.degradedBody}</p>
    </section>
  );
}

export function PendingNotice(): ReactElement {
  return (
    <section className="ct-pending" role="status" data-testid="pane-pending">
      <h3 className="ct-pending__heading">{SHELL_COPY.pendingHeading}</h3>
      <p className="ct-pending__body">{SHELL_COPY.pendingBody}</p>
    </section>
  );
}
