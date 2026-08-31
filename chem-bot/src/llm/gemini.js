/**
 * Google Gemini API wrapper
 * - Standard chat() for plain messages
 * - Graceful fallback (returns null) when no API key is set
 */

const { safePost } = require('../utils/http');
const { config } = require('../config');

const API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_TIMEOUT = 30000;
const DEFAULT_MODEL = config.geminiModel || process.env.GEMINI_MODEL || 'gemini-1.5-flash';
const DEFAULT_TEMPERATURE = 0.3;
const DEFAULT_MAX_TOKENS = 800;

/**
 * Check if Gemini is configured
 * @returns {boolean}
 */
function isAvailable() {
  return Boolean(config.geminiApiKey);
}

/**
 * Build common request payload for Gemini
 * @param {Array} messages - OpenAI-format messages
 * @param {Object} options
 * @returns {Object} request body
 */
function buildRequestBody(messages, options = {}) {
  // Convert OpenAI format to Gemini format
  const systemInstruction = messages.find(m => m.role === 'system');
  const userMessages = messages.filter(m => m.role !== 'system');

  const contents = userMessages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }]
  }));

  return {
    contents,
    systemInstruction: systemInstruction ? {
      parts: [{ text: systemInstruction.content }]
    } : undefined,
    generationConfig: {
      temperature: options.temperature !== undefined ? options.temperature : DEFAULT_TEMPERATURE,
      maxOutputTokens: options.max_tokens || DEFAULT_MAX_TOKENS,
      ...(options.response_format ? { responseMimeType: options.response_format.type === 'json_object' ? 'application/json' : 'text/plain' } : {})
    }
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
    const model = options.model || DEFAULT_MODEL;
    const url = `${API_URL}/${model}:generateContent?key=${config.geminiApiKey}`;

    const data = await safePost(url, body, {
      timeout: DEFAULT_TIMEOUT,
      headers: { 'Content-Type': 'application/json' },
      retries: 2
    });

    const candidate = data?.candidates?.[0];
    if (!candidate) return null;

    const content = candidate.content?.parts?.[0]?.text || '';

    return {
      content,
      usage: data.usageMetadata || null,
      finishReason: candidate.finishReason || null,
      model: data.modelVersion || model
    };
  } catch (err) {
    // Graceful: return null
    return null;
  }
}

/**
 * Chat with function-calling support (Gemini uses tools differently)
 * @param {Array} messages
 * @param {Array} tools - OpenAI-style function definitions (will be converted)
 * @param {Object} options
 * @returns {Promise<{content: string|null, toolCalls: Array, usage: Object}|null>}
 */
async function chatWithTools(messages, tools, options = {}) {
  if (!isAvailable()) return null;
  if (!Array.isArray(messages) || messages.length === 0) return null;
  if (!Array.isArray(tools) || tools.length === 0) {
    return chat(messages, options);
  }

  try {
    const model = options.model || DEFAULT_MODEL;
    const url = `${API_URL}/${model}:generateContent?key=${config.geminiApiKey}`;

    // Convert OpenAI tools to Gemini format
    const functionDeclarations = tools.map(t => ({
      name: t.function.name,
      description: t.function.description,
      parameters: t.function.parameters
    }));

    const systemInstruction = messages.find(m => m.role === 'system');
    const userMessages = messages.filter(m => m.role !== 'system');

    const contents = userMessages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));

    const body = {
      contents,
      systemInstruction: systemInstruction ? {
        parts: [{ text: systemInstruction.content }]
      } : undefined,
      tools: [{ functionDeclarations }],
      toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
      generationConfig: {
        temperature: options.temperature !== undefined ? options.temperature : DEFAULT_TEMPERATURE,
        maxOutputTokens: options.max_tokens || DEFAULT_MAX_TOKENS
      }
    };

    const data = await safePost(url, body, {
      timeout: DEFAULT_TIMEOUT,
      headers: { 'Content-Type': 'application/json' },
      retries: 2
    });

    const candidate = data?.candidates?.[0];
    if (!candidate) return null;

    const toolCalls = [];
    let content = '';

    for (const part of candidate.content?.parts || []) {
      if (part.text) content += part.text;
      if (part.functionCall) {
        toolCalls.push({
          id: part.functionCall.name + '_' + Date.now(),
          type: 'function',
          function: {
            name: part.functionCall.name,
            arguments: JSON.stringify(part.functionCall.args || {})
          }
        });
      }
    }

    return {
      content: content || null,
      toolCalls,
      usage: data.usageMetadata || null,
      finishReason: candidate.finishReason || null,
      model: data.modelVersion || model
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