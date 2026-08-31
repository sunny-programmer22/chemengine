/**
 * Main entry point for the Chemistry Bot
 * Supports both polling (development) and webhook (production) modes
 */

const TelegramBot = require('node-telegram-bot-api');
const express = require('express');

const { config, validateConfig, logger } = require('./config');
const { registerHandlers } = require('./bot/handler');
const { attachMiddleware } = require('./bot/middleware');

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

  // Webhook endpoint
  const bot = new TelegramBot(config.telegramBotToken);

  attachMiddleware(bot);
  registerHandlers(bot);

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
}

// Run the bot
if (require.main === module) {
  main();
}

module.exports = { createBot, main };
