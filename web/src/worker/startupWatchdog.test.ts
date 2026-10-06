import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createStartupWatchdog } from "./startupWatchdog";

describe("startup watchdog — the only permitted timeout (C-07 L236)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("fires exactly once after the budget elapses", () => {
    const onTimeout = vi.fn();
    const watchdog = createStartupWatchdog({ timeoutMs: 5000, onTimeout });
    watchdog.arm();

    vi.advanceTimersByTime(4999);
    expect(onTimeout).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onTimeout).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(60_000);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it("cancel() before expiry prevents the timeout entirely", () => {
    const onTimeout = vi.fn();
    const watchdog = createStartupWatchdog({ timeoutMs: 100, onTimeout });
    watchdog.arm();
    watchdog.cancel();
    vi.advanceTimersByTime(10_000);
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it("re-arming replaces the previous timer (single pending timeout)", () => {
    const onTimeout = vi.fn();
    const watchdog = createStartupWatchdog({ timeoutMs: 100, onTimeout });
    watchdog.arm();
    vi.advanceTimersByTime(50);
    watchdog.arm(); // restarted at t=50 → fires at t=150
    vi.advanceTimersByTime(100); // t=150
    expect(onTimeout).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(100);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it("cancel() after firing is harmless", () => {
    const onTimeout = vi.fn();
    const watchdog = createStartupWatchdog({ timeoutMs: 10, onTimeout });
    watchdog.arm();
    vi.advanceTimersByTime(10);
    watchdog.cancel();
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });
});
