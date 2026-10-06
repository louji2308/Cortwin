import { describe, expect, it, vi } from "vitest";
import { TRUST_PANES, type HistoryAction, type UrlNoticeCode } from "../navigation";
import { bindRouterToStore, createShellRouter, type RouterHost, type ShellRoute } from "./router";

/**
 * P6-SHELL — router laws (C-10 §7.2): valid deep link, invalid fragment ->
 * default + designed notice, push on view change, popstate back/forward,
 * query preservation, and a store binding that cannot loop.
 *
 * Everything runs headless against a fake host: no DOM, no history API.
 */

type FakeHost = {
  host: RouterHost;
  writes: Array<{ href: string; action: HistoryAction }>;
  hash(): string;
  /** Simulate the user pressing back/forward or editing the fragment. */
  go(next: string): void;
};

function fakeHost(initial = ""): FakeHost {
  let hash = initial;
  const listeners = new Set<() => void>();
  const writes: Array<{ href: string; action: HistoryAction }> = [];
  return {
    writes,
    hash: () => hash,
    host: {
      read: () => hash,
      write(href, action) {
        writes.push({ href, action });
        hash = href;
      },
      listen(onChange) {
        listeners.add(onChange);
        return () => {
          listeners.delete(onChange);
        };
      }
    },
    go(next) {
      hash = next;
      for (const listener of [...listeners]) listener();
    }
  };
}

type FakeStore = {
  getState: () => { view: { route: string; pane: string | null } };
  subscribe: (listener: () => void) => () => void;
  intents: { view: { navigate: (route: never, pane: string | null) => void } };
  view(): { route: string; pane: string | null };
  writes: number;
};

function fakeStore(initial: ShellRoute = { route: "explore", pane: null }): FakeStore {
  let view: { route: string; pane: string | null } = { ...initial };
  const listeners = new Set<() => void>();
  const store: FakeStore = {
    writes: 0,
    getState: () => ({ view }),
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    intents: {
      view: {
        navigate(route, pane) {
          store.writes += 1;
          view = { route: route as unknown as string, pane };
          for (const listener of [...listeners]) listener();
        }
      }
    },
    view: () => view
  };
  return store;
}

describe("valid deep links", () => {
  it("maps #/explore to the explore view with no notice", () => {
    const router = createShellRouter(fakeHost("#/explore").host);
    expect(router.snapshot().route).toEqual({ route: "explore", pane: null });
    expect(router.snapshot().notices).toHaveLength(0);
  });

  it("maps an empty fragment to the default explore view with no notice", () => {
    const router = createShellRouter(fakeHost("").host);
    expect(router.snapshot().route).toEqual({ route: "explore", pane: null });
    expect(router.snapshot().notices).toHaveLength(0);
  });

  it("maps every trust pane to trust/<pane> with no notice", () => {
    for (const pane of TRUST_PANES) {
      const router = createShellRouter(fakeHost(`#/trust/${pane}`).host);
      expect(router.snapshot().route).toEqual({ route: "trust", pane });
      expect(router.snapshot().notices).toHaveLength(0);
    }
  });

  it("maps the four system panes to system/<pane> with no notice", () => {
    for (const pane of ["requirements", "architecture", "integrity", "model-card"]) {
      const router = createShellRouter(fakeHost(`#/system/${pane}`).host);
      expect(router.snapshot().route).toEqual({ route: "system", pane });
      expect(router.snapshot().notices).toHaveLength(0);
    }
  });

  it("keeps the query string when a deep link carries selections", () => {
    const router = createShellRouter(fakeHost("#/trust/subgroups?case=hypo1&target=LAD").host);
    expect(router.snapshot().route).toEqual({ route: "trust", pane: "subgroups" });
    expect(router.snapshot().notices).toHaveLength(0);
    expect(router.snapshot().path).toBe("#/trust/subgroups");
  });
});

describe("invalid fragments fall back to a designed default + notice", () => {
  it("an unknown route resolves to explore with an UNKNOWN_ROUTE notice", () => {
    const router = createShellRouter(fakeHost("#/nowhere").host);
    expect(router.snapshot().route).toEqual({ route: "explore", pane: null });
    expect(router.snapshot().notices.map((n) => n.code)).toEqual<UrlNoticeCode[]>([
      "UNKNOWN_ROUTE"
    ]);
  });

  it("an unknown trust pane resolves to the default pane with an UNKNOWN_PANE notice", () => {
    const router = createShellRouter(fakeHost("#/trust/nonsense").host);
    expect(router.snapshot().route).toEqual({ route: "trust", pane: "performance" });
    expect(router.snapshot().notices.map((n) => n.code)).toEqual<UrlNoticeCode[]>([
      "UNKNOWN_PANE"
    ]);
  });

  it("a bare #/system resolves to the default system pane with a notice", () => {
    const router = createShellRouter(fakeHost("#/system").host);
    expect(router.snapshot().route).toEqual({ route: "system", pane: "requirements" });
    expect(router.snapshot().notices.map((n) => n.code)).toEqual<UrlNoticeCode[]>([
      "UNKNOWN_PANE"
    ]);
  });

  it("a fragment that is not a route at all still resolves, never throws", () => {
    const router = createShellRouter(fakeHost("#not-a-route").host);
    expect(router.snapshot().route.route).toBe("explore");
    expect(router.snapshot().notices).toHaveLength(1);
  });
});

describe("view changes push, and only view changes write", () => {
  it("navigating to another view pushes one history entry with the canonical path", () => {
    const h = fakeHost("#/explore");
    const router = createShellRouter(h.host);
    router.navigate({ route: "system", pane: "integrity" });
    expect(h.writes).toEqual([{ href: "#/system/integrity", action: "push" }]);
    expect(router.snapshot().route).toEqual({ route: "system", pane: "integrity" });
  });

  it("navigating within the same route does not write a history entry", () => {
    const h = fakeHost("#/trust/performance");
    const router = createShellRouter(h.host);
    router.navigate({ route: "trust", pane: "performance" });
    expect(h.writes).toHaveLength(0);
  });

  it("a pane change inside trust pushes", () => {
    const h = fakeHost("#/trust/performance");
    const router = createShellRouter(h.host);
    router.navigate({ route: "trust", pane: "leakage" });
    expect(h.writes).toEqual([{ href: "#/trust/leakage", action: "push" }]);
  });

  it("navigation preserves the existing query so boot's selections survive", () => {
    const h = fakeHost("#/explore?case=hypo1&target=LAD");
    const router = createShellRouter(h.host);
    router.navigate({ route: "trust", pane: "calibration" });
    expect(h.writes[0]?.href).toBe("#/trust/calibration?case=hypo1&target=LAD");
  });

  it("notices clear once the router moves to a valid fragment", () => {
    const h = fakeHost("#/nowhere");
    const router = createShellRouter(h.host);
    expect(router.snapshot().notices).toHaveLength(1);
    router.navigate({ route: "trust", pane: "decisions" });
    expect(router.snapshot().notices).toHaveLength(0);
    expect(h.writes).toHaveLength(1);
  });
});

describe("popstate back/forward", () => {
  it("re-reads the fragment on an external change and notifies subscribers", () => {
    const h = fakeHost("#/explore");
    const router = createShellRouter(h.host);
    const seen: ShellRoute[] = [];
    router.subscribe((snapshot) => seen.push(snapshot.route));

    h.go("#/system/architecture");
    expect(router.snapshot().route).toEqual({ route: "system", pane: "architecture" });
    expect(seen).toEqual([{ route: "system", pane: "architecture" }]);

    h.go("#/explore");
    expect(router.snapshot().route).toEqual({ route: "explore", pane: null });
    expect(seen).toHaveLength(2);
  });

  it("a back navigation onto an invalid fragment surfaces the notice again", () => {
    const h = fakeHost("#/explore");
    const router = createShellRouter(h.host);
    h.go("#/trust/bogus");
    expect(router.snapshot().route).toEqual({ route: "trust", pane: "performance" });
    expect(router.snapshot().notices.map((n) => n.code)).toEqual<UrlNoticeCode[]>([
      "UNKNOWN_PANE"
    ]);
  });

  it("an identical external re-write emits nothing", () => {
    const h = fakeHost("#/trust/leakage");
    const router = createShellRouter(h.host);
    const listener = vi.fn();
    router.subscribe(listener);
    h.go("#/trust/leakage");
    expect(listener).not.toHaveBeenCalled();
  });

  it("stops listening after dispose", () => {
    const h = fakeHost("#/explore");
    const router = createShellRouter(h.host);
    const listener = vi.fn();
    router.subscribe(listener);
    router.dispose();
    h.go("#/system/requirements");
    expect(listener).not.toHaveBeenCalled();
    expect(router.snapshot().route).toEqual({ route: "explore", pane: null });
  });
});

describe("bindRouterToStore — one store, one URL, no echo loops", () => {
  it("applies a deep link to the store on bind", () => {
    const h = fakeHost("#/trust/subgroups");
    const router = createShellRouter(h.host);
    const store = fakeStore();
    bindRouterToStore(router, store as never);
    expect(store.view()).toEqual({ route: "trust", pane: "subgroups" });
    expect(store.writes).toBe(1);
    expect(h.writes).toHaveLength(0);
  });

  it("a store view change pushes the matching fragment exactly once", () => {
    const h = fakeHost("#/explore");
    const router = createShellRouter(h.host);
    const store = fakeStore();
    bindRouterToStore(router, store as never);

    store.intents.view.navigate("system" as never, "model-card");
    expect(h.writes).toEqual([{ href: "#/system/model-card", action: "push" }]);
    expect(store.writes).toBe(1);
    expect(router.snapshot().route).toEqual({ route: "system", pane: "model-card" });
  });

  it("an external back navigation lands in the store without a second write", () => {
    const h = fakeHost("#/explore");
    const router = createShellRouter(h.host);
    const store = fakeStore();
    bindRouterToStore(router, store as never);

    h.go("#/trust/calibration");
    expect(store.view()).toEqual({ route: "trust", pane: "calibration" });
    expect(store.writes).toBe(1);
    expect(h.writes).toHaveLength(0);
  });

  it("does not write the store when the route already matches", () => {
    const h = fakeHost("#/trust/performance");
    const router = createShellRouter(h.host);
    const store = fakeStore({ route: "trust", pane: "performance" });
    bindRouterToStore(router, store as never);
    expect(store.writes).toBe(0);
    expect(h.writes).toHaveLength(0);
  });

  it("unsubscribes both directions", () => {
    const h = fakeHost("#/explore");
    const router = createShellRouter(h.host);
    const store = fakeStore();
    const unbind = bindRouterToStore(router, store as never);
    unbind();

    store.intents.view.navigate("system" as never, "integrity");
    expect(h.writes).toHaveLength(0);

    h.go("#/trust/leakage");
    expect(store.view()).toEqual({ route: "system", pane: "integrity" });
    expect(router.snapshot().route).toEqual({ route: "trust", pane: "leakage" });
  });
});
