import axios from 'axios';

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:5000') + '/api';

/**
 * Axios instance configured with base URL, auth token interceptor,
 * and response caching via ETag/If-None-Match headers.
 */
const api = axios.create({
  baseURL: API_BASE,
});

// Simple in-memory response cache for ETag-based caching
const responseCache = new Map();
const CACHE_MAX_SIZE = 100;

/**
 * Evict oldest entries when cache exceeds max size.
 */
const evictCache = () => {
  if (responseCache.size > CACHE_MAX_SIZE) {
    const firstKey = responseCache.keys().next().value;
    responseCache.delete(firstKey);
  }
};

// Attach JWT token and ETag caching to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('pulse_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  // Add If-None-Match header for conditional requests (ETag caching)
  if (config.method === 'get') {
    const cacheKey = config.url + JSON.stringify(config.params || {});
    const cached = responseCache.get(cacheKey);
    if (cached?.etag) {
      config.headers['If-None-Match'] = cached.etag;
      config._cacheKey = cacheKey;
    }
  }

  return config;
});

// Handle 401 responses and ETag 304 responses
api.interceptors.response.use(
  (response) => {
    // Cache response with ETag for future conditional requests
    if (response.config.method === 'get' && response.headers.etag) {
      const cacheKey = response.config._cacheKey ||
        response.config.url + JSON.stringify(response.config.params || {});
      responseCache.set(cacheKey, {
        etag: response.headers.etag,
        data: response.data,
        cachedAt: Date.now(),
      });
      evictCache();
    }
    return response;
  },
  (error) => {
    // Handle 304 Not Modified - return cached data
    if (error.response?.status === 304) {
      const cacheKey = error.config._cacheKey ||
        error.config.url + JSON.stringify(error.config.params || {});
      const cached = responseCache.get(cacheKey);
      if (cached) {
        return { data: cached.data, status: 304, headers: error.response.headers };
      }
    }

    if (error.response?.status === 401) {
      localStorage.removeItem('pulse_token');
      localStorage.removeItem('pulse_user');
      // Only redirect if not already on auth pages
      if (!window.location.pathname.startsWith('/login') &&
          !window.location.pathname.startsWith('/register')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// Auth endpoints
export const authAPI = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  getMe: () => api.get('/auth/me'),
};

// Video endpoints
export const videoAPI = {
  upload: (formData, onProgress) =>
    api.post('/videos/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (e) => {
        const percent = Math.round((e.loaded * 100) / e.total);
        onProgress?.(percent);
      },
    }),
  list: (params) => api.get('/videos', { params }),
  get: (id) => api.get(`/videos/${id}`),
  update: (id, data) => api.put(`/videos/${id}`, data),
  delete: (id) => api.delete(`/videos/${id}`),
  reprocess: (id) => api.post(`/videos/${id}/reprocess`),
  compress: (id) => api.post(`/videos/${id}/compress`),
  getQualities: (id) => api.get(`/videos/${id}/qualities`),
  streamUrl: (id, quality) => {
    const token = localStorage.getItem('pulse_token');
    let url = `${API_BASE}/videos/${id}/stream?token=${token}`;
    if (quality && quality !== 'original') url += `&quality=${quality}`;
    return url;
  },
};

// Admin endpoints
export const adminAPI = {
  getUsers: () => api.get('/admin/users'),
  updateRole: (id, role) => api.put(`/admin/users/${id}/role`, { role }),
  deleteUser: (id) => api.delete(`/admin/users/${id}`),
  getStats: () => api.get('/admin/stats'),
  flushCache: (tier) => api.post('/admin/cache/flush', { tier }),
};

/**
 * Clear the client-side response cache.
 * Useful after mutations that may invalidate cached data.
 */
export const clearResponseCache = () => {
  responseCache.clear();
};

export default api;
