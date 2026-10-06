/**
 * C-07 L236 startup watchdog — the ONLY timeout permitted anywhere in the
 * compute boundary ("there is no normative per-request timeout; a startup
 * watchdog MAY trigger worker degradation but MUST NOT alter numerical
 * results").
 *
 * Semantics: `arm()` (re)starts a single timer; `cancel()` clears it; the
 * timer fires `onTimeout` at most once per arm. It measures only the
 * main→worker init→ready handshake (Architecture FM-02 "Init timeout").
 */

export type StartupWatchdogOptions = {
  timeoutMs: number;
  onTimeout: () => void;
};

export type StartupWatchdog = {
  arm: () => void;
  cancel: () => void;
};

export function createStartupWatchdog(options: StartupWatchdogOptions): StartupWatchdog {
  let handle: ReturnType<typeof setTimeout> | null = null;

  const cancel = (): void => {
    if (handle !== null) {
      clearTimeout(handle);
      handle = null;
    }
  };

  const arm = (): void => {
    cancel();
    handle = setTimeout(() => {
      handle = null;
      options.onTimeout();
    }, options.timeoutMs);
  };

  return { arm, cancel };
}
