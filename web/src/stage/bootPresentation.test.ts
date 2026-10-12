import { describe, expect, it } from "vitest";
import { decideBootFrame } from "./bootPresentation";

describe("decideBootFrame — prepare cost is not interactive evidence", () => {
  it("gates every frame until the structure is in the scene", () => {
    const decision = decideBootFrame(false, false, false);
    expect(decision).toEqual({
      presented: false,
      gate: true,
      rebaseFlight: false,
      kickNextFrame: false
    });
  });

  it("never rebases a flight that does not exist yet", () => {
    const decision = decideBootFrame(false, false, true);
    expect(decision.rebaseFlight).toBe(false);
    expect(decision.kickNextFrame).toBe(false);
  });

  it("presents on the first structure frame, still gates it, and kicks the loop", () => {
    const decision = decideBootFrame(false, true, false);
    expect(decision).toEqual({
      presented: true,
      gate: true,
      rebaseFlight: false,
      kickNextFrame: true
    });
  });

  it("rebases a pending flight on the presenting frame so the arc is measured post-prepare", () => {
    const decision = decideBootFrame(false, true, true);
    expect(decision).toEqual({
      presented: true,
      gate: true,
      rebaseFlight: true,
      kickNextFrame: true
    });
  });

  it("measures every frame after presentation — slow machines still downgrade", () => {
    const decision = decideBootFrame(true, true, true);
    expect(decision).toEqual({
      presented: true,
      gate: false,
      rebaseFlight: false,
      kickNextFrame: false
    });
  });

  it("keeps measuring after presentation even when the structure briefly leaves", () => {
    const decision = decideBootFrame(true, false, false);
    expect(decision.gate).toBe(false);
  });
});
