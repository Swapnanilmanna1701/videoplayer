const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const Video = require('../models/Video');
const User = require('../models/User');
const { analyseVideo } = require('../services/sensitivityAnalyser');
const { compressVideo } = require('../services/compressionService');
const cache = require('../services/cacheService');
const cdn = require('../services/cdnService');

/**
 * POST /api/videos/upload
 * Upload a video file with metadata. Triggers sensitivity analysis
 * and video compression pipelines in parallel.
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

    // Invalidate video list cache (new video added)
    cache.invalidateVideo(video._id.toString());

    // Fire-and-forget: sensitivity analysis runs in the background
    analyseVideo(video._id.toString(), req.user._id.toString()).catch((err) => {
      console.error('Background processing error:', err.message);
    });

    // Fire-and-forget: compression runs in the background after upload
    compressVideo(video._id.toString(), req.user._id.toString()).catch((err) => {
      console.error('Background compression error:', err.message);
    });

    res.status(201).json({
      message: 'Video uploaded successfully. Processing and compression started.',
      video,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/videos
 * List videos for the authenticated user with optional filtering.
 * Responses are cached in the videoList tier.
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
 * Includes compression variants and CDN URLs when available.
 * Response is cached in the videoMeta tier.
 */
const getVideo = async (req, res, next) => {
  try {
    const videoId = req.params.id;

    // Check cache first
    const cachedVideo = cache.get('videoMeta', videoId);
    if (cachedVideo && cachedVideo.user._id.toString() === req.user._id.toString() ||
        cachedVideo && req.user.role === 'admin') {
      // Generate CDN URLs for cached response
      const response = enrichVideoResponse(cachedVideo, req);
      return res.json(response);
    }

    const video = await Video.findById(videoId).populate('user', 'username email');
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

    // Cache the video metadata
    cache.set('videoMeta', videoId, video.toObject());

    const response = enrichVideoResponse(video.toObject(), video);
    res.json(response);
  } catch (error) {
    next(error);
  }
};

/**
 * Enrich video response with CDN URLs and quality variant information.
 */
const enrichVideoResponse = (video) => {
  const token = '';
  const result = { video };

  // Add streaming URLs for each quality variant
  if (video.compression?.variants?.length > 0) {
    result.qualities = video.compression.variants.map((v) => ({
      quality: v.quality,
      label: v.label,
      resolution: v.resolution,
      size: v.size,
      url: cdn.getVideoUrl(video._id, v.filename, v.quality, token).url,
    }));
  }

  // Add original stream URL
  result.streamUrl = cdn.getVideoUrl(video._id, video.filename, null, token).url;
  result.cdnEnabled = cdn.isEnabled();

  return result;
};

/**
 * PUT /api/videos/:id
 * Update video metadata (title, description, category).
 * Invalidates relevant caches.
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

    // Invalidate caches for this video
    cache.invalidateVideo(req.params.id);

    res.json({ message: 'Video updated.', video });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/videos/:id
 * Delete a video, its compressed variants, and file from disk.
 * Invalidates relevant caches.
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

    const uploadsDir = process.env.UPLOAD_DIR || 'uploads';

    // Delete original file from disk
    const filePath = path.join(uploadsDir, video.filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // Delete compressed variants directory
    const variantsDir = path.join(uploadsDir, req.params.id);
    if (fs.existsSync(variantsDir)) {
      fs.rmSync(variantsDir, { recursive: true, force: true });
    }

    await Video.findByIdAndDelete(req.params.id);

    // Invalidate caches
    cache.invalidateVideo(req.params.id);

    res.json({ message: 'Video deleted.' });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/videos/:id/stream
 * Stream a video file using HTTP range requests for efficient playback.
 * Supports partial content (206) for seeking in video players.
 * Supports quality selection via ?quality= query parameter.
 * Applies CDN cache headers for optimal content delivery.
 *
 * Query params:
 * - token: JWT for authentication (required)
 * - quality: Quality variant to stream (e.g. '360p', '720p') (optional)
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

    // Check user session cache before hitting DB
    let user = cache.get('userSession', decoded.id);
    if (!user) {
      user = await User.findById(decoded.id);
      if (!user) {
        return res.status(401).json({ error: 'User not found.' });
      }
      cache.set('userSession', decoded.id, user.toObject());
    }

    const video = await Video.findById(req.params.id);
    if (!video) {
      return res.status(404).json({ error: 'Video not found.' });
    }

    // Check ownership or admin access
    const userId = user._id?.toString() || user.id;
    if (
      user.role !== 'admin' &&
      video.user.toString() !== userId
    ) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const uploadsDir = process.env.UPLOAD_DIR || 'uploads';
    const requestedQuality = req.query.quality;

    // Determine which file to stream
    let filePath;
    let contentType = video.mimetype;

    if (requestedQuality && video.compression?.variants?.length > 0) {
      // Find the requested quality variant
      const variant = video.compression.variants.find(
        (v) => v.quality === requestedQuality
      );
      if (variant) {
        filePath = path.join(uploadsDir, variant.filename);
        contentType = 'video/mp4'; // Compressed variants are always MP4
      }
    }

    // Fallback to original file if quality variant not found or not requested
    if (!filePath || !fs.existsSync(filePath)) {
      filePath = path.join(uploadsDir, video.filename);
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Video file not found on server.' });
    }

    // Check file stat cache
    const statCacheKey = filePath;
    let fileStat = cache.get('streamMeta', statCacheKey);
    if (!fileStat) {
      fileStat = fs.statSync(filePath);
      cache.set('streamMeta', statCacheKey, { size: fileStat.size, mtime: fileStat.mtime });
    }

    const fileSize = fileStat.size;
    const range = req.headers.range;

    // Apply CDN cache headers
    const cacheHeaders = cdn.getCacheHeaders('video');
    Object.entries(cacheHeaders).forEach(([header, value]) => {
      res.setHeader(header, value);
    });

    // Add Accept-Ranges header for all responses
    res.setHeader('Accept-Ranges', 'bytes');

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
        'Content-Type': contentType,
      });

      stream.pipe(res);
    } else {
      // No range header - send full file
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': contentType,
      });
      fs.createReadStream(filePath).pipe(res);
    }
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/videos/:id/qualities
 * Get available quality variants for a video.
 * Used by the frontend to populate the quality selector.
 */
const getVideoQualities = async (req, res, next) => {
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

    const qualities = [];

    // Add original quality
    qualities.push({
      quality: 'original',
      label: 'Original',
      resolution: video.compression?.sourceMetadata
        ? `${video.compression.sourceMetadata.width}x${video.compression.sourceMetadata.height}`
        : 'Unknown',
      size: video.size,
    });

    // Add compressed variants
    if (video.compression?.variants?.length > 0) {
      video.compression.variants.forEach((v) => {
        qualities.push({
          quality: v.quality,
          label: v.label,
          resolution: v.resolution,
          size: v.size,
        });
      });
    }

    res.json({
      videoId: video._id,
      compressionStatus: video.compression?.status || 'pending',
      qualities,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/videos/:id/reprocess
 * Re-trigger sensitivity analysis for a video.
 * Invalidates relevant caches.
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

    // Invalidate caches
    cache.invalidateVideo(req.params.id);

    analyseVideo(video._id.toString(), req.user._id.toString()).catch((err) => {
      console.error('Reprocessing error:', err.message);
    });

    res.json({ message: 'Reprocessing started.', video });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/videos/:id/compress
 * Manually trigger video compression for a video.
 * Useful for re-compressing or compressing older videos.
 * Requires: editor or admin role.
 */
const compressVideoManual = async (req, res, next) => {
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

    if (video.compression?.status === 'compressing') {
      return res.status(409).json({ error: 'Video is already being compressed.' });
    }

    // Reset compression state
    video.compression = {
      status: 'pending',
      variants: [],
      completedAt: null,
      sourceMetadata: video.compression?.sourceMetadata || {},
    };
    await video.save();

    // Fire-and-forget: compression runs in the background
    compressVideo(video._id.toString(), req.user._id.toString()).catch((err) => {
      console.error('Manual compression error:', err.message);
    });

    cache.invalidateVideo(req.params.id);

    res.json({ message: 'Compression started.', video });
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
  getVideoQualities,
  reprocessVideo,
  compressVideoManual,
};
