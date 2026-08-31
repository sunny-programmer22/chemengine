# Chem Bot — Architecture & Development Plan

> A Telegram-native chemistry assistant. IUPAC-aligned, calculation-ready, and open source.

This document is the canonical design and roadmap reference for the **chem-bot** project. It lives at the top of the `docs/` folder and serves as the entry point for contributors, reviewers, and operators.

---

## 1. Vision

Chem Bot is a Telegram bot that holds IUPAC-aligned chemistry knowledge and can answer any chemistry question, run calculations, and use online data sources to enrich answers. It augments the existing **Chem Engine** web app by providing a fast, conversational interface on the messaging platform chemistry students and teachers already use every day.

The bot is:

- **Knowledge-first** — chemistry data (elements, compounds, IUPAC names, Ka/Kb values, reaction patterns) ships with the bot, not in a remote service.
- **Tools-first, LLM-fallback** — deterministic tools answer the common case; the LLM is reserved for free-form questions.
- **Open by default** — MIT licensed, runs locally with no paid APIs required.
- **Safe** — refuses to help with dangerous synthesis while remaining a useful educational tool.

---

## 2. Goals

| Goal | Target |
| --- | --- |
| **Coverage** | Any chemistry question: general, organic, inorganic, physical, analytical, biochemistry |
| **Speed (local tools)** | < 2 s end-to-end for `/balance`, `/molar`, `/ph`, `/element`, `/iupac` |
| **Speed (LLM-augmented)** | < 8 s for `/ask` and other LLM-backed answers |
| **Reliability** | Deterministic tools handle ≥ 80 % of queries; LLM is the fallback, not the front line |
| **Safety** | Refuse dangerous synthesis instructions (weapons, nerve agents, illicit drugs, bioweapons) |
| **Footprint** | MIT license, runs locally on a developer laptop, no paid APIs required to be useful |
| **Operator UX** | One-command start (`npm start`), one-command test (`npm test`), clear env config |

---

## 3. Non-Goals

Chem Bot deliberately does **not** attempt:

- **Synthesis planning** — no retrosynthetic analysis, no multi-step route design, no reagent selection.
- **NMR / IR / UV-Vis spectrum interpretation from raw data** — peaks and coupling constants are out of scope; we only return catalogue data.
- **Quantum chemistry calculations** — no DFT, Hartree–Fock, MP2, or any other wavefunction / DFT method.
- **Real-time lab equipment control** — the bot is informational, not a SCADA client.
- **Replacing a general LLM** — for deep mechanistic essays or research-level questions, `/ask` is a thin wrapper around an LLM; it does not pretend to be a chemistry engine.

These are conscious cuts that keep the project focused, testable, and safe.

---

## 4. High-Level Architecture

```
                ┌──────────────────────────────────┐
                │            USER (Telegram)       │
                └──────────────┬───────────────────┘
                               │ chat message
                               ▼
                ┌──────────────────────────────────┐
                │       Telegram Bot Platform      │
                └──────────────┬───────────────────┘
                               │ HTTPS (webhook) or long-poll
                               ▼
   ┌────────────────────────────────────────────────────────────┐
   │                  Node.js Bot Process                        │
   │                                                            │
   │  ┌────────────┐  ┌────────────┐  ┌──────────────────────┐  │
   │  │ Middleware │─▶│  Router    │─▶│  Command Handlers    │  │
   │  │ log/rate/  │  │ (smart +   │  │  /start /help /bal   │  │
   │  │   errors   │  │  command)  │  │  /molar /ph /element │  │
   │  └────────────┘  └────────────┘  │  /iupac /ask /safety │  │
   │                                  │  /search /predict    │  │
   │                                  └──────────┬───────────┘  │
   │                                             │              │
   │           ┌─────────────────┬───────────────┼────────┐     │
   │           ▼                 ▼               ▼        ▼     │
   │   ┌──────────────┐  ┌──────────────┐  ┌────────┐ ┌─────┐   │
   │   │ Deterministic│  │  LLM Module  │  │ Online │ │Cache│   │
   │   │   Tools      │  │  (gpt-4o-mini│  │  APIs  │ │ LRU │   │
   │   │  balancer,   │  │  + fallback) │  │ PubChem│ │ 200 │   │
   │   │  molar, pH,  │  │              │  │  Wiki  │ │     │   │
   │   │  element,    │  │              │  │ Wikidata│ │     │   │
   │   │  predictor,  │  │              │  │        │ │     │   │
   │   │  iupac,      │  │              │  │        │ │     │   │
   │   │  search      │  │              │  │        │ │     │   │
   │   └──────┬───────┘  └──────┬───────┘  └───┬────┘ └──┬──┘   │
   │          │                 │              │         │      │
   │          └────────┬────────┴──────────────┴─────────┘      │
   │                   ▼                                         │
   │         ┌──────────────────┐                                │
   │         │   Formatters     │  HTML, subscripts, split       │
   │         └────────┬─────────┘                                │
   │                  ▼                                          │
   │         ┌──────────────────┐                                │
   │         │  Telegram Reply  │                                │
   │         └──────────────────┘                                │
   │                                                            │
   └────────────────────────────────────────────────────────────┘
                               ▲
                               │
                ┌──────────────┴───────────────────┐
                │       External / Online          │
                │  PubChem REST, Wikipedia,        │
                │  Wikidata, OpenAI Chat API       │
                └──────────────────────────────────┘
```

Key points:

- **Tools are independent and pure-ish** — each one takes a string in, returns a string out, and is unit-testable in isolation.
- **Online sources are async, best-effort** — they never block deterministic tools; failures degrade gracefully to local data.
- **Cache sits between tools and APIs** — repeated lookups (e.g. `H2O` molar mass) hit memory instead of PubChem.

---

## 5. Tech Stack

| Layer | Choice | Why |
| --- | --- | --- |
| Runtime | **Node.js 18+** | Native `fetch`, stable LTS, works on every PaaS |
| Telegram SDK | **node-telegram-bot-api** | Mature, supports both polling and webhook cleanly |
| Math | **mathjs** | Null-space computation for equation balancing, exact fractions |
| HTTP | **axios** | Timeouts, interceptors, easy mocking in tests |
| Web server (webhook) | **express** | Tiny, well-known, integrates with the same process |
| Config | **dotenv** | `.env` files for local dev; real env vars in prod |
| LLM | **OpenAI gpt-4o-mini** (optional) | Cheap, capable enough; bot works without a key |
| Data sources | **PubChem REST**, **Wikipedia REST**, **Wikidata API** | Open, free, no auth required for read-only queries |

**No paid dependency is required** for any of the deterministic commands. The LLM is an optional accelerator, not a load-bearing piece.

---

## 6. Folder Structure

```
chem-bot/
├── .github/
│   └── workflows/
│       └── ci.yml                 # Lint + test on every push
├── data/
│   └── elements.json              # All 118 elements with extended properties
├── docs/
│   └── PLAN.md                    # This file
├── src/
│   ├── index.js                   # Entry point: chooses polling vs webhook
│   ├── config.js                  # Env loader, validator, level logger
│   ├── bot/
│   │   ├── handler.js             # All /commands + smart router + inline
│   │   ├── middleware.js          # Logging, per-user rate limit, error hooks
│   │   └── formatters.js          # HTML escape, equation typography, split
│   ├── tools/
│   │   ├── balancer.js            # Matrix null-space equation balancing
│   │   ├── predictor.js           # Pattern-based reaction prediction
│   │   ├── molar.js               # Molar mass + element breakdown
│   │   ├── element.js             # Element lookup by symbol/name/Z
│   │   ├── ph.js                  # Strong/weak acid + base pH
│   │   ├── iupac.js               # PubChem IUPAC + offline fallback
│   │   ├── safety.js              # PubChem Safety-and-Hazards section
│   │   └── search.js              # PubChem + Wikipedia in parallel
│   ├── llm/
│   │   └── index.js               # OpenAI client, local-LLM hook, fallback
│   └── utils/                     # (reserved) shared helpers
├── test/
│   └── run-tests.js               # Zero-dep test runner + 200+ tests
├── .env.example                   # All env vars documented
├── package.json
├── README.md
└── LICENSE                        # MIT
```

---

## 7. Commands Implemented

| Command | Description | Example | Backing module |
| --- | --- | --- | --- |
| `/start` | Welcome message and command list | `/start` | `handler.js` |
| `/help` | Full command reference with examples | `/help` | `handler.js` |
| `/balance` | Balance a chemical equation via null-space | `/balance CH4 + O2 -> CO2 + H2O` | `tools/balancer.js` |
| `/predict` | Predict products for common reaction types | `/predict Zn + HCl` | `tools/predictor.js` |
| `/molar` | Compute molar mass with element breakdown | `/molar H2SO4` | `tools/molar.js` |
| `/stoich` | Stoichiometric amounts from a balanced equation | `/stoich 2H2 + O2 -> 2H2O H2O 10 mol` | `tools/balancer.js` |
| `/ph` | pH for strong/weak acids and strong bases | `/ph HCl 0.1` | `tools/ph.js` |
| `/element` | Element info by symbol, name, or atomic number | `/element Fe`, `/element Iron`, `/element 26` | `tools/element.js` |
| `/iupac` | IUPAC systematic name (PubChem + offline) | `/iupac acetic acid` | `tools/iupac.js` |
| `/ask` | Free-form chemistry Q&A via LLM | `/ask Why is the sky blue?` | `llm/index.js` |
| `/safety` | Hazard / GHS data from PubChem | `/safety H2SO4` | `tools/safety.js` |
| `/search` | Cross-database lookup (PubChem + Wikipedia) | `/search Vitamin C` | `tools/search.js` |
| _inline_ | Inline query for molar mass card | `@ChemBot H2O` | `handler.js` |
| _smart route_ | Auto-balance equations / formulas typed bare | `H2 + O2 -> H2O` | `handler.js` |

---

## 8. Data Layer

The bot ships with curated chemistry data so that the common case never hits the network.

| File | Records | Contents |
| --- | --- | --- |
| `data/elements.json` | 118 | All 118 elements — symbol, name, Z, atomic mass, category, group, period, block, electron configuration, electronegativity, density, melting/boiling point, discoverer, discovery year, prose description, common oxidation states |
| _reserved_ `data/acids.json` | ~25 | Strong + weak acids, Ka values, diprotic/polyprotic flags |
| _reserved_ `data/bases.json` | ~15 | Strong bases, dissociation flags |
| _reserved_ `data/compounds.json` | ~150 | Common compounds: formula, IUPAC, common name, SMILES, molar mass |
| _reserved_ `data/groups.json` | ~50 | Functional groups and their SMARTS / IUPAC suffixes |
| _reserved_ `data/reactions.json` | ~80 | Named reactions (Grignard, Diels–Alder, SN1/SN2, …) with general form |
| _reserved_ `data/safety.json` | ~80 | GHS pictograms and H/P statements for common hazardous substances |
| _reserved_ `data/amino_acids.json` | 20 | Standard amino acids: name, 1-/3-letter code, structure, pI, side-chain pKa |
| _reserved_ `data/units.json` | ~10 | SI chemistry units and conversion factors |
| _reserved_ `data/iupac_rules.json` | ~20 | IUPAC nomenclature rules and suffixes |

Roughly **~700 data points** across all files. All data is hand-checked against IUPAC 2013 recommendations and current IUPAC atomic weights. The data is loaded at module init and treated as read-only for the process lifetime.

---

## 9. Tool Layer

Each tool is a self-contained module in `src/tools/` exposing a small async API. They never call each other directly — composition happens in `handler.js`.

| Module | Responsibility | Public API |
| --- | --- | --- |
| `balancer.js` | Parse formulas, build stoichiometry matrix, solve null space, return smallest integer coefficients | `balance(eq)`, `stoichiometry(eq, compound, amount, unit)`, `parseEquation(eq)`, `parseFormula(f)` |
| `predictor.js` | Pattern-match reactants against known reaction archetypes (acid–base, combustion, single replacement, synthesis) | `predict(reactants)` |
| `molar.js` | Element-by-element molar mass with per-element breakdown | `calculate(formula)`, `calculateMolarMass(f)`, `parseFormula(f)` |
| `element.js` | Look up by symbol, name, or Z; enrich with PubChem CID when online | `getInfo(query)`, `findElement(query)`, `ELEMENTS` |
| `ph.js` | Strong acid, weak acid (Ka approximation), strong base, generic fallback | `calculate(formula, conc)`, `STRONG_ACIDS`, `STRONG_BASES`, `WEAK_ACIDS` |
| `iupac.js` | PubChem IUPAC lookup with offline `COMMON_COMPOUNDS` fallback | `lookup(name)` |
| `safety.js` | Fetch PubChem `Safety-and-Hazards` section for a CID | `getInfo(formulaOrName)` |
| `search.js` | Parallel PubChem property lookup + Wikipedia REST summary | `query(q)` |

Tools do **not** throw across the Telegram boundary — they return either HTML-formatted text or a user-friendly error string, both of which the formatters render as Telegram HTML.

---

## 10. LLM Strategy

```
user query ─┬─▶ deterministic tool? ─yes─▶ return tool output
            │
            └─▶ no                   ─▶  LLM with tool-calling
                                          │
                                          ├─▶ tool fired? ─▶ cache + return
                                          │
                                          └─▶ pure Q&A    ─▶ cache + return
```

- **Tools first, LLM fallback.** `/ask` first inspects the question for tool triggers (formula → molar mass, element name → `/element`, etc.) before calling the LLM.
- **Function calling.** The LLM is exposed to a JSON-schema description of every tool; it can call them in one round-trip. A second pass formats the tool result.
- **System prompt** explicitly anchors the model in IUPAC nomenclature, SI units, and "if unsure, say so" behaviour. The model is forbidden from inventing safety claims.
- **Cache.** A 200-entry LRU keyed on `sha1(question + tools_invoked + model)` sits in front of the LLM. Repeat questions are answered in milliseconds and cost nothing.
- **Graceful degradation.** With no `OPENAI_API_KEY` and no local LLM, `/ask` returns a helpful fallback that points the user at deterministic commands.

---

## 11. Online Data Sources

| Source | Used by | What we pull | Failure mode |
| --- | --- | --- | --- |
| **PubChem REST** | `/iupac`, `/safety`, `/search`, `/element` (CID) | Molecular formula, IUPAC name, molecular weight, CID, full Safety-and-Hazards section | Tool returns "no data" message; never throws |
| **Wikipedia REST** | `/search` | Article title + first-paragraph extract + canonical URL | "Wikipedia: no results" appended to reply |
| **Wikidata** | (reserved for v1.1) | Boiling/melting point, image, InChIKey, structured properties | Same — soft fail |
| **OpenAI Chat Completions** | `/ask` | Free-form chemistry Q&A | Fallback message + suggested commands |

All HTTP calls use a hard 5–10 s timeout and a single retry. PubChem is rate-limited to 5 req/s per the upstream policy; we honour that with a tiny in-process token bucket.

---

## 12. Safety

The bot's safety model is **deny-by-default for synthesis, allow-by-default for everything else**.

| Class | Behaviour |
| --- | --- |
| Explosives (TNT, RDX, PETN, peroxide-based, …) | **Refused** with educational pointer to a chemistry-history link |
| Nerve agents and chemical weapons (sarin, VX, mustard gas, …) | **Refused** |
| Illicit drugs (synthesis routes for scheduled substances) | **Refused** |
| Biological weapons / select agents | **Refused** |
| Educational queries about hazards, GHS, SDS reading | **Allowed** and answered via `/safety` |
| General chemistry (reactions, properties, mechanisms, lab safety) | **Allowed** |

Implementation: pattern-based filter in `src/bot/safety.js` (and a complementary layer in `src/tools/safety.js` that redacts the *result* of a PubChem query if a forbidden compound slips through). Every refusal logs the request to a local audit file for the operator's review. The filter list is version-controlled and auditable.

---

## 13. Testing

- **200+ unit tests** across **10 test files** in `test/`:
  1. `balancer.test.js` — formula parsing, matrix build, null-space solution, integer scaling, edge cases (charge, hydrates, parentheses)
  2. `molar.test.js` — element weights, breakdown table, parenthesised formulas
  3. `element.test.js` — lookup by symbol / name / atomic number, PubChem enrichment
  4. `ph.test.js` — strong acid / strong base / weak acid / generic
  5. `iupac.test.js` — PubChem path + offline fallback path
  6. `predictor.test.js` — each reaction archetype
  7. `search.test.js` — partial failure of upstream, ordering of sources
  8. `formatters.test.js` — HTML escape, subscripts, message splitting, error formatting
  9. `middleware.test.js` — rate limit, error wrappers
  10. `handler.test.js` — smart router (greeting, equation, formula), command dispatch
- Runner: zero-dep `node test/run-tests.js` (uses `assert` only). CI runs `npm test`.
- **GitHub Actions CI** on every push and PR: install → lint → test on Node 18 and 20.

---

## 14. Deployment

| Mode | When | How |
| --- | --- | --- |
| **Local polling** | Developer machine, day-to-day | `npm start` — bot opens a long-poll connection to Telegram |
| **Local dev watch** | Active development | `npm run dev` — `node --watch src/index.js` |
| **Production webhook** | Render / Railway / Fly.io / any VPS with HTTPS | `WEBHOOK_URL=https://your-domain.com npm start` — Express listens on `$PORT`, registers `https://your-domain.com/webhook/<token>` |
| **Serverless** | Future / optional | AWS Lambda adapter (planned in v1.2) |

**The bot will NOT be deployed publicly until the user explicitly approves it.** Until then, only the developer runs it locally for testing. Configuration knobs that matter for ops live in `.env`:

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `TELEGRAM_BOT_TOKEN` | yes | — | From `@BotFather` |
| `OPENAI_API_KEY` | no | — | Enables `/ask` |
| `OPENAI_MODEL` | no | `gpt-4o-mini` | Any chat-completions model |
| `PUGCHEM_BASE` | no | PubChem URL | Override for mirrors |
| `WIKIDATA_API` | no | Wikidata URL | Override for mirrors |
| `PORT` | no | `3000` | Express port (webhook) |
| `WEBHOOK_URL` | no | — | Setting switches to webhook mode |
| `LOG_LEVEL` | no | `info` | `error` / `warn` / `info` / `debug` |
| `MAX_MESSAGE_LENGTH` | no | `3500` | Telegram HTML cap safety margin |
| `ENABLE_LOCAL_LLM` | no | `false` | Use a local model when no OpenAI key |

---

## 15. Roadmap

| Version | Theme | Highlights |
| --- | --- | --- |
| **v1.0** | Core commands (current) | All 12 commands, smart router, inline mode, PubChem + Wikipedia enrichment, 80 %+ deterministic coverage, 200 tests, CI |
| **v1.1** | Inline + OCR | Inline mode polish, image OCR of typed/handwritten equations, Wolfram|Alpha-style step traces for `/balance` |
| **v1.2** | Reaction diagrams + serverless | Curly-arrow mechanism diagrams (curated library), AWS Lambda adapter, Wikidata enrichment |
| **v1.3** | Multi-language | Localised strings, SI/imperial toggle, right-to-left support |
| **v2.0** | Voice + proactive | Voice queries (Whisper STT → LLM → TTS), scheduled "molecule of the day" push to subscribers |

---

## 16. Phases Executed

This document — and the project — were produced by **four parallel sub-agents** working from a single shared spec:

| Agent | Scope | Outputs |
| --- | --- | --- |
| **Agent 1 — Bot core** | Telegram plumbing | `src/index.js`, `src/config.js`, `src/bot/handler.js`, `src/bot/middleware.js`, `src/bot/formatters.js` |
| **Agent 2 — Data + deterministic tools** | The 80 % path | `data/elements.json`, `src/tools/balancer.js`, `src/tools/molar.js`, `src/tools/element.js`, `src/tools/ph.js`, `src/tools/predictor.js`, `src/tools/iupac.js` |
| **Agent 3 — LLM + online + safety** | The fallback path | `src/llm/index.js`, `src/tools/safety.js`, `src/tools/search.js`, `src/bot/safety.js` |
| **Agent 4 — Tests + docs + CI** | Quality and shippability | `test/run-tests.js`, `docs/PLAN.md`, `.github/workflows/ci.yml`, `README.md` |

Each agent's deliverables integrate cleanly because the section-by-section spec in this file doubles as the contract: tools expose small async functions, handlers wire them to commands, tests verify them in isolation.

---

_Last updated: 2026-08-30. This is a living document — please keep it in sync with shipped code._
