# Chem Bot — Deployment Guide

This document covers general deployment options for chem-bot. For a step-by-step
walkthrough of the recommended path (Render), see
[`DEPLOY_RENDER.md`](../DEPLOY_RENDER.md).

---

## 1. Overview of deployment options

| Platform | Difficulty | Cost | Best for |
|---|---|---|---|
| **[Render](https://render.com)** (recommended) | Easy | Free tier / $7/mo Starter | Quick deploy, automatic HTTPS, free to start |
| **[Railway](https://railway.app)** | Easy | $5/mo + usage | One-click deploys, no sleep on paid plans |
| **[Heroku](https://heroku.com)** | Medium | $5/mo (Eco dyno) | Long-standing PaaS, well-documented |
| **[Fly.io](https://fly.io)** | Medium | Pay-as-you-go (free allowance) | Multi-region, low latency |
| **VPS (DigitalOcean, Linode, Vultr, Hetzner)** | Hard | $4–6/mo | Full control, run your own systemd / Docker stack |
| **Serverless (AWS Lambda + API Gateway, Cloudflare Workers)** | Hard | Pay-per-request | Cost-effective at scale, requires adapter |

For most users, **Render** is the fastest path. Pick a VPS only if you need
custom networking, persistent disk, or want to avoid cold starts.

---

## 2. Webhook vs Polling

chem-bot supports two ways of receiving updates from Telegram:

| | Polling | Webhook |
|---|---|---|
| **How it works** | Bot repeatedly asks Telegram "anything new?" via long-poll HTTP requests | Telegram POSTs updates to a URL you register |
| **Network requirements** | Bot makes outbound requests only | Public HTTPS URL the bot is reachable on |
| **Latency** | Up to ~1 second (poll interval) | Near-instant |
| **Best for** | Local development, behind firewalls | Production, any cloud host |
| **How to enable** | Default — just don't set `WEBHOOK_URL` | Set `WEBHOOK_URL=https://your-domain.com` |

The bot auto-detects which mode to use:

```js
// src/index.js
if (config.webhookUrl) {
  startWebhookMode();   // uses Express
} else {
  startPollingMode();   // long-poll
}
```

For production, **always use webhook mode** — polling through a cloud provider's
NAT usually doesn't work, and webhook is more efficient.

---

## 3. Environment variables reference

All env vars consumed by chem-bot (see `src/config.js`):

| Variable | Required | Default | Description |
|---|---|---|---|
| `TELEGRAM_BOT_TOKEN` | **Yes** | — | Bot token from [@BotFather](https://t.me/BotFather) |
| `GEMINI_API_KEY` | No | — | Google Gemini API key (powers `/ask`) |
| `GEMINI_MODEL` | No | `gemini-1.5-flash` | Gemini model name |
| `OPENAI_API_KEY` | No | — | OpenAI key (alternative to Gemini) |
| `OPENAI_MODEL` | No | `gpt-4o-mini` | OpenAI model name |
| `PUGCHEM_BASE` | No | `https://pubchem.ncbi.nlm.nih.gov/rest/pug` | PubChem REST base |
| `WIKIDATA_API` | No | `https://www.wikidata.org/w/api.php` | Wikidata API base |
| `PORT` | No | `3000` | Port the Express server listens on (webhook mode) |
| `WEBHOOK_URL` | No | — | Public HTTPS URL — enables webhook mode |
| `LOG_LEVEL` | No | `info` | `error` / `warn` / `info` / `debug` |
| `MAX_MESSAGE_LENGTH` | No | `3500` | Max chars per Telegram message |
| `ENABLE_LOCAL_LLM` | No | `false` | Try local LLM if no cloud key set |
| `RATE_LIMIT_MAX` | No | `30` | Max messages per user per window |
| `RATE_LIMIT_WINDOW_MS` | No | `60000` | Rate-limit window in ms |
| `RATE_LIMIT_BAN_MS` | No | `300000` | Auto-ban duration after repeated violations |

The `.env.example` file at the repo root lists the most common ones with
sensible defaults.

---

## 4. Generic deployment steps (any host)

The shape of the deploy is the same regardless of platform:

1. **Provision a Node.js 18+ runtime.**
2. **Run `npm install`** to install dependencies.
3. **Set the required env vars** (especially `TELEGRAM_BOT_TOKEN`).
4. **Run `npm start`** to launch the bot.
5. **Determine the public URL** your host gave you.
6. **Set `WEBHOOK_URL` to that URL** and restart the bot — Telegram will register
   the webhook automatically.

Most PaaS platforms do steps 1–4 from a `Procfile` or a detected `npm start` script.

### Render

See [`DEPLOY_RENDER.md`](../DEPLOY_RENDER.md) for the full walkthrough.

### Railway

1. New Project → Deploy from GitHub repo.
2. Set the same env vars as above.
3. Railway exposes a public URL on the service's **Settings** → **Networking** → **Generate Domain**.
4. Copy the URL into `WEBHOOK_URL`, redeploy.

### Heroku

```bash
heroku create your-chem-bot
heroku config:set TELEGRAM_BOT_TOKEN=xxx GEMINI_API_KEY=yyy
git push heroku main
heroku config:set WEBHOOK_URL=$(heroku info -s | grep web_url | cut -d= -f2)
```

### VPS (systemd)

1. SSH into the box, install Node 20 via `nvm` or your distro's package manager.
2. Clone the repo, `npm install`, `cp .env.example .env` and edit.
3. Create `/etc/systemd/system/chem-bot.service`:

   ```ini
   [Unit]
   Description=Chem Bot
   After=network.target

   [Service]
   User=chem
   WorkingDirectory=/home/chem/chem-bot
   ExecStart=/usr/bin/node src/index.js
   Restart=on-failure
   EnvironmentFile=/home/chem/chem-bot/.env

   [Install]
   WantedBy=multi-user.target
   ```

4. `sudo systemctl enable --now chem-bot`.
5. Front it with **nginx + Let's Encrypt** for HTTPS, then set `WEBHOOK_URL` to
   your domain and restart.

---

## 5. Production checklist

Before going live with real users:

- [ ] **HTTPS is configured.** Telegram refuses non-HTTPS webhooks.
- [ ] **`WEBHOOK_URL` matches the actual public URL** (no trailing slash).
- [ ] **`TELEGRAM_BOT_TOKEN` is set** and is the right bot.
- [ ] **`LOG_LEVEL=info`** (or `warn` for less noise).
- [ ] **Node version pinned** to 20 LTS via `.nvmrc` or `engines` in `package.json`.
- [ ] **Health check endpoint** is reachable at `/health`.
- [ ] **Rate limiting is on** (it is by default — verify `RATE_LIMIT_MAX`).
- [ ] **Auto-restart on crash** is enabled (systemd, Render restart policy, etc.).
- [ ] **Logs are captured somewhere** (Render Logs, journald, Logtail, etc.).
- [ ] **No cold starts** (paid Render plan, paid Railway plan, or always-on VPS).

### Rate limits to be aware of

- **Telegram Bot API:** ~30 messages/second to different chats, 1 message/second
  per chat. chem-bot's rate limiter per user is far below this.
- **PubChem:** ~5 requests/second without an API key, ~10 with one. chem-bot
  caches PubChem responses for 5 minutes, which keeps it well within limits.
- **Gemini API:** Free tier has per-minute token limits. If `/ask` returns
  "rate limit" errors, consider upgrading to a paid Gemini plan.

### Error monitoring

For a hobby deployment, Render's built-in Logs is enough. For something more
serious, pipe stdout to an external log sink:

```bash
# Render: add a Log Stream
# Or use a log drain
```

### Uptime

If you need 99.9% uptime, avoid the Render free tier (it sleeps). Use:

- Render Starter plan ($7/mo) — always on
- Railway ($5/mo + usage) — always on
- A $4–6 VPS with a systemd-managed process

---

## 6. Updating the bot

```bash
git pull            # or git pull origin main
npm install         # in case deps changed
# restart the process — on Render this is automatic on push
```

On Render, every push to `main` triggers an automatic redeploy. On a VPS,
restart with `sudo systemctl restart chem-bot`.

---

## 7. Rolling back

- **Render:** **Events** → click a previous successful deploy → **Rollback**.
- **Heroku:** `heroku releases:rollback`.
- **VPS:** `git checkout <previous-tag> && sudo systemctl restart chem-bot`.
