# Chem Bot — Architecture

This document describes the runtime architecture of the chem-bot project as it
sits today. For roadmap and design intent, see [`docs/PLAN.md`](PLAN.md). For
how to drive the bot, see [`docs/COMMANDS.md`](COMMANDS.md).

---

## 1. High-level overview

Chem Bot is a Node.js service that fronts a Telegram channel. Incoming
messages are routed through a small middleware stack, dispatched to the right
tool, and rendered as Telegram-friendly HTML or Markdown before they are
returned to the user.

```
   Telegram
      │  (long-poll or webhook)
      ▼
 ┌─────────────┐
 │   index.js  │  entry point — selects polling vs webhook
 └──────┬──────┘
        ▼
 ┌─────────────┐
 │  middleware │  logging · rate limit · error guard
 └──────┬──────┘
        ▼
 ┌─────────────┐
 │   handler   │  command router + smart-routing fallback
 └──┬─────┬────┘
    │     │
    ▼     ▼
  tools  llm   (deterministic first, LLM as fallback)
    │
    ▼
 formatters
    │
    ▼
 Telegram reply
```

The deterministic layer is the source of truth. LLM calls are only made when
no tool can answer the question (gated by `ENABLE_LOCAL_LLM` or `OPENAI_API_KEY`).

## 2. Source tree

```
chem-bot/
├── src/
│   ├── index.js              # entry point (polling/webhook)
│   ├── config.js             # env loader & validation
│   ├── bot/
│   │   ├── handler.js        # command handlers
│   │   ├── middleware.js     # logging + per-user rate limit
│   │   ├── formatters.js     # HTML / Markdown / split helpers
│   │   └── safety.js         # regex-based query gate
│   ├── tools/
│   │   ├── balancer.js       # linear-algebra + bounded-search balancer
│   │   ├── predictor.js      # reaction-type decision tree
│   │   ├── molar.js          # molar mass (uses parser + elements.json)
│   │   ├── element.js        # symbol/name/Z lookup
│   │   ├── ph.js             # strong/weak acid + base pH
│   │   ├── stoichiometry.js  # g/kg/mg/mol/L/mL → other compounds
│   │   ├── iupac.js          # PubChem name resolver
│   │   ├── safety.js         # PubChem hazard summary
│   │   └── search.js         # PubChem + Wikidata + Wikipedia
│   ├── llm/
│   │   └── index.js          # OpenAI or local LLM adapter
│   └── utils/
│       ├── parser.js         # stack-based formula / equation parser
│       ├── pubchem.js        # PubChem REST client (cached)
│       ├── wikidata.js       # Wikidata SPARQL helper
│       ├── wikipedia.js      # Wikipedia REST client
│       ├── http.js           # shared axios + retry
│       └── cache.js          # small LRU cache
├── data/
│   └── elements.json         # 118 elements (Z, mass, category, …)
├── test/                     # plain-assertion test suite
└── docs/                     # this directory
```

## 3. Parser contract

Every tool ultimately depends on `utils/parser.js`. Its exports are:

```js
parseCompound(formula)
  // → { isValid, elements: { H: 2, O: 1 }, charge, formula, error }

parseEquation(equation)
  // → { isValid, reactants: ['H2','O2'], products: ['H2O'], direction, original }

molecularWeight(formula)
  // → { isValid, weight, breakdown: [{ element, count, weight, totalWeight }] }
  //   throws on unknown element or unparseable formula
```

Key rules:

- Element counts > 1 use digit notation, never subscripts (`H2O`, not `H₂O`).
- Parentheses, square brackets, and curly brackets are normalised to `()`.
- Hydrates are dot-separated (`CuSO4.5H2O`).
- Charges are trailing `^2-`, `^+`, etc.

Any new tool must accept and produce plain ASCII chemical notation. Display
formatting (subscripts/superscripts) is the formatter's job.

## 4. Element data

`data/elements.json` is loaded synchronously on first call to any tool that
needs it (molar, element, balancer, predictor). It contains the 118 IUPAC
elements with the fields used by `element.js`:

```
Z, symbol, name, atomicMass, category, group, period, block,
electronConfiguration, electronegativity, density, meltingPoint,
boilingPoint, discoveredBy, discoveryYear, description, commonOxidationStates
```

All atomic masses are IUPAC 2021 standard atomic weights.

## 5. Caching

`utils/cache.js` is a small LRU (max 256 entries). It wraps:

- PubChem REST responses (5-minute TTL)
- Wikidata SPARQL results (10-minute TTL)
- Wikipedia REST summaries (1-hour TTL)

Cache is in-process only; restart the bot to flush.

## 6. Safety gate

`bot/safety.js` and `tools/safety.js` share a regex pattern list. The flow is:

1. Every incoming user query is normalised.
2. Patterns are matched (case-insensitive, word-bounded).
3. If a match hits a *synthesis* pattern and the surrounding context is a
   "how do I make it" instruction, the request is **blocked** with a
   category + reason returned to the user.
4. Mentions in *educational* contexts (e.g. "explain why sarin is dangerous")
   are explicitly allowed — the pattern matcher keeps two separate allow/deny
   lists.

## 7. Rate limiting

`bot/middleware.js` keeps a per-user sliding window. Default: 30 messages /
60 seconds. Configurable via `RATE_LIMIT_MAX` and `RATE_LIMIT_WINDOW_MS` env
vars. The first violation logs; the second within 10 s blocks the user for
`RATE_LIMIT_BAN_MS` (default 5 minutes).

## 8. LLM fallback

`llm/index.js` is invoked only when:

- No deterministic tool produced a result, **or**
- The user explicitly typed `/ask`.

`OPENAI_API_KEY` controls the OpenAI path; `ENABLE_LOCAL_LLM=true` switches to
a local model served at `LLM_BASE_URL` (Ollama-compatible). The prompt is
prefixed with the same IUPAC guardrails the deterministic layer uses so the
LLM never produces instructions for weaponisable synthesis.

## 9. Error handling

Every command handler is wrapped in a try/catch. The bot never crashes on a
single bad input. The error is logged and a friendly Telegram message is sent
to the user. The full stack is only printed to the server log, never
returned to the chat.
