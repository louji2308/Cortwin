import { scaleLinear } from "d3-scale";
import { interpolateCividis } from "d3-scale-chromatic";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { Color } from "three";
import { describe, expect, it } from "vitest";
import { create } from "zustand";
import { App } from "./App";

describe("foundation scaffold", () => {
  it("renders the scaffold heading", () => {
    const html = renderToString(createElement(App));
    expect(html).toContain("<h1");
    expect(html).toContain("CorTwin — foundation scaffold");
  });

  it("resolves the pinned chart, colour and state stack", () => {
    const scale = scaleLinear().domain([0, 1]).range([0, 100]);
    expect(scale(0.5)).toBe(50);
    expect(interpolateCividis(0)).toMatch(/^rgb\(/);
    expect(new Color(1, 0, 0).r).toBe(1);
    const useCounter = create<{ count: number; inc: () => void }>((set) => ({
      count: 0,
      inc: () => set((state) => ({ count: state.count + 1 }))
    }));
    expect(useCounter.getState().count).toBe(0);
    useCounter.getState().inc();
    expect(useCounter.getState().count).toBe(1);
  });

  it("resolves the pinned react-three-fiber and drei modules", async () => {
    const fiber = await import("@react-three/fiber");
    expect(typeof fiber.Canvas).toBe("function");
    const drei = await import("@react-three/drei");
    expect(drei).toBeTruthy();
  }, 60_000);
});
