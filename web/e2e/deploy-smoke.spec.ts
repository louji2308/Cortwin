import { expect, test } from "@playwright/test";
import { interact, settle } from "./support";

interface FailedResponse {
  url: string;
  status: number;
}

interface FailedRequest {
  url: string;
  failure: string;
}

test.describe("VC-15 deployment smoke", () => {
  test("production preview: zero console errors, zero page errors, all responses 2xx", async ({
    page
  }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const responses: FailedResponse[] = [];
    const failedRequests: FailedRequest[] = [];

    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(message.text());
      }
    });
    page.on("pageerror", (error) => {
      pageErrors.push(String(error));
    });
    page.on("response", (response) => {
      responses.push({ url: response.url(), status: response.status() });
    });
    page.on("requestfailed", (request) => {
      failedRequests.push({
        url: request.url(),
        failure: request.failure()?.errorText ?? "unknown"
      });
    });

    const navigation = await page.goto("/", { waitUntil: "load" });
    expect(navigation, "navigation must return a response").toBeTruthy();
    expect(navigation?.status(), "document must load with HTTP 200").toBe(200);

    await settle(page);
    await interact(page);
    await settle(page);

    await test.info().attach("deploy-smoke", {
      body: JSON.stringify(
        { responses, failedRequests, consoleErrors, pageErrors },
        null,
        2
      ),
      contentType: "application/json"
    });

    const notOk = responses.filter(
      (entry) => entry.status < 200 || entry.status >= 300
    );
    console.log(
      `[deploy-smoke] responses=${responses.length} non2xx=${notOk.length} failed=${failedRequests.length} consoleErrors=${consoleErrors.length} pageErrors=${pageErrors.length}`
    );
    for (const entry of responses) {
      console.log(`[deploy-smoke]   ${entry.status} ${entry.url}`);
    }

    expect(pageErrors, "zero unhandled page errors").toEqual([]);
    expect(consoleErrors, "zero console errors").toEqual([]);
    expect(notOk, "every response must be 2xx").toEqual([]);
    expect(failedRequests, "zero failed network requests").toEqual([]);

    await expect(page, "document title").toHaveTitle(/CorTwin/i);
    const heading = page.locator("h1");
    await expect(heading, "exactly one primary heading").toHaveCount(1);
    await expect(heading).toBeVisible();
    expect((await heading.innerText()).trim().length).toBeGreaterThan(0);
    await expect(page.locator("#root")).toBeAttached();
  });
});
