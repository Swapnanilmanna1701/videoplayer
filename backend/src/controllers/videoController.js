const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const Video = require('../models/Video');
const User = require('../models/User');
const { analyseVideo } = require('../services/sensitivityAnalyser');

/**
 * POST /api/videos/upload
 * Upload a video file with metadata. Triggers sensitivity analysis pipeline.
 * Requires: editor or admin role.
 */
const uploadVideo = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No video file provided.' });
    }

    const { title, description, category } = req.body;
    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Video title is required.' });
    }

    const video = await Video.create({
      title: title.trim(),
      description: description?.trim() || '',
      filename: req.file.filename,
      originalName: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      category: category?.trim() || 'uncategorised',
      user: req.user._id,
      organisation: req.user.organisation,
      status: 'uploading',
    });

    // Update status to processing and start analysis asynchronously
    video.status = 'processing';
    await video.save();

    // Fire-and-forget: sensitivity analysis runs in the background
    analyseVideo(video._id.toString(), req.user._id.toString()).catch((err) => {
      console.error('Background processing error:', err.message);
    });

    res.status(201).json({
      message: 'Video uploaded successfully. Processing started.',
      video,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/videos
 * List videos for the authenticated user with optional filtering.
 * Query params: sensitivity, status, category, search, page, limit, sortBy, order
 */
const getVideos = async (req, res, next) => {
  try {
    const {
      sensitivity,
      status,
      category,
      search,
      page = 1,
      limit = 12,
      sortBy = 'createdAt',
      order = 'desc',
    } = req.query;

    // Build filter - scoped to user (multi-tenant isolation)
    const filter = {};

    // Admins can see all videos in their organisation; others see only their own
    if (req.user.role === 'admin') {
      filter.organisation = req.user.organisation;
    } else {
      filter.user = req.user._id;
    }

    if (sensitivity && sensitivity !== 'all') {
      filter.sensitivity = sensitivity;
    }
    if (status && status !== 'all') {
      filter.status = status;
    }
    if (category && category !== 'all') {
      filter.category = category;
    }
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit)));
    const sortOrder = order === 'asc' ? 1 : -1;

    const [videos, total] = await Promise.all([
      Video.find(filter)
        .sort({ [sortBy]: sortOrder })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .populate('user', 'username email'),
      Video.countDocuments(filter),
    ]);

    res.json({
      videos,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/videos/:id
 * Get a single video's metadata by ID.
 */
const getVideo = async (req, res, next) => {
  try {
    const video = await Video.findById(req.params.id).populate('user', 'username email');
    if (!video) {
      return res.status(404).json({ error: 'Video not found.' });
    }

    // Check ownership or admin access
    if (
      req.user.role !== 'admin' &&
      video.user._id.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    res.json({ video });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/videos/:id
 * Update video metadata (title, description, category).
 * Requires: editor or admin role.
 */
const updateVideo = async (req, res, next) => {
  try {
    const video = await Video.findById(req.params.id);
    if (!video) {
      return res.status(404).json({ error: 'Video not found.' });
    }

    // Check ownership or admin access
    if (
      req.user.role !== 'admin' &&
      video.user.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const { title, description, category } = req.body;
    if (title) video.title = title.trim();
    if (description !== undefined) video.description = description.trim();
    if (category) video.category = category.trim();

    await video.save();
    res.json({ message: 'Video updated.', video });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/videos/:id
 * Delete a video and its file from disk.
 * Requires: editor (own videos) or admin.
 */
const deleteVideo = async (req, res, next) => {
  try {
    const video = await Video.findById(req.params.id);
    if (!video) {
      return res.status(404).json({ error: 'Video not found.' });
    }

    // Check ownership or admin access
    if (
      req.user.role !== 'admin' &&
      video.user.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    // Delete file from disk
    const filePath = path.join(process.env.UPLOAD_DIR || 'uploads', video.filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    await Video.findByIdAndDelete(req.params.id);
    res.json({ message: 'Video deleted.' });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/videos/:id/stream
 * Stream a video file using HTTP range requests for efficient playback.
 * Supports partial content (206) for seeking in video players.
 *
 * Authentication is handled via query parameter (?token=...) because
 * HTML <video> elements cannot set Authorization headers.
 */
const streamVideo = async (req, res, next) => {
  try {
    // Authenticate via query param token (video elements can't set headers)
    const token = req.query.token || req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'Access denied. No token provided.' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ error: 'Invalid or expired token.' });
    }

    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({ error: 'User not found.' });
    }

    const video = await Video.findById(req.params.id);
    if (!video) {
      return res.status(404).json({ error: 'Video not found.' });
    }

    // Check ownership or admin access
    if (
      user.role !== 'admin' &&
      video.user.toString() !== user._id.toString()
    ) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const filePath = path.join(process.env.UPLOAD_DIR || 'uploads', video.filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Video file not found on server.' });
    }

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
      // Parse range header for partial content delivery
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = end - start + 1;

      const stream = fs.createReadStream(filePath, { start, end });

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': video.mimetype,
      });

      stream.pipe(res);
    } else {
      // No range header - send full file
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': video.mimetype,
      });
      fs.createReadStream(filePath).pipe(res);
    }
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/videos/:id/reprocess
 * Re-trigger sensitivity analysis for a video.
 * Requires: editor or admin role.
 */
const reprocessVideo = async (req, res, next) => {
  try {
    const video = await Video.findById(req.params.id);
    if (!video) {
      return res.status(404).json({ error: 'Video not found.' });
    }

    if (
      req.user.role !== 'admin' &&
      video.user.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    if (video.status === 'processing') {
      return res.status(409).json({ error: 'Video is already being processed.' });
    }

    video.status = 'processing';
    video.processingProgress = 0;
    video.sensitivity = 'pending';
    await video.save();

    analyseVideo(video._id.toString(), req.user._id.toString()).catch((err) => {
      console.error('Reprocessing error:', err.message);
    });

    res.json({ message: 'Reprocessing started.', video });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  uploadVideo,
  getVideos,
  getVideo,
  updateVideo,
  deleteVideo,
  streamVideo,
  reprocessVideo,
};
