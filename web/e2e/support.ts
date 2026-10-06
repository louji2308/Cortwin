import type { Page } from "@playwright/test";

/**
 * C-15 CSP minimum — copied VERBATIM from Project/Contracts.md line 448.
 * Do not reword, reorder or "tidy" this string: it is contract text.
 */
export const EXPECTED_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'none';";

/** Resource types that C-15 prohibits outright. */
export const PROHIBITED_RESOURCE_TYPES: ReadonlySet<string> = new Set([
  "websocket",
  "ping",
  "eventsource"
]);

/**
 * Storage key/name patterns that would indicate patient or case data reached a
 * persistent store (C-15 Storage line). Pattern-scan is advisory UX for failure
 * messages; the scaffold assertion "storage stays empty" is the hard gate.
 */
export const CASE_LIKE_KEY =
  /(case|patient|mrn|subject|encounter|shap|attribut|probab|evaluat|feature|stenos|diagnos|observat|specimen|cohort|record)/i;

export interface SyncStorageCapture {
  localStorage: Record<string, string>;
  sessionStorage: Record<string, string>;
  cookies: string;
}

export interface StorageSnapshot extends SyncStorageCapture {
  indexedDb: string[];
  cacheApi: string[];
}

/**
 * Records the origin's synchronous storage state BEFORE any application script
 * runs (Playwright init scripts execute ahead of page scripts on every
 * navigation). Stored on `window.__preAppStorage`.
 */
export async function installPreAppCapture(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const read = (store: Storage): Record<string, string> => {
      const out: Record<string, string> = {};
      for (let i = 0; i < store.length; i += 1) {
        const key = store.key(i);
        if (key !== null) {
          out[key] = store.getItem(key) ?? "";
        }
      }
      return out;
    };
    const target = window as unknown as Record<string, unknown>;
    target["__preAppStorage"] = {
      localStorage: read(window.localStorage),
      sessionStorage: read(window.sessionStorage),
      cookies: document.cookie
    };
  });
}

export async function readPreAppCapture(page: Page): Promise<SyncStorageCapture> {
  const value = await page.evaluate(() => {
    const target = window as unknown as Record<string, unknown>;
    return target["__preAppStorage"] as SyncStorageCapture | undefined;
  });
  if (value === undefined) {
    throw new Error(
      "storage-audit: pre-application capture is missing — installPreAppCapture() must run before page.goto()"
    );
  }
  return value;
}

/** Full post-hoc snapshot: sync stores + cookie string + IndexedDB + Cache API. */
export async function storageSnapshot(page: Page): Promise<StorageSnapshot> {
  return page.evaluate(async () => {
    const read = (store: Storage): Record<string, string> => {
      const out: Record<string, string> = {};
      for (let i = 0; i < store.length; i += 1) {
        const key = store.key(i);
        if (key !== null) {
          out[key] = store.getItem(key) ?? "";
        }
      }
      return out;
    };
    let indexedDb: string[] = [];
    if (typeof indexedDB !== "undefined" && typeof indexedDB.databases === "function") {
      const databases = await indexedDB.databases();
      indexedDb = databases.map((entry) => entry.name ?? "<unnamed>");
    }
    let cacheApi: string[] = [];
    if (typeof caches !== "undefined") {
      cacheApi = await caches.keys();
    }
    return {
      localStorage: read(window.localStorage),
      sessionStorage: read(window.sessionStorage),
      cookies: document.cookie,
      indexedDb,
      cacheApi
    };
  });
}

/** Every storage key/name in a snapshot, across all stores. */
export function allStorageKeys(snapshot: StorageSnapshot): string[] {
  const cookieNames = snapshot.cookies
    .split(";")
    .map((pair) => pair.split("=")[0]?.trim() ?? "")
    .filter((name) => name.length > 0);
  return [
    ...Object.keys(snapshot.localStorage),
    ...Object.keys(snapshot.sessionStorage),
    ...cookieNames,
    ...snapshot.indexedDb,
    ...snapshot.cacheApi
  ];
}

/** Snapshot keys that look like patient/case data (C-15). */
export function caseLikeKeys(snapshot: StorageSnapshot): string[] {
  return allStorageKeys(snapshot).filter((key) => CASE_LIKE_KEY.test(key));
}

/**
 * C-15 Network: only same-origin static traffic, plus the inert `data:`/`blob:`
 * schemes (worker bundles, inlined assets). Anything else is a violation.
 */
export function isSameOriginUrl(rawUrl: string, origin: string): boolean {
  if (rawUrl.startsWith("data:") || rawUrl.startsWith("blob:")) {
    return true;
  }
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }
  return parsed.origin === origin;
}

/**
 * Generic, forward-compatible interaction sweep: it must exercise the scaffold
 * today and still exercise whatever the app grows into, without hardcoding
 * product-specific selectors. Dismissible dialogs are auto-dismissed by
 * Playwright; every step is required (no silent catches).
 */
export async function interact(page: Page): Promise<void> {
  const heading = page.locator("h1").first();
  if ((await heading.count()) > 0 && (await heading.isVisible())) {
    await heading.click();
  }

  for (let i = 0; i < 5; i += 1) {
    await page.keyboard.press("Tab");
  }
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowDown");

  const controls = page.locator(
    'button, a[href^="#"], [role="button"], [role="tab"], [role="link"], [role="menuitem"]'
  );
  for (let i = 0; i < 6; i += 1) {
    if ((await controls.count()) <= i) {
      break;
    }
    const control = controls.nth(i);
    if (await control.isVisible()) {
      // Off-viewport controls (e.g. a skip link parked at left:-9999px until
      // focused) are keyboard-revealed by design; a mouse click cannot reach
      // them, so activate those by focus+Enter instead. On-screen controls are
      // clicked as before. Either way the step is required — never skipped.
      const box = await control.boundingBox();
      const viewport = page.viewportSize();
      const onScreen =
        box !== null &&
        viewport !== null &&
        box.x + box.width / 2 >= 0 &&
        box.x + box.width / 2 <= viewport.width &&
        box.y + box.height / 2 >= 0 &&
        box.y + box.height / 2 <= viewport.height;
      if (onScreen) {
        await control.click({ timeout: 3_000 });
      } else {
        await control.focus();
        await page.keyboard.press("Enter");
      }
      await page.keyboard.press("Escape");
    }
  }

  await page.evaluate(() => {
    window.scrollTo(0, document.body.scrollHeight);
  });
  await page.evaluate(() => {
    window.scrollTo(0, 0);
  });
}

/** Short deterministic settle window (requests kicked off by load/interaction). */
export async function settle(page: Page, milliseconds = 500): Promise<void> {
  await page.waitForTimeout(milliseconds);
}
