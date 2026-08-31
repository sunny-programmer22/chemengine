/**
 * Shared HTTP client with timeouts, retries, and error handling
 */

const axios = require('axios');

/**
 * Default HTTP client configuration
 */
const DEFAULT_TIMEOUT = 10000; // 10 seconds
const DEFAULT_RETRIES = 2;
const RETRY_DELAY_BASE = 500; // ms

/**
 * Shared axios instance with default config
 */
const httpClient = axios.create({
  timeout: DEFAULT_TIMEOUT,
  headers: {
    'User-Agent': 'ChemBot/1.0 (Educational Chemistry Bot)',
    'Accept': 'application/json'
  }
});

/**
 * Sleep helper for retry backoff
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Determine if an error is retryable
 * @param {Error} err - Error object
 * @returns {boolean} True if retryable
 */
function isRetryable(err) {
  // Network errors, timeouts, 5xx errors
  if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') return true;
  if (err.code === 'ECONNRESET' || err.code === 'ENOTFOUND') return true;
  if (!err.response) return true;
  const status = err.response.status;
  return status >= 500 && status < 600;
}

/**
 * Safe GET request with retries and error handling
 * @param {string} url - URL to fetch
 * @param {Object} opts - Options
 * @returns {Promise<any>} Response data
 */
async function safeGet(url, opts = {}) {
  const {
    timeout = DEFAULT_TIMEOUT,
    retries = DEFAULT_RETRIES,
    params = null,
    headers = null
  } = opts;

  const config = { timeout };
  if (params) config.params = params;
  if (headers) config.headers = { ...httpClient.defaults.headers, ...headers };

  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await httpClient.get(url, config);
      return res.data;
    } catch (err) {
      lastErr = err;
      if (attempt < retries && isRetryable(err)) {
        const delay = RETRY_DELAY_BASE * Math.pow(2, attempt);
        await sleep(delay);
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

/**
 * Safe POST request with retries and error handling
 * @param {string} url - URL to POST to
 * @param {any} data - Request body
 * @param {Object} opts - Options
 * @returns {Promise<any>} Response data
 */
async function safePost(url, data, opts = {}) {
  const {
    timeout = DEFAULT_TIMEOUT,
    retries = DEFAULT_RETRIES,
    headers = null
  } = opts;

  const config = { timeout };
  if (headers) config.headers = { ...httpClient.defaults.headers, ...headers };

  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await httpClient.post(url, data, config);
      return res.data;
    } catch (err) {
      lastErr = err;
      if (attempt < retries && isRetryable(err)) {
        const delay = RETRY_DELAY_BASE * Math.pow(2, attempt);
        await sleep(delay);
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

module.exports = {
  httpClient,
  safeGet,
  safePost,
  sleep
};
