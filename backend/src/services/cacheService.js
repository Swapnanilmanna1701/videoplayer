const NodeCache = require('node-cache');

/**
 * Multi-tier caching service for the Pulse application.
 *
 * Cache tiers:
 * - videoMeta: Video metadata (TTL: 5 min) - frequently read, rarely written
 * - videoList: Video list/query results (TTL: 2 min) - invalidated on upload/delete
 * - userSession: User profile data (TTL: 15 min) - reduces DB lookups
 * - adminStats: Admin statistics (TTL: 1 min) - aggregate queries are expensive
 * - streamMeta: Streaming file metadata (TTL: 10 min) - file stat caching
 *
 * Each tier has its own TTL and check period for fine-grained control.
 */

const caches = {
  videoMeta: new NodeCache({ stdTTL: 300, checkperiod: 60, useClones: false }),
  videoList: new NodeCache({ stdTTL: 120, checkperiod: 30, useClones: false }),
  userSession: new NodeCache({ stdTTL: 900, checkperiod: 120, useClones: false }),
  adminStats: new NodeCache({ stdTTL: 60, checkperiod: 15, useClones: false }),
  streamMeta: new NodeCache({ stdTTL: 600, checkperiod: 60, useClones: false }),
};

/**
 * Get a value from the specified cache tier.
 * @param {string} tier - Cache tier name
 * @param {string} key - Cache key
 * @returns {*} Cached value or undefined
 */
const get = (tier, key) => {
  const cache = caches[tier];
  if (!cache) return undefined;
  return cache.get(key);
};

/**
 * Set a value in the specified cache tier.
 * @param {string} tier - Cache tier name
 * @param {string} key - Cache key
 * @param {*} value - Value to cache
 * @param {number} [ttl] - Optional custom TTL in seconds
 */
const set = (tier, key, value, ttl) => {
  const cache = caches[tier];
  if (!cache) return;
  if (ttl) {
    cache.set(key, value, ttl);
  } else {
    cache.set(key, value);
  }
};

/**
 * Delete a specific key from a cache tier.
 * @param {string} tier - Cache tier name
 * @param {string} key - Cache key
 */
const del = (tier, key) => {
  const cache = caches[tier];
  if (!cache) return;
  cache.del(key);
};

/**
 * Flush all keys from a specific cache tier.
 * Used when bulk invalidation is needed (e.g. after video upload/delete).
 * @param {string} tier - Cache tier name
 */
const flush = (tier) => {
  const cache = caches[tier];
  if (!cache) return;
  cache.flushAll();
};

/**
 * Flush all caches across all tiers.
 */
const flushAll = () => {
  Object.values(caches).forEach((cache) => cache.flushAll());
};

/**
 * Invalidate caches related to a specific video.
 * Called after video upload, update, delete, or processing completion.
 * @param {string} videoId - The video's MongoDB ObjectId
 */
const invalidateVideo = (videoId) => {
  del('videoMeta', videoId);
  flush('videoList'); // Query results may now be stale
  flush('adminStats'); // Stats may have changed
};

/**
 * Invalidate caches related to a specific user.
 * Called after user profile or role changes.
 * @param {string} userId - The user's MongoDB ObjectId
 */
const invalidateUser = (userId) => {
  del('userSession', userId);
  flush('adminStats');
};

/**
 * Get cache statistics for monitoring and admin dashboard.
 * @returns {object} Statistics for each cache tier
 */
const getStats = () => {
  const stats = {};
  for (const [name, cache] of Object.entries(caches)) {
    const cacheStats = cache.getStats();
    stats[name] = {
      keys: cache.keys().length,
      hits: cacheStats.hits,
      misses: cacheStats.misses,
      hitRate: cacheStats.hits + cacheStats.misses > 0
        ? Math.round((cacheStats.hits / (cacheStats.hits + cacheStats.misses)) * 100)
        : 0,
    };
  }
  return stats;
};

module.exports = {
  get,
  set,
  del,
  flush,
  flushAll,
  invalidateVideo,
  invalidateUser,
  getStats,
};
