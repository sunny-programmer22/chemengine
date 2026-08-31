# Chemistry Bot 🧪

A powerful Telegram bot for chemistry — equation balancing, molar mass calculation, pH analysis, element lookups, IUPAC naming, safety information, and AI-powered Q&A.

[![Node.js](https://img.shields.io/badge/Node.js-20-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![Telegram Bot API](https://img.shields.io/badge/Telegram-Bot%20API-26A5E4?logo=telegram&logoColor=white)](https://core.telegram.org/bots/api)
[![Gemini](https://img.shields.io/badge/Google-Gemini-8E75B2?logo=google&logoColor=white)](https://ai.google.dev)
[![PubChem](https://img.shields.io/badge/PubChem-Data-FF6F00?logo=data:image/svg%2bxml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=)](https://pubchem.ncbi.nlm.nih.gov)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Built with Node.js, `node-telegram-bot-api`, and powered by PubChem, Wikidata, and Gemini.

---

## Features

- **Equation Balancing** — Balance any chemical equation using linear algebra
- **Molar Mass Calculator** — Compute molar mass with detailed element breakdown
- **pH Calculator** — Calculate pH for strong acids, weak acids, and bases
- **Element Lookup** — Get info by symbol, name, or atomic number
- **IUPAC Names** — Look up systematic chemical names via PubChem
- **Reaction Predictor** — Predict products for common reaction types
- **Safety Information** — Pull hazard data from PubChem
- **Multi-Source Search** — Search across PubChem and Wikipedia
- **AI Q&A** — Free-form chemistry questions via Gemini or local LLM
- **Smart Router** — Type an equation directly, it auto-balances
- **Inline Mode** — Use the bot inline from any chat for quick lookups
- **Rate Limiting** — Per-user rate limiting to prevent spam
- **Polished Formatting** — Proper subscripts, superscripts, and chemistry typography
- **Polling & Webhook** — Easy local dev (polling) and production (webhook)

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Create your .env file
cp .env.example .env

# 3. Edit .env and set your Telegram bot token (and Gemini key for /ask)
#    TELEGRAM_BOT_TOKEN=your_actual_token_here
#    GEMINI_API_KEY=your_gemini_api_key_here

# 4. Start the bot
npm start
```

> Need a bot token? Open Telegram, message [@BotFather](https://t.me/BotFather), send `/newbot`, and copy the token it gives you.

That's it — open Telegram, find your bot, and send `/start`.

For development with auto-restart:

```bash
npm run dev
```

For local test suite:

```bash
npm test
```

---

## Commands

The bot is **command-first** but also **smart-routes** free text. Type any formula and it auto-calculates molar mass; type any equation and it auto-balances.

| Command | Description | Example |
|---------|-------------|---------|
| `/start` | Welcome message and command list | `/start` |
| `/help` | Show all commands and examples | `/help` |
| `/balance` | Balance a chemical equation | `/balance CH4 + O2 -> CO2 + H2O` |
| `/predict` | Predict reaction products | `/predict Zn + HCl` |
| `/molar` | Calculate molar mass | `/molar H2SO4` |
| `/stoich` | Stoichiometry calculation | `/stoich 2H2 + O2 -> 2H2O H2O 10 mol` |
| `/ph` | Calculate pH of a solution | `/ph HCl 0.1` |
| `/element` | Element information | `/element Fe` or `/element Iron` or `/element 26` |
| `/iupac` | Look up IUPAC names | `/iupac acetic acid` |
| `/ask` | Free-form chemistry Q&A (Gemini) | `/ask Why is the sky blue?` |
| `/safety` | Safety information | `/safety H2SO4` |
| `/search` | Multi-source search | `/search Vitamin C` |

### Smart Routing

You can also type without a command:
- `H2 + O2 -> H2O` — auto-balanced
- `NaCl` — auto-calculates molar mass
- `hello` — friendly greeting

### Inline Mode

Type `@YourChemBot H2O` in any chat to get a quick molar mass card.

For the full command reference, see [`docs/COMMANDS.md`](docs/COMMANDS.md).

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                       Telegram API                          │
└──────────────────────────┬──────────────────────────────────┘
                           │
                ┌──────────┴──────────┐
                │                     │
        ┌───────▼──────┐      ┌──────▼──────┐
        │   Polling    │      │   Webhook   │
        │    Mode      │      │    Mode     │
        └───────┬──────┘      └──────┬──────┘
                │                     │
                └──────────┬──────────┘
                           │
                  ┌────────▼────────┐
                  │   Middleware    │
                  │ • Logging       │
                  │ • Rate Limiting │
                  │ • Error Handler │
                  └────────┬────────┘
                           │
                  ┌────────▼────────┐
                  │  Command Router │
                  └────────┬────────┘
                           │
        ┌──────────┬───────┼───────┬──────────┐
        │          │       │       │          │
   ┌────▼────┐ ┌───▼──┐ ┌──▼──┐ ┌──▼──┐  ┌────▼────┐
   │ Balancer│ │ Molar│ │  pH │ │Safe │  │   LLM   │
   └────┬────┘ └──┬───┘ └──┬──┘ └──┬──┘  └────┬────┘
        │         │        │       │           │
        └─────────┴────┬───┴───────┴───────────┘
                       │
              ┌────────▼────────┐
              │   Formatters    │
              │  (HTML, split)  │
              └────────┬────────┘
                       │
              ┌────────▼────────┐
              │  Telegram Reply │
              └─────────────────┘
```

For the full architecture overview, see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## Deployment

The bot supports two modes:

- **Polling mode** — used by default for local development. No public URL required.
- **Webhook mode** — used for production. Triggered automatically by setting `WEBHOOK_URL`.

### Quick deploy to Render

The fastest way to put the bot online. A full step-by-step guide is in
[`DEPLOY_RENDER.md`](DEPLOY_RENDER.md).

For other platforms (Railway, Heroku, VPS) and a production checklist, see
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TELEGRAM_BOT_TOKEN` | **Yes** | — | Your bot token from BotFather |
| `GEMINI_API_KEY` | No | — | Google Gemini key for `/ask` |
| `GEMINI_MODEL` | No | `gemini-1.5-flash` | Gemini model to use |
| `OPENAI_API_KEY` | No | — | OpenAI key (alternative to Gemini) |
| `OPENAI_MODEL` | No | `gpt-4o-mini` | OpenAI model to use |
| `PUGCHEM_BASE` | No | PubChem URL | PubChem API base |
| `WIKIDATA_API` | No | Wikidata URL | Wikidata API base |
| `PORT` | No | `3000` | Express server port (webhook) |
| `WEBHOOK_URL` | No | — | Set to enable webhook mode |
| `LOG_LEVEL` | No | `info` | `error` / `warn` / `info` / `debug` |
| `MAX_MESSAGE_LENGTH` | No | `3500` | Max chars per Telegram message |
| `ENABLE_LOCAL_LLM` | No | `false` | Try local LLM if no Gemini/OpenAI key |

---

## Tech Stack

- **Runtime:** Node.js 20+
- **Bot framework:** [node-telegram-bot-api](https://github.com/yagop/node-telegram-bot-api)
- **HTTP / Web server:** [Express](https://expressjs.com)
- **HTTP client:** [axios](https://axios-http.com)
- **Math / parsing:** [mathjs](https://mathjs.org)
- **AI / LLM:** [Google Gemini](https://ai.google.dev) (primary), OpenAI (fallback), or local model
- **Chemistry data:** [PubChem REST API](https://pubchem.ncbi.nlm.nih.gov/docs/pug-rest), [Wikidata](https://www.wikidata.org), Wikipedia

---

## License

MIT — see [LICENSE](LICENSE) for details.

---

## Credits

Built with care by **Sunny Programmer**. Special thanks to the open data sources that make this possible:

- [PubChem](https://pubchem.ncbi.nlm.nih.gov) — Open chemistry database
- [Wikidata](https://www.wikidata.org) — Structured knowledge base
- [node-telegram-bot-api](https://github.com/yagop/node-telegram-bot-api) — Telegram Bot API wrapper
- [mathjs](https://mathjs.org) — Math library for equation balancing
- [Google Gemini](https://ai.google.dev) — Generative AI for free-form Q&A
