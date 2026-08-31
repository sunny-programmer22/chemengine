# Deploying to Render

This guide walks you through deploying **chem-bot** to [Render](https://render.com) so it runs 24/7 and Telegram can reach it via webhook.

The whole process takes about 10 minutes.

---

## Prerequisites

You'll need:

- A **GitHub account** with the chem-bot repo pushed to it
  - Repo target: <https://github.com/sunny-programmer22/chemengine>
- A **Render account** (free tier is fine) — sign up at <https://render.com>
- A **Telegram bot token** from [@BotFather](https://t.me/BotFather)
- A **Google Gemini API key** from <https://aistudio.google.com/app/apikey> (used by `/ask`)

---

## Step 1: Push the code to GitHub

If you haven't already, push the project to GitHub:

```bash
cd "D:\engine - Copy\chem-bot"
git init                       # if not already a git repo
git add .
git commit -m "Initial commit: chem-bot"
git branch -M main
git remote add origin https://github.com/sunny-programmer22/chemengine.git
git push -u origin main
```

> Render will auto-deploy on every push to `main` once the service is set up.

---

## Step 2: Sign up / log in to Render

1. Go to <https://render.com>
2. Click **Get Started for Free** (or **Sign In** if you already have an account)
3. Authorize Render to access your GitHub account when prompted

---

## Step 3: Create a new Web Service

1. From the Render dashboard, click **New +** (top right)
2. Select **Web Service**
3. Find and click **Connect** next to the `sunny-programmer22/chemengine` repository
   - If the repo doesn't appear, click **Configure account** to grant Render access to it
4. Click **Connect** to confirm

---

## Step 4: Configure the service

Fill in the following values on the service creation form:

| Field | Value |
|---|---|
| **Name** | `chem-bot` |
| **Region** | `Oregon (US West)` |
| **Branch** | `main` |
| **Runtime** | `Node` |
| **Build Command** | `npm install` |
| **Start Command** | `npm start` |
| **Plan** | `Free` |

Leave **Instance Type** on the default for the Free plan.

---

## Step 5: Add environment variables

In the **Environment Variables** section, click **Add Environment Variable** for each of the following:

| Key | Value | Notes |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | your token from @BotFather | **Required** - only hard-required var (`src/config.js:45`) |
| `GEMINI_API_KEY` | your Gemini API key | **Optional** but required for `/ask` (Gemini path) |
| `OPENAI_API_KEY` | your OpenAI API key | **Optional** - alternative for `/ask` (`src/config.js:27`) |
| `GEMINI_MODEL` | `gemini-1.5-flash` | Optional - overrides `src/config.js:30` default (`gemini-1.5-flash`) |
| `OPENAI_MODEL` | `gpt-4o-mini` | Optional - defaults to `gpt-4o-mini` (`src/config.js:28`, `.env.example:3`) |
| `WEBHOOK_URL` | `https://chem-bot.onrender.com` | **Required for production** - base URL only, **no** `/webhook/...` suffix (see Step 8); set after first deploy |
| `PORT` | `3000` | Optional - Render injects `PORT`, defaults to `3000` (`src/config.js:33`; Render sets automatically) |
| `LOG_LEVEL` | `info` | Optional - `error` / `warn` / `info` / `debug` (`src/config.js:35`) |
| `MAX_MESSAGE_LENGTH` | `3500` | Optional - Telegram chunk limit (`src/config.js:36`, `render.yaml:19`) |
| `PUGCHEM_BASE` | `https://pubchem.ncbi.nlm.nih.gov/rest/pug` | Optional - override PubChem API (`src/config.js:31`, `.env.example:6`) |
| `WIKIDATA_API` | `https://www.wikidata.org/w/api.php` | Optional - override Wikidata API (`src/config.js:32`, `.env.example:7`) |
| `ENABLE_LOCAL_LLM` | `true` / `false` | Optional - `true` enables local LLM (`src/config.js:37`, `.env.example:12`) |
| `NODE_VERSION` | `20` | Optional - Forces Node 20 LTS (set via the **Advanced** panel or as an env var) (`render.yaml:13`) |

> Tip: to pin the Node version, scroll to the **Advanced** section and add a `NODE_VERSION` env var with value `20`. Alternatively, add a `.nvmrc` file containing `20` to the repo.

> Do **not** set `WEBHOOK_URL` yet — you'll add it after the first deploy succeeds and you know the public URL.

---

## Step 6: Click "Create Web Service"

Scroll to the bottom and click **Create Web Service**. Render will:

1. Clone the repo
2. Run `npm install` (build command)
3. Start the bot with `npm start`
4. Assign a public URL like `https://chem-bot.onrender.com`

Watch the **Logs** panel — you should see:

```
[INFO]  Starting bot in POLLING mode...
```

That's expected — it means the bot is running but hasn't been told its webhook URL yet. Telegram can't reach a polling bot behind Render's network, so the next step is to flip it into webhook mode.

---

## Step 7: Copy the public URL

Once the deploy finishes (status turns green), copy the URL Render shows at the top of the service page. It will look like:

```
https://chem-bot.onrender.com
```

---

## Step 8: Add WEBHOOK_URL and trigger a redeploy

1. In the left sidebar, click **Environment**
2. Click **Add Environment Variable**
3. Add:
   - **Key:** `WEBHOOK_URL`
   - **Value:** the URL from Step 7 (e.g. `https://chem-bot.onrender.com`)
4. Click **Save Changes**

Render will automatically redeploy with the new env var. This time, in the logs you should see:

```
[INFO]  Starting bot in WEBHOOK mode: https://chem-bot.onrender.com
[INFO]  Webhook set successfully
[INFO]  Server listening on port 3000
```

The bot has now registered its webhook with Telegram at `https://chem-bot.onrender.com/webhook/<your-token>`.

> **Important - WEBHOOK_URL format:** `WEBHOOK_URL` is the **base URL only** (`https://chem-bot.onrender.com` - no trailing slash, no `/webhook` suffix). The code appends the path itself at `src/index.js:136`: `` `${config.webhookUrl}/webhook/${config.telegramBotToken}` `` and listens at `src/index.js:123`: `` app.post(`/webhook/${config.telegramBotToken}`) ``. Setting `WEBHOOK_URL` to the full webhook URL will double the path and break Telegram delivery.

---

## Step 9: Verify the health check

In a browser or with `curl`:

```bash
curl https://chem-bot.onrender.com/health
```

You should get:

```json
{ "status": "ok", "bot": "chem-bot", "mode": "webhook" }
```

If you see that, the service is alive and listening.

---

## Step 10: Test in Telegram

1. Open Telegram
2. Search for **@ReactoLab_bot** (or your bot's username)
3. Send `/start`

You should get the welcome message back. Try a few commands:

```
/start
H2O
H2 + O2 -> H2O
/element Fe
/balance CH4 + O2 -> CO2 + H2O
/ask Why does ice float?
```

If everything works, you're done. 🎉

---

## Troubleshooting

### "Application failed to respond" / service won't start

- Open **Logs** in the Render dashboard.
- Look for stack traces around `npm install` or `npm start`.
- Most common causes:
  - Missing `TELEGRAM_BOT_TOKEN` — the bot exits on startup if it's not set.
  - `MODULE_NOT_FOUND` — see below.

### Bot is not responding in Telegram

- Double-check `TELEGRAM_BOT_TOKEN` is correct in **Environment**.
- Make sure `WEBHOOK_URL` **exactly** matches the public URL Render assigned you (no trailing slash, includes `https://`).
- Visit `https://api.telegram.org/bot<YOUR_TOKEN>/getWebhookInfo` — the `url` field should be `https://chem-bot.onrender.com/webhook/<YOUR_TOKEN>`. If it's empty or wrong, the bot's `setWebHook` call failed.
- Force a redeploy: **Manual Deploy** → **Clear build cache & deploy**.

### `MODULE_NOT_FOUND` errors

- A dependency is missing from `package.json`. Add it and push, or run `npm install <package>` locally and commit the updated `package.json` + `package-lock.json`.
- Then click **Manual Deploy** → **Clear build cache & deploy** in Render.

### Free tier sleeps after 15 minutes of inactivity

Render's free Web Service spins down after 15 minutes without inbound traffic. When that happens:

- The next Telegram message will take ~30 seconds to wake the service.
- Logs will show a cold-start delay.

To stay online 24/7, upgrade the plan:

- **Starter** plan: $7/month per service. No sleep, always-on.
- Render will charge automatically via the payment method on file.

You can upgrade under **Settings** → **Plan** → **Change Plan**.

### Webhook keeps getting reset

If you change `WEBHOOK_URL` or rotate `TELEGRAM_BOT_TOKEN`, the bot will re-register the webhook on next start — no manual intervention needed. If Telegram still has a stale webhook, call:

```bash
curl -X POST "https://api.telegram.org/bot<YOUR_TOKEN>/deleteWebhook"
```

…and trigger a redeploy so the bot re-registers it.

### Logs are too noisy

Set `LOG_LEVEL=warn` or `LOG_LEVEL=error` in **Environment** to reduce noise.

---

## Automatic redeploys

Render auto-redeploys on every push to the `main` branch. To deploy a new version:

```bash
git add .
git commit -m "Your change"
git push
```

Watch the **Events** tab for the new deploy. Once it goes green, the bot is updated — no extra steps.

---

## Costs

| Plan | Monthly | Sleep? | Best for |
|---|---|---|---|
| **Free** | $0 | Yes (after 15 min idle) | Trying it out, low-traffic demos |
| **Starter** | $7 | No, 24/7 | Always-on, real users |

The bot is lightweight — Starter is more than enough for typical classroom / community use.

---

## Next steps

- Set a custom domain: **Settings** → **Custom Domains**
- Add a health-check probe: Render pings `/health` automatically once you add `healthCheckPath: /health` in the service config
- Add error monitoring: pipe Render logs to a service like [Logtail](https://logtail.com) or [Better Stack](https://betterstack.com)
