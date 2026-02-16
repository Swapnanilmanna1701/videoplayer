const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');
const { getIO } = require('../config/socket');
const Video = require('../models/Video');

/**
 * Video compression quality presets.
 * Each preset defines resolution, bitrate, and audio settings
 * optimised for different network conditions and devices.
 */
const QUALITY_PRESETS = {
  '360p': {
    resolution: '640x360',
    videoBitrate: '500k',
    audioBitrate: '64k',
    label: '360p - Low',
  },
  '480p': {
    resolution: '854x480',
    videoBitrate: '1000k',
    audioBitrate: '96k',
    label: '480p - Medium',
  },
  '720p': {
    resolution: '1280x720',
    videoBitrate: '2500k',
    audioBitrate: '128k',
    label: '720p - HD',
  },
  '1080p': {
    resolution: '1920x1080',
    videoBitrate: '5000k',
    audioBitrate: '192k',
    label: '1080p - Full HD',
  },
};

/**
 * Get video metadata (duration, resolution, codec) using ffprobe.
 * @param {string} filePath - Path to the video file
 * @returns {Promise<object>} - Video metadata
 */
const getVideoMetadata = (filePath) => {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err);

      const videoStream = metadata.streams.find((s) => s.codec_type === 'video');
      const audioStream = metadata.streams.find((s) => s.codec_type === 'audio');

      resolve({
        duration: metadata.format.duration ? Math.round(metadata.format.duration) : null,
        width: videoStream?.width || null,
        height: videoStream?.height || null,
        codec: videoStream?.codec_name || null,
        audioCodec: audioStream?.codec_name || null,
        bitrate: metadata.format.bit_rate ? parseInt(metadata.format.bit_rate) : null,
        size: metadata.format.size ? parseInt(metadata.format.size) : null,
      });
    });
  });
};

/**
 * Determine which quality presets to generate based on source resolution.
 * Only generates presets at or below the source resolution to avoid upscaling.
 * @param {number} sourceHeight - Original video height
 * @returns {string[]} - Array of quality keys to generate
 */
const getTargetQualities = (sourceHeight) => {
  const allQualities = ['360p', '480p', '720p', '1080p'];
  const heightMap = { '360p': 360, '480p': 480, '720p': 720, '1080p': 1080 };

  return allQualities.filter((q) => heightMap[q] <= sourceHeight);
};

/**
 * Compress a single video file to a specific quality preset.
 * @param {string} inputPath - Source video file path
 * @param {string} outputPath - Destination file path
 * @param {object} preset - Quality preset configuration
 * @returns {Promise<object>} - Compression result with file size
 */
const compressToQuality = (inputPath, outputPath, preset) => {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .outputOptions([
        `-vf scale=${preset.resolution.replace('x', ':')}`,
        `-b:v ${preset.videoBitrate}`,
        `-b:a ${preset.audioBitrate}`,
        '-c:v libx264',
        '-c:a aac',
        '-preset fast',
        '-movflags +faststart', // Enable progressive download
        '-crf 23',
      ])
      .output(outputPath)
      .on('end', () => {
        const stats = fs.statSync(outputPath);
        resolve({
          path: outputPath,
          size: stats.size,
        });
      })
      .on('error', (err) => {
        // Clean up partial file on error
        if (fs.existsSync(outputPath)) {
          fs.unlinkSync(outputPath);
        }
        reject(err);
      })
      .run();
  });
};

/**
 * Compress a video into multiple quality variants.
 * Emits real-time progress via Socket.io.
 *
 * Creates a subdirectory under uploads for each video's compressed variants:
 *   uploads/<videoId>/360p.mp4, 480p.mp4, 720p.mp4, 1080p.mp4
 *
 * @param {string} videoId - MongoDB ObjectId of the video
 * @param {string} userId - Owner's user ID for Socket.io room targeting
 */
const compressVideo = async (videoId, userId) => {
  const io = getIO();
  const room = `user_${userId}`;
  const uploadsDir = process.env.UPLOAD_DIR || 'uploads';

  try {
    const video = await Video.findById(videoId);
    if (!video) throw new Error('Video not found');

    const inputPath = path.join(uploadsDir, video.filename);
    if (!fs.existsSync(inputPath)) throw new Error('Source video file not found');

    // Get source video metadata
    let metadata;
    try {
      metadata = await getVideoMetadata(inputPath);
    } catch {
      // If ffprobe fails (ffmpeg not installed), skip compression gracefully
      console.warn(`Compression skipped for video ${videoId}: ffprobe not available`);
      await Video.findByIdAndUpdate(videoId, {
        'compression.status': 'skipped',
      });
      io.to(room).emit('compression:skipped', {
        videoId,
        reason: 'FFmpeg not available on server',
      });
      return;
    }

    // Update video with source metadata
    await Video.findByIdAndUpdate(videoId, {
      duration: metadata.duration,
      'compression.status': 'compressing',
      'compression.sourceMetadata': metadata,
    });

    io.to(room).emit('compression:start', { videoId });

    const sourceHeight = metadata.height || 1080;
    const targetQualities = getTargetQualities(sourceHeight);

    if (targetQualities.length === 0) {
      await Video.findByIdAndUpdate(videoId, {
        'compression.status': 'completed',
      });
      return;
    }

    // Create variants directory
    const variantsDir = path.join(uploadsDir, videoId);
    if (!fs.existsSync(variantsDir)) {
      fs.mkdirSync(variantsDir, { recursive: true });
    }

    const variants = [];
    const totalQualities = targetQualities.length;

    for (let i = 0; i < totalQualities; i++) {
      const quality = targetQualities[i];
      const preset = QUALITY_PRESETS[quality];
      const outputFilename = `${quality}.mp4`;
      const outputPath = path.join(variantsDir, outputFilename);

      const progressPercent = Math.round(((i) / totalQualities) * 100);
      io.to(room).emit('compression:progress', {
        videoId,
        quality,
        progress: progressPercent,
        stage: `Compressing ${preset.label}...`,
      });

      try {
        const result = await compressToQuality(inputPath, outputPath, preset);
        variants.push({
          quality,
          filename: `${videoId}/${outputFilename}`,
          resolution: preset.resolution,
          bitrate: preset.videoBitrate,
          size: result.size,
          label: preset.label,
        });
      } catch (err) {
        console.error(`Compression failed for ${quality}:`, err.message);
        // Continue with other qualities even if one fails
      }
    }

    // Update video with compression results
    await Video.findByIdAndUpdate(videoId, {
      'compression.status': variants.length > 0 ? 'completed' : 'failed',
      'compression.variants': variants,
      'compression.completedAt': new Date(),
    });

    io.to(room).emit('compression:complete', {
      videoId,
      variants: variants.map((v) => ({
        quality: v.quality,
        label: v.label,
        size: v.size,
      })),
    });

    console.log(
      `Video ${videoId} compressed: ${variants.length} variants created`
    );
    return variants;
  } catch (error) {
    console.error(`Compression error for video ${videoId}:`, error.message);

    await Video.findByIdAndUpdate(videoId, {
      'compression.status': 'failed',
    });

    io.to(room).emit('compression:error', {
      videoId,
      error: 'Video compression failed.',
    });

    throw error;
  }
};

module.exports = {
  compressVideo,
  getVideoMetadata,
  getTargetQualities,
  QUALITY_PRESETS,
};
