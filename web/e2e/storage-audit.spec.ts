import { expect, test } from "@playwright/test";
import {
  caseLikeKeys,
  installPreAppCapture,
  interact,
  readPreAppCapture,
  settle,
  storageSnapshot
} from "./support";
import type { StorageSnapshot } from "./support";

const EMPTY_SNAPSHOT: StorageSnapshot = {
  localStorage: {},
  sessionStorage: {},
  cookies: "",
  indexedDb: [],
  cacheApi: []
};

async function expectNothingStored(snapshot: StorageSnapshot, where: string): Promise<void> {
  expect(
    snapshot.localStorage,
    `${where}: localStorage must stay empty (C-15 Storage)`
  ).toEqual({});
  expect(snapshot.sessionStorage, `${where}: sessionStorage must stay empty`).toEqual({});
  expect(snapshot.cookies, `${where}: cookies must stay empty`).toBe("");
  expect(snapshot.indexedDb, `${where}: no IndexedDB databases may be created`).toEqual(
    []
  );
  expect(snapshot.cacheApi, `${where}: no Cache API entries may be created`).toEqual([]);
  expect(caseLikeKeys(snapshot), `${where}: case/patient-like keys found`).toEqual([]);
}

test.describe("C-15 storage audit", () => {
  test("load writes nothing to localStorage / sessionStorage / cookies / IndexedDB / Cache API", async ({
    context,
    page
  }) => {
    await installPreAppCapture(page);
    await page.goto("/", { waitUntil: "load" });
    await settle(page);

    const preApp = await readPreAppCapture(page);
    expect(
      preApp.localStorage,
      "pre-application localStorage must be empty on a fresh context"
    ).toEqual({});
    expect(preApp.sessionStorage).toEqual({});
    expect(preApp.cookies).toBe("");

    const postLoad = await storageSnapshot(page);
    await expectNothingStored(postLoad, "post-load");
    expect(
      postLoad.localStorage,
      "application load must not write localStorage"
    ).toEqual(preApp.localStorage);
    expect(postLoad.sessionStorage).toEqual(preApp.sessionStorage);
    expect(postLoad.cookies).toBe(preApp.cookies);

    expect(await context.cookies(), "no cookies may exist for any origin").toEqual([]);
    expect(postLoad).toEqual(EMPTY_SNAPSHOT);
  });

  test("interactions write nothing to any storage API", async ({ context, page }) => {
    await page.goto("/", { waitUntil: "load" });
    await settle(page);
    const before = await storageSnapshot(page);
    await expectNothingStored(before, "before interaction");

    await interact(page);
    await settle(page);

    const after = await storageSnapshot(page);
    await expectNothingStored(after, "after interaction");
    expect(after, "interactions must not add storage keys").toEqual(before);
    expect(await context.cookies()).toEqual([]);
  });

  test("storage audit detects synthetic case-like writes (mutation check)", async ({
    page
  }) => {
    await page.goto("/", { waitUntil: "load" });
    await page.evaluate(() => {
      window.localStorage.setItem("case_001", JSON.stringify({ mrn: "SYNTHETIC" }));
      window.localStorage.setItem("patient_demo", "SYNTHETIC");
      window.sessionStorage.setItem("evaluation_draft", "SYNTHETIC");
      window.document.cookie = "case_session=SYNTHETIC; path=/";
    });

    const snapshot = await storageSnapshot(page);
    expect(Object.keys(snapshot.localStorage)).toContain("case_001");
    expect(snapshot.localStorage["case_001"]).toContain("SYNTHETIC");
    expect(snapshot.sessionStorage["evaluation_draft"]).toBe("SYNTHETIC");
    expect(snapshot.cookies).toContain("case_session=SYNTHETIC");

    const flagged = caseLikeKeys(snapshot).sort();
    expect(flagged).toEqual(
      ["case_001", "case_session", "evaluation_draft", "patient_demo"].sort()
    );
  });
});
