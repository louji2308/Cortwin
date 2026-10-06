# CorTwin release checklist (P8-DEPLOY → submission)

Owner: unit **P8-DEPLOY** (claims `.github/workflows/**`, `web/vite.config.ts` base/path only,
`web/package.json` scripts only, `web/e2e/offline.spec.ts`, `tools/qa/release-checklist.md`).
Consumes **C-01/C-15**, **VC-12/VC-13/VC-15**, AGENTS §9. This is the runbook a human or the
orchestrator executes — never an agent's own push. **Agents never run `gh`, `git push`, or any
command that contacts the remote**; the orchestrator deploys on explicit instruction.

---

## 0. Date gates (operational, not aspirational)

| Date (2026) | Must be true |
|---|---|
| **Oct 7–9** | P0 UI/3D live URL (first `deploy.yml` run) |
| **Oct 12** | Feature freeze: no new scope, only hardening; README + model card done |
| **Oct 13** | 6-page document + 3–10 min video recorded |
| **Oct 14 (evening IST)** | Fresh-browser smoke below, then submit |
| **Oct 15 00:15 IST** | Official deadline — *not* the operational target |
| **Oct 21** | Live link must still work (no trial-period hosting) |

## 1. Pre-deploy: everything green locally

Run from the repository root unless noted. **All must pass before any deploy is attempted.**

```powershell
# 1. static + pipeline gates
python -m ruff check .
python -m pytest -q                    # needs data/raw/…csv (see §6 dataset gate)

# 2. web gates
cd web
npm ci                                 # clean, lockfile-exact
npm run typecheck                      # tsc -p tsconfig.json (src/ + vite config)
npm run build                          # tsc + vite build, base "./" → dist/
npm run verify:dist                    # C-01 inline manifest + C-15 CSP byte-exact
npx vitest run                         # parity, domain, store, registry, view-model, copy
npm run test:e2e                       # golden + offline + request/storage/CSP/deploy smoke
cd ..

# 3. workflow syntax (PyYAML 6.x)
python -c "import yaml;yaml.safe_load(open('.github/workflows/ci.yml',encoding='utf-8'));yaml.safe_load(open('.github/workflows/deploy.yml',encoding='utf-8'));print('workflows OK')"

# 4. nothing accidental staged/committed
git status --porcelain
```

Offline proof required by Implementation_Plan step 19 runs inside `npm run test:e2e`
(`e2e/offline.spec.ts`): after boot the network is cut (`context.setOffline(true)`) and the demo
path still completes — default truth → edit → new worker inference → vessel select → explanation →
safety banner — with a context-wide blocker recording **0 cross-origin attempts**,
**0 failed requests after the cut**, **0 console/page errors**, **0 service workers, 0 caches**.

### Constraint conflict (recorded, never "solved")

A *cold-start reload with the network cut* would need a service worker + Cache API pre-cache, and
**C-15 forbids both** (`e2e/storage-audit.spec.ts`: zero writes, zero caches). Offline is therefore
proven at **session** level: load once online, then work fully offline. Do **not** add a service
worker to make the checklist item green — that would violate C-15 (AG-10).

## 2. One-time repository settings (human, browser)

1. Repo **Settings → Pages → Build and deployment → Source: GitHub Actions** (not "Deploy from a
   branch"). If this is not set, `deploy.yml`'s `upload-pages-artifact` step fails loudly.
2. Repo **Settings → Pages → Custom domain**: none required. The project site serves at
   `https://<owner>.github.io/<repo>/`.
3. Branch protection on `main` optional; CI runs on `push` + `pull_request`.
4. **Never** enable "Require approval for all outside collaborators" in a way that blocks the
   orchestrator's own workflow runs.

## 3. Deploy (orchestrator only)

```text
Actions → "Deploy CorTwin to GitHub Pages" → Run workflow → branch: main
```

`deploy.yml` is **`workflow_dispatch` only** by design (deliberate, recorded in Progress.md §4).
Post-freeze, if automatic deploys on push are wanted, uncomment the `push: branches: [main]`
trigger block at the top of `deploy.yml` — that is a freeze-time change, not a mid-build one.

The workflow rebuilds from source (`npm ci` + `npm run build` + `verify:dist`) and deploys the
**verified** `web/dist`, so what ships is always reproducible from `main`. Job summary shows the
deployed URL (`environment: github-pages`).

## 4. Fresh-browser smoke (after every deploy) — the judge's path

Open the URL in a **fresh private/incognito window** (no cache, no storage):

1. Page loads ≤ a few seconds, no console errors (DevTools → Console must be empty).
2. Explore is **pre-populated**: default case, headline probability with threshold + decision +
   tier, three vessel cards coloured by probability. **Zero clicks to first value.**
3. Vessel card click → inspector shows LAD (or clicked target), **Why** view with attribution
   rows summing to the margin; measurements table has values + direction.
4. Edit a feature (e.g. Age) → number, bar, 3D colour and waterfall all update together; the
   safety banner is visible on **every** route.
5. Trust and System panes open with real evidence (no typed/hardcoded numbers anywhere).
6. Browser back/forward behave; deep links land somewhere valid with a notice.
7. Network tab: **only same-origin GETs**, zero third-party, zero websocket/beacon.
8. Application tab: **no cookies, no localStorage, no Cache Storage entries.**
9. Resize to 1366×768 and to a narrow window; keyboard-only pass (Tab/arrow) works; screenshot.
10. `assets/ATTRIBUTION.md` is reachable from the repo (HD-07 licensing evidence) and README
    contains the AI-use disclosure + safety disclaimer.

Record screenshots into the evidence index (§7).

## 5. Mirror + rollback

- **Mirror:** Cloudflare Pages (or any static host) pointed at the same `web/dist` artifact —
  identical build command `cd web && npm ci && npm run build`, output `web/dist`. Verify the same
  smoke on the mirror URL.
- **Rollback:** GitHub Pages redeploy is per-deploy — Actions → pick the last green
  `deploy.yml` run → **Re-run all jobs**, or revert the offending commit on `main` and run the
  workflow again. No database, no migrations, no cached state anywhere.
- **Banned:** any hosting on a trial that lapses before **Oct 21**.

## 6. CI notes (`.github/workflows/ci.yml`)

- Chain order (each named after the gate it proves): checkout → Python 3.12 + pip cache → ruff →
  **dataset gate** → pytest (VC-01…VC-06) → Node 22 + `npm ci` → tsc → vitest (VC-06…VC-11) →
  `npm run build` → `verify:dist` → Playwright chromium → e2e (VC-12/13/15) → `make -n test`
  parity dry-run → failure-only artifact upload.
- **Dataset gate:** `data/raw/` is gitignored and `pipeline/fetch_data.py` does not exist yet
  (`make data` is currently broken — owner B0-2). CI therefore *requires* the CSV (fetch step
  when `make data` is implemented) and fails with a loud `::error` rather than skipping the
  blocking pytest suite. A red dataset gate is a real red, never a skipped test (AG-04).
- Every step has `timeout-minutes`; top-level `permissions: contents: read`; deploy job is the
  only holder of `pages: write` + `id-token: write`.

## 7. Evidence index (what proves each item)

| Checklist item | Proving command / artifact |
|---|---|
| Workflows parse | `python -c "import yaml; …"` → `workflows OK` |
| Lint | `python -m ruff check .` |
| Pipeline + leakage + parity | `python -m pytest -q` |
| Compile | `npm run typecheck` (+ strict `tsc --ignoreConfig --strict` over `e2e/offline.spec.ts`) |
| Artifact integrity | `npm run verify:dist` → `RESULT: ALL CHECKS PASS` |
| Unit/parity | `npx vitest run` |
| Golden path, request/storage/CSP, deploy smoke | `npm run test:e2e` → `N passed` |
| Offline proof | `e2e/offline.spec.ts` logs: `crossOriginAttempts=0 failedAfterCut=0 serviceWorkers=0` |
| Subpath base path | `dist/index.html` emits `./assets/…`; `base: "./"` in `web/vite.config.ts` |
| Licensing / AI disclosure | `assets/ATTRIBUTION.md`, README sections |
| Live URL | job summary of `deploy.yml` + fresh-browser smoke screenshots |

Generated evidence is rewritten by every run — never hand-edit it.
