const crypto = require('crypto');
const path = require('path');

/**
 * CDN Integration Service for Pulse.
 *
 * Supports configurable CDN providers (CloudFront, Cloudflare, BunnyCDN, custom).
 * When CDN_ENABLED is true, video streaming URLs are served through the CDN
 * with signed URLs for access control and cache optimisation headers.
 *
 * Environment variables:
 * - CDN_ENABLED: Enable/disable CDN ('true'/'false')
 * - CDN_BASE_URL: CDN base URL (e.g. https://cdn.example.com)
 * - CDN_SECRET_KEY: Secret key for signing CDN URLs
 * - CDN_TOKEN_EXPIRY: Signed URL expiry in seconds (default: 3600)
 * - CDN_PROVIDER: Provider type ('cloudfront', 'cloudflare', 'bunny', 'custom')
 */

/**
 * Check if CDN is enabled.
 * @returns {boolean}
 */
const isEnabled = () => {
  return process.env.CDN_ENABLED === 'true' && !!process.env.CDN_BASE_URL;
};

/**
 * Generate a signed URL token using HMAC-SHA256.
 * This prevents URL tampering and provides time-limited access.
 *
 * @param {string} resourcePath - The resource path to sign
 * @param {number} expiresAt - Unix timestamp when the URL expires
 * @returns {string} - HMAC signature
 */
const generateSignature = (resourcePath, expiresAt) => {
  const secret = process.env.CDN_SECRET_KEY || 'default-cdn-secret';
  const data = `${resourcePath}:${expiresAt}`;
  return crypto.createHmac('sha256', secret).update(data).digest('hex');
};

/**
 * Verify a signed URL token.
 * @param {string} resourcePath - The resource path
 * @param {number} expiresAt - Unix timestamp
 * @param {string} signature - The signature to verify
 * @returns {boolean} - Whether the signature is valid and not expired
 */
const verifySignature = (resourcePath, expiresAt, signature) => {
  if (Date.now() / 1000 > expiresAt) return false;
  const expected = generateSignature(resourcePath, expiresAt);
  return crypto.timingSafeEqual(
    Buffer.from(expected, 'hex'),
    Buffer.from(signature, 'hex')
  );
};

/**
 * Generate a CDN URL for a video resource.
 * Falls back to the local server URL if CDN is disabled.
 *
 * @param {string} videoId - Video MongoDB ObjectId
 * @param {string} filename - Video filename
 * @param {string} [quality] - Optional quality variant (e.g. '720p')
 * @param {string} [token] - JWT token for local fallback authentication
 * @returns {object} - { url, isCdn, expiresAt }
 */
const getVideoUrl = (videoId, filename, quality, token) => {
  if (!isEnabled()) {
    // Fallback to local streaming endpoint
    const base = `${process.env.BASE_URL || 'http://localhost:5000'}/api/videos`;
    let url = `${base}/${videoId}/stream?token=${token || ''}`;
    if (quality) url += `&quality=${quality}`;
    return { url, isCdn: false, expiresAt: null };
  }

  const cdnBase = process.env.CDN_BASE_URL.replace(/\/$/, '');
  const expiry = parseInt(process.env.CDN_TOKEN_EXPIRY) || 3600;
  const expiresAt = Math.floor(Date.now() / 1000) + expiry;

  // Build resource path
  let resourcePath;
  if (quality) {
    resourcePath = `/videos/${videoId}/${quality}.mp4`;
  } else {
    resourcePath = `/videos/${filename}`;
  }

  const signature = generateSignature(resourcePath, expiresAt);

  const url = `${cdnBase}${resourcePath}?expires=${expiresAt}&signature=${signature}`;

  return { url, isCdn: true, expiresAt };
};

/**
 * Generate cache control headers based on content type and CDN configuration.
 *
 * @param {string} contentType - Type of content ('video', 'metadata', 'static')
 * @returns {object} - Headers object
 */
const getCacheHeaders = (contentType) => {
  const headers = {};

  switch (contentType) {
    case 'video':
      // Videos are immutable once compressed; cache aggressively
      headers['Cache-Control'] = isEnabled()
        ? 'public, max-age=31536000, immutable' // 1 year with CDN
        : 'public, max-age=86400'; // 24 hours without CDN
      headers['Vary'] = 'Accept-Encoding';
      break;

    case 'metadata':
      // Metadata can change (title, sensitivity); cache briefly
      headers['Cache-Control'] = 'public, max-age=60, stale-while-revalidate=300';
      headers['Vary'] = 'Authorization';
      break;

    case 'static':
      // Static assets; cache for a long time
      headers['Cache-Control'] = 'public, max-age=2592000'; // 30 days
      break;

    default:
      headers['Cache-Control'] = 'no-cache';
  }

  return headers;
};

/**
 * Get CDN configuration info for the admin panel.
 * @returns {object} - CDN status and configuration
 */
const getConfig = () => {
  return {
    enabled: isEnabled(),
    provider: process.env.CDN_PROVIDER || 'none',
    baseUrl: isEnabled() ? process.env.CDN_BASE_URL : null,
    tokenExpiry: parseInt(process.env.CDN_TOKEN_EXPIRY) || 3600,
  };
};

module.exports = {
  isEnabled,
  generateSignature,
  verifySignature,
  getVideoUrl,
  getCacheHeaders,
  getConfig,
};
