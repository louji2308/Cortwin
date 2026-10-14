import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { StageToolbar } from "./StageToolbar";

/**
 * StageToolbar — the C-11 §8.1 in-viewer camera controls (explore F.2).
 *
 * These are presentation laws that hold under renderToString: the five camera
 * buttons, the focus toggle's pressed/label state (never colour-only), the 44px
 * target floor the a11y T6 sweep measures, and the neutral geometric
 * vocabulary HD-02 resolved. Callback geometry lives in `viewControls.ts`
 * (pure, Node-tested); there is no Front button because "Reset view" IS the
 * anterior framing.
 */

const noop = (): void => undefined;

function render(focused: boolean): string {
  return renderToString(
    <StageToolbar
      focused={focused}
      onFit={noop}
      onReset={noop}
      onPreset={noop}
      onFocusToggle={noop}
    />
  );
}

describe("StageToolbar", () => {
  it("renders the camera toolbar with five camera buttons and a focus toggle", () => {
    const html = render(false);
    expect(html).toContain('class="ct-stage__toolbar"');
    expect(html).toContain('role="toolbar"');
    expect(html).toContain('aria-label="Stage view controls"');
    expect((html.match(/class="ct-stage__tool"/g) ?? []).length).toBe(6);
  });

  it("labels each camera button with the neutral geometric vocabulary (HD-02)", () => {
    const html = render(false);
    expect(html).toContain('data-testid="stage-fit"');
    expect(html).toContain(">Fit heart</button>");
    expect(html).toContain('data-testid="stage-reset"');
    expect(html).toContain(">Reset view</button>");
    expect(html).toContain('data-testid="stage-back"');
    expect(html).toContain('data-testid="stage-side"');
    expect(html).toContain('data-testid="stage-top"');
  });

  it("does not ship a separate Front button (Reset view is the anterior framing)", () => {
    const html = render(false);
    expect(html).not.toMatch(/>Front</);
    expect(html).not.toContain("data-testid=\"stage-front\"");
  });

  it("exposes the focus toggle's pressed state, not colour alone", () => {
    expect(render(false)).toContain('aria-pressed="false"');
    expect(render(true)).toContain('aria-pressed="true"');
  });

  it("names the focus toggle by its state (Enter when idle, Exit when focused)", () => {
    const idle = render(false);
    expect(idle).toContain('aria-label="Enter focus mode"');
    expect(idle).toContain(">Focus</button>");

    const focused = render(true);
    expect(focused).toContain('aria-label="Exit focus mode"');
    expect(focused).toContain(">Exit focus</button>");
  });

  it("gives every control a real button element with the shared 44px target class", () => {
    const html = render(false);
    expect((html.match(/<button/g) ?? []).length).toBe(6);
    expect((html.match(/type="button"/g) ?? []).length).toBe(6);
  });

  it("never renders a probability, threshold or percentage (INV-C13)", () => {
    const html = render(true);
    expect(html).not.toMatch(/\d+\s*%/);
    expect(html).not.toMatch(/threshold/i);
  });
});
