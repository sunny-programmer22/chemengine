/**
 * Main entry point for the Chemistry Bot
 * Supports both polling (development) and webhook (production) modes
 */

const path = require('path');
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');

const { config, validateConfig, logger } = require('./config');
const { registerHandlers } = require('./bot/handler');
const { attachMiddleware } = require('./bot/middleware');

// The web UI lives at the repo root in www/ (outside the chem-bot rootDir).
// Render clones the whole repo, so __dirname/../../www resolves to it here.
const WWW_DIR = path.join(__dirname, '..', '..', 'www');

/**
 * Mount the static web UI. Serving it last means API routes (/api/chat,
 * /webhook, /health) win over the static fallback, and GET / serves
 * www/index.html — so the homepage IS the bot.
 * @param {Object} app - Express app
 */
function mountStatic(app) {
  app.use(express.static(WWW_DIR, { index: 'index.html' }));
}

/**
 * Create and start the bot
 * @returns {Object} Bot instance
 */
function createBot() {
  // Determine mode: webhook or polling
  if (config.webhookUrl) {
    return startWebhookMode();
  } else {
    return startPollingMode();
  }
}

/**
 * Start a tiny health-only Express server.
 * Used in BOTH polling and webhook modes so Render's health checks
 * can hit /health regardless of mode.
 * @param {string} mode - 'webhook' or 'polling' (informational)
 * @param {Object} [sharedApp] - Reuse the existing Express app in webhook mode
 * @returns {Object} Express app (always) and HTTP server (polling only)
 */
function startHealthServer(mode, sharedApp) {
  const app = sharedApp || express();
  if (!sharedApp) {
    app.use(express.json());
    // Serve the static web UI (the homepage IS the bot) in standalone mode too
    mountStatic(app);
  }

  // Trust Render's reverse proxy so req.ip / X-Forwarded-* work correctly
  if (mode === 'webhook') {
    app.set('trust proxy', 1);
  }

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', bot: 'chem-bot', mode });
  });

  if (sharedApp) {
    // Webhook mode: caller will call app.listen() themselves
    return { app, server: null };
  }

  const server = app.listen(config.port, () => {
    logger.info(`Health server listening on port ${config.port} (${mode} mode)`);
  });

  return { app, server };
}

/**
 * Start bot in polling mode (for local development)
 * @returns {Object} Bot instance
 */
function startPollingMode() {
  logger.info('Starting bot in POLLING mode...');

  const bot = new TelegramBot(config.telegramBotToken, {
    polling: {
      interval: 300,
      autoStart: true,
      params: {
        timeout: 10
      }
    }
  });

  attachMiddleware(bot);
  registerHandlers(bot);

  // Register Telegram command menu (appears in app's "Menu" / "/" autocomplete) – node-telegram-bot-api 0.66
  if (typeof bot.setMyCommands === 'function') {
    const commands = [
      { command: 'start', description: 'Get started with the bot' },
      { command: 'help', description: 'Show all commands' },
      { command: 'balance', description: 'Balance chemical equations' },
      { command: 'predict', description: 'Predict reaction products' },
      { command: 'molar', description: 'Calculate molar mass' },
      { command: 'stoich', description: 'Stoichiometry calculations' },
      { command: 'ph', description: 'Calculate pH of a solution' },
      { command: 'element', description: 'Get element information' },
      { command: 'iupac', description: 'Look up IUPAC name' },
      { command: 'ask', description: 'Ask a chemistry question' },
      { command: 'safety', description: 'Get safety information' },
      { command: 'search', description: 'Search chemistry databases' },
      { command: 'organic', description: 'Organic chemistry help and concepts' },
      { command: 'hydrocarbon', description: 'Hydrocarbon classification and nomenclature' },
      { command: 'functional', description: 'Identify functional groups' },
      { command: 'mechanism', description: 'Explain organic reaction mechanisms' },
      { command: 'stereo', description: 'Stereochemistry and chirality (R/S, E/Z)' },
      { command: 'spectroscopy', description: 'Analyze IR, NMR, and mass spectra' }
    ];
    bot.setMyCommands(commands).catch((err) => logger.warn('Failed to set bot commands (polling):', err.message));
  }

  bot.on('polling_error', (err) => {
    logger.error('Polling error:', err.message);
  });

  // Start a minimal health server so Render can health-check even in
  // polling mode (useful for local/staging deployments that still expose
  // a port). Silent if the port is unavailable.
  try {
    startHealthServer('polling');
  } catch (err) {
    logger.warn('Could not start health server in polling mode:', err.message);
  }

  return bot;
}

/**
 * Start bot in webhook mode (for production)
 * @returns {Object} Bot instance
 */
function startWebhookMode() {
  logger.info(`Starting bot in WEBHOOK mode: ${config.webhookUrl}`);

  const app = express();

  // Trust Render's reverse proxy so req.ip / X-Forwarded-* work correctly
  app.set('trust proxy', 1);

  app.use(express.json({ limit: '1mb' }));

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', bot: 'chem-bot', mode: 'webhook' });
  });

  // CORS for web chat API (same-origin + localhost dev)
  app.use((req, res, next) => {
    const origin = req.headers.origin || '';
    const allowed = ['https://chemengine.onrender.com', 'https://chem-bot.onrender.com', 'http://localhost:3000', 'http://localhost:5500', ''];
    if (allowed.includes(origin) || origin.startsWith('http://localhost')) {
      res.header('Access-Control-Allow-Origin', origin || '*');
    }
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
  });

  // Rate limiting for web chat API (simple in-memory)
  const rateLimitMap = new Map();
  function rateLimit(req, res, next) {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const now = Date.now();
    const windowMs = 60000;
    const maxRequests = 30;
    const entry = rateLimitMap.get(ip) || { count: 0, resetAt: now + windowMs };
    if (now > entry.resetAt) {
      rateLimitMap.set(ip, { count: 1, resetAt: now + windowMs });
      return next();
    }
    if (entry.count >= maxRequests) {
      return res.status(429).json({ reply: 'Too many requests. Please slow down.', source: 'rate-limit' });
    }
    entry.count++;
    rateLimitMap.set(ip, entry);
    next();
  }

  // Web chat API — reuses the same chemistry tools as the Telegram bot
  app.post('/api/chat', rateLimit, express.json({ limit: '1mb' }), async (req, res) => {
    const { message } = req.body || {};
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ reply: 'Please send a message.', source: 'error' });
    }
    const trimmed = message.trim().slice(0, 500);
    if (!trimmed) {
      return res.status(400).json({ reply: 'Please send a message.', source: 'error' });
    }
    try {
      const { routeWebMessage } = require('./web-chat');
      const result = await routeWebMessage(trimmed);
      return res.json(result);
    } catch (err) {
      return res.status(500).json({ reply: 'Something went wrong. Please try again.', source: 'error' });
    }
  });

  // Webhook endpoint
  const bot = new TelegramBot(config.telegramBotToken);

  attachMiddleware(bot);
  registerHandlers(bot);

  // Register Telegram command menu for webhook mode as well
  if (typeof bot.setMyCommands === 'function') {
    const commands = [
      { command: 'start', description: 'Get started with the bot' },
      { command: 'help', description: 'Show all commands' },
      { command: 'balance', description: 'Balance chemical equations' },
      { command: 'predict', description: 'Predict reaction products' },
      { command: 'molar', description: 'Calculate molar mass' },
      { command: 'stoich', description: 'Stoichiometry calculations' },
      { command: 'ph', description: 'Calculate pH of a solution' },
      { command: 'element', description: 'Get element information' },
      { command: 'iupac', description: 'Look up IUPAC name' },
      { command: 'ask', description: 'Ask a chemistry question' },
      { command: 'safety', description: 'Get safety information' },
      { command: 'search', description: 'Search chemistry databases' },
      { command: 'organic', description: 'Organic chemistry help and concepts' },
      { command: 'hydrocarbon', description: 'Hydrocarbon classification and nomenclature' },
      { command: 'functional', description: 'Identify functional groups' },
      { command: 'mechanism', description: 'Explain organic reaction mechanisms' },
      { command: 'stereo', description: 'Stereochemistry and chirality (R/S, E/Z)' },
      { command: 'spectroscopy', description: 'Analyze IR, NMR, and mass spectra' }
    ];
    bot.setMyCommands(commands).catch((err) => logger.warn('Failed to set bot commands (webhook):', err.message));
  }

  // Webhook route with error handling so a bad payload doesn't crash the server
  app.post(`/webhook/${config.telegramBotToken}`, (req, res) => {
    try {
      bot.processUpdate(req.body);
      res.sendStatus(200);
    } catch (err) {
      logger.error('Webhook processing error:', err.message);
      // Still return 200 to Telegram so they don't retry indefinitely
      // but log so we can investigate
      res.sendStatus(200);
    }
  });

  // Static web UI — mounted LAST so API/webhook routes take precedence.
  // GET / serves www/index.html (the homepage IS the bot).
  mountStatic(app);

  // Set webhook
  bot.setWebHook(`${config.webhookUrl}/webhook/${config.telegramBotToken}`)
    .then(() => {
      logger.info('Webhook set successfully');
    })
    .catch((err) => {
      logger.error('Failed to set webhook:', err.message);
    });

  // Start Express server (bind to 0.0.0.0 explicitly for Render)
  app.listen(config.port, '0.0.0.0', () => {
    logger.info(`Server listening on 0.0.0.0:${config.port}`);
  });

  return bot;
}

/**
 * Graceful shutdown handler
 * @param {Object} bot - Bot instance
 */
function setupGracefulShutdown(bot) {
  const shutdown = (signal) => {
    logger.info(`\n${signal} received. Shutting down gracefully...`);

    if (config.webhookUrl) {
      bot.deleteWebHook()
        .then(() => {
          logger.info('Webhook removed');
          process.exit(0);
        })
        .catch((err) => {
          logger.error('Error removing webhook:', err.message);
          process.exit(1);
        });
    } else {
      bot.stopPolling()
        .then(() => {
          logger.info('Polling stopped');
          process.exit(0);
        })
        .catch((err) => {
          logger.error('Error stopping polling:', err.message);
          process.exit(1);
        });
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

/**
 * Main entry point
 */
function main() {
  // Display banner
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║              🧪  CHEMISTRY BOT  🧪                       ║');
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log('║  Powered by PubChem, Wikidata, and AI                    ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log();

  // Validate configuration
  if (!validateConfig()) {
    process.exit(1);
  }

  // Create and start the bot
  const bot = createBot();

  // Setup graceful shutdown
  setupGracefulShutdown(bot);

  logger.info('Chem Bot is running...');
  logger.info(`Mode: ${config.webhookUrl ? 'Webhook' : 'Polling'}`);
  logger.info(`Log level: ${config.logLevel}`);

  // Get bot info
  bot.getMe()
    .then((botInfo) => {
      logger.info(`Bot username: @${botInfo.username}`);
      logger.info(`Bot name: ${botInfo.first_name}`);
    })
    .catch((err) => {
      logger.error('Could not get bot info:', err.message);
    });

  // Register bot command menu for Telegram clients
  bot.setMyCommands([
    { command: 'start', description: 'Start the bot and see welcome message' },
    { command: 'help', description: 'Show help and all commands' },
    { command: 'balance', description: 'Balance a chemical equation' },
    { command: 'predict', description: 'Predict reaction products' },
    { command: 'molar', description: 'Calculate molar mass' },
    { command: 'stoich', description: 'Stoichiometry calculations' },
    { command: 'ph', description: 'Calculate pH of a solution' },
    { command: 'element', description: 'Get element information' },
    { command: 'iupac', description: 'Look up IUPAC name' },
    { command: 'ask', description: 'Ask a chemistry question' },
    { command: 'safety', description: 'Get safety information' },
    { command: 'search', description: 'Search chemistry databases' },
    { command: 'organic', description: 'Organic chemistry help and concepts' },
    { command: 'hydrocarbon', description: 'Hydrocarbon classification and nomenclature' },
    { command: 'functional', description: 'Identify functional groups' },
    { command: 'mechanism', description: 'Explain organic reaction mechanisms' },
    { command: 'stereo', description: 'Stereochemistry and chirality (R/S, E/Z)' },
    { command: 'spectroscopy', description: 'Analyze IR, NMR, and mass spectra' }
  ]).catch((err) => {
    logger.error('Failed to set bot commands:', err.message);
  });
}

// Run the bot
if (require.main === module) {
  main();
}

module.exports = { createBot, main };
