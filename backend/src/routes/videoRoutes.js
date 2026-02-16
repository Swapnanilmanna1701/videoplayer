const express = require('express');
const { authenticate, authorise } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { cacheResponse } = require('../middleware/cacheMiddleware');
const {
  uploadVideo,
  getVideos,
  getVideo,
  updateVideo,
  deleteVideo,
  streamVideo,
  getVideoQualities,
  reprocessVideo,
  compressVideoManual,
} = require('../controllers/videoController');

const router = express.Router();

// Stream endpoint uses token from query param (video elements can't set headers).
// Must be defined BEFORE the router.use(authenticate) middleware.
router.get('/:id/stream', streamVideo);

// All remaining routes require authentication via Authorization header
router.use(authenticate);

// GET /api/videos - List videos with filtering (all roles) [cached]
router.get('/', cacheResponse('videoList'), getVideos);

// GET /api/videos/:id - Get single video metadata (all roles)
router.get('/:id', getVideo);

// GET /api/videos/:id/qualities - Get available quality variants (all roles) [cached]
router.get('/:id/qualities', cacheResponse('videoMeta', (req) => `qualities:${req.params.id}`), getVideoQualities);

// POST /api/videos/upload - Upload a video (editor, admin)
router.post('/upload', authorise('editor', 'admin'), upload.single('video'), uploadVideo);

// PUT /api/videos/:id - Update video metadata (editor, admin)
router.put('/:id', authorise('editor', 'admin'), updateVideo);

// DELETE /api/videos/:id - Delete a video (editor, admin)
router.delete('/:id', authorise('editor', 'admin'), deleteVideo);

// POST /api/videos/:id/reprocess - Re-trigger analysis (editor, admin)
router.post('/:id/reprocess', authorise('editor', 'admin'), reprocessVideo);

// POST /api/videos/:id/compress - Manually trigger compression (editor, admin)
router.post('/:id/compress', authorise('editor', 'admin'), compressVideoManual);

module.exports = router;
