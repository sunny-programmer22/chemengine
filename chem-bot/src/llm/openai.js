/**
 * OpenAI Chat Completions API wrapper
 * - Standard chat() for plain messages
 * - chatWithTools() for OpenAI function calling
 * - Graceful fallback (returns null) when no API key is set
 */

const { safePost } = require('../utils/http');
const { config } = require('../config');

const API_URL = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_TIMEOUT = 30000; // 30 seconds
const DEFAULT_MODEL = config.openaiModel || process.env.OPENAI_MODEL || 'gpt-4o-mini';
const DEFAULT_TEMPERATURE = 0.3;
const DEFAULT_MAX_TOKENS = 800;

/**
 * Check if OpenAI is configured
 * @returns {boolean}
 */
function isAvailable() {
  return Boolean(config.openaiApiKey);
}

/**
 * Build common request payload
 * @param {Array} messages
 * @param {Object} options
 * @returns {Object} request body
 */
function buildRequestBody(messages, options = {}) {
  return {
    model: options.model || DEFAULT_MODEL,
    messages,
    temperature: options.temperature !== undefined ? options.temperature : DEFAULT_TEMPERATURE,
    max_tokens: options.max_tokens || DEFAULT_MAX_TOKENS,
    ...(options.response_format ? { response_format: options.response_format } : {})
  };
}

/**
 * Standard chat call
 * @param {Array<{role: string, content: string}>} messages - OpenAI-format messages
 * @param {Object} options - { model, temperature, max_tokens, response_format }
 * @returns {Promise<{content: string, usage: Object}|null>}
 */
async function chat(messages, options = {}) {
  if (!isAvailable()) return null;

  if (!Array.isArray(messages) || messages.length === 0) {
    return null;
  }

  try {
    const body = buildRequestBody(messages, options);
    const headers = {
      Authorization: `Bearer ${config.openaiApiKey}`,
      'Content-Type': 'application/json'
    };
    const data = await safePost(API_URL, body, {
      timeout: DEFAULT_TIMEOUT,
      headers,
      retries: 2
    });

    const choice = data?.choices?.[0];
    if (!choice) return null;

    return {
      content: choice.message?.content || '',
      usage: data.usage || null,
      finishReason: choice.finish_reason || null,
      model: data.model || body.model
    };
  } catch (err) {
    // Graceful: log nothing, return null
    return null;
  }
}

/**
 * Chat with function-calling support
 * @param {Array<{role: string, content: string, tool_call_id?: string, tool_calls?: any}>} messages
 * @param {Array} tools - OpenAI function tool definitions
 * @param {Object} options - { model, temperature, max_tokens }
 * @returns {Promise<{content: string|null, toolCalls: Array, usage: Object}|null>}
 */
async function chatWithTools(messages, tools, options = {}) {
  if (!isAvailable()) return null;
  if (!Array.isArray(messages) || messages.length === 0) return null;
  if (!Array.isArray(tools) || tools.length === 0) {
    // No tools - fall back to plain chat
    return chat(messages, options);
  }

  try {
    const body = {
      ...buildRequestBody(messages, options),
      tools,
      tool_choice: options.tool_choice || 'auto'
    };
    const headers = {
      Authorization: `Bearer ${config.openaiApiKey}`,
      'Content-Type': 'application/json'
    };
    const data = await safePost(API_URL, body, {
      timeout: DEFAULT_TIMEOUT,
      headers,
      retries: 2
    });

    const choice = data?.choices?.[0];
    if (!choice) return null;

    return {
      content: choice.message?.content || null,
      toolCalls: choice.message?.tool_calls || [],
      usage: data.usage || null,
      finishReason: choice.finish_reason || null,
      model: data.model || body.model
    };
  } catch (err) {
    return null;
  }
}

module.exports = {
  chat,
  chatWithTools,
  isAvailable,
  API_URL,
  DEFAULT_MODEL
};
