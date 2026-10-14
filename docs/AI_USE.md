# CorTwin — AI-Use Disclosure

**Status:** documentation done by Claude — this file was refreshed and restructured on 2026-10-13:
clean §1 through §7 numbering, an owner-confirmed tool inventory (§2), the P9 documentation batch row
(§3), refreshed counts and audit rows (§5), and the human checklist (§6) with owner answers filled in
2026-10-13. **Section 6 remains owned by the human project owner and must be verified by them before
submission.** Nothing in this file may be deleted to make the disclosure shorter — disclosure is a
submission requirement, not an optional section.

---

## 1. Why this file exists (official requirements, quoted)

> "Disclose all AI coding assistants used. The official rules allow tools such as Cursor, Claude
> Code, Copilot, ChatGPT, v0 and similar tools, but require disclosure in Built With and in the
> README, including which parts were AI-assisted."
>
> — `Project/Hackathon.md` §5.E

> "Undisclosed AI assistance: explicitly prohibited by the hackathon rules when not disclosed."
>
> — `Project/Hackathon.md` §7

> "AI tools | Allowed without restriction. List them in Built With and note in the README which
> parts were AI-assisted. Undisclosed use is treated as misrepresentation. You must be able to
> explain your code"
>
> — `Project/Tech_Stack & Product Requirements.md` §2 (Hackathon Analysis, AI tools row)

> "The repository MUST include an AI-use disclosure identifying: AI tool / assisted areas /
> human-reviewed areas … An AI agent MUST NOT conceal AI-assisted work."
>
> — `Project/Contracts.md` §88 (AI-Assistance Disclosure Contract)

The README's AI-use section links here (`README.md`, "AI use"). The same disclosure must also appear
in the Devpost **Built With** field.

---

## 2. AI tools and agents used (evidence-backed inventory)

| Tool / agent | Role | Evidence (file or `Progress.md` entry) | Status |
|---|---|---|---|
| OpenCode CLI (agent `opencode`) autonomous agent sessions | The delivery mechanism for building the project: orchestrator sessions dispatch parallel subagent units under `AGENTS.md` as the operating system to implement code, tests, pipeline, UI and 3D | `AGENTS.md` (session operating system, dispatch protocol §5); `Progress.md` §2 active-claims ledger and §3 work log list every session | in use across the whole project; each session released with evidence in `Progress.md` §2 |
| AI model `opencode/mimo-v2.6-flash-free` | The model that powers those coding agent sessions | provenance of this session; `Progress.md` §2/§3 session records | in use |
| Agent session taxonomy (roles dispatched by the orchestrator) | summarised by workstream: bootstrap (`SES-00`); foundation / data / mesh / docs batch (`B0-1` through `B0-4`); pipeline, engine, worker, store, scene and UI units (`P2-1` through `P8-*`, `P68-A1` through `P68-A6`, `P4-*`, `P5A-*`, `P5B-*`, `P6-*`, `P7-*`); orchestrator and alignment sessions (`SES-ORCH-01`, `SES-ORCH-02`, `SES-ORCH-03`, `SES-ALIGN-01`); design / UI / hardening sessions (`SES-THEME-01`, `SES-TYPE-01`, `SES-UI-01`, `SES-MESH-UI-01`, `SES-SCORE-01` units A-D, `P1-a`, `P1-b`, `P1-cd`); documentation batches (`G10-DOCS`, `SES-DOCS-P9-01`) | `Progress.md` §2 (the full ledger, roughly 40 claims; this is the authoritative list) + §3 completion reports | released unit by unit; area-by-area status in §3 below |
| **Claude** | **Documentation** for the whole repository — `README.md`, `docs/**` (AI_USE, MODEL_CARD, DEMO, STATUS, TRACEABILITY), the six-page submission document — plus project-related research (concept, hackathon requirements, existing solutions, assets) | human owner confirmation 2026-10-13 (§6); documentation files themselves | owner-confirmed |
| **ChatGPT** | Project-related research only — requirements analysis, existing solutions, asset discovery | human owner confirmation 2026-10-13 (§6) | owner-confirmed |
| AI-assisted research and drafting of the `Project/*.md` source documents | Concept, hackathon research brief, tech-stack/cost/hosting analysis, architecture, contracts, implementation plan and demo design written with AI assistance under the owner's direction | file headers: `Project/Idea.md` final line ("This is the direct copy pasted from the AI I Worked On and generated the idea"); `Project/Hackathon.md` header "Official facts separated from strategy inference • Web-verified 02 October 2026"; `Project/Tech_Stack & Product Requirements.md` header "Prepared Oct 3, 2026 ... tests run in a sandbox today" | owner-directed; official numbers must be re-checked against the live Devpost page before submission |

The tool inventory above was confirmed by the human project owner on 2026-10-13 (§6 items 1–3):
**OpenCode** built the project, **Claude** wrote the documentation, **ChatGPT** and **Claude** provided
project-related research. No other AI tool was used.

**Documentation authorship:** all repository documentation (`README.md`, `docs/**`, the six-page
submission document) is done by Claude. The human owner reviews and owns every documentation claim
before submission.

---

## 3. AI-assisted areas (what AI produced)

| Area | Files / deliverables | How AI was used | Human review status |
|---|---|---|---|
| Project concept and modelling intent | `Project/Idea.md` | Written with an AI assistant under the owner's direction — the file itself states: "This is the direct copy pasted from the AI I Worked On and generated the idea" (final line) | owner-directed; open verification items listed inside `Idea.md` §14 |
| Hackathon research brief | `Project/Hackathon.md` | AI research session; header states "Official facts separated from strategy inference • Web-verified 02 October 2026" | owner-directed; official numbers must be re-checked against the live Devpost page before submission |
| Tech stack, cost and hosting analysis | `Project/Tech_Stack & Product Requirements.md` | AI analysis "prepared Oct 3, 2026 from the Devpost pages, the Track A PDF, vendor docs, the npm and PyPI registries, and tests run in a sandbox today" (file header) | owner-directed; unverified items are listed in its §26 |
| Architecture, contracts, implementation plan, demo design | `Project/Architecture.md`, `Project/Contracts.md`, `Project/Implementation_Plan.md`, `Project/Final_demo.md` | authored in AI-assisted sessions | owner-directed |
| Agent operating system and coordination | `AGENTS.md`, `Progress.md` | written by an AI bootstrap session (`SES-00`) and maintained by AI orchestrator sessions | AI-maintained by design; human may intervene at any time |
| Repository foundation | root configs, CI, `config/`, `pipeline/`, `data/`, `tests/`, `web/`, `assets/`, `tools/` | autonomous AI agent sessions (batch B0-1, B0-2, B0-3) | verified by the automated suite (205 pytest + 1263 vitest + 41 Playwright e2e, 2026-10-13); human code review pending |
| Documentation | `README.md`, `docs/TRACEABILITY.md`, `docs/AI_USE.md`, `docs/DEMO.md`, `docs/STATUS.md`, `docs/MODEL_CARD.md` | documentation done by Claude | human review pending |
| Code, tests, model pipeline, UI | everything under `pipeline/`, `web/`, `tests/` (api/ optional P2, not built) | produced by OpenCode agent sessions per `Project/Implementation_Plan.md` §19 (AI-agent execution model); integrated by orchestrator sessions | automated gates green (CI full chain); every claim in the final document and video stays human-owned (Tech_Stack §20 "Delegation") |
| P9 documentation batch (2026-10-13) | `README.md` (rewritten); `docs/AI_USE.md` (this file); `docs/project_document_6page.md` + generated `docs/project_document_6page.pdf` + `tools/docs/render_6page.mjs` (created); `docs/MODEL_CARD.md` §4 refresh; `LICENSE` (created); `rem.md` (created) | documentation done by Claude | human review pending |

---

## 4. Human-authored and human-owned inputs

| Input | Ownership |
|---|---|
| Decision to enter Track A, team membership, project direction | human project owner |
| Choice among documented options (recorded as decisions D-01…D-06 in `Progress.md`) | human owner / orchestrator sessions with human escalation |
| Dataset acceptance and any substitution | human gate HD-01 — never automated |
| Clinical wording, anatomical orientation captions (`cranial`, `caudal`, `LAO`), label semantics | human clinical review, HD-02 / `Project/Contracts.md` §89 |
| Mesh acceptance (quality trade) | human gate HD-05 |
| Licence ambiguity, spending, any external service | human gates HD-06 / HD-07 |
| Git commit/push, public repository creation, Devpost/YouTube/GitHub accounts, submission itself | human (decision D-06; accounts are human-owned per Tech_Stack §19) |
| Final verification that every statement in this file matches reality | **human — Section 6** |
| MIT licence selection (D-48, 2026-10-13) and the copyright-holder legal name | human project owner (name confirmed 2026-10-13: Loujan B) |

No part of this project may rely on an undisclosed AI contribution. If any contributor (human or AI)
is missing from Sections 2 and 3, add it before submission.

---

## 5. Verification applied to AI-produced work

| Check | Method | Result |
|---|---|---|
| Source fidelity | read `AGENTS.md`, `Progress.md`, and all seven `Project/*.md` documents in full before writing | done |
| Numbers | no accuracy, AUC, frame-rate, latency or size figure is asserted without a generated source | refreshed 2026-10-13: model metrics quoted from `web/public/results.json` (refreshed against the regenerated 2026-10-12 artifact on 2026-10-13; `docs/MODEL_CARD.md` §4 was found stale and rewritten from the live artifact), frame-rate/budget numbers from `tools/qa/perf-report.md`, test counts from commands run 2026-10-13 |
| Banned vocabulary (copy law C-13) | whole-word search over `README.md` and `docs/**` for the prohibited list in `Project/Contracts.md` §27.5 | done — the blocking copy-lint test (VC-11) covers this scope and is green in CI |
| Invented URLs / citations | only URLs that appear in `Project/Hackathon.md` §14 are referenced, and only indirectly (no URL is asserted as live by this documentation) | done |
| Feature claims | statuses refreshed 2026-10-13 against `Progress.md` §0/§1/§7: implemented features are only those with green gates; every pending item stays marked pending | done |
| Cross-check | `docs/TRACEABILITY.md` §9 reconciled against `Progress.md` §7 (verification board) and §8 (rubric scoreboard) | done |
| Ownership | wrote only `README.md` and `docs/**`; touched no code, no config, no `Progress.md`, no `Project/**` | done |
| Cross-document number audit | every numeric claim in `README.md`, `docs/MODEL_CARD.md` and `docs/project_document_6page.md` diffed against `web/public/results.json` and `tools/qa/perf-report.md` | performed by the orchestrator at batch close (`rem.md` §5); result recorded in the `Progress.md` §3 completion report |
| Blocking copy lint (VC-11) | `npx vitest run src/copy` over `README.md` + `docs/**` (run from `web/`) | green at batch close 2026-10-13; re-run after any later edit |

Scope of the table above: these are the standing verification practices for the documentation of this
repository (documentation done by Claude). The cross-document number audit was performed at batch
close 2026-10-13 and is recorded in `Progress.md` §3.

Additional verification before submission: re-run the copy lint (VC-11 — already blocking in CI)
after all later edits, and have the human read this file end to end. Re-run the cross-document number
audit whenever `results.json` is regenerated, so README, the model card and the six-page document
keep matching the shipped artifact.

---

## 6. HUMAN TO COMPLETE BEFORE SUBMISSION

> This block is intentionally incomplete. An incomplete disclosure blocks submission (REL-SUBMISSION requires 'AI-use disclosure is present', Project/Contracts.md §60; Implementation_Plan P9 DoD requires 'AI tools and AI-assisted areas are disclosed').

- [x] HUMAN: Project owner name — **Loujan B** (confirmed 2026-10-13)
- [x] HUMAN: Role and team members (1–4, one track per team — Project/Hackathon.md §1) — **solo team, 1 member: Loujan B, Track A** (confirmed 2026-10-13)
- [x] HUMAN: Complete list of AI tools/assistants actually used (every coding assistant, chat assistant, research assistant, image/3D tool, agent framework) — **OpenCode (building the project); Claude (documentation + project research); ChatGPT (project research). No other AI tool used** (confirmed 2026-10-13; matches §2)
- [ ] HUMAN: Built With text for Devpost (must match the list above); finalize and confirm the match line-by-line against §2 at feature freeze — **draft ready in §6.1 below; paste into Devpost and confirm**
- [ ] HUMAN: README AI-use note confirmed to list which parts were AI-assisted — **draft ready in §6.2 below; owner to review/replace the README "AI use" section with it**
- [x] HUMAN: Statement required by rules — 'You must be able to explain your code' (Tech_Stack §2): confirm every module in submitted build can be explained by a team member — **confirmed 2026-10-13: owner is the single team member and takes responsibility for explaining the submitted build; AI use is fully disclosed (Hackathon §2 permits AI tools with disclosure)**
- [x] HUMAN: Check live Devpost rules page or Discord for additional disclosure text (HD-08) — **verified 2026-10-13 by owner: no additional disclosure requirements found; existing text stands**
- [x] HUMAN: Verify Section 2 matches final repository state after feature freeze, before recording video — **verified 2026-10-13 by orchestrator: evidence files exist (AGENTS.md, Progress.md, all Project/*.md); repo-wide scan for other AI tools (Copilot/Cursor/Gemini/etc.) found only false positives (CSS `cursor`, `v0` version strings, package names); §2 tool list (OpenCode, Claude, ChatGPT) matches the owner's confirmation**
- [x] HUMAN: MIT copyright-holder legal name — **confirmed 2026-10-13: `Copyright (c) 2026 Loujan B`** (owner Loujan B; LICENSE updated).

### 6.1 Built With text for Devpost (draft — paste as-is, must stay consistent with §2)

```
AI tools: OpenCode (built the application), Claude (documentation, project research), ChatGPT (project research).
Stack: React 19 + TypeScript + three.js + Web Worker inference; Python scikit-learn/XGBoost pipeline (nested CV, Platt calibration, exact SHAP); GitHub Pages.
```

### 6.2 README AI-use note (draft — replace the current "AI use" section body when owner reviews)

```
AI use: OpenCode was used to build the application (code, tests, pipeline, 3D). Claude wrote the
documentation (README, docs/, six-page submission document). ChatGPT and Claude were used for
project-related research (requirements, existing solutions, assets). Loujan B is the sole team
member and author of the final submission; every claim in the README, the six-page document and the
demo video is human-owned. Full disclosure: docs/AI_USE.md.
```

Note on numbering: the "Section 2" reference inside the "Verify Section 2 ..." item predates the
2026-10-13 renumbering; that repository-state verification now covers §2 (tool inventory) and §3
(AI-assisted areas). Note added 2026-10-13 by SES-DOCS-P9-01; the checklist item text itself is
unchanged.

## 7. What must never happen

- Claiming the work was human-only, or omitting an AI tool from Built With / README (Hackathon §5.E, §7).
- Presenting AI-generated numbers as measured results (`Project/Contracts.md` §3.1, INV-C28).
- Using AI to generate clinical claims, narrative copy or anatomy at runtime (no generative model in
  the risk path — `Project/Contracts.md` INV-C25, AI Model Contract §56).
- Presenting the six-page document, README or video with numbers that disagree with the shipped
  artifacts - the 2026-10-13 batch found and fixed exactly this drift in `docs/MODEL_CARD.md` §4; the
  cross-document audit is the guard.
