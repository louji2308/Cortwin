import { expect, test } from "@playwright/test";
import type { BrowserContext, Page, Request } from "@playwright/test";
import {
  PROHIBITED_RESOURCE_TYPES,
  interact,
  isSameOriginUrl,
  settle
} from "./support";

interface ObservedRequest {
  url: string;
  method: string;
  resourceType: string;
}

interface AuditReport {
  origin: string;
  capturedAt: string;
  total: number;
  observed: ObservedRequest[];
  crossOrigin: ObservedRequest[];
  prohibitedResourceTypes: ObservedRequest[];
  nonGetMethods: ObservedRequest[];
  websockets: string[];
}

function collectRequests(
  context: BrowserContext,
  page: Page
): { observed: ObservedRequest[]; websockets: string[] } {
  const seen = new Set<Request>();
  const observed: ObservedRequest[] = [];
  const websockets: string[] = [];

  const record = (request: Request): void => {
    if (seen.has(request)) {
      return;
    }
    seen.add(request);
    observed.push({
      url: request.url(),
      method: request.method(),
      resourceType: request.resourceType()
    });
  };

  context.on("request", record);
  page.on("request", record);
  page.on("websocket", (socket) => {
    websockets.push(socket.url());
  });

  return { observed, websockets };
}

async function report(
  origin: string,
  observed: ObservedRequest[],
  websockets: string[]
): Promise<AuditReport> {
  return {
    origin,
    capturedAt: new Date().toISOString(),
    total: observed.length,
    observed,
    crossOrigin: observed.filter((entry) => !isSameOriginUrl(entry.url, origin)),
    prohibitedResourceTypes: observed.filter((entry) =>
      PROHIBITED_RESOURCE_TYPES.has(entry.resourceType)
    ),
    nonGetMethods: observed.filter(
      (entry) => entry.method !== "GET" && entry.method !== "HEAD"
    ),
    websockets
  };
}

async function publish(reportData: AuditReport): Promise<void> {
  await test
    .info()
    .attach("request-audit", {
      body: JSON.stringify(reportData, null, 2),
      contentType: "application/json"
    });
  console.log(
    `[request-audit] origin=${reportData.origin} observed=${reportData.total} crossOrigin=${reportData.crossOrigin.length} prohibitedTypes=${reportData.prohibitedResourceTypes.length} nonGet=${reportData.nonGetMethods.length} websockets=${reportData.websockets.length}`
  );
  for (const entry of reportData.observed) {
    console.log(`[request-audit]   ${entry.method} ${entry.resourceType} ${entry.url}`);
  }
}

test.describe("VC-13 / C-15 request audit", () => {
  test("every request during load + interaction is same-origin; zero websocket/beacon/analytics traffic", async ({
    context,
    page,
    baseURL
  }) => {
    expect(baseURL, "playwright baseURL must be configured").toBeTruthy();
    const origin = new URL(baseURL as string).origin;
    const { observed, websockets } = collectRequests(context, page);

    await page.goto("/", { waitUntil: "load" });
    await settle(page);
    await interact(page);
    await settle(page);

    const reportData = await report(origin, observed, websockets);
    await publish(reportData);

    expect(
      reportData.total,
      "the audit must actually observe the document + bundle, otherwise the collectors are broken"
    ).toBeGreaterThan(0);
    expect(
      reportData.crossOrigin,
      "C-15 Network: cross-origin request observed"
    ).toEqual([]);
    expect(
      reportData.prohibitedResourceTypes,
      "C-15 Network: websocket/beacon/analytics-class request observed"
    ).toEqual([]);
    expect(
      reportData.nonGetMethods,
      "C-15 Network: only same-origin static GET (and HEAD) is allowed"
    ).toEqual([]);
    expect(reportData.websockets, "C-15 Network: WebSocket connection opened").toEqual(
      []
    );
  });

  test("audit harness detects a cross-origin attempt (mutation check)", async ({
    context,
    baseURL
  }) => {
    expect(baseURL, "playwright baseURL must be configured").toBeTruthy();
    const origin = new URL(baseURL as string).origin;

    expect(isSameOriginUrl(`${origin}/assets/index.js`, origin)).toBe(true);
    expect(isSameOriginUrl("data:text/plain;base64,AA==", origin)).toBe(true);
    expect(isSameOriginUrl(`blob:${origin}/0-1234`, origin)).toBe(true);
    expect(isSameOriginUrl("https://evil.example/collect", origin)).toBe(false);
    expect(isSameOriginUrl("http://127.0.0.1:4173/x", origin)).toBe(false);
    expect(isSameOriginUrl("not a url", origin)).toBe(false);

    const caught: string[] = [];
    context.on("request", (request) => {
      if (!isSameOriginUrl(request.url(), origin)) {
        caught.push(request.url());
      }
    });

    const probePage: Page = await context.newPage();
    await expect(
      probePage.goto("http://127.0.0.1:9/cortwin-request-audit-probe", {
        timeout: 15_000
      }),
      "probe navigation must fail: nothing listens on the discard port"
    ).rejects.toThrow(/ERR_|Timeout/);
    expect(
      caught.some((url) => url.includes("cortwin-request-audit-probe")),
      `harness must observe the cross-origin attempt; observed=${JSON.stringify(caught)}`
    ).toBe(true);
    await probePage.close();
  });
});
