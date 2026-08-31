/**
 * Local LLM placeholder (Ollama)
 * - Reads ENABLE_LOCAL_LLM from env. If false, returns null.
 * - If true, attempts to call a local Ollama server at http://localhost:11434
 * - Keep it simple: just one chat() function.
 */

const axios = require('axios');

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3';
const TIMEOUT_MS = 30000;

/**
 * Check if local LLM is enabled
 * @returns {boolean}
 */
function isEnabled() {
  return process.env.ENABLE_LOCAL_LLM === 'true';
}

/**
 * Check if the local Ollama server is reachable.
 * @returns {Promise<boolean>}
 */
async function isAvailable() {
  if (!isEnabled()) return false;
  try {
    const res = await axios.get(`${OLLAMA_URL}/api/tags`, { timeout: 2000 });
    return res.status === 200;
  } catch (err) {
    return false;
  }
}

/**
 * Send a chat request to a local Ollama server.
 * @param {Array<{role: string, content: string}>} messages
 * @param {Object} options - { model, temperature, max_tokens }
 * @returns {Promise<{content: string, usage: Object}|null>}
 */
async function chat(messages, options = {}) {
  if (!isEnabled()) return null;
  if (!Array.isArray(messages) || messages.length === 0) return null;

  const model = options.model || OLLAMA_MODEL;
  const body = {
    model,
    messages,
    stream: false,
    options: {
      temperature: options.temperature !== undefined ? options.temperature : 0.3,
      num_predict: options.max_tokens || 800
    }
  };

  try {
    const res = await axios.post(`${OLLAMA_URL}/api/chat`, body, {
      timeout: TIMEOUT_MS,
      headers: { 'Content-Type': 'application/json' }
    });
    const content = res.data?.message?.content || '';
    return {
      content,
      usage: res.data?.usage || null,
      model
    };
  } catch (err) {
    return null;
  }
}

module.exports = {
  chat,
  isEnabled,
  isAvailable,
  OLLAMA_URL,
  OLLAMA_MODEL
};
