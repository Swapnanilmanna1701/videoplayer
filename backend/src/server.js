require('dotenv').config();

const express = require('express');
const http = require('http');
const cors = require('cors');
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

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
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
app.use('/api/auth', authRoutes);
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
