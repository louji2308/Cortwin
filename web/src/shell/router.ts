/**
 * P6-SHELL — the fragment router (C-10 §7.2, Architecture §9.6).
 *
 * The router is deliberately thin: it owns *when* the address bar and the
 * store agree about `route`/`pane`, and nothing else. Parsing, validity,
 * notices and serialization are the pure `../navigation` functions — this
 * module never re-implements the grammar and never touches query parameters
 * (`case`, `target`, `feature`, `stage`, `share`), which belong to the boot
 * loader and the selection layer.
 *
 * Everything is driven through an injected `RouterHost`, so the whole module
 * runs headless in Node: tests hand it a fake hash, a fake history and a fake
 * event source and exercise valid links, invalid links, push and popstate
 * without a DOM.
 *
 * Laws encoded here:
 *   - an invalid fragment resolves to the safe default view **plus** a visible
 *     notice (C-10 "every abnormal outcome is a typed, visible notice");
 *   - a route or pane change pushes a history entry; anything that leaves the
 *     route/pane pair unchanged writes nothing (C-10 §7.2 history semantics);
 *   - a navigation never drops the existing query string, so a deep link that
 *     boot resolved keeps its `case`/`target` selections.
 */
import type { ViewRoute } from "../contracts";
import {
  historyActionBetween,
  parseUrl,
  serializeUrl,
  type HistoryAction,
  type UrlNotice
} from "../navigation";

/** The router's slice of the URL: which view, which pane. */
export type ShellRoute = { route: ViewRoute; pane: string | null };

export type RouterSnapshot = {
  route: ShellRoute;
  /** C-10 notices discovered while parsing the current fragment. */
  notices: readonly UrlNotice[];
  /** Path-only fragment (`#/trust/calibration`) for the current route. */
  path: string;
};

/**
 * The environment the router reads and writes. `read` returns the raw
 * fragment (`location.hash` in a browser, any string in a test).
 */
export type RouterHost = {
  read(): string;
  write(href: string, action: HistoryAction): void;
  /** Subscribe to external fragment changes (popstate/hashchange). */
  listen(onChange: () => void): () => void;
};

export type ShellRouter = {
  snapshot(): RouterSnapshot;
  subscribe(listener: (snapshot: RouterSnapshot) => void): () => void;
  /** App-driven view change: push when route/pane changed, otherwise no-op. */
  navigate(next: ShellRoute): void;
  /** Re-read the host (back/forward, hand-edited fragment). */
  refresh(): void;
  dispose(): void;
};

/** Path portion of a fragment, without the leading `#`. `/` when absent. */
function pathOf(hash: string): string {
  let rest = hash;
  const hashAt = rest.indexOf("#");
  if (hashAt >= 0) rest = rest.slice(hashAt + 1);
  const queryAt = rest.indexOf("?");
  const path = queryAt >= 0 ? rest.slice(0, queryAt) : rest;
  return path === "" ? "/explore" : path;
}

function queryOf(hash: string): string {
  const hashAt = hash.indexOf("#");
  const rest = hashAt >= 0 ? hash.slice(hashAt + 1) : hash;
  const queryAt = rest.indexOf("?");
  return queryAt >= 0 ? rest.slice(queryAt) : "";
}

function snapshotOf(hash: string): RouterSnapshot {
  const parsed = parseUrl(hash);
  return {
    route: { route: parsed.route, pane: parsed.pane },
    notices: parsed.notices,
    path: serializeUrl({ route: parsed.route, pane: parsed.pane })
  };
}

export function createShellRouter(host: RouterHost): ShellRouter {
  let current = snapshotOf(host.read());
  const listeners = new Set<(snapshot: RouterSnapshot) => void>();
  let disposed = false;

  const emit = (next: RouterSnapshot): void => {
    const changed =
      next.route.route !== current.route.route ||
      next.route.pane !== current.route.pane ||
      next.notices.length !== current.notices.length ||
      next.path !== current.path;
    current = next;
    if (!changed) return;
    for (const listener of [...listeners]) listener(current);
  };

  const stopListening = host.listen(() => {
    if (disposed) return;
    emit(snapshotOf(host.read()));
  });

  return {
    snapshot: () => current,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    navigate(next) {
      if (disposed) return;
      const target = serializeUrl({ route: next.route, pane: next.pane });
      const currentHash = host.read();
      if (`#${pathOf(currentHash)}` === target) {
        // Already at the canonical path (a notice-only fragment still counts
        // as "correct view"); recompute so notices clear when they can.
        emit(snapshotOf(currentHash));
        return;
      }
      const parsed = parseUrl(currentHash);
      const previous: ShellRoute = { route: parsed.route, pane: parsed.pane };
      const action = historyActionBetween(previous, next);
      host.write(`${target}${queryOf(currentHash)}`, action);
      emit(snapshotOf(host.read()));
    },
    refresh() {
      if (disposed) return;
      emit(snapshotOf(host.read()));
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      stopListening();
      listeners.clear();
    }
  };
}

/**
 * Two-way binding between the router and the one C-09 store.
 *
 * The binding is idempotent in both directions: each side no-ops when it is
 * already in agreement, so a store write can never echo back into a second
 * write, and a hash write can never echo back into a second store write.
 * Returns the unsubscribe function.
 */
export function bindRouterToStore(
  router: ShellRouter,
  store: {
    getState(): { view: { route: ViewRoute; pane: string | null } };
    subscribe(listener: () => void): () => void;
    intents: { view: { navigate(route: ViewRoute, pane: string | null): void } };
  }
): () => void {
  const applyToStore = (route: ShellRoute): void => {
    const view = store.getState().view;
    if (view.route === route.route && view.pane === route.pane) return;
    store.intents.view.navigate(route.route, route.pane);
  };

  applyToStore(router.snapshot().route);

  const stopRouter = router.subscribe((snapshot) => {
    applyToStore(snapshot.route);
  });

  const stopStore = store.subscribe(() => {
    const view = store.getState().view;
    const snapshot = router.snapshot();
    if (snapshot.route.route === view.route && snapshot.route.pane === view.pane) return;
    router.navigate({ route: view.route, pane: view.pane });
  });

  return () => {
    stopRouter();
    stopStore();
  };
}
