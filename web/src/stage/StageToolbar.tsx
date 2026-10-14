import "./stage.css";

/**
 * Stage camera toolbar — the in-viewer view controls (C-11 §8.1 "camera
 * controls"; explore F.2).
 *
 * Laws:
 * - **Pure presentational**: every button invokes a callback the stage
 *   container owns. It reads no store and computes no camera pose — the pose
 *   geometry lives in `viewControls.ts` (pure, Node-tested).
 * - **Neutral geometric vocabulary (HD-02 resolved 2026-10-14)**: the
 *   orientation presets are the geometric captions Front / Back / Side / Top.
 *   "Reset view" IS the Front (anterior) framing, so the toolbar ships five
 *   camera buttons — a separate Front button would duplicate Reset view.
 * - **Fit heart vs Reset view**: Fit frames the whole model from the current
 *   direction; Reset returns to the canonical anterior overview.
 * - **Focus is a toggle**: its pressed state and its accessible name both
 *   reflect `focused`, so the state is never encoded by colour or position
 *   alone.
 * - **Every control is a real button** at the shared 44px minimum target, so
 *   the a11y T6 target sweep sees them and T1's tab budget counts them
 *   predictably.
 */

export type StageToolbarProps = {
  readonly focused: boolean;
  readonly onFit: () => void;
  readonly onReset: () => void;
  readonly onPreset: (preset: "back" | "side" | "top") => void;
  readonly onFocusToggle: () => void;
};

type CameraButton = {
  readonly key: string;
  readonly label: string;
  readonly testid: string;
  readonly press: () => void;
};

export function StageToolbar({
  focused,
  onFit,
  onReset,
  onPreset,
  onFocusToggle
}: StageToolbarProps) {
  const cameraButtons: CameraButton[] = [
    { key: "fit", label: "Fit heart", testid: "stage-fit", press: onFit },
    { key: "reset", label: "Reset view", testid: "stage-reset", press: onReset },
    { key: "back", label: "Back", testid: "stage-back", press: () => onPreset("back") },
    { key: "side", label: "Side", testid: "stage-side", press: () => onPreset("side") },
    { key: "top", label: "Top", testid: "stage-top", press: () => onPreset("top") }
  ];

  return (
    <div className="ct-stage__toolbar" role="toolbar" aria-label="Stage view controls">
      {cameraButtons.map((button) => (
        <button
          key={button.key}
          type="button"
          className="ct-stage__tool"
          data-testid={button.testid}
          onClick={button.press}
        >
          {button.label}
        </button>
      ))}
      <button
        type="button"
        className="ct-stage__tool"
        data-testid="stage-focus"
        aria-pressed={focused}
        aria-label={focused ? "Exit focus mode" : "Enter focus mode"}
        onClick={onFocusToggle}
      >
        {focused ? "Exit focus" : "Focus"}
      </button>
    </div>
  );
}
