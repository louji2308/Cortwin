# CorTwin — AI-Use Disclosure

**Status:** draft written by an AI documentation agent on 2026-10-03; **Section 5 must be completed
and verified by the human project owner before submission.** Nothing in this file may be deleted to
make the disclosure shorter — disclosure is a submission requirement, not an optional section.

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

## 2. AI-assisted areas (what AI produced)

| Area | Files / deliverables | How AI was used | Human review status |
|---|---|---|---|
| Project concept and modelling intent | `Project/Idea.md` | Written with an AI assistant under the owner's direction — the file itself states: "This is the direct copy pasted from the AI I Worked On and generated the idea" (final line) | owner-directed; open verification items listed inside `Idea.md` §14 |
| Hackathon research brief | `Project/Hackathon.md` | AI research session; header states "Official facts separated from strategy inference • Web-verified 02 October 2026" | owner-directed; official numbers must be re-checked against the live Devpost page before submission |
| Tech stack, cost and hosting analysis | `Project/Tech_Stack & Product Requirements.md` | AI analysis "prepared Oct 3, 2026 from the Devpost pages, the Track A PDF, vendor docs, the npm and PyPI registries, and tests run in a sandbox today" (file header) | owner-directed; unverified items are listed in its §26 |
| Architecture, contracts, implementation plan, demo design | `Project/Architecture.md`, `Project/Contracts.md`, `Project/Implementation_Plan.md`, `Project/Final_demo.md` | authored in AI-assisted sessions | owner-directed |
| Agent operating system and coordination | `AGENTS.md`, `Progress.md` | written by an AI bootstrap session (`SES-00`) and maintained by AI orchestrator sessions | AI-maintained by design; human may intervene at any time |
| Repository foundation (in flight) | root configs, CI, `config/`, `pipeline/`, `data/`, `tests/`, `web/`, `assets/`, `tools/` | autonomous AI agent sessions (batch B0-1, B0-2, B0-3) | **not yet reviewed — no code exists to review at time of writing** |
| Documentation | `README.md`, `docs/TRACEABILITY.md`, `docs/AI_USE.md`, `docs/DEMO.md`, `docs/STATUS.md` | written by the AI documentation session (agent ID B0-4) on 2026-10-03 | self-checked by that session (Section 4); human review pending |
| Future code, tests, model pipeline, UI | everything under `pipeline/`, `web/`, `tests/`, `api/` | planned to be produced by AI agent sessions per `Project/Implementation_Plan.md` §19 (AI-agent execution model) | every claim in the final document and video stays human-owned (Tech_Stack §20 "Delegation") |

**This documentation session specifically:** run inside the OpenCode CLI agent `opencode`, model
`opencode/mimo-v2.6-flash-free`, agent role "Documentation / Traceability (B0-4)". It wrote only
`README.md` and `docs/**`.

---

## 3. Human-authored and human-owned inputs

| Input | Ownership |
|---|---|
| Decision to enter Track A, team membership, project direction | human project owner |
| Choice among documented options (recorded as decisions D-01…D-06 in `Progress.md`) | human owner / orchestrator sessions with human escalation |
| Dataset acceptance and any substitution | human gate HD-01 — never automated |
| Clinical wording, anatomical orientation captions (`cranial`, `caudal`, `LAO`), label semantics | human clinical review, HD-02 / `Project/Contracts.md` §89 |
| Mesh acceptance (quality trade) | human gate HD-05 |
| Licence ambiguity, spending, any external service | human gates HD-06 / HD-07 |
| Git commit/push, public repository creation, Devpost/YouTube/GitHub accounts, submission itself | human (decision D-06; accounts are human-owned per Tech_Stack §19) |
| Final verification that every statement in this file matches reality | **human — Section 5** |

No part of this project may rely on an undisclosed AI contribution. If any contributor (human or AI)
is missing from Section 2, add it before submission.

---

## 4. Verification applied to AI-produced work (this documentation session)

| Check | Method | Result |
|---|---|---|
| Source fidelity | read `AGENTS.md`, `Progress.md`, and all seven `Project/*.md` documents in full before writing | done |
| Numbers | no accuracy, AUC, frame-rate, latency or size figure is stated in `README.md` or `docs/**`; every number is either a quoted dataset fact with a cited source or an explicitly labelled design target | done — see report evidence |
| Banned vocabulary (copy law C-13) | whole-word search over `README.md` and `docs/**` for the prohibited list in `Project/Contracts.md` §27.5 | done — no prohibited phrase present; see report evidence |
| Invented URLs / citations | only URLs that appear in `Project/Hackathon.md` §14 are referenced, and only indirectly (no URL is asserted as live by this documentation) | done |
| Feature claims | every status marked `not started` / `planned` / `in progress`; no feature is described as working | done |
| Cross-check | `docs/TRACEABILITY.md` §9 reconciled against `Progress.md` §7 (verification board) and §8 (rubric scoreboard) | done |
| Ownership | wrote only `README.md` and `docs/**`; touched no code, no config, no `Progress.md`, no `Project/**` | done |

Additional verification that must happen before submission (not done by this session): run the copy
lint (VC-11) over the full repository including this file, re-run the banned-word search after all
later edits, and have the human read this file end to end.

---

## 5. HUMAN TO COMPLETE BEFORE SUBMISSION

> **This block is intentionally incomplete. An incomplete disclosure blocks submission
> (`REL-SUBMISSION` requires "AI-use disclosure is present", `Project/Contracts.md` §60; and
> Implementation_Plan P9 DoD requires "AI tools and AI-assisted areas are disclosed").**

- [ ] **Project owner name:** _to be filled in_
- [ ] **Role and team members (1–4, one track per team — `Project/Hackathon.md` §1):** _to be filled in_
- [ ] **Complete list of AI tools/assistants actually used** (every coding assistant, chat assistant,
      research assistant, image/3D tool, and the agent framework; the rules' examples are "Cursor,
      Claude Code, Copilot, ChatGPT, v0 and similar tools" — list what was *used*, not the examples): _to be filled in_
- [ ] **Built With text for Devpost** (must match the list above): _to be filled in_
- [ ] **README AI-use note confirmed** to list which parts were AI-assisted: _check after any README edit_
- [ ] **Statement required by the rules — "You must be able to explain your code"
      (Tech_Stack §2):** confirm every module in the submitted build can be explained by a team
      member: _to be confirmed_
- [ ] **Any additional disclosure text required by the live Devpost rules page or Discord**
      (HD-08: Discord-only requirements are not visible to agents): _to be checked before Oct 12_
- [ ] **Verification that Section 2 matches the final repository state** (re-read after feature
      freeze, before the video is recorded): _to be confirmed_

---

## 6. What must never happen

- Claiming the work was human-only, or omitting an AI tool from Built With / README (Hackathon §5.E, §7).
- Presenting AI-generated numbers as measured results (`Project/Contracts.md` §3.1, INV-C28).
- Using AI to generate clinical claims, narrative copy or anatomy at runtime (no generative model in
  the risk path — `Project/Contracts.md` INV-C25, AI Model Contract §56).
