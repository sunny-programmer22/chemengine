/**
 * LRU Cache implementation for API responses and computed results
 */

class LRUCache {
  /**
   * Create an LRU cache
   * @param {number} maxSize - Maximum number of entries (default 200)
   * @param {number} ttlMs - Time to live in milliseconds (default 1 hour)
   */
  constructor(maxSize = 200, ttlMs = 60 * 60 * 1000) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
    this.cache = new Map();
    this.timestamps = new Map();
  }

  /**
   * Generate a cache key from arguments
   * @param {...any} args - Arguments to create key from
   * @returns {string} Cache key
   */
  static generateKey(...args) {
    const str = JSON.stringify(args);
    // Simple hash for browser compatibility
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(36);
  }

  /**
   * Get a value from cache
   * @param {string} key - Cache key
   * @returns {any|null} Cached value or null if not found/expired
   */
  get(key) {
    if (!this.cache.has(key)) {
      return null;
    }

    const timestamp = this.timestamps.get(key);
    const now = Date.now();

    // Check if expired
    if (timestamp && (now - timestamp > this.ttlMs)) {
      this.delete(key);
      return null;
    }

    // Move to end (most recently used)
    const value = this.cache.get(key);
    this.cache.delete(key);
    this.cache.set(key, value);
    this.timestamps.delete(key);
    this.timestamps.set(key, now);

    return value;
  }

  /**
   * Set a value in cache
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   */
  set(key, value) {
    // Remove if exists to update position
    if (this.cache.has(key)) {
      this.cache.delete(key);
      this.timestamps.delete(key);
    }

    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      this.delete(oldestKey);
    }

    this.cache.set(key, value);
    this.timestamps.set(key, Date.now());
  }

  /**
   * Check if key exists and is not expired
   * @param {string} key - Cache key
   * @returns {boolean} True if cached and valid
   */
  has(key) {
    if (!this.cache.has(key)) {
      return false;
    }

    const timestamp = this.timestamps.get(key);
    const now = Date.now();

    if (timestamp && (now - timestamp > this.ttlMs)) {
      this.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Delete a key from cache
   * @param {string} key - Cache key
   */
  delete(key) {
    this.cache.delete(key);
    this.timestamps.delete(key);
  }

  /**
   * Clear all cached entries
   */
  clear() {
    this.cache.clear();
    this.timestamps.clear();
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache stats
   */
  stats() {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      ttlMs: this.ttlMs
    };
  }
}

// Pre-configured cache instances for different data types
const pubchemCache = new LRUCache(200, 60 * 60 * 1000); // 1 hour TTL
const wikipediaCache = new LRUCache(100, 30 * 60 * 1000); // 30 min TTL
const wikidataCache = new LRUCache(100, 60 * 60 * 1000); // 1 hour TTL
const llmCache = new LRUCache(200, 30 * 60 * 1000); // 30 min TTL for LLM responses

module.exports = {
  LRUCache,
  pubchemCache,
  wikipediaCache,
  wikidataCache,
  llmCache
};
