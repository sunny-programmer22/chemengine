/**
 * Middleware for the Chemistry Bot
 * Handles logging, rate limiting, and error catching
 */

const { logger, config } = require('../config');

// In-memory rate limiter storage
const userTimestamps = new Map();
const RATE_LIMIT_MS = 1500;

/**
 * Check if a user is rate limited
 * @param {number} userId - Telegram user ID
 * @param {number} ms - Time window in milliseconds
 * @returns {boolean} True if user is rate limited
 */
function rateLimit(userId, ms = RATE_LIMIT_MS) {
  const now = Date.now();
  const lastTime = userTimestamps.get(userId);

  if (lastTime && (now - lastTime) < ms) {
    return true; // Rate limited
  }

  userTimestamps.set(userId, now);
  return false; // Not rate limited
}

/**
 * Log incoming message
 * @param {Object} msg - Telegram message object
 */
function logMessage(msg) {
  const chatId = msg.chat?.id || 'unknown';
  const userId = msg.from?.id || 'unknown';
  const username = msg.from?.username || msg.from?.first_name || 'unknown';
  const text = msg.text || msg.caption || '(no text)';
  const timestamp = new Date().toISOString();

  // Truncate long messages for logging
  const preview = text.length > 100 ? text.substring(0, 100) + '...' : text;

  logger.info(`[${timestamp}] Chat:${chatId} User:${userId} (@${username}) - ${preview}`);
}

/**
 * Error handler wrapper
 * @param {Function} handler - Handler function
 * @returns {Function} Wrapped function
 */
function withErrorHandling(handler) {
  return async (msg) => {
    try {
      await handler(msg);
    } catch (err) {
      logger.error('Handler error:', {
        error: err.message,
        stack: err.stack,
        chatId: msg.chat?.id,
        userId: msg.from?.id
      });
    }
  };
}

/**
 * Attach middleware to the bot
 * @param {Object} bot - Telegram bot instance
 */
function attachMiddleware(bot) {
  // Add chatId property to all incoming messages
  bot.on('message', (msg) => {
    if (msg.chat) {
      msg.chatId = msg.chat.id;
    }

    // Log the message
    logMessage(msg);

    // Rate limiting check
    if (msg.from && msg.from.id) {
      if (rateLimit(msg.from.id, RATE_LIMIT_MS)) {
        // Don't block, just notify
        logger.debug(`Rate limited user: ${msg.from.id}`);
        // Send a gentle reminder if it looks like spam
        if (msg.text && !msg.text.startsWith('/')) {
          bot.sendMessage(
            msg.chatId,
            '⏸️ Please slow down a bit — send one message at a time.'
          ).catch(() => {}); // Silently ignore if send fails
        }
      }
    }
  });

  // Catch polling errors
  bot.on('polling_error', (err) => {
    logger.error('Polling error:', err.message);
  });

  // Catch webhook errors
  bot.on('webhook_error', (err) => {
    logger.error('Webhook error:', err.message);
  });

  // Catch general errors
  bot.on('error', (err) => {
    logger.error('Bot error:', err.message);
    if (err.stack) {
      logger.error('Stack trace:', err.stack);
    }
  });

  logger.info('Middleware attached successfully');
}

module.exports = {
  attachMiddleware,
  rateLimit,
  logMessage,
  withErrorHandling
};
