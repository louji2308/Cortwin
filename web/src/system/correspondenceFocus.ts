import type { CameraPreset, TargetId, ViewRoute } from "../contracts";
import type { VesselIdentity } from "../registry";
import type { CorTwinStore } from "../store";

/**
 * "Focus in scene" (D-22) — the one place a System-view control writes to the
 * C-09 store.
 *
 * The action is derived from the registry's own identity row (C-02 §5.2):
 * nothing here invents a target id, a camera preset or a vessel name, so the
 * button can only ever move the store to an identity the registry published.
 * `focusActionFor` is the pure projection a test can assert against the
 * registry; `focusVesselInScene` applies it through the contract's intents —
 * selection first (C-09 `selection.selectTarget`), then the camera preset the
 * stage already reacts to (C-11 §8.1), then the route change so the promised
 * scene is the one that is shown (C-10 §7.2 view change).
 */

/** What the button will do, resolved before it happens. */
export type FocusAction = {
  route: ViewRoute;
  pane: string | null;
  targetId: TargetId;
  cameraPreset: CameraPreset;
};

/** Derive the action purely from a registry identity row — never from a literal. */
export function focusActionFor(identity: VesselIdentity): FocusAction {
  return {
    route: "explore",
    pane: null,
    targetId: identity.targetId,
    cameraPreset: identity.targetId
  };
}

/** Apply the action through the store's own intents. */
export function focusVesselInScene(store: CorTwinStore, identity: VesselIdentity): void {
  const action = focusActionFor(identity);
  store.intents.selection.selectTarget(action.targetId);
  store.intents.view.setCameraPreset(action.cameraPreset);
  store.intents.view.navigate(action.route, action.pane);
}
