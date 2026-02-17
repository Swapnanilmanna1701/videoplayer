require('dotenv').config();

// Validate required environment variables before starting
const requiredEnvVars = ['MONGODB_URI', 'JWT_SECRET'];
const missingVars = requiredEnvVars.filter((key) => !process.env[key]);
if (missingVars.length > 0) {
  console.error(`Missing required environment variables: ${missingVars.join(', ')}`);
  console.error('Set these in your Render dashboard or .env file.');
  process.exit(1);
}

const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const path = require('path');
const fs = require('fs');

const connectDB = require('./config/db');
const { initSocket } = require('./config/socket');
const errorHandler = require('./middleware/errorHandler');
const cdn = require('./services/cdnService');

// Route imports
const authRoutes = require('./routes/authRoutes');
const videoRoutes = require('./routes/videoRoutes');
const adminRoutes = require('./routes/adminRoutes');

const app = express();
const server = http.createServer(app);

// Initialise Socket.io
initSocket(server);

// Ensure uploads directory exists
const uploadsDir = process.env.UPLOAD_DIR || 'uploads';
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Middleware

// Security: disable X-Powered-By header
app.disable('x-powered-by');

// Security: set standard security headers via helmet
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }, // Allow cross-origin video streaming
  contentSecurityPolicy: false, // API-only server; CSP not needed
}));

// Security: rate limit auth endpoints to prevent brute-force attacks
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // max 20 requests per window per IP
  message: { error: 'Too many requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// HTTP compression for API responses (skip video streams - they have their own encoding)
app.use(compression({
  filter: (req, res) => {
    // Don't compress video streams
    if (req.path.includes('/stream')) return false;
    return compression.filter(req, res);
  },
  level: 6, // Balanced compression level
  threshold: 1024, // Only compress responses > 1KB
}));

// Build allowed origins list for CORS
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
];
if (process.env.FRONTEND_URL) {
  allowedOrigins.push(process.env.FRONTEND_URL);
}
// Also allow any Vercel preview deployment URLs
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    if (
      allowedOrigins.includes(origin) ||
      origin.endsWith('.vercel.app')
    ) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  exposedHeaders: ['ETag', 'X-Cache', 'Cache-Control'],
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint with cache headers
app.get('/api/health', (req, res) => {
  const headers = cdn.getCacheHeaders('metadata');
  Object.entries(headers).forEach(([header, value]) => {
    res.setHeader(header, value);
  });
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    cdn: cdn.isEnabled() ? 'enabled' : 'disabled',
  });
});

// API routes
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/videos', videoRoutes);
app.use('/api/admin', adminRoutes);

// Global error handler
app.use(errorHandler);

// Start server
const PORT = process.env.PORT || 5000;

const startServer = async () => {
  await connectDB();
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Pulse server running on port ${PORT}`);
    console.log(`Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:5173'}`);
    console.log(`CDN: ${cdn.isEnabled() ? 'Enabled (' + process.env.CDN_BASE_URL + ')' : 'Disabled'}`);
    console.log(`HTTP Compression: Enabled`);
    console.log(`Response Caching: Enabled`);
  });
};

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

module.exports = { app, server };
