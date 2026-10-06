# tools/qa — CorTwin P8 QA harnesses

Owner: unit **P68-A5** (claims: `tools/qa/**`, `web/e2e/**`, `web/playwright.config.ts`,
`web/index.html` CSP meta only, `web/package.json` scripts only).
Contracts consumed: **C-15** (Security/Privacy/Requests), **C-16** (budgets), **VC-13**
(request audit), **VC-15** (deployment smoke). Phase: P8 preparation (step 10, 11, 13, 14, 18, 19).

---

## 1. Run the audits end-to-end

The suite **never builds automatically** — it audits a *production* build
(`npm run build` + `npm run preview`). `playwright.config.ts` fails fast with an explicit
message if `web/dist/index.html` is missing **or stale** (built before the CSP meta landed).

```powershell
# from the repository root
cd web
npm run build        # required first — the ONLY command that produces dist/
npm run test:e2e     # = playwright test (chromium, headless, preview on :4173)

# supporting checks
npm run typecheck    # tsc over src/ (e2e is checked separately, see §5)
npx vitest run       # unit tests (vitest include is src/** only — e2e is never picked up)
```

Server lifecycle: Playwright starts `npm run preview -- --port 4173 --strictPort`
itself and reuses an already-running server (`reuseExistingServer: true`). Note
`vite preview` binds `localhost` (IPv6 `::1`) on this host — `http://127.0.0.1:4173`
is refused, which is why `baseURL` is `http://localhost:4173`.

## 2. What each audit proves

| Spec | Contract / gate | What it proves |
|---|---|---|
| `e2e/request-audit.spec.ts` | C-15 Network · **VC-13** | Every request during load **and** interaction is same-origin (or `data:`/`blob:`); method is GET/HEAD only; **zero** websocket / beacon (`ping`) / eventsource / analytics-class traffic; zero `WebSocket` connections. Mutation check: the harness *does* observe a deliberately cross-origin navigation attempt and the URL classifier rejects foreign origins. |
| `e2e/storage-audit.spec.ts` | C-15 Storage | Pre-application snapshot (captured by an init script that runs before any app script) and post-load snapshot are both empty; after interactions nothing was written to `localStorage`, `sessionStorage`, cookies, IndexedDB or the Cache API; `context.cookies()` empty. Mutation check: synthetic `case_*` / `patient_*` / `evaluation_*` writes are detected and flagged. |
| `e2e/csp.spec.ts` | C-15 CSP (Contracts.md L448) | The built page carries exactly one CSP meta tag whose content matches the contract string **byte for byte**, and **zero** `securitypolicyviolation` events fire from load through interaction (collector installed by init script, so parse-time violations are caught too). Mutation check: a deliberately injected inline script is blocked *and* recorded, proving the collector works. |
| `e2e/deploy-smoke.spec.ts` | **VC-15** deployment smoke | Production preview loads with zero console errors, zero unhandled page errors, zero failed requests, every response 2xx, title + `h1` present, `#root` mounted. |

Shared helpers live in `e2e/support.ts` (contract CSP constant, storage snapshots,
origin classifier, forward-compatible interaction sweep).

## 3. Artifacts (evidence)

| Path | Produced by | Content |
|---|---|---|
| `tools/qa/artifacts/playwright-results.json` | JSON reporter | machine-readable result of the last `npm run test:e2e` (`stats`: expected/unexpected/skipped/flaky) |
| `tools/qa/artifacts/test-results/*/` | test attachments | `request-audit` (full observed request list), `csp-violations`, `deploy-smoke` (responses/errors) + traces/screenshots **on failure only** |
| `tools/qa/artifacts/dev-csp-probe.json` | `dev-csp-probe.mjs` | measured dev-server CSP behaviour (see §4) |
| `tools/qa/artifacts/dev-served-index.html` | probe run | exact HTML `npm run dev` serves (shows injection order) |
| `tools/qa/artifacts/dev-server.log` | probe run | dev server log for the same run |
| `tools/qa/perf_protocol.md` | this unit | C-16 B-01…B-12 measurement protocol, TARGET/MEASURED labels |

Generated artifacts are rewritten by every run — never hand-edit them.

## 4. CSP: production clean, and the DEV caveat as *measured*

Contract CSP (verbatim, `Project/Contracts.md` L448) lives in `web/index.html`, so it is
served in dev too.

**Production (`npm run build` + preview) — clean, verified:** `csp.spec.ts` records
**0 violations** across load + interaction, and `deploy-smoke.spec.ts` records 0 console
errors. This is the build the judge sees.

**Dev (`npm run dev`) — measured with `dev-csp-probe.mjs`:**

```powershell
cd web
npm run dev -- --port 5199 --strictPort     # in one shell
node ../tools/qa/dev-csp-probe.mjs http://localhost:5199/   # in another
```

Measured result (2026-10-04, Vite 8.3.2 + `@vitejs/plugin-react` 6.1.1, see
`artifacts/dev-csp-probe.json`):

- **0 load-time violations, app renders, 0 page errors** — dev is *not* broken today.
- Mechanism: Vite injects the inline react-refresh preamble as
  `<script type="module">import { injectIntoGlobalHook } from "/@react-refresh"; …</script>`
  **before** the `<meta http-equiv="Content-Security-Policy">` tag (see
  `artifacts/dev-served-index.html`). A meta CSP applies from the point it is parsed, so
  that preamble is outside the policy's reach — it executes, dev/HMR work.
- **The CSP is nevertheless active in dev**: the probe's mutation injection of an inline
  script *after* the meta produced 1 `script-src-elem` violation (`blockedURI: "inline"`),
  the script did not execute, and Chromium logged the expected console error.

**Fragility warning for future sessions:** the dev behaviour above depends on Vite
injecting the preamble *ahead of* the meta tag. If anyone moves the CSP meta to the very
top of `<head>` (which is otherwise best practice) — or Vite changes injection order —
the react-refresh preamble will be blocked and `npm run dev` will stop rendering while
`npm run preview` stays clean. Contract CSP may **not** be weakened to fix that; the
legitimate fix is a dev-only `transformIndexHtml` step in `web/vite.config.ts` (not owned
by this unit). Until then: **verify the product through `npm run build` + `npm run
preview` (or the e2e suite), which is exactly the artefact under test.**

## 5. Type-checking the e2e sources

`web/tsconfig.json` only includes `src/ + vite/vitest configs`, so `npm run typecheck`
does not cover `web/e2e/**`. This unit type-checks them explicitly (strict mode):

```powershell
cd web
npx tsc --noEmit --ignoreConfig --strict --skipLibCheck --target ES2022 --module ESNext `
  --moduleResolution bundler --lib ES2022,DOM,DOM.Iterable `
  e2e/support.ts e2e/csp.spec.ts e2e/request-audit.spec.ts e2e/storage-audit.spec.ts `
  e2e/deploy-smoke.spec.ts playwright.config.ts ../tools/qa/tscheck/ambient.d.ts
```

`tscheck/ambient.d.ts` supplies minimal `node:fs`/`node:path`/`node:url` declarations —
`@types/node` is not installed because adding dependencies is outside this unit's
authority (Tech_Stack §27 lock).

## 6. Out of scope / handoffs

- **CI wiring is another session's area** (`.github/**` is untouched here). Hand the CI
  job: `cd web && npm ci && npm run build && npm run test:e2e`.
- `web/test-results/` is not used; Playwright output is redirected to
  `tools/qa/artifacts/test-results`. Adding `tools/qa/artifacts/` to `.gitignore`
  (generated evidence) is a request to the `.gitignore` owner — this unit does not edit it.
- The audits are intentionally forward-compatible: as the real app grows, the interaction
  sweep exercises whatever buttons/links/tabs exist, and the storage rule stays
  "nothing persistent at all" until a privacy review says otherwise.
