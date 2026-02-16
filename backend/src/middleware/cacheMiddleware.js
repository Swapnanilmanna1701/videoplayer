const crypto = require('crypto');
const cache = require('../services/cacheService');
const cdn = require('../services/cdnService');

/**
 * API response caching middleware.
 * Caches GET responses with ETag support and Cache-Control headers.
 *
 * @param {string} tier - Cache tier to use (e.g. 'videoMeta', 'videoList', 'adminStats')
 * @param {Function} [keyGenerator] - Optional custom key generator function (req) => string
 * @returns {Function} Express middleware
 */
const cacheResponse = (tier, keyGenerator) => {
  return (req, res, next) => {
    // Only cache GET requests
    if (req.method !== 'GET') return next();

    // Generate cache key from URL + user context
    const key = keyGenerator
      ? keyGenerator(req)
      : `${req.user?._id || 'anon'}:${req.originalUrl}`;

    // Check for cached response
    const cached = cache.get(tier, key);

    if (cached) {
      // Generate ETag from cached content
      const etag = `"${crypto.createHash('md5').update(JSON.stringify(cached.body)).digest('hex')}"`;

      // Check If-None-Match header for 304 response
      if (req.headers['if-none-match'] === etag) {
        return res.status(304).end();
      }

      // Apply CDN-appropriate cache headers
      const cacheHeaders = cdn.getCacheHeaders('metadata');
      Object.entries(cacheHeaders).forEach(([header, value]) => {
        res.setHeader(header, value);
      });

      res.setHeader('ETag', etag);
      res.setHeader('X-Cache', 'HIT');
      return res.json(cached.body);
    }

    // Override res.json to intercept and cache the response
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      // Only cache successful responses
      if (res.statusCode >= 200 && res.statusCode < 300) {
        cache.set(tier, key, { body, cachedAt: Date.now() });

        const etag = `"${crypto.createHash('md5').update(JSON.stringify(body)).digest('hex')}"`;
        res.setHeader('ETag', etag);

        const cacheHeaders = cdn.getCacheHeaders('metadata');
        Object.entries(cacheHeaders).forEach(([header, value]) => {
          res.setHeader(header, value);
        });
      }

      res.setHeader('X-Cache', 'MISS');
      return originalJson(body);
    };

    next();
  };
};

/**
 * Stream caching middleware.
 * Adds appropriate cache headers for video streaming responses.
 * Does not cache the actual video data (that's handled by CDN or browser).
 */
const cacheStream = () => {
  return (req, res, next) => {
    const cacheHeaders = cdn.getCacheHeaders('video');
    Object.entries(cacheHeaders).forEach(([header, value]) => {
      res.setHeader(header, value);
    });
    next();
  };
};

module.exports = { cacheResponse, cacheStream };
