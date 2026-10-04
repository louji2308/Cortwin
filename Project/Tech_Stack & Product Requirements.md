# CorTwin: verified tech stack and execution plan

*Track A, Multimodal AI Hackathon 2026. Prepared Oct 3, 2026 from the Devpost pages, the Track A PDF, vendor docs, the npm and PyPI registries, and tests run in a sandbox today.*

**Verdict:** build a static, client-side app. Python trains and exports once. The browser runs the models, exact SHAP and the 3D scene. Everything on the runtime and hosting path is free, needs no account beyond GitHub, and uses no API key. Estimated total spend: $0.

## 1. Project Understanding

- **What it does:** CorTwin takes a clinical profile in five groups (history, exam, ECG, labs, echo; 54 features), predicts overall CAD and stenosis in LAD, LCX and RCA, colours three vessels on a 3D heart, and explains each number with exact SHAP.
- **Who and journey:** judges, clinicians, students. Open on a preloaded patient, rotate and click a vessel, press the Evidence Ladder, edit one field, read why, then open Validation and flip the leakage toggle.
- **Differentiators (build these yourself):** calibrated, leakage-safe probabilities with reliability tiers; the Evidence Ladder; modality-to-feature SHAP that reconciles exactly; an honest Validation page.
- **Input to output:** form values, then a feature vector, then a worker (trees + logistic regression + Platt scaling), then four probabilities, an uncertainty band and SHAP, then the store, then 3D colours and the dashboard.
- **Essential:** pipeline with honest metrics, three selectable vessels, cards, SHAP, measurements table, disclaimer, live link, video, 6-page document.
- **Optional:** FastAPI endpoint, similar-patient lookup, report upload.
- **Biggest time sinks and risks:** mesh preparation, JavaScript parity with XGBoost, and the document plus video.
- **Simplifiable:** no backend, database, auth or LLM. 'Multimodal' here means five kinds of clinical evidence fused in one model, not images or audio.
- **Must be demo-grade:** prediction parity, the colour-versus-threshold legend, the disclaimer, and 3D frame rate.

## 2. Hackathon Analysis

| Item | Verified on Devpost, Oct 3 | Engineering consequence |
| --- | --- | --- |
| Organisers | KamandPrompt (IIT Mandi) with Augli.ai, PurpleRain Tech, LDV Labs | None |
| Dates | Problem statements Sep 30. Development to Oct 14 EOD. Deadline Oct 15, 12:15am IST. Judging Oct 15-20. Showcase and winners Oct 21 | The live link must survive until Oct 21, so no trial-period services |
| Team | 1-4 members, one track per team | None |
| Prizes | Track A: ₹15,000 first, ₹10,000 second | None |
| AI tools | Allowed without restriction. List them in Built With and note in the README which parts were AI-assisted. Undisclosed use is treated as misrepresentation. You must be able to explain your code | Add an AI-use section to the README and document. Keep modules small enough to explain |
| Judging | Industry expert panel, names to be announced. Criteria live in the problem-statement PDF | Track A weights: prediction 30, 3D 25, interpretability 20, integration 15, technical 10 |
| Submission | On Devpost. The page says submission requirements ship with the problem statements | From the PDF: prototype, pipeline with model weights, dashboard, document of at most 6 pages, 3-10 minute YouTube video |
| Eligibility | Overview says students only, ages 14+. Rules say primarily for college students, with all eligible individuals allowed | Confirm on Discord if this applies to you |
| Not visible | Further information is shared on the official Discord after registration | Check Discord for submission-form details before Oct 12 |

The event is pitched around generative and agentic AI, but the Track A criteria in the PDF are the five above. Nothing in them requires a generative model, so none is used in the risk path.

## 3. Core Technical Requirements

Priority: P0 mandatory, P1 important, P2 optional. Complexity and risk: L, M, H.

| ID | Requirement | Pri | Cx | Risk |
| --- | --- | --- | --- | --- |
| F1 | Predict CAD, LAD, LCX, RCA from 54 features; exclude LAD, LCX, RCA, Cath | P0 | M | L |
| F2 | 3D heart, three separately selectable vessels coloured by calibrated probability; rotate, zoom, select | P0 | H | H (meshes) |
| F3 | Cards, modality and feature SHAP bars, measurements table with contribution | P0 | M | M |
| F4 | Persistent safety disclaimer | P0 | L | L |
| F5 | Input form with preloaded patient and per-modality 'not provided' | P0 | M | L |
| F6 | Range guard ('outside training range' chip) | P1 | L | L |
| F7 | Evidence Ladder under the canvas | P1 | M | M |
| F8 | Validation page: CIs, calibration, thresholds, leakage toggle | P0 table, P1 toggle | M | L |
| N1 | Responsive on integrated graphics: render on demand, capped pixel ratio, quality drop | P0 | M | M |
| N2 | Input edit to recolour under 100 ms (target, not yet measured in JS) | P0 | M | M |
| N3 | `make reproduce` regenerates every figure from fixed seeds into `results.json` | P0 | M | L |
| N4 | Extensibility: features, targets and vessels defined in config plus a registry | P0 | M | L |
| N5 | Patient inputs never leave the browser | P0 | L | L |
| A1 | Nested CV, calibration, tuned thresholds, CIs, no SMOTE | P0 | M | L |
| A2 | Exact SHAP in TypeScript matching Python to 1e-5 | P0 | H | H |
| A3 | Unprovided modalities marginalised, not zero-filled | P1 | M | M |
| I1 | Public URL on a free static host through Oct 21 | P0 | L | L |
| I2 | CI: lint, pytest, vitest parity, build, deploy | P1 | L | L |
| I3 | FastAPI reference endpoint | P2 | L | L |
| H1 | 3-10 minute YouTube video | P0 | M | M |
| H2 | Document of at most 6 pages | P0 | M | L |
| H3 | README AI-use note and Built With list | P0 | L | L |
| H4 | Model weights in the repo | P0 | L | L |
| D1 | Deterministic preloaded patient; demo runs from a local build with no network | P0 | L | L |

## 4. Architecture Requirements

- **No server in the critical path.** Inference, SHAP and rendering all run in the browser, so there is no cold start, no key and no privacy question.
- **One state model.** A single store drives the form, the ladder chips, the SHAP bars and the vessel colours.
- **One registry.** Each vessel's id, mesh name, model target and UI card come from one file, with a test.
- **Config-driven.** Adding a feature or structure means editing JSON, not code. The video can demo this.
- **Numbers come from files.** Every figure in the app, README, document and video is generated from `results.json`.
- **Weak-hardware first.** Small models, decimated meshes, render on demand.
- **Zero third-party requests at runtime.** System fonts, same-origin assets, which also makes the offline demo possible.

## 5. Build vs Integrate vs Avoid

| Component | Decision | Reason |
| --- | --- | --- |
| Training and validation pipeline | Build, on scikit-learn and XGBoost | Core of the 30% criterion |
| Inference worker and exact SHAP | Build | Core differentiator. Depth-2 trees keep it small |
| 3D engine | Integrate (three.js, React Three Fiber, drei) | Named in the PDF. Do not write a renderer |
| Anatomy meshes | Integrate BodyParts3D, build the Blender merge | Licence fits. Merging multi-part vessels is real work |
| Colour ramp | Integrate d3-scale-chromatic (cividis) | Colour-blind-safe, no hand-tuned palette |
| Charts | Build thin SVG with d3-scale | A few bars and curves. A chart library adds weight and styling fights |
| UI components | Avoid a library | Native details and summary for accordions. Custom look |
| Hosting, CI | Integrate GitHub Pages and Actions | Repo, CI and host under one account |
| Backend, database, auth, uploads | Avoid | No accounts, no stored data, no files |
| LLM or vision API | Avoid in the risk path | Hallucination risk, cost, privacy, and the criteria do not reward it |
| Monitoring and analytics | Avoid | A no-telemetry privacy claim is a stronger story |
| Kubernetes, queues, microservices | Avoid | No value here |
| Video | Integrate OBS and YouTube | Required by the brief |

## 6. Candidate Technologies

| Subsystem | Candidates considered |
| --- | --- |
| Model runtime | Hand-written TypeScript tree walker; onnxruntime-web; XGBoost compiled to WASM; server-side FastAPI |
| Explanations | Own exact SHAP in TypeScript; `shap` on a server; LIME |
| 3D | React Three Fiber with drei; plain three.js; VTK.js; Babylon.js |
| Meshes | BodyParts3D; Sketchfab and NIH 3D models; paid marketplace models; procedural tubes |
| Static hosting | GitHub Pages; Cloudflare Pages; Netlify; Vercel; Render static; Hugging Face Static Space |
| Reference API host | Render free web service; Hugging Face Docker Space; local Docker only |
| State and styling | zustand or React context; plain CSS, Tailwind or a component library |
| Charts | Hand-rolled SVG with d3-scale; Recharts; Chart.js |
| Data and auth | None; Supabase; Firebase; SQLite |
| AI APIs | None; a hosted text or vision model |

## 7. Technology Evaluation

| Decision | Winner | Why it survived | Why the others lost |
| --- | --- | --- | --- |
| Model runtime | TypeScript tree walker plus logistic regression in a Web Worker | A plain walker reproduced XGBoost to 3e-7 in Python last session. Exact SHAP needs the tree structure anyway | A conversion runtime adds a dependency and a failure point. A server adds cold starts and sends patient data off-device |
| Explanations | Own exact interventional SHAP, `shap` as parity oracle only | Depth-2 trees mean at most 8 feature subsets per tree. Additive models make attributions reconcile exactly | LIME is approximate and unstable. A server-side `shap` needs the server |
| 3D | React Three Fiber 9.8 with drei 10.7 on three 0.186 | Peer ranges line up: r3f wants react >=19 <19.4 and React is 19.3.0; drei wants r3f ^9 and three >=0.159. State binding is declarative | VTK.js and Babylon.js are heavier for a three-vessel scene. Plain three.js is the fallback if r3f causes friction |
| Meshes | BodyParts3D | CC BY-SA 2.1 Japan. The part list includes trunk of right coronary artery (FMA3802), trunk of left coronary artery (FMA3855) and the anterior interventricular branch (FMA3862) | A Sketchfab model derived from BodyParts3D is CC BY-NC-SA. A marketplace model I saw costs $28 |
| Primary host | GitHub Pages via Actions | Free for public repos. Site up to 1 GB, soft 100 GB a month bandwidth. The 10-builds-per-hour soft limit does not apply to custom Actions workflows | Netlify's free plan is credit-based with a hard cap per a third-party summary. Vercel not needed |
| Mirror host | Cloudflare Pages | 500 builds a month, 25 MiB per file, 20,000 files, 100 projects on the Free plan | None. It is the switch-over option |
| Reference API | Local Docker, optional Render | Render free: 750 instance-hours a month, spins down after 15 minutes idle, wakes in about a minute | Hugging Face: the current Hub docs say creating a Docker Space needs a paid plan, though older guides call it free. Treat as not free |
| Toolchain | Vite 8.3.2, React 19.3.0, TypeScript 6.0.3, vitest 5.0.3 | vitest 5.0.3 supports vite ^8. plugin-react 6.1.1 needs vite ^8 | TypeScript 7.0.2 is npm's latest, but typescript-eslint 8.71.0 supports only >=4.8.4 <6.1.0. Pin 6.0.3 |
| State, styling, charts | zustand 5.0.15, plain CSS variables, SVG with d3-scale | Fewest dependencies, full control of the dark-stage look | Tailwind, component libraries and chart libraries add weight and hide the design |
| Data, auth, AI API | None | Nothing in Track A needs them | Each adds cost, setup and a failure mode |

## 8. Final Technology Stack

- **Frontend:** React 19.3, TypeScript 6.0.3, Vite 8.3, plain CSS.
- **3D:** three 0.186, @react-three/fiber 9.8, @react-three/drei 10.7.
- **State and charts:** zustand 5.0, d3-scale and d3-scale-chromatic 3.1, hand-built SVG.
- **Inference and SHAP:** TypeScript Web Worker.
- **Pipeline:** Python 3.12, pandas 3.0, numpy 2.5, scikit-learn 1.9, xgboost 3.4, shap 0.52 (oracle only), pytest 9.1.
- **Meshes:** BodyParts3D, Blender, @gltf-transform/cli 4.5. Fallback: procedural tubes.
- **Hosting and CI:** GitHub Pages and Actions. Mirror: Cloudflare Pages.
- **Optional:** FastAPI 0.142 reference endpoint, local Docker.
- **Backend, database, auth, storage, monitoring, AI API:** none.

## 9. Full System Architecture

```
BUILD TIME (laptop and CI)                       RUN TIME (judge's browser)
data CSV -> encode -> nested CV -> export         static host (GitHub Pages)
   |                                                |  index.html, JS, CSS
   v                                                |  model.json, results.json, registry.json, *.glb
results.json, model.json, golden fixtures           v
BodyParts3D -> Blender -> gltf-transform -> .glb   React UI <-> zustand store <-> Web Worker
                                                     |                         (trees, LR, Platt, SHAP)
                                                     v
                                                 R3F scene (vessel colour comes from the store)
```

- **Request flow:** edit a field, store updates, the worker receives the feature vector plus an observed-mask, returns four probabilities, band, per-feature SHAP and modality sums, then the UI and scene re-render.
- **AI inference flow:** standardise, XGBoost logit and logistic logit, average, Platt scale, compare with the tuned threshold, assign tier and band, apply the coherence rule (CAD = max of CAD and vessel probabilities).
- **Data flow:** files are read-only at runtime. No writes anywhere.
- **Authentication and upload flow:** none by design.
- **Error flow:** worker error, retry on the main thread, then a visible banner. WebGL failure shows a static poster plus the 2D vessel table.
- **Deployment flow:** push to main, CI runs lint, pytest, vitest parity and build, then deploys to Pages.

## 10. Multimodal AI Architecture

**Minimum pipeline that makes the product strong:** five evidence groups fused in one additive model, with attribution per group.

- **Modalities:** History (17 features), Exam and symptoms (13), ECG (7), Labs (14), Echo (3). The grouping is our own choice, since UCI defines four groups.
- **Fusion:** XGBoost and logistic logits averaged, then Platt scaling. Everything stays additive in log-odds, so group contributions are sums of feature SHAP values and always reconcile.
- **Missing evidence:** unprovided modalities are marginalised over a 60-row background set. The prediction-level behaviour was verified last session. The attribution restriction to observed features still needs a unit test.
- **Why it improves the product:** the Evidence Ladder shows how each kind of evidence moves each vessel. That is the multimodal story, and it is true.
- **Models and APIs:** none hosted. Rationale text comes from templates over the top contributors, so it cannot invent anything.
- **Cost and latency:** $0. SHAP took about 30 ms per patient in numpy. The JavaScript figure is not yet measured.
- **Optional, not in the lock:** an ECG or report image to field-extraction step with a vision model, with human confirmation. I did not verify any provider's free tier, so it stays out.

## 11. Data Architecture

- **Source:** UCI Extension of Z-Alizadeh Sani, 303 patients, 59 columns, CC BY 4.0 (verified on the UCI page last session). The vessel columns were not reproducible this session because UCI and Kaggle are blocked in the sandbox.
- **Raw data:** fetched by `make data` with a checksum. Commit it only if you are comfortable with CC BY 4.0 attribution.
- **Shipped artifacts:** `model.json` (about 400 KB estimated from last session's 564 KB for 1,200 trees; confirm after export), `results.json`, `registry.json`, background rows, percentile tables, `.glb` meshes.
- **Encoding:** strict maps that raise on unknown values. Sex: Male=1, 'Fmale'=0. BBB: N, LBBB, RBBB. VHD: N, mild (lowercase), Moderate, Severe.
- **Computed field:** BMI equals Weight over (Length/100) squared, so make it read-only. Group Weight, Length and BMI as one 'Body size' row in explanations.
- **Example patients:** some real cohort rows, labelled as training data, plus two or three hypothetical profiles.

## 12. Integration Architecture

| Integration | Purpose | Direction | Runtime dependency? |
| --- | --- | --- | --- |
| GitHub repo, Actions, Pages | Source, CI, hosting | Push, deploy | Hosting only |
| BodyParts3D | Anatomy, one-time export | Build time | No |
| UCI dataset | Training data, one-time download | Build time | No |
| YouTube | Video | Upload | No |
| Devpost | Submission | Manual | No |
| Render (optional) | Reference API | Browser or curl | No |

At runtime the app makes no third-party requests, and you can show that in the DevTools Network tab during the video.

## 13. Cost Architecture

- **Target:** $0, against a budget of $0-$2.
- **Hosting:** GitHub Pages. Mirror: Cloudflare Pages.
- **Compute:** none after export. Inference runs on the viewer's device.
- **Usage:** a site of a few MB, judged over Oct 15-21, is far below the verified limits.
- **Where a charge could appear:** only if you add paid hosting or a hosted model. Neither is in the plan.

## 14. Cost Safety Table

| Service | Purpose | Free? | Free limit | Card required? | Expected usage | Est. cost | Risk |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GitHub repo, Actions, Pages | Host, CI | Yes | Pages: 1 GB site, 100 GB a month soft, 10 deploy-minutes timeout (verified). Actions minutes for public repos: not re-checked | Not expected; not verified | Few MB, tens of builds | $0 | Low |
| Cloudflare Pages | Mirror | Yes | 500 builds a month, 25 MiB per file, 20,000 files, 100 projects (verified) | Not verified | A few MB | $0 | Low |
| Render free web service | Optional API | Yes | 750 instance-hours a month, sleeps after 15 min, about 1 min wake (verified) | Not verified | Demo only | $0 | Medium: cold start, so off the critical path |
| Hugging Face Docker Space | Rejected | Conflicting docs; current Hub docs say a paid plan is needed | n/a | n/a | Not used | $0 | Avoid: surprise cost |
| YouTube | Video | Yes | One upload | No | One 3-10 min video | $0 | Low: processing delay, so upload early |
| Devpost | Submission | Yes, registration is free | n/a | No | One project | $0 | Low |
| BodyParts3D | Meshes | Yes | CC BY-SA 2.1 Japan | No | One-time | $0 | Share-alike obligation |
| npm, PyPI | Packages | Yes | n/a | No | One-time | $0 | Low |

**Total expected: $0.**

## 15. Security Strategy

- **No secrets exist.** There are no API keys and no backend credentials. `.env.example` is empty by design. CI deploys with GitHub's built-in permissions and stores nothing.
- **Privacy by architecture.** Patient inputs never leave the browser, and there is no analytics or telemetry. Show the empty Network tab in the video.
- **Input validation.** Strict encoders throw on unknown categories (for example, `mild` is lowercase while `Moderate` is capitalised). A range guard flags values outside the training range. BMI is computed, not typed.
- **Supply chain.** Commit lockfiles, install with `npm ci`, pin the versions in section 27, and run `npm audit` once at the freeze.
- **Headers.** Add a Content-Security-Policy `<meta>` tag with `default-src 'self'`, `worker-src 'self' blob:` and `img-src 'self' data:`, then test the app under it. Cloudflare Pages also supports a `_headers` file (up to 100 rules, verified).
- **AI misuse.** No generative model sits in the risk path, so there is no prompt-injection surface. Copy rules: say 'estimates', never 'detects', 'diagnoses' or 'guides'.
- **Licences.** BodyParts3D needs attribution, and derived meshes ship under the same share-alike licence. The dataset needs CC BY 4.0 attribution.
- **Optional API.** If you deploy it: closed CORS, no logging of inputs, and never on the critical path.

## 16. Failure & Fallback Strategy

| Dependency | Failure mode | Impact | Fallback |
| --- | --- | --- | --- |
| GitHub Pages | Outage, or a deploy limit | Judges cannot open the link | Cloudflare Pages mirror built from the same repo, plus the YouTube video and README screenshots |
| Meshes | Poor quality or under 30 fps | 25% criterion at risk | Procedural CatmullRom tubes along hand-placed centrelines, decided on Oct 4 |
| WebGL or slow GPU | Low frame rate, no context | Unusable 3D | Render on demand, capped pixel ratio, automatic quality drop, then a static poster plus a 2D vessel table |
| Web Worker | Fails to start | No predictions | Run the same code on the main thread and show a banner |
| JS and Python parity | Float drift | Wrong numbers | Golden fixtures at 1e-5, `Math.fround`, exported base score. Parity runs in CI |
| Dataset download | UCI or Kaggle blocked or changed | Pipeline cannot run | Keep a checksum and a local copy. Never rely on a live download during judging |
| Render API (optional) | Cold start of about a minute, or suspension | Reference endpoint slow | Not on any critical path. Local Docker is the primary reference |
| YouTube | Processing delay or visibility error | Missing deliverable | Upload on Oct 13 and check it logged out. Keep a local MP4 |
| Devpost | Form or upload issues | Missed submission | Submit on the evening of Oct 14 IST, not at the deadline |
| Network at demo time | None or flaky | Live demo fails | Everything is same-origin. Record and demo from `npm run preview` |

## 17. Repository Structure

```
cortwin/
  README.md            run, reproduce, AI-use disclosure, requirement coverage
  Makefile             data, reproduce, export, test, web, build
  .github/workflows/ci.yml
  config/
    features.json     54 features: type, group, encoding, min, max
    targets.json      CAD, LAD, LCX, RCA
    registry.json     vessel id, mesh name, model target, UI card
  data/               fetched by script, checksums.txt
  pipeline/           encode.py train.py validate.py export_model.py shap_exact.py
  web/
    public/           model.json, results.json, models/*.glb
    src/              scene/ panels/ worker/ validation/ registry/ store.ts
  api/                optional FastAPI /predict, Dockerfile
  tests/              test_leakage.py test_encode.py test_parity.py, vitest fixtures
  assets/             blender source, ATTRIBUTION.md
  docs/               MODEL_CARD.md ARCHITECTURE.md AI_USE.md DEMO.md
```

**Documents worth having:** `README` (run it, reproduce it, coverage table), `MODEL_CARD` (data, protocol, limits, disclosures), `ARCHITECTURE` (diagrams, data flow, stack), `AI_USE` (required by the rules), `DEMO` (click path and video script). Skip `API.md` unless you deploy the API.

## 18. Development Environment

- **VS Code extensions:** ESLint, Prettier, Python with Pylance, Ruff, Vitest. Nothing else.
- **Runtimes tested today:** Node 22 and Python 3.12.
- **Package managers:** npm for the web app, pip in a venv for the pipeline. One less tool to learn than pnpm or uv.
- **Commands:**
  - `make data` fetches and checksums the CSV.
  - `make reproduce` runs nested CV and writes `results.json`, `model.json` and fixtures.
  - `make test` runs pytest and vitest parity.
  - `cd web && npm ci && npm run dev` starts the app.
  - `npm run build && npm run preview` is what you demo from.
- **Git:** trunk-based with short branches, CI on every push, and a `submission-v1` tag.
- **Env vars:** none required.
- **Debugging:** drei's `Stats` for frame rate, Chrome Performance with 4x CPU throttling to mimic weak hardware, `pytest -k` for the pipeline.
- **Pin note:** use TypeScript 6.0.3, not the 7.x that npm currently calls latest.

## 19. Required Tools / Accounts / Services

| Item | Purpose | Cost | Required? |
| --- | --- | --- | --- |
| VS Code, Node 22, Python 3.12, Git | Development | Free | Yes |
| Blender | Align, merge and decimate meshes | Free | Yes, unless procedural tubes are chosen |
| OBS Studio | Record the video | Free | Yes |
| GitHub account and public repo | Source, CI, Pages | $0 | Yes |
| Devpost account | Submission | $0 | Yes |
| YouTube account | Video | $0 | Yes |
| Cloudflare account | Mirror host | $0 | Optional |
| Render account | Optional API | $0 | Optional |
| Docker | Run the optional API locally | Free | Optional |

**Project resources to create:** a public GitHub repo, Pages enabled with the Actions source, and nothing else. No database, no bucket, no API keys.

## 20. Implementation Roadmap

| Phase and dates | Objective and tasks | Depends on | Output | Risk | Done when |
| --- | --- | --- | --- | --- | --- |
| 0. Foundation, Oct 3-4 | Repo, CI skeleton, clean-install smoke test of every pinned package, get the extension CSV, mesh gate: three selectable vessels at 30 fps or more on integrated graphics | None | Green CI, data file, mesh decision | Mesh quality, data access | Oct 4 evening: meshes accepted or procedural tubes chosen |
| 1. Pipeline, Oct 3-5 | Encode, nested CV for four targets, calibration, thresholds, CIs, leakage numbers | Data file | `results.json` matching last session's table within 0.01 | Vessel numbers never reproduced yet | Table reproduced, leakage guard test passes |
| 2. Export and parity, Oct 5-6 | `model.json`, TypeScript worker, golden fixtures, parity tests | Phase 1 | Worker passes parity at 1e-5 | Float drift | All fixtures green |
| 3. UI and 3D (P0), Oct 6-9 | Config-driven form, store, scene via registry, cards, SHAP bars, measurements table, disclaimer, deploy | Phase 2, mesh decision | Live URL by Oct 9 | Frame rate | Opens correctly in a fresh browser |
| 4. P1 features, Oct 10-11 | Ladder, band and tiers, Validation page with leakage toggle, range guard, input audit, presets | Phase 3 | Feature-complete build | Scope creep | P0 done, chosen P1 done |
| 5. Hardening, Oct 12 | Feature freeze, throttled-CPU test, offline run from preview, CSP, README, model card | Phase 4 | Release candidate | Late bugs | `rc1` tagged |
| 6. Document and video, Oct 13 | Six-page PDF, record from local build, upload | Phase 5 | PDF, YouTube link | Processing delay | Video plays logged out |
| 7. Submission, Oct 14 | Fresh-browser check of the live link and mirror, submit in the evening IST | All | Submission confirmed | Devpost glitches | Done before Oct 15, 12:15am IST |

**Delegation:** coding agents can safely take scaffolding, config-driven forms and panels, SVG charts, tests generated from fixtures, CI YAML, and README tables. Keep these human: model and validation judgement, parity debugging, mesh acceptance, clinical wording, and every claim in the document. Fix the worker message schema before splitting UI and worker work, because that contract is the tightest coupling in the project.

## 21. Demo-First Strategy

**Critical path:** open app on a preloaded patient, rotate and click a vessel, press Ladder, edit one field, read SHAP and the measurements table, open Validation, flip the leakage toggle.

- **Must be real:** predictions, SHAP, calibration and leakage numbers. These are the core claim and are never faked.
- **Cached or static:** `results.json`, meshes, background rows.
- **Deterministic:** the preloaded patient, the fixed seed, the example profiles.
- **Fallback:** poster plus 2D table for WebGL failure, main-thread inference if the worker fails.
- **Simulated:** nothing in the risk path. The config-driven feature-add in the video is a sped-up, labelled cut.
- **Must never fail:** first paint with a coloured heart, the disclaimer, and the vessel click.
- **Rehearse:** record from `npm run preview` on the weakest laptop you have, with Wi-Fi off once.

## 22. Hackathon Submission Requirements

- Devpost project submitted to Track A, in the evening of Oct 14 IST (deadline Oct 15, 12:15am IST).
- Public repo with the pipeline, model weights (`model.json`), tests and README.
- Live URL that stays up through Oct 21.
- YouTube video of 3-10 minutes showing the workflow, 3D interactions and technical implementation.
- Project document of at most 6 pages.
- AI tools listed in Built With, and the README stating which parts were AI-assisted. Be ready to explain every module.
- Visible safety disclaimer in the UI.
- Check the Discord for any submission-form details that were not on Devpost.

## 23. Risks and Mitigations

| Risk | Mitigation |
| --- | --- |
| Mesh quality or merge effort | Oct 4 gate, then procedural tubes |
| Vessel-level results not yet reproduced | Get the CSV on day one, and report whatever `make reproduce` yields |
| JS parity bugs | Golden fixtures from day one, `Math.fround`, 1e-5 tolerance |
| Toolchain version clashes | Day-1 clean install, pin TypeScript 6.0.3, fall back to plain three.js if r3f causes friction |
| Judges anchoring on inflated competitor numbers | Leakage toggle and reliability tiers explain the gap |
| Time | P0 first, feature freeze Oct 12 |
| Slow judge laptop | Render on demand, quality drop, static poster |
| Rules | Disclose AI use, explain every module |

## 24. Self-Critique

- **Overengineering?** The stack has no server, database or auth. The remaining complexity is the model, the worker and the scene, which are the scored parts.
- **Can it be free?** Yes, and it is. No component needs a paid tier.
- **Does free survive judging?** GitHub Pages and Cloudflare Pages have no trial expiry. Render free sleeps, so it is not in the critical path.
- **Does anything fail in the demo?** Network, WebGL and the worker each have a fallback.
- **Is the complexity visible to judges?** Parity tests, the leakage toggle and the config-driven feature-add make it visible.
- **Honest weakness:** if the vessel-level CV cannot be reproduced, headline claims change. The pipeline reports whatever it finds.

## 25. Second-Pass Optimizations

1. **Dropped the Hugging Face Docker Space** as the API host. Current Hub docs say Docker Spaces need a paid plan, and older guides disagree.
2. **Demoted FastAPI** to an optional parity oracle. The app never calls it.
3. **Pinned TypeScript 6.0.3.** npm's latest is 7.0.2, but typescript-eslint supports only versions below 6.1.0.
4. **Used xgboost-cpu** for CI and Docker. It installed and ran today.
5. **Removed UI, chart and CSS frameworks.** Native elements, SVG and CSS variables mean fewer dependencies and a more distinctive look.
6. **Removed network fonts.** System font stack, zero third-party requests.
7. **Made GitHub the primary host** so repo, CI and hosting share one account. Cloudflare Pages is the mirror. It needs a base-path setting, so test both.
8. **Dropped monitoring.** No telemetry is a feature.
9. **Rejected Sketchfab-derived meshes** because of their non-commercial licence.
10. **Closed an open item:** the BodyParts3D part list does include a trunk of the right coronary artery. Mesh quality is still unchecked.

## 26. Final Verification

| Item | Status | Evidence |
| --- | --- | --- |
| Hackathon dates, rules, AI policy | Verified | Devpost overview and rules pages, fetched today |
| Cloudflare Pages limits | Verified | Cloudflare docs |
| GitHub Pages limits | Verified | GitHub docs |
| Render free tier | Verified | Render docs |
| Hugging Face Docker Spaces free? | Conflicting | Current Hub docs say paid; older guides say free. Excluded |
| npm versions and peer ranges | Verified | Registry queries today |
| PyPI versions, joint install | Verified | Installed together in a clean venv and imported |
| `shap` with XGBoost 3.4.1 | Verified | Default mode raised a categorical-split error. `enable_categorical=False` worked |
| Cividis ramp in d3-scale-chromatic 3.1.0 | Verified | Ran it |
| BodyParts3D parts exist | Verified | Part list shows trunks and branches for both coronary arteries |
| Vessel-level results (LAD, LCX, RCA) | **Not verified** | Extension CSV unreachable from the sandbox |
| Mesh quality and frame rate | **Not verified** | Oct 4 gate |
| JavaScript port parity | **Not verified** | Python algorithm only |
| Card requirements at signup (GitHub, Cloudflare, Render) | **Not verified** | Check when signing up |
| GitHub Actions minutes for public repos | **Not re-checked** | Check the billing page |
| Discord-only requirements | **Not visible** | Join and read |
| `vite build` with R3F and vitest together | **Not verified** | Day-1 smoke test |

## 27. FINAL LOCKED STACK

```
Frontend      -> React 19.3 + TypeScript 6.0.3 + Vite 8.3 + plain CSS
3D            -> three 0.186 + @react-three/fiber 9.8 + @react-three/drei 10.7
State, charts -> zustand 5.0, d3-scale + d3-scale-chromatic 3.1 (cividis), hand-built SVG
Inference     -> TypeScript Web Worker (own code): trees, logistic regression, Platt, exact SHAP
Backend       -> none (optional FastAPI 0.142 reference endpoint, local Docker)
Database/Auth/Storage -> none
AI            -> in-house XGBoost + logistic ensemble over five evidence groups, no hosted model API
Pipeline      -> Python 3.12, pandas 3.0, numpy 2.5, scikit-learn 1.9, xgboost 3.4 (enable_categorical=False), shap 0.52 (parity oracle only)
Meshes        -> BodyParts3D -> Blender -> @gltf-transform/cli 4.5 (fallback: procedural tubes)
Hosting       -> GitHub Pages via Actions (primary), Cloudflare Pages (mirror)
CI/CD         -> GitHub Actions
Monitoring    -> none
Testing       -> pytest 9.1, vitest 5.0 with golden-fixture parity, Playwright 1.63 smoke (optional)
Dev tools     -> VS Code (ESLint, Prettier, Python, Ruff, Vitest), npm, Makefile
Docs, video   -> README, MODEL_CARD, ARCHITECTURE, AI_USE, DEMO, 6-page PDF, OBS, YouTube
Cost          -> $0
```

Not in the lock: Render API host (card requirement unverified) and any hosted vision or text model.
