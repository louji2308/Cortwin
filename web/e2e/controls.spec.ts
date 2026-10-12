import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { expectSafetyBanner } from "./golden-helpers";
import { settle } from "./support";

/**
 * P6-E2E controls spec — the DEAD-CONTROL SWEEP of `web/src/explore/**` and
 * `web/src/panels/**`, verified live in a real browser against the production
 * build (`vite preview`), with NO route/network mocking.
 *
 * Every interactive control in the sweep area is either asserted here or in a
 * named sibling suite; this spec closes the gaps the sweep found where a
 * control was wired at the binding level (unit tests + source scans) but never
 * ACTUATED end-to-end:
 *
 *   1. Reset case (ExploreView profile head) — click must restore the default
 *      case and clear the one-way custom-subset warning (Contracts 8.4 L389:
 *      "stays visible until case select or reset").
 *   2. Build Up (EvidenceRail) — click must play the stage ladder against real
 *      settled evaluations (never a timer, Final_demo 4.5 / Contracts 8.4),
 *      reach `done`, disable itself, and restart when a chip is pressed.
 *   3. Hover channel (vessel card ↔ Inspector target row) — one store channel
 *      must highlight BOTH representations, for pointer AND keyboard focus;
 *      arrow keys cycle the registry's vessels (wrap included).
 *   4. Inspector Evidence tab → "Open validation" — must land on Trust →
 *      Performance with the safety banner intact (model.ts onOpenValidation).
 *   5. Depth-2 focus editor (measurements row → edit) — Cancel must revert a
 *      draft without dispatching, Apply must commit through the one frozen
 *      edit path (revision + Profile shows the same value), Close must clear.
 *
 * Hard assertions: real inference settles each step (data-eval-status=ready),
 * banner on every stop (INV-12), zero console/page errors, no hardcoded
 * probability — numbers are never typed here, only presence/attribute state.
 */

function trackErrors(page: Page): { consoleErrors: string[]; pageErrors: string[] } {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  return { consoleErrors, pageErrors };
}

/** Boot "/" and wait for the Explore workspace's FIRST settled evaluation. */
async function bootExplore(page: Page): Promise<void> {
  await page.goto("/", { waitUntil: "load" });
  const shell = page.locator('[data-testid="shell-root"]');
  await expect(shell).toHaveAttribute("data-boot-phase", "ready", { timeout: 30_000 });
  await expect(shell).toHaveAttribute("data-view", "explore");
  const explore = page.locator('[data-testid="explore"]');
  await expect(explore).toHaveAttribute("data-eval-status", "ready", { timeout: 30_000 });
  await expect(
    page.locator('[data-testid="headline-readout"] [role="group"][data-target-id="CAD"]'),
    "the first real readout must be on screen"
  ).toBeVisible({ timeout: 20_000 });
  await settle(page, 700);
}

test.describe("P6-E2E controls (dead-control sweep, live)", () => {
  test("Reset case restores the default case and clears the custom-subset warning (L389)", async ({
    page
  }) => {
    test.setTimeout(180_000);
    const { consoleErrors, pageErrors } = trackErrors(page);
    await bootExplore(page);

    const form = page.locator('[data-testid="profile-form"]');
    const explore = page.locator('[data-testid="explore"]');
    const warning = page.locator('[data-testid="custom-subset-warning"]');
    const ecgSection = page.locator('section[data-modality-id="ecg"]');

    await expect(warning, "the default case starts on the validated ladder").toHaveCount(0);
    await expect(ecgSection).toHaveAttribute("data-provided", "true");
    const revisionBoot = Number(await form.getAttribute("data-revision"));

    // Withhold ECG from the Profile: off-ladder subset → the one-way L389 flag.
    await ecgSection.locator('input[data-role="modality-provide"]').check();
    await expect
      .poll(() => form.getAttribute("data-revision").then((value) => Number(value)), {
        message: "withholding a modality must increment the case revision (C-09)",
        timeout: 10_000
      })
      .toBeGreaterThan(revisionBoot);
    await expect(ecgSection).toHaveAttribute("data-provided", "false");
    await expect(explore).toHaveAttribute("data-eval-status", "ready", { timeout: 20_000 });
    await expect(warning, "an off-ladder subset must surface the L389 warning").toBeVisible();
    const revisionWithhold = Number(await form.getAttribute("data-revision"));

    // THE CONTROL UNDER TEST: Reset case.
    await page.locator(".ct-explore__reset").click();
    await expect
      .poll(() => form.getAttribute("data-revision").then((value) => Number(value)), {
        message: "Reset case must increment the case revision (C-09)",
        timeout: 10_000
      })
      .toBeGreaterThan(revisionWithhold);
    await expect(ecgSection, "reset restores the default case's observations").toHaveAttribute(
      "data-provided",
      "true",
      { timeout: 20_000 }
    );
    await expect(
      page.locator('section[data-modality-id="ecg"] input[data-role="modality-provide"]'),
      "reset must leave the not-provided toggle off again"
    ).not.toBeChecked();
    await expect(
      warning,
      "reset is the contract's clearing point for the custom-subset flag (L389)"
    ).toHaveCount(0);
    await expect(explore, "the reset case must settle to a real evaluation").toHaveAttribute(
      "data-eval-status",
      "ready",
      { timeout: 20_000 }
    );
    await expectSafetyBanner(page, "after Reset case");
    console.log(
      `[controls] reset: revision ${revisionBoot} -> ${revisionWithhold} -> ` +
        `${await form.getAttribute("data-revision")} warningCleared=true`
    );

    expect(consoleErrors, "zero console errors across the reset interaction").toEqual([]);
    expect(pageErrors, "zero page errors across the reset interaction").toEqual([]);
  });

  test("Build Up plays the stage ladder against real evaluations, reaches done, restarts on a chip", async ({
    page
  }) => {
    test.setTimeout(180_000);
    const { consoleErrors, pageErrors } = trackErrors(page);
    await bootExplore(page);

    const form = page.locator('[data-testid="profile-form"]');
    const explore = page.locator('[data-testid="explore"]');
    const buildUp = page.locator('[data-testid="build-up-button"]');
    const chip = (id: string): ReturnType<Page["locator"]> =>
      page.locator(`[data-testid="stage-chip-${id}"]`);

    await expect(buildUp).toHaveCount(1);
    await expect(buildUp, "the ladder starts idle").toHaveAttribute("data-state", "idle");
    await expect(buildUp).toBeEnabled();
    const revisionStart = Number(await form.getAttribute("data-revision"));

    // THE CONTROL UNDER TEST: Build Up. Each advance rides one settled real
    // evaluation + the display tween — never a timer (Contracts 8.4 L388).
    await buildUp.click();
    await expect(buildUp, "the machine must enter playing").toHaveAttribute(
      "data-state",
      "playing"
    );
    await expect(buildUp, "playing marks the control busy").toHaveAttribute("aria-busy", "true");

    // The last stage (echo) must come into step before the machine reports done.
    await expect(chip("echo"), "the ladder must advance to its final stage").toHaveAttribute(
      "aria-current",
      "step",
      { timeout: 60_000 }
    );
    await expect(buildUp, "the run must complete").toHaveAttribute("data-state", "done", {
      timeout: 30_000
    });
    await expect(buildUp, "done disables the control until a chip restarts it").toBeDisabled();
    await expect(page.locator('[data-testid="build-up-status"]')).toBeVisible();
    await expect(explore, "every ladder step must settle a real evaluation").toHaveAttribute(
      "data-eval-status",
      "ready",
      { timeout: 20_000 }
    );
    const revisionDone = Number(await form.getAttribute("data-revision"));
    expect(revisionDone, "the ladder must have re-masked the case (revision climbs)").toBeGreaterThan(
      revisionStart
    );

    // A chip press takes over from done and restarts the machine at idle.
    await chip("history").click();
    await expect(buildUp, "a chip press unlocks a finished run").toHaveAttribute(
      "data-state",
      "idle"
    );
    await expect(chip("history")).toHaveAttribute("aria-current", "step");
    await expect(buildUp).toBeEnabled();
    await expect(explore).toHaveAttribute("data-eval-status", "ready", { timeout: 20_000 });
    await expectSafetyBanner(page, "after Build Up ladder");
    console.log(
      `[controls] build-up: revision ${revisionStart} -> ${revisionDone} finalStage=echo restart=idle`
    );

    expect(consoleErrors, "zero console errors across the Build Up run").toEqual([]);
    expect(pageErrors, "zero page errors across the Build Up run").toEqual([]);
  });

  test("one hover channel highlights the vessel card AND the Inspector target row (pointer + keyboard)", async ({
    page
  }) => {
    test.setTimeout(180_000);
    const { consoleErrors, pageErrors } = trackErrors(page);
    await bootExplore(page);

    const inspector = page.locator("section.ct-ins");
    // The Inspector opens at target depth (default target); the target rows
    // live at case depth — walk up through the crumb, as the judge does.
    await page.locator(".ct-ins-crumb button").click();
    await expect(inspector).toHaveAttribute("data-inspector-depth", "case");

    const card = page.locator('[aria-label="Vessel probabilities"] > button[data-target-id="LCX"]');
    const row = page.locator('li.ct-ins-target[data-target-id="LCX"]');
    await expect(card, "the LCX vessel card must render").toHaveCount(1);
    await expect(row, "the Inspector must list the LCX target row").toHaveCount(1);
    await expect(card).toHaveAttribute("data-hovered", "false");
    await expect(row).toHaveAttribute("data-hovered", "no");

    // Pointer hover → BOTH representations light up from the one store channel.
    await card.hover();
    await expect(card, "the hovered card must highlight").toHaveAttribute("data-hovered", "true");
    await expect(card).toHaveAttribute("aria-pressed", "false"); // hover is not selection
    await expect(row, "the Inspector row must follow the same channel").toHaveAttribute(
      "data-hovered",
      "yes"
    );

    // Pointer leaves → both clear (no sticky hover).
    await page.locator('[data-testid="headline-readout"]').hover();
    await expect(card).toHaveAttribute("data-hovered", "false");
    await expect(row).toHaveAttribute("data-hovered", "no");

    // Keyboard parity: focus routes through the same channel.
    await card.focus();
    await expect(card, "focus must highlight through the same channel").toHaveAttribute(
      "data-hovered",
      "true"
    );
    await expect(row).toHaveAttribute("data-hovered", "yes");
    await page.keyboard.press("Tab"); // focus moves to the next vessel card
    await expect(card, "blur must clear the hover").toHaveAttribute("data-hovered", "false");
    await expect(row).toHaveAttribute("data-hovered", "no");

    // The Inspector row's OWN pointer handlers ride the same channel: hovering
    // the row's Inspect button must light up the vessel card.
    const rcaRowButton = page.locator('li.ct-ins-target[data-target-id="RCA"] button');
    await expect(rcaRowButton, "the RCA row's select button must render").toHaveCount(1);
    await rcaRowButton.hover();
    await expect(
      page.locator('[aria-label="Vessel probabilities"] > button[data-target-id="RCA"]'),
      "the row's pointer enter must highlight the card through the one channel"
    ).toHaveAttribute("data-hovered", "true");
    await expect(page.locator('li.ct-ins-target[data-target-id="RCA"]')).toHaveAttribute(
      "data-hovered",
      "yes"
    );
    await page.locator('[data-testid="headline-readout"]').hover();
    await expect(
      page.locator('[aria-label="Vessel probabilities"] > button[data-target-id="RCA"]')
    ).toHaveAttribute("data-hovered", "false");

    // Arrow keys cycle the registry's vessels from the still-default selection
    // (the handler's own path: CAD falls to the first vessel, then wraps).
    const pressed = (id: string): ReturnType<Page["locator"]> =>
      page.locator(`[aria-label="Vessel probabilities"] > button[data-target-id="${id}"]`);
    await pressed("LAD").focus();
    await page.keyboard.press("ArrowRight");
    await expect(pressed("LAD"), "CAD falls to the first vessel").toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await page.keyboard.press("ArrowRight");
    await expect(pressed("LCX")).toHaveAttribute("aria-pressed", "true");
    await expect(pressed("LAD")).toHaveAttribute("aria-pressed", "false");
    await page.keyboard.press("ArrowRight");
    await expect(pressed("RCA")).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("ArrowRight");
    await expect(pressed("LAD"), "the cycle must wrap to the first vessel").toHaveAttribute(
      "aria-pressed",
      "true"
    );

    // Selection still rides the click path, untouched by hover.
    await card.click();
    await expect(card).toHaveAttribute("aria-pressed", "true");
    await expect(card).toHaveAttribute("data-selected", "true");

    // The Inspector's own select button (case depth) drives the same intent:
    // walk back through the crumb, press "Inspect RCA", the card selects.
    await page.locator(".ct-ins-crumb button").click();
    await expect(inspector).toHaveAttribute("data-inspector-depth", "case");
    await page.locator('li.ct-ins-target[data-target-id="RCA"] button').click();
    await expect(pressed("RCA"), "the row's select button must select the vessel").toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await expect(inspector).toHaveAttribute("data-inspector-depth", "target");
    await expect(inspector.locator('[aria-current="page"]')).toHaveText("RCA");

    await expectSafetyBanner(page, "after hover cross-highlight");
    console.log(
      `[controls] hover: card+row highlighted for pointer, focus and row-button; ` +
        `arrows cycled LAD→LCX→RCA→LAD; row button selected RCA`
    );

    expect(consoleErrors, "zero console errors across the hover interaction").toEqual([]);
    expect(pageErrors, "zero page errors across the hover interaction").toEqual([]);
  });

  test("Inspector Evidence tab renders artifact stats and Open validation lands on Trust performance", async ({
    page
  }) => {
    test.setTimeout(180_000);
    const { consoleErrors, pageErrors } = trackErrors(page);
    await bootExplore(page);

    const inspector = page.locator("section.ct-ins");
    await expect(inspector, "boot lands on the default target").toHaveAttribute(
      "data-inspector-depth",
      "target"
    );

    // THE CONTROL UNDER TEST: the Evidence tab (the sweep's third inspector tab).
    await page.locator("#ct-ins-tab-evidence").click();
    const evidence = page.locator('[data-testid="inspector-evidence"]');
    await expect(evidence, "the Evidence panel must open").toBeVisible();
    await expect(page.locator('[data-testid="evidence-roc-auc"]')).not.toBeEmpty();
    expect(
      await page.locator('[data-testid="evidence-roc-auc"]').textContent(),
      "the metric cell must carry a rendered value (never a typed literal — presence only)"
    ).toMatch(/\d/);
    await expect(page.locator('[data-testid="evidence-tier"]')).toBeVisible();
    await expect(
      page.locator('[data-testid="evidence-rationale"]'),
      "the tier rationale must be present"
    ).not.toBeEmpty();

    // THE CONTROL UNDER TEST: Open validation → Trust / Performance.
    const openValidation = page.locator('[data-testid="evidence-open-validation"]');
    await expect(openValidation).toBeVisible();
    await openValidation.click();
    const shell = page.locator('[data-testid="shell-root"]');
    await expect(shell, "Open validation must navigate to Trust").toHaveAttribute(
      "data-view",
      "trust"
    );
    await expect(
      page.locator('[data-testid="trust-view"]'),
      "…on the Performance pane"
    ).toHaveAttribute("data-pane", "performance");
    await expectSafetyBanner(page, "after Open validation");
    console.log(`[controls] evidence tab → open validation → trust/performance`);

    expect(consoleErrors, "zero console errors across the Evidence tab journey").toEqual([]);
    expect(pageErrors, "zero page errors across the Evidence tab journey").toEqual([]);
  });

  test("Inspector depth-2 focus editor: Cancel reverts the draft, Apply commits through the one intent path", async ({
    page
  }) => {
    test.setTimeout(180_000);
    const { consoleErrors, pageErrors } = trackErrors(page);
    await bootExplore(page);

    const form = page.locator('[data-testid="profile-form"]');
    const explore = page.locator('[data-testid="explore"]');

    // Open the focus editor: Measurements tab → click the Age row's select button.
    await page.locator("#ct-ins-tab-measurements").click();
    await expect(page.locator('[data-view="measurements"]')).toBeVisible();
    const ageRowButton = page.locator('tr[data-feature-id="Age"] button');
    await expect(ageRowButton, "the Age measurement row must be selectable").toHaveCount(1);
    await ageRowButton.click();

    const focusSection = page.locator('section[data-feature-focus="Age"]');
    await expect(focusSection, "the depth-2 focus editor must open").toBeVisible();
    const focusInput = focusSection.locator("input.ct-ins-input");
    await expect(focusInput).toBeVisible();
    const committed = await focusInput.inputValue();
    expect(committed.length, "the editor must start from the committed value").toBeGreaterThan(0);
    const revisionCommitted = Number(await form.getAttribute("data-revision"));

    // CANCEL: a draft edit is local — cancel reverts it and dispatches nothing.
    const draft = committed === "45" ? "46" : "45";
    await focusInput.fill(draft);
    await expect(focusInput).toHaveValue(draft);
    await focusSection.getByRole("button", { name: "Cancel" }).click();
    await expect(focusInput, "cancel must revert to the committed value").toHaveValue(committed);
    expect(
      Number(await form.getAttribute("data-revision")),
      "cancel must never dispatch an edit (C-09: no phantom revision)"
    ).toBe(revisionCommitted);
    await expect(focusSection, "cancel keeps the editor open on the committed value").toBeVisible();

    // APPLY: commit through the frozen edit path → revision, real re-evaluation,
    // and the SAME value on screen in the Profile (one intent path, C-09/C-08).
    const applied = committed === "86" ? "30" : "86";
    await focusInput.fill(applied);
    await focusSection.getByRole("button", { name: "Apply" }).click();
    await expect
      .poll(() => form.getAttribute("data-revision").then((value) => Number(value)), {
        message: "Apply must dispatch the edit and increment the case revision (C-09)",
        timeout: 10_000
      })
      .toBeGreaterThan(revisionCommitted);
    await expect(explore, "the applied edit must settle a real evaluation").toHaveAttribute(
      "data-eval-status",
      "ready",
      { timeout: 20_000 }
    );
    await expect(
      page.locator('[data-feature-id="Age"] input[data-role="value-input"]'),
      "the Profile must show the value the focus editor applied (one intent path)"
    ).toHaveValue(applied);

    // CLOSE: the focus head's Close clears the depth-2 editor.
    await focusSection.getByRole("button", { name: "Close" }).click();
    await expect(focusSection, "close must clear the focus editor").toHaveCount(0);
    await expectSafetyBanner(page, "after the focus editor journey");
    console.log(
      `[controls] focus editor: cancel reverted ${draft} (revision held ${revisionCommitted}); ` +
        `apply dispatched ${applied} (revision ${await form.getAttribute("data-revision")})`
    );

    expect(consoleErrors, "zero console errors across the focus editor journey").toEqual([]);
    expect(pageErrors, "zero page errors across the focus editor journey").toEqual([]);
  });
});
