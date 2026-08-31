/**
 * Configuration loader for the Chemistry Bot
 * Reads environment variables and provides sensible defaults
 */

require('dotenv').config();

/**
 * @typedef {Object} Config
 * @property {string} telegramBotToken - Telegram bot token
 * @property {string} openaiApiKey - OpenAI API key
 * @property {string} openaiModel - OpenAI model to use
 * @property {string} geminiApiKey - Google Gemini API key
 * @property {string} geminiModel - Gemini model to use
 * @property {string} pubchemBase - PubChem API base URL
 * @property {string} wikidataApi - Wikidata API URL
 * @property {number} port - Express server port
 * @property {string} webhookUrl - Webhook URL for production
 * @property {string} logLevel - Logging level
 * @property {number} maxMessageLength - Maximum message length for Telegram
 * @property {boolean} enableLocalLlm - Whether to use local LLM
 */

/** @type {Config} */
const config = {
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  openaiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite',
  pubchemBase: process.env.PUGCHEM_BASE || 'https://pubchem.ncbi.nlm.nih.gov/rest/pug',
  wikidataApi: process.env.WIKIDATA_API || 'https://www.wikidata.org/w/api.php',
  port: parseInt(process.env.PORT || '3000', 10),
  webhookUrl: process.env.WEBHOOK_URL || '',
  logLevel: process.env.LOG_LEVEL || 'info',
  maxMessageLength: parseInt(process.env.MAX_MESSAGE_LENGTH || '3500', 10),
  enableLocalLlm: process.env.ENABLE_LOCAL_LLM === 'true'
};

/**
 * Validate required configuration
 * @returns {boolean} True if valid, logs error and exits if not
 */
function validateConfig() {
  if (!config.telegramBotToken) {
    console.error('╔════════════════════════════════════════════════════════════╗');
    console.error('║                  CONFIGURATION ERROR                       ║');
    console.error('╠════════════════════════════════════════════════════════════╣');
    console.error('║  TELEGRAM_BOT_TOKEN is not set!                           ║');
    console.error('║                                                            ║');
    console.error('║  Please create a .env file with your bot token.          ║');
    console.error('║  Copy .env.example to .env and add your token.            ║');
    console.error('║                                                            ║');
    console.error('║  To get a bot token:                                      ║');
    console.error('║  1. Open Telegram and search for @BotFather              ║');
    console.error('║  2. Send /newbot to create a new bot                      ║');
    console.error('║  3. Copy the token it gives you                          ║');
    console.error('╚════════════════════════════════════════════════════════════╝');
    return false;
  }
  return true;
}

/**
 * Get logger function based on log level
 * @returns {Function} Logger function
 */
function getLogger() {
  const levels = { error: 0, warn: 1, info: 2, debug: 3 };
  const currentLevel = levels[config.logLevel] || 2;

  return {
    error: (msg, ...args) => {
      if (currentLevel >= levels.error) console.error(`[ERROR] ${msg}`, ...args);
    },
    warn: (msg, ...args) => {
      if (currentLevel >= levels.warn) console.warn(`[WARN] ${msg}`, ...args);
    },
    info: (msg, ...args) => {
      if (currentLevel >= levels.info) console.log(`[INFO] ${msg}`, ...args);
    },
    debug: (msg, ...args) => {
      if (currentLevel >= levels.debug) console.log(`[DEBUG] ${msg}`, ...args);
    }
  };
}

const logger = getLogger();

module.exports = {
  config,
  validateConfig,
  logger
};
