# CorTwin — Engineering Status

**Last updated:** 2026-10-08 · **Source of truth:** `Progress.md` at the repository root. This file is
a public-safe projection of it: no session identifiers, no internal notes; performance numbers appear
only when measured and traceable to a committed report.

---

## Current state in one paragraph

CorTwin has completed phases P0–P8. The dataset is fetched and checksummed, the model is trained and
exported (nested CV 5×3 outer / 4 inner, calibration, thresholds), and the browser application is
built end-to-end: profile form → Web Worker inference → calibrated probabilities → three-vessel 3D
stage → exact-SHAP explanation → Evidence Rail → Trust/System panes. The full verification chain —
pytest, vitest, TypeScript compile, production build, artifact-integrity check and the Playwright
end-to-end suite — is green locally and in CI (gates G0–G8 PASS). There is **no live URL yet**:
deployment is blocked on enabling GitHub Pages, a one-time human repository setting. Documentation
and the demo video (P9 / G10) are in flight toward the 14 October submission.

---

## Phase status

| Phase | Objective | Gate | State |
|---|---|---|---|
| P0 | Foundation: repo, clean install, CI skeleton, contract ownership map | G0 | complete — PASS |
| P1 | Data + schema proof, leakage gate, early 3D risk gate | G1 | complete — PASS |
| P2 | Validation and model training (nested CV, calibration, thresholds) | G2 | complete — PASS |
| P3 | Model compilation, manifest, Python oracle, golden fixtures | G3 | complete — PASS |
| P4 | TypeScript domain engine and Web Worker (parity at 1e-5) | G4 | complete — PASS |
| P5 | Store, registry, scene, 3D runtime integration | G5 | complete — PASS |
| P6 | Explore core — flagship end-to-end experience | G6 | complete — PASS |
| P7 | Trust, System, Evidence Rail, P1 surfaces | G7 | complete — PASS |
| P8 | Full-system verification, security, performance, deployment config | G8 | complete — PASS (deploy config ready; G9 blocked on GitHub Pages enablement) |
| P9 | Feature freeze, documentation, video, final smoke, submission | G9/G10 | in progress — G9 awaiting the human Pages setting, G10 docs/video under way |

---

## What is verified today (2026-10-08)

| Item | Evidence |
|---|---|
| Full test chain green | pytest **203 passed** · vitest **1177 passed (81 files)** · `tsc` exit 0 · Playwright e2e **32/32** (2026-10-08) |
| CI green on every push | `.github/workflows/ci.yml` runs ruff → dataset gate → pytest → tsc → vitest → build → artifact integrity → e2e; latest verified run `37698481044` |
| Model artifacts exist and are integrity-checked | `web/public/model.json`, `web/public/results.json`, `pipeline/artifacts/deployed_model.joblib`; modelId `sha256:71406e355e66d6cd4b7a96848271deb5cc189000a121b9147770975657e2ddba`; metrics transcribed in `docs/MODEL_CARD.md` |
| Dataset acquired and checksummed | `data/raw/`, `data/CHECKSUMS.txt`, `data/PROVENANCE.md` (CC BY 4.0) |
| 3D mesh gate decided | `web/public/models/heart.glb` CONDITIONAL PASS (`assets/REPORT_mesh_gate.md`) plus procedural fallback `assets/fallback/heart_tubes.glb`; frame-rate and scene budgets measured in `tools/qa/perf-report.md` |
| Documentation set | `README.md`, `docs/TRACEABILITY.md` (104 mapped requirement rows), `docs/AI_USE.md`, `docs/DEMO.md`, `docs/STATUS.md`, `docs/MODEL_CARD.md` |
| Toolchain pins | Python 3.12.9 / pytest 9.1.1 locally; CI on pinned Python 3.12 and Node 22. Local host runs Node 24 — every gate is green under both |
| Source documents read in full before writing | `AGENTS.md`, `Progress.md`, and all seven `Project/*.md` files |

## What remains

- **Live URL (G9):** human enables GitHub Pages (Settings → Pages → Source: "GitHub Actions"), then
  the deploy workflow runs; fresh-browser smoke afterwards.
- **B-04 re-measure:** sustained frame rate on the actual demo hardware (protocol and honest partial
  results already in `tools/qa/perf-report.md`).
- **Documentation freeze (2026-10-12):** README/model-card final pass, HD-07 licence ruling (human),
  Discord requirement check (human).
- **Video (3–10 min) and six-page document:** by 2026-10-13.
- **Submission:** operational target evening of 2026-10-14 IST (official deadline 2026-10-15 00:15 IST).
- Optional P2 extras (FastAPI reference endpoint, similar-patient lookup) only if safe after hardening.

---

## Known risks (carried forward)

| Risk | Target date / owner | Note |
|---|---|---|
| Live link must survive 2026-10-21 (no trial-period hosting) | 2026-10-09 | GitHub Pages chosen; enablement is a one-time human repository setting |
| Exact dataset accessibility | resolved 2026-10-04 | committed to `data/raw/` with checksums (HD-01 never triggered) |
| Python ↔ TypeScript numerical parity | resolved 2026-10-04…05 | golden fixtures from day one; parity gate green in CI |
| 3D frame rate on demo hardware | 2026-10-09 | budgets measured in CI/dev; final re-measure on demo hardware |
| Licence ambiguity (mesh derivatives) | docs freeze (HD-07) | interim CC BY-SA 2.1 Japan + both verbatim credits recorded (D-23) |
| Requirements known only from the event Discord | before 2026-10-12 (human) | human owner checks and records them (HD-08) |
| Documentation drifting from generated artefacts | continuous | every figure regenerated from `results.json`, never typed by hand |
| Dataset units confirmation | continuous | do not state units that have not been checked |

---

## How to keep this file in sync

1. Re-read `Progress.md` (sections 0, 1, 7, 8, 9) before editing this file.
2. Copy only public-safe content: phase states, verification states, risks, dates. No session IDs,
   no internal decisions text, no metrics that have not been measured.
3. Never mark a phase or verification as done here unless `Progress.md` shows its evidence.
4. If this file and `Progress.md` disagree, `Progress.md` is authoritative and this file must be corrected.
