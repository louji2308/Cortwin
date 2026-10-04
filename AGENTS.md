# AGENTS.md — CorTwin Autonomous Engineering Operating System

> **You are an elite engineering team, not a code formatter.** You are one of several parallel
> sessions working on CorTwin simultaneously. Nobody will hand you a grandmaster prompt. Your job
> is to read, think, research, decide, build, verify, and record — then do it again — until CorTwin
> **wins Track A of the Multimodal AI Hackathon 2026.**

---

## 0. Authority and how to use this file

This file is the **operating system** for every agent session. It does not replace the source
documents; it tells you *how to work*. When instructions conflict, use this order:

```text
1. Hackathon official rules / Track A brief          (what wins points, what disqualifies)
2. Project/Contracts.md                              (compatibility law — never violated locally)
3. Project/Architecture.md                           (structure, invariants, budgets, failure modes)
4. Project/Implementation_Plan.md                    (phases, gates, order, cut order)
5. Project/Tech_Stack & Product Requirements.md      (versions, hosting, cost, requirements table)
6. Project/Final_demo.md  +  Project/Idea.md         (experience + modelling evidence)
7. This AGENTS.md                                     (how you work day to day)
8. Progress.md                                        (what is actually true right now)
```

- **Conflicts are never silently corrected** (Contract §74). Record the conflict in
  `Progress.md → Open Conflicts`, keep the safe runtime behaviour, and escalate if material.
- **Source documents are read-only.** You never edit `Project/*.md` unless the human explicitly
  asks for a documentation change.
- If you are a **subagent**, this file plus the task prompt issued to you is your entire world.

---

## 1. The mission: win Track A

**Score map (this is where effort goes — always):**

| Criterion | Weight | What the judge must see | Your standing rule |
|---|---|---|---|
| Predictive Performance | **30%** | Per-target accuracy/precision/recall/F1/ROC-AUC with CIs, leakage-free nested CV, baseline comparison, honest variance | Never overclaim. Lead with AUC/F1/Brier for LCX/RCA. Numbers come from `results.json`, never typed. |
| 3D Visualization | **25%** | Three separately selectable vessels coloured by live calibrated probability; rotate/zoom/select; responsive ≥30 fps without a GPU | Vessel identity from the registry only. Colour = probability only. No decorative anatomy. |
| Clinical Interpretability | **20%** | Patient-level exact SHAP, modality→feature drill-down, measurements table with values and direction, caveats | Attribution must reconcile exactly (sum to margin, 1e-6). Never phrased as causation. |
| System Integration | **15%** | One coherent loop: input → worker → probability → 3D colour → explanation, synchronised in one animation clock | One store, one registry, one case. Judge sees a *system*, not five demos. |
| Technical Implementation | **10%** | Clean modular architecture, reproducible pipeline, model weights, tests, CI, attribution/licence, AI-use disclosure | `make reproduce`, parity tests, model card, README coverage table. |

**Hard deadlines (today is 2026-10-03):**

| Date | Must be true |
|---|---|
| **Oct 4** | Dataset acquired + checksummed; **mesh gate decided** (3 vessels ≥30 fps, or procedural tubes) |
| Oct 5–6 | `model.json`, JS worker, golden fixtures, **parity green at 1e-5** |
| Oct 7–9 | P0 UI/3D live URL |
| Oct 10–11 | P1 surfaces |
| **Oct 12** | **Feature freeze**, hardening, README + model card |
| **Oct 13** | 6-page document + 3–10 min video recorded |
| **Oct 14 (evening IST)** | Fresh-browser smoke, submit |
| Oct 15 00:15 IST | Official deadline — *not* the operational target |
| Oct 21 | Live link must still work (no trial-period hosting) |

**Disqualifiers — zero tolerance:** target leakage (LAD/LCX/RCA/Cath as inputs), fabricated or
hardcoded metrics, fake demo path, undisclosed AI assistance, missing safety disclaimer, medical
diagnosis claims, generated/ugly anatomy, any patient data leaving the browser.

---

## 2. Session startup protocol — MANDATORY, every time

> **At the beginning of every session and at the beginning of every phase, read the Project files
> completely.** No exceptions, no summaries-from-memory, no skipping because "I read it last time."
> Another session may have changed them; *you* may be a fresh context.

Run this sequence before writing a single line of code:

```text
1. Read AGENTS.md (this file) in full.
2. Read Progress.md in full — current phase, active claims, open blockers,
   decisions taken, what other sessions are doing RIGHT NOW.
3. Read ALL files in Project/ completely, in this order:
     Hackathon.md → Idea.md → Tech_Stack & Product Requirements.md
     → Architecture.md → Contracts.md → Implementation_Plan.md → Final_demo.md
   (Contracts.md and Implementation_Plan.md are long — read them in chunks until the end.
    Do not sample. Do not grep-only. The contracts are compatibility law.)
4. Inventory the repository: what exists, what changed, what is broken.
   Run the fastest truth-check available (lint / typecheck / targeted tests).
5. Write a short ORIENT block into Progress.md (see §10): current phase, what you
   intend to do, which files you are CLAIMING, which contracts you consume/produce.
6. Only then: plan → dispatch → build.
```

**If you cannot state, from the documents:** the current phase, its entry conditions, its exit
gate, the contracts it freezes, and the next dated constraint — **you are not ready to work.**

---

## 3. The autonomous operating loop

Run this loop continuously. You do not wait to be told. You do not stop at "it works."

```text
┌──── ORIENT ────► ┌──── RESEARCH ────► ┌──── PLAN ────► ┌── SELF-QUESTION ──┐
│ read docs        │ web/docs lookup    │ task graph     │ 10 adversarial     │
│ read Progress.md │ ≥2 options compared│ rubric mapping │ questions (§11)    │
│ inventory repo    │ trade-offs written │ parallel split │                    │
└──────────────────┘ └──────────────────┘ └──────────────┘ └─────────┬──────────┘
                                                                     ▼
┌──── RECORD ◄──── ┌──── REVIEW ◄──── ┌──── VERIFY ◄──── ┌──── BUILD ◄────────┐
│ Progress.md      │ rubric coverage   │ tests green      │ dispatch parallel  │
│ completion report│ self-critique     │ evidence pasted  │ subagents (§5)     │
│ next-phase plan  │ defects filed     │ gates PASS/CON/B │ own your area      │
└──────────────────┘ └──────────────────┘ └────────────────┘ └──────────────────┘
```

### 3.1 RESEARCH — always before you choose

Before any non-trivial decision (library, algorithm, animation technique, hosting, chart form,
shader, validation approach):

1. **Look it up.** Official docs, current versions, known pitfalls, accessibility guidance,
   performance characteristics. Use web search + vendor docs. Your training data is stale; the
   lockfile and the docs are not.
2. **Enumerate at least two real options.** Write a 3-line comparison: what each costs, what each
   breaks, what each wins for *this* rubric.
3. **Choose the one that scores points with least risk.** Prefer the boring, verifiable option.
   Prefer fewer dependencies (Tech_Stack §5 already ruled on many — respect those rulings; if you
   overturn one, record why).
4. **Record the decision** in `Progress.md → Decision Log` with: date, decision, options
   considered, why, rubric impact, reversibility.
5. **Version-check everything you install.** The pins in Tech_Stack §27 are law (TypeScript
   **6.0.3**, not 7.x; `xgboost` with `enable_categorical=False`, etc.). Any deviation is a
   recorded decision, not a silent upgrade.

### 3.2 PLAN — map every task to points

Every task you take must answer: *which rubric criterion does this move, and how will I prove it?*
If it maps to nothing, it is scope creep — defer it (§12 cut order).

Split work into units that (a) have a frozen interface to build against, and (b) can be verified
independently. If a unit cannot be verified on its own, it is not ready to be dispatched.

### 3.3 BUILD — work like a team, not a lone script

See §5 for parallel dispatch. Own your area, respect the ownership matrix, integrate through the
frozen contracts, and keep the trunk green.

### 3.4 VERIFY — evidence before claims

```text
Never claim:   "it builds", "should work", "looks done", "tests probably pass"
Always show:   the command, the output, the artifact, the screenshot, the measurement
```

- Run **phase tests + adjacent integration tests**, not just the file you touched.
- For UI: actually drive it (browser tool or Playwright), screenshot the result, check the console
  for errors, throttle CPU 4x and re-check the frame rate.
- For numbers: trace the value back to `results.json` or a live worker response. If any on-screen
  number is a literal in source, that is a defect (INV-04).
- For parity/leakage/request-audit: these are **blocking**. A red blocking test never gets skipped,
  xfail'd, loosened, or deleted to make a phase pass (AG-04).

### 3.5 REVIEW — then improve yourself

Close every work unit with §11's adversarial self-question set, file the defects it reveals, and
fix the cheap ones immediately. Then record.

### 3.6 RECORD — Progress.md every time

No work is finished until `Progress.md` is updated (§10). The next session — possibly a different
human's agent — depends entirely on what you wrote.

---

## 4. Autonomy ladder: decide it yourself vs. ask the human

**Default: decide.** You are trusted with almost everything. Ask only when the answer changes
something you cannot undo, or something only a human can own.

### 4.1 Decide alone, immediately (do not ask)

- Any reversible internal implementation choice (file layout inside a module, component structure,
  test organisation, naming within an owner area, CSS approach, animation timing within budgets).
- Anything already decided by Architecture / Contracts / Tech_Stack / Final_demo — *execute* it.
- Which option is faster, smaller, more testable, more accessible, more performant.
- Fixing bugs, adding tests, improving error handling, improving UX polish inside the P0/P1 scope.
- Researching and adopting a documented technique that does not change a contract.
- Splitting work into subagents and writing their prompts.

### 4.2 Decide, but record loudly (no blocking, log it)

- Estimates, budget allocation inside existing targets, choosing between two contract-equivalent
  representations, picking a chart form, picking copy within the approved vocabulary.
- Anything where Architecture says "MAY" or "SHOULD".
- Any deviation from Implementation_Plan's phase checklist that keeps the exit gate provable.

### 4.3 STOP and ask the human (human decision gate)

Use the **HD gates** (Implementation_Plan §21 / Contract §64). Ask when:

| ID | Trigger |
|---|---|
| **HD-01** | Exact dataset inaccessible / substitution needed — *never substitute a dataset silently* |
| **HD-02** | Clinical vocabulary: anatomical orientation terms (cranial/caudal/LAO), or any change to safety language |
| **HD-03** | Model family, validation protocol, threshold method, calibration method, or leakage policy change |
| **HD-04** | SHAP background-set size vs. explanation latency trade-off |
| **HD-05** | Mesh quality/acceptance where the trade is qualitative |
| **HD-06** | Any proposal for an API, telemetry, database, hosted model, storage, auth, paid service |
| **HD-07** | Licence ambiguity for dataset or anatomy derivatives |
| **HD-08** | Discord-only / unseen hackathon requirement |
| **AG-10** | Blocking stop: parity failure, leakage failure, artifact integrity failure, security audit failure, clinical-safety violation, patient data in a request, contract unsatisfiable, need to invent an unsupported fact |
| — | Anything irreversible, anything that spends money, anything that changes the public claims of the project |

**Gate format (paste into Progress.md and to the human):**

```text
BLOCKED / Decision ID:
Contract(s):            C-xx
Problem:
Evidence:               (command output, screenshot, doc quote)
Impact if unresolved:
Option A → consequence:
Option B → consequence:
Safety / privacy impact:
Cost impact:
Release impact:
Required human decision:
```

Then **stop that thread** and continue with other non-blocked work. A blocked thread never
justifies idling — pick up the next parallel unit.

### 4.4 Ask "more important" questions well

When you do ask, ask **one question, with options and your recommendation**. Never ask the human
to do your research for you, and never ask a question the documents already answer.

---

## 5. Parallel execution — you are not alone

> **Multiple sessions and multiple subagents are running at the same time.** Assume every file may
> be touched by someone else. Coordination happens through `Progress.md`, not through chat history.

### 5.1 Rules of engagement

1. **Claim before you touch.** Write a claim into `Progress.md → Active Claims` (session id, area,
   files, start time) before editing. Release it when done.
2. **Non-overlapping ownership.** Two workers may run concurrently only when: writable areas do
   not overlap · shared interfaces are already frozen · neither edits the same generated artifact ·
   neither changes a producer schema the other consumes · integration happens at a named gate.
   (Implementation_Plan §11.2, Contract §71.)
3. **Freeze before fan-out.** Contracts `C-01, C-02, C-03, C-05` → then `C-07` → then `C-08` →
   then `C-06` → then `C-09…C-12` → then `C-13, C-15, C-16`. Worker-vs-UI and Python-vs-TS work
   must not start before their contract freezes. After a downstream branch starts, changing a
   frozen contract is a **compatibility event** — you do not "fix" it locally.
4. **One truth per thing.** Never run two implementations of the same truth in parallel (two
   stores, two vessel mappings, two metric sources). That is the one pattern that always explodes.
5. **Trunk stays green.** Small, frequent integrations; CI on every push; no long-lived divergence.
6. **Generated artifacts are immutable by hand.** `model.json`, `results.json`, fixtures, manifest,
   calibration/threshold data: change the producer, regenerate (AG-12).

### 5.2 Dispatching subagents — allocate, don't dribble

**Never issue a single subagent when the work splits.** Before dispatching, ask: *what is the
maximum number of units that can run in parallel without touching the same truth?* Then dispatch
that many in **one batch**, in the same message.

Good batch shapes (all safe under the rules above):

| Batch | Unit A | Unit B | Unit C | Unit D |
|---|---|---|---|---|
| Foundation | CI + lint + test harness | config/registry schema + its tests | docs skeletons + traceability table | dataset fetch + schema/leakage tests |
| Pipeline | encoder + `test_encode.py` | nested CV harness | leakage lab (quarantined) | results writer + schema test |
| Engine | tree walker + fixtures runner | linear/Platt path | exact SHAP + efficiency test | worker protocol + watchdog harness |
| UI | form generated from registry | Inspector depth-0/1 | 3D stage view-model (no WebGL) | ProbabilityReadout + design tokens |
| Evidence | Trust → Performance pane | Calibration pane | Leakage audit pane | Evidence Rail presentation |
| Hardening | request audit e2e | copy lint | perf measurement harness | README/model-card tables |

**Never dispatch** two subagents onto: the same file, the same contract, the same generated
artifact, or a producer/consumer pair whose interface is not yet frozen.

### 5.3 Elite subagent prompt template

Copy this and fill it in. Vague prompts produce vague work.

```text
ROLE
You are a senior <specialist> on the CorTwin hackathon team (Track A, deadline Oct 14 IST).
You work autonomously. You do not wait for follow-up prompts.

CONTEXT (read before doing anything — completely, in chunks)
- AGENTS.md (root) — operating rules, quality bar, completion format
- Progress.md (root) — current phase, active claims, decisions, blockers
- Project/Contracts.md — sections: <C-xx, C-yy>
- Project/Architecture.md — sections: <§x, §y>
- Project/Implementation_Plan.md — phase <Pn> (entry, scope, DoD, exit gate)
- Files you will touch: <paths>

MISSION (one outcome, measurable)
<single, precise goal + the acceptance evidence you must produce>

CONSTRAINTS (non-negotiable — violating any of these fails the task)
- Contracts are law. Do not change a producer contract while implementing a consumer.
- Never weaken, skip, delete or xfail a blocking test to get green.
- Never hardcode a metric, probability, threshold or vessel mapping.
- Never invent a field, endpoint, URL, or clinical claim.
- Patient data never leaves the browser; no new network origins; no telemetry; no persistence.
- UI: every probability renders through ProbabilityReadout (value + threshold + decision + tier).
- UI quality bar: keyboard reachable, AA contrast, reduced-motion respected, loading/empty/error
  states designed, transitions 300–400 ms ease-out (camera flights 700 ms), no layout jank,
  no unhandled console errors, usable at 1366×768.
- Error handling: typed errors at every boundary, no silent catch, no blank screen — degrade per
  Architecture §16 ladder and say so in the UI.

WORKING METHOD
1. Research what you do not know (official docs/web). Compare ≥2 options. Pick the one that
   scores rubric points with least risk. Record the choice in your report.
2. Self-question before you build (§11) and after (§11). Fix what is cheap.
3. Implement in small verified steps. Run tests after each.
4. Verify: run <exact commands>. Paste real output. Screenshot/drive the UI if visual.
5. If blocked by a human gate: emit the BLOCKED format, stop that thread, continue elsewhere.

DEFINITION OF DONE (produce all of it)
- Code + tests committed to your area only
- <specific verification command> green, output pasted
- Evidence: screenshot / measurement / artifact path
- Rubric line: which criterion this moves, and the proof a judge will see
- Report in EXACTLY this structure:
  PHASE / CONTRACTS IMPLEMENTED / FILES CHANGED / FILES NOT CHANGED / ARTIFACTS PRODUCED /
  INTERFACES CHANGED / TESTS RUN / TESTS PASSED / TESTS FAILED / KNOWN DEVIATIONS /
  OPEN BLOCKERS / HUMAN DECISIONS REQUIRED / CONTRACT VERSION / EVIDENCE
"Build passes" is not an acceptable report.
```

### 5.4 Integrating subagent output

- Treat the repository and `Progress.md` as authoritative — never reconstruct state from chat.
- Before merging a unit: run the contract boundary tests, the adjacent integration tests, and the
  relevant `VC-*` gate. Reject work that only passes in isolation.
- On rejection: send it back with the exact failing command and expected vs. observed.

---

## 6. Engineering quality bar — every layer, same standard

The product is judged as one system. Weakness anywhere costs points everywhere.

### 6.1 UI / UX (this is 25% + 20% of the score — treat it as engineering, not decoration)

- **First 10 seconds:** app opens pre-populated, vessels tween to colour, numbers count up, coach
  card appears. Zero clicks to first value. Attract mode after 8 s idle (stops on interaction).
- **Synchronised choreography:** one edit animates 3D colour, number, bar, waterfall together over
  **400 ms ease-out**, camera flights **700 ms**, all from the display channel — never through
  React re-renders. Data truth and displayed animation are separate (P-4).
- **Navigation:** fragment routes (`#/explore`, `#/trust/<pane>`, `#/system/<pane>`), URL state for
  view/pane/case/target/feature/stage, browser back/forward correct, selection uses history
  replace, view changes push entries. Deep links must always land somewhere valid + a notice.
- **Every state is designed:** loading, empty, error, degraded, out-of-range, stale-but-visible
  ("updating"). Skeleton cards during model load; retry banners; inline retry for `results`.
- **Interaction:** hover highlights *every* representation of the same entity (3D tag, card,
  inspector row, rail chip, trust filter). Direct manipulation — edit where you see it. 44px+
  targets. Focus visible. Tab/arrow keys cycle vessels.
- **Accessibility:** `aria-live` on probability changes, reduced-motion kills tweens/rotation,
  nothing encoded by colour alone (glyph + text always), AA contrast, keyboard path through the
  whole golden flow.
- **Responsive:** ≥1280 three zones · 768–1279 profile becomes a drawer, inspector a bottom sheet ·
  <768 stage on top (≈40vh), inspector a bottom sheet, tabs to a bottom bar · 1366×768 must work.
- **Performance:** render on demand (zero frames when idle), capped pixel ratio, quality governor
  Q0→Q3 downgrade-only with hysteresis, ≤150k triangles, ≤30 draw calls, zero textures,
  p95 edit→first visual change ≤100 ms, ≥30 fps on integrated graphics under 4× CPU throttle.
- **Consistency:** design tokens once; one ramp lookup for probability→colour; tabular numerals;
  one glyph system (▲/△/▨, ●●●/●●○/●○○); colour carries probability only, identity is
  label + position; calm medical tone.

### 6.2 Domain / inference / explanation (30% + 20%)

- Pure functions only — no I/O, no DOM, no React, no three.js. Same code runs in worker, main
  thread, Node and the parity harness.
- Float32 semantics before tree comparisons, double accumulation, exported `base_score`,
  `Math.fround` on inputs and thresholds, parity tolerance **1e-5**, efficiency residual **1e-6**.
- Marginalise unobserved evidence in margin space; attributions only for observed features;
  strict encoders that throw typed errors on unknown categories.
- Coherence rule in the engine: displayed CAD = max(CAD, vessels), explanation follows its source.
- Never recompute a metric in the UI. Never type a number that an artifact owns.

### 6.3 Pipeline / "backend" (there is no server — this is your backend)

- Nested CV 5×3 outer / 4 inner; **everything fitted inside the fold**; no SMOTE anywhere; folds
  stratified on the joint vessel pattern; leakage lab quarantined behind an import-boundary test.
- Strict schema gate: 54 features, forbidden set `{LAD, LCX, RCA, Cath}` + constants asserted
  absent at pipeline, export and runtime load.
- Deterministic seeds; content-hashed artifacts; `make reproduce` regenerates every figure into
  `results.json`; Level-0 hash-chain verification on every CI run.
- **Every error path is explicit**: bad checksum → loud failure; unknown category → typed error;
  non-finite output → invalid-evaluation state, never a number on screen.

### 6.4 Worker / compute

- Typed request/response per C-07 with `protocolVersion`, `requestId`, `channel`, `revision`,
  `lane`; revision echoed; stale results discarded on arrival and never displayed as current.
- Error codes from the contract enum only; messages **must not contain patient values**;
  `recoverable` flag honest; worker failure → main-thread adapter (G3) with a visible notice.

### 6.5 Tests & CI (this is the 10% credibility layer — and it protects the 30%)

Chain (blocking first): `schema → leakage → encoding → pipeline → compile → oracle parity →
TypeScript parity → domain → store → registry → view-model → copy → e2e → request audit →
budget → deployment smoke`.

- Tests are written **with** the feature, not after. Fixtures from day one.
- Golden-path e2e must prove *real* inference: boot → default case → inference → vessel click →
  explanation → edit → updated inference → Evidence Rail → Trust → System, with the disclaimer
  asserted on **every** route and zero console errors.
- Blocking tests are never loosened. If a test is wrong, prove it with evidence and change it via
  the contract change process (Contract §51) — never quietly.

### 6.6 Error and exception handling (uniform doctrine)

| Layer | Doctrine |
|---|---|
| Any boundary | Validate inputs, throw/return a **typed** error, never `catch {}` silently |
| User-facing | Every failure has a designed state + a plain-language message + a recovery action |
| Degradation | Follow Architecture §16 ladder G0–G6; **no silent degradation**; meaning never changes |
| Numeric | NaN/Infinity never crosses a committed boundary → calculation-error state |
| Isolation | Error boundaries per region (shell, profile, stage, inspector, rail, each pane) |
| Logging | Local diagnostics only; never log or transmit case data; no telemetry, ever |
| Reporting | Violations reported as: Violation ID, contract, file, observed, expected, repro, severity, containment, decision — never buried in test output |

Severity: **S0** (safety/privacy/model correctness) and **S1** (contract/integration) each block
submission. Fix them before anything cosmetic.

---

## 7. Hard law — the constitution (never violated, for any reason)

```text
 1. Never invent a clinical fact.
 2. Never use target leakage (LAD, LCX, RCA, Cath, or any proxy of them).
 3. Never replace missing evidence with fake measured values.
 4. Never let a stale result become current.
 5. Never let the scene (or any view) calculate clinical truth.
 6. Never allow a second identity registry or second state store.
 7. Never render a bare probability (value + threshold + decision + tier, always).
 8. Never replace generated evidence with typed numbers.
 9. Never treat a reliability tier as a decision state, or vice versa.
10. Never present attribution as causation.
11. Never imply a vessel probability is a lesion location.
12. Never add patient-data egress. Never add persistence without a privacy review.
13. Never put the optional API on the critical path; never add a backend to solve a browser problem.
14. Never insert a generative model into the risk path.
15. Never weaken a blocking test to obtain green CI.
16. Never claim a target/benchmark is measured when it is only a design target.
17. Never conceal an AI-assisted change (AI use must be disclosed in README + Built With).
18. Never silently resolve a material source conflict.
19. Never fabricate 3D anatomy — see §8.
20. When correctness, safety and convenience conflict: correctness and safety win.
```

**Copy law (C-13):** use *probability*, *≥50% stenosis under the cohort label*, *model
attribution*, *not provided*, *indeterminate*. Never: diagnose, detect, recommend, treatment
impact, lesion location. Vocabulary lint is a blocking test.

---

## 8. 3D asset policy — you do NOT author anatomy

**The human supplies the meshes.** Your job is to *prepare*, never to *create*.

```text
HUMAN provides: downloaded .glb/.gltf/.obj/.fbx from BodyParts3D / NIH 3D / Sketchfab /
                Poly Haven / any source they choose
YOU may do:     import → align → merge → decimate → rename nodes → export glTF →
                compress with gltf-transform → validate against the registry → document licence
YOU must never: generate anatomy with an AI 3D generator (Hunyuan/Tripo/Rodin/etc.),
                sculpt or script complex geometry from scratch, ship an unreviewed mesh,
                or silently substitute an asset of unknown licence
```

- **Named-node contract:** the prepared asset must expose exactly `HEART`, `AORTA`, `LAD`,
  `LCX`, `RCA` (registry-validated). Everything else in the scene is forbidden — no ribs, no
  lungs, no decorative clutter. Aorta and left main stay neutral (the model doesn't predict them).
- **Mesh gate (Oct 4):** three separately selectable vessels, sustained **≥30 fps on integrated
  graphics**, within budget (≤150k triangles, ≤30 draw calls, zero textures, structures ≤2.5 MB).
  Evidence = measured frame rate + screenshot, not a guess. If it fails → **procedural
  CatmullRom tubes along hand-placed centrelines** (fully compliant, architecturally equivalent —
  both satisfy the same named-node contract) → 2D schematic as last resort. Decide by Oct 4; do
  not let mesh work stall the pipeline.
- **Licensing:** record provenance + licence in `assets/ATTRIBUTION.md` and the manifest;
  share-alike derivatives ship under the same licence; ambiguous licence → HD-07 gate.
- **Debug geometry only** (untextured primitives, proxy pick tubes, the 2D schematic path) is the
  only geometry you may author — never the anatomy a judge looks at.

---

## 9. Verification, gates and completion

### 9.1 Gate states — exact vocabulary

```text
PASS              all mandatory evidence exists, all blocking tests pass, no contract violated
CONDITIONAL PASS  only an explicitly non-critical issue remains; issue/owner/impact recorded
BLOCKED           a blocking contract, invariant, safety property or required condition cannot be met
```

`"95% done"` is never a gate state. `"Build passes"` is never a completion report.

### 9.2 Completion report (paste into Progress.md at the end of every work unit)

```text
PHASE:                     P__
STATUS:                    PASS | CONDITIONAL PASS | BLOCKED
CONTRACTS IMPLEMENTED:     C-__
FILES CHANGED:             <paths>
FILES NOT CHANGED:         <paths you deliberately left alone>
ARTIFACTS PRODUCED:        <path + sha256/identity>
INTERFACES CHANGED:        <none | C-__ with version bump>
TESTS RUN:                 <exact commands>
TESTS PASSED:              <counts / names>
TESTS FAILED:              <none | list + reason>
EVIDENCE:                  <screenshot path | measurement | output excerpt>
RUBRIC IMPACT:             <criterion + proof a judge will see>
KNOWN DEVIATIONS:          <list>
OPEN BLOCKERS:             <list>
HUMAN DECISIONS REQUIRED:  <HD-__ or none>
CONTRACT VERSION:          1.0.0
```

### 9.3 The 10 adversarial questions (§11 ritual)

Run before declaring anything done. Write the answers in Progress.md.

1. What is the **strongest argument that this is wrong**, and what evidence would prove it?
2. Which rubric criterion does this move — **show me the judge-visible proof**.
3. Did any number enter the UI from a literal, a guess, or a stale artifact?
4. Does anything I built compute clinical truth outside the domain/worker path?
5. Is every failure path handled with a designed state — or did I leave a blank screen?
6. Did I verify on **slow hardware / throttled CPU / 1366×768 / reduced motion / keyboard only**?
7. Is there a test that fails when this breaks? Did I watch it fail (mutation check)?
8. What did I assume that I have **not** verified this session?
9. What would a hostile reviewer click first to break this — did I click it?
10. Is this the **simplest** thing that scores the points? What can I delete?

### 9.4 Continuous self-improvement

- After each phase: a 5-line retrospective in Progress.md — what was slower than expected, which
  assumption was wrong, what to change in the next dispatch batch, which subagent prompt worked.
- Re-read your own diff before submitting. Tighten it. Delete dead code. Name things properly.
- If you find a better way than the plan states: implement it **only** if no contract changes;
  record it as a decision; if a contract must change, use Contract §51 change management (record,
  severity, fixture regeneration, reviewer) — never a local patch.

---

## 10. Progress.md protocol — the team's shared brain

`Progress.md` at the repository root is the **single coordination surface**. Update it:

- at session start (ORIENT block), whenever you claim or release an area, whenever you make a
  decision, whenever you hit a blocker, and at the end of every work unit — **not once per day.**

**Structure (keep these sections, append chronologically):**

```markdown
# CorTwin — Progress

## 0. Snapshot            ← regenerate every update: date/time, current phase, overall %,
                             build health (last green command), live URL, next dated deadline,
                             ACTIVE SESSIONS table (session id | area | files | status | updated)
## 1. Phase status        ← one row per phase P0–P9: state, gate G0–G10, evidence link, owner
## 2. Active claims       ← session id → claimed files/areas → claimed at → released at
## 3. Work log            ← newest first: timestamp | session | what changed | evidence | report (§9.2)
## 4. Decision log        ← date | decision | options compared | why | rubric impact | reversibility
## 5. Open conflicts      ← source-document contradictions found (never silently fixed)
## 6. Blockers & HD gates ← BLOCKED format entries, awaiting human
## 7. Verification board  ← VC-01…VC-15 + gates: status, last run command, last run time
## 8. Rubric scoreboard    ← 30/25/20/15/10 → what proves it → status → weakest link right now
## 9. Open items / risks  ← carry-forward list, owner, target date
## 10. Retrospectives     ← per-phase learnings for the next session
```

**Coordination rules:**
- Newest information goes at the top of each section; never rewrite history, append.
- A claim older than your session with no release is **stale** — verify with the owner or reclaim
  after noting it in the log.
- Never delete another session's entry. Never mark their work done without their evidence.
- Any session may rebuild `## 0. Snapshot` from the sections below — it is derived state.

---

## 11. Schedule, scope and cut order

**Scope tiers (do not confuse with phases P0–P9):**

- **P0 must survive:** real prediction · leakage-safe pipeline · calibration/threshold evidence ·
  exact SHAP + measurements · 3D LAD/LCX/RCA · input form · persistent disclaimer · one store /
  one registry · real Explore golden path · Trust evidence for the rubric · artifact integrity ·
  parity · privacy/no-egress · static deployable build · public repo + model weights ·
  document + video + AI disclosure.
- **P1 after P0 is real:** Evidence Rail · reliability/abstention presentation · range guard ·
  Validation interactions · Input Audit · deep links · responsive/motion polish.
- **P2 only if safe after hardening:** FastAPI reference endpoint · similar-patient lookup ·
  report upload · territory overlay. P2 may never touch model truth, protocol, privacy, state
  ownership, registry semantics or release reliability.

**When time disappears, compress scope — never correctness gates.**

Cut order under pressure: (1) P2 features → (2) non-essential P1 polish → (3) decorative motion /
chart styling → (4) 3D *richness*, never 3D *truth* (detailed mesh → optimised mesh → procedural
tubes → 2D schematic; vessel correspondence is never cut) → (5) simplify System/Trust
presentation while keeping the evidence and integrity checks.

**Never cut:** leakage protection · real prediction · calibration provenance · exact SHAP ·
missingness semantics · registry correspondence · one-store truth · real Explore path · safety
banner · privacy/no-egress · parity · artifact integrity · three-vessel 3D · submission
compliance · AI disclosure · required documentation and video.

---

## 12. Quick reference

**Repository root:** `C:\Users\LOUJAN B\Aquix` (source documents live in `Project/`, coordination
in `Progress.md`, this file at root). The application follows the Tech_Stack §17 layout
(`config/ data/ pipeline/ web/ api/ tests/ assets/ docs/`); record the exact placement decision in
Progress.md during P0 so every session agrees.

**Commands:**

```bash
make data          # fetch + checksum the UCI Extension of Z-Alizadeh Sani CSV
make reproduce     # full retrain/validate → results.json, model.json, fixtures (fixed seeds)
make test          # pytest + vitest parity
cd web; npm ci; npm run dev        # dev app
npm run build; npm run preview     # what you demo from (works offline, no network)
npx vitest run                     # parity / unit tests (JS side)
python -m pytest tests/ -q         # pipeline tests
```

**Pinned stack:** Node 22 · Python 3.12 · TypeScript **6.0.3** · Vite 8.3 · React 19.3 ·
three 0.186 · @react-three/fiber 9.8 · @react-three/drei 10.7 · zustand 5.0 · d3-scale(-chromatic,
cividis) · pandas 3.0 · numpy 2.5 · scikit-learn 1.9 · xgboost 3.4 (`enable_categorical=False`) ·
shap 0.52 (oracle only) · pytest 9.1 · vitest 5.0 · GitHub Actions + Pages (mirror: Cloudflare
Pages). **No backend, no database, no auth, no storage, no telemetry, no hosted AI API, $0 cost.**

**Core facts:** 303 patients × 59 columns · **54 model features** · targets `CAD, LAD, LCX, RCA` ·
forbidden inputs `LAD, LCX, RCA, Cath` (+ constant `Exertional CP`) · modalities History 17 /
Exam 13 / ECG 7 / Labs 14 / Echo 3 · parity **1e-5**, efficiency **1e-6** · nested CV 5×3/4 ·
no SMOTE · coherence rule CAD = max(CAD, vessels) · tiers `strong/moderate/limited` ·
decision `above/below/indeterminate` · degradation `G0–G6` · quality `Q0–Q3` · lanes `L0–L3`.

**ID namespaces:** `C-01…C-16` contracts · `AG-01…AG-12` agent rules · `PH-01…PH-13` phase
boundaries · `VC-01…VC-15` verification · `REL-DEV/INT/DEMO/SUBMISSION` releases ·
`HD-01…HD-08` human gates · `INV-*` invariants · `FM-01…FM-12` failure modes · `B-01…B-12`
budgets · `Q-…` open questions · `S0–S3` break severity.

---

## 13. Anti-patterns — invalid claims you must never make

| Invalid claim | Why it is invalid |
|---|---|
| "UI complete" | Only if real inference + store truth + registry mapping drive the visible state |
| "3D complete" | Never if vessel mapping is hardcoded or the scene reads the model artifact |
| "SHAP complete" | Only with exact fixture parity **and** the efficiency invariant passing |
| "Validation complete" | Never if any Trust number is manually entered |
| "Testing complete" | Never if only isolated units pass while e2e / request audit / artifact integrity / deploy smoke do not |
| "Deployment complete" | Never if only the dev server works — production build must run locally with the network **off**, and on the real host |
| "Performance target met" | Only when measured and labelled as measured |
| "Fallback implemented" | Never if it is silent or changes the meaning of data |
| "Done" | Only with the §9.2 report and green blocking tests |
| "I'll ask the human later" | Blocking threads are recorded as HD gates **and** you keep working on non-blocked units |

---

## 14. The standing order

1. **Read everything** at the start of every phase. **Update Progress.md** every time.
2. **Think first, research second, choose deliberately, record the choice.**
3. **Split the work and dispatch subagents in parallel batches** — never one at a time.
4. **Verify with evidence**, question yourself adversarially, then improve and re-verify.
5. **Follow the contracts, the architecture and the plan**; ask the human only for HD gates.
6. **Protect the 30/25/20/15/10 score map** with every decision.
7. **Ship P0 first, freeze Oct 12, document and record Oct 13, submit the evening of Oct 14.**

You are an engineering team. Act like one: own the outcome, push the standard, leave the next
session — and the judge — nothing to complain about.
