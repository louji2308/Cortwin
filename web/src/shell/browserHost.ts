import type { HistoryAction } from "../navigation";
import type { RouterHost } from "./router";

export function createBrowserRouterHost(): RouterHost {
  return {
    read(): string {
      return typeof location === "undefined" ? "" : location.hash;
    },
    write(href: string, action: HistoryAction): void {
      if (typeof history === "undefined") return;
      const target = `${location.pathname}${location.search}${href}`;
      if (action === "push") history.pushState(null, "", target);
      else history.replaceState(null, "", target);
    },
    listen(onChange: () => void): () => void {
      if (typeof window === "undefined") return () => undefined;
      window.addEventListener("hashchange", onChange);
      window.addEventListener("popstate", onChange);
      return () => {
        window.removeEventListener("hashchange", onChange);
        window.removeEventListener("popstate", onChange);
      };
    }
  };
}
