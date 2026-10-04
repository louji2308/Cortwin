# CorTwin — Engineering Status

**Last updated:** 2026-10-03 · **Source of truth:** `Progress.md` at the repository root. This file is
a public-safe projection of it: no session identifiers, no internal notes, **no performance metrics**
(numbers appear only when they are measured and traceable, which is not yet the case).

---

## Current state in one paragraph

CorTwin is at the start of Phase P0 (foundation). The repository exists with its directory skeleton,
its source documents and its coordination/traceability documentation. **The application has not been
built, the model has not been trained, no test suite exists yet, and there is no live URL.** The next
dated milestone is **2026-10-04**: acquire and checksum the dataset, and decide the 3D asset route
(accepted meshes vs procedural tubes).

---

## Phase status

| Phase | Objective | Gate | State |
|---|---|---|---|
| P0 | Foundation: repo, clean install, CI skeleton, contract ownership map | G0 | in progress |
| P1 | Data + schema proof, leakage gate, early 3D risk gate | G1 | not started |
| P2 | Validation and model training (nested CV, calibration, thresholds) | G2 | not started |
| P3 | Model compilation, manifest, Python oracle, golden fixtures | G3 | not started |
| P4 | TypeScript domain engine and Web Worker (parity at 1e-5) | G4 | not started |
| P5 | Store, registry, scene, 3D runtime integration | G5 | not started |
| P6 | Explore core — flagship end-to-end experience | G6 | not started |
| P7 | Trust, System, Evidence Rail, P1 surfaces | G7 | not started |
| P8 | Full-system verification, security, performance, deployment | G8/G9 | not started |
| P9 | Feature freeze, documentation, video, final smoke, submission | G10 | not started |

---

## What is verified today (2026-10-03)

| Item | Evidence |
|---|---|
| Python test command executes | `python -m pytest tests/ -q` → `no tests ran in 0.03s`, exit code 5 (zero test files exist yet) |
| Documentation set written and internally cross-checked | `README.md`, `docs/TRACEABILITY.md`, `docs/AI_USE.md`, `docs/DEMO.md`, `docs/STATUS.md` |
| Traceability completeness | 104 mapped requirement rows across rubric, requirements table, contracts and verifications (`docs/TRACEABILITY.md` §K) |
| Source documents read in full before writing | `AGENTS.md`, `Progress.md`, and all seven `Project/*.md` files |

## What is NOT verified / does not exist yet

- Any model, metric, calibration result or validation number — **none has been produced**.
- The application, 3D scene, worker, store, forms and panes — no application code exists.
- `make data`, `make reproduce`, `make test`, `npm run dev`, `npm run build`, `npm run preview` —
  none has been run successfully in this repository (see `README.md` "Command surface").
- Dataset acquisition and checksum (due 2026-10-04).
- 3D mesh quality and frame rate — the mesh gate is undecided (due 2026-10-04).
- JavaScript/Python parity, request audit, budget report, deployment smoke (VC-01…VC-15 all not started).
- Public repository, live URL, video, six-page document.
- Toolchain pins: the plan pins Python 3.12 / pytest 9.1 / Node 22; the current machine reports
  Python 3.11.9 / pytest 8.4.2 / Node 24. Evidence-first resolution is in progress; the deviation is
  recorded and unresolved.

---

## Known risks (carried forward)

| Risk | Target date / owner | Note |
|---|---|---|
| Exact dataset accessibility | 2026-10-04 | if inaccessible, escalation is required before any substitution — a dataset is never swapped silently |
| 3D mesh quality / route decision | 2026-10-04 | fallback route is procedural tubes along hand-placed centrelines |
| Python ↔ TypeScript numerical parity | 2026-10-05…06 | golden fixtures are to be created from day one |
| Toolchain version drift vs pinned stack | foundation phase | resolve with evidence before accepting any deviation |
| Requirements known only from the event Discord | before 2026-10-12 | human owner checks and records them |
| Documentation drifting from generated artefacts | documentation phase | every figure must be regenerated from the results artefact, never typed by hand |
| Dataset units and licence confirmation | before UI finalisation | do not state units that have not been checked |

---

## How to keep this file in sync

1. Re-read `Progress.md` (sections 0, 1, 7, 8, 9) before editing this file.
2. Copy only public-safe content: phase states, verification states, risks, dates. No session IDs,
   no internal decisions text, no metrics that have not been measured.
3. Never mark a phase or verification as done here unless `Progress.md` shows its evidence.
4. If this file and `Progress.md` disagree, `Progress.md` is authoritative and this file must be corrected.
