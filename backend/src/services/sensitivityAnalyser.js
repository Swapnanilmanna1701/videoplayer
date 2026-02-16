const { getIO } = require('../config/socket');
const Video = require('../models/Video');

/**
 * Simulated sensitivity analysis categories.
 * In production, this would integrate with a real ML/AI service
 * (e.g. Google Video Intelligence API, AWS Rekognition).
 */
const SENSITIVITY_CATEGORIES = [
  'violence',
  'adult_content',
  'hate_speech',
  'drug_use',
  'dangerous_activities',
  'graphic_content',
];

/**
 * Simulates a delay to mimic real processing time.
 */
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Analyse a video for content sensitivity.
 * Emits real-time progress updates via Socket.io to the video owner's room.
 *
 * Processing stages:
 * 1. Initialisation (0-10%)
 * 2. Frame extraction (10-30%)
 * 3. Audio analysis (30-50%)
 * 4. Content classification (50-80%)
 * 5. Report generation (80-100%)
 *
 * @param {string} videoId - The MongoDB ObjectId of the video
 * @param {string} userId - The owner's user ID for Socket.io room targeting
 */
const analyseVideo = async (videoId, userId) => {
  const io = getIO();
  const room = `user_${userId}`;

  try {
    // Update status to processing
    await Video.findByIdAndUpdate(videoId, {
      status: 'processing',
      processingProgress: 0,
    });
    io.to(room).emit('processing:start', { videoId });

    // Stage 1: Initialisation
    for (let progress = 0; progress <= 10; progress += 2) {
      await delay(200);
      await Video.findByIdAndUpdate(videoId, { processingProgress: progress });
      io.to(room).emit('processing:progress', {
        videoId,
        progress,
        stage: 'Initialising analysis...',
      });
    }

    // Stage 2: Frame extraction
    for (let progress = 10; progress <= 30; progress += 2) {
      await delay(150);
      await Video.findByIdAndUpdate(videoId, { processingProgress: progress });
      io.to(room).emit('processing:progress', {
        videoId,
        progress,
        stage: 'Extracting video frames...',
      });
    }

    // Stage 3: Audio analysis
    for (let progress = 30; progress <= 50; progress += 2) {
      await delay(180);
      await Video.findByIdAndUpdate(videoId, { processingProgress: progress });
      io.to(room).emit('processing:progress', {
        videoId,
        progress,
        stage: 'Analysing audio content...',
      });
    }

    // Stage 4: Content classification
    for (let progress = 50; progress <= 80; progress += 2) {
      await delay(200);
      await Video.findByIdAndUpdate(videoId, { processingProgress: progress });
      io.to(room).emit('processing:progress', {
        videoId,
        progress,
        stage: 'Classifying content sensitivity...',
      });
    }

    // Generate simulated sensitivity results
    const sensitivityScore = Math.random();
    const isFlagged = sensitivityScore > 0.7; // ~30% chance of being flagged
    const flaggedCategories = isFlagged
      ? SENSITIVITY_CATEGORIES.filter(() => Math.random() > 0.6)
      : [];

    // Stage 5: Report generation
    for (let progress = 80; progress <= 100; progress += 2) {
      await delay(100);
      await Video.findByIdAndUpdate(videoId, { processingProgress: progress });
      io.to(room).emit('processing:progress', {
        videoId,
        progress,
        stage: 'Generating sensitivity report...',
      });
    }

    // Finalise results
    const updatedVideo = await Video.findByIdAndUpdate(
      videoId,
      {
        status: 'completed',
        processingProgress: 100,
        sensitivity: isFlagged ? 'flagged' : 'safe',
        sensitivityDetails: {
          score: Math.round(sensitivityScore * 100) / 100,
          categories: flaggedCategories,
          analysedAt: new Date(),
        },
      },
      { new: true }
    );

    io.to(room).emit('processing:complete', {
      videoId,
      sensitivity: updatedVideo.sensitivity,
      sensitivityDetails: updatedVideo.sensitivityDetails,
    });

    console.log(
      `Video ${videoId} processed: ${updatedVideo.sensitivity} (score: ${sensitivityScore.toFixed(2)})`
    );
    return updatedVideo;
  } catch (error) {
    console.error(`Error processing video ${videoId}:`, error.message);

    await Video.findByIdAndUpdate(videoId, {
      status: 'failed',
      processingProgress: 0,
    });

    io.to(room).emit('processing:error', {
      videoId,
      error: 'Processing failed. Please try again.',
    });

    throw error;
  }
};

module.exports = { analyseVideo };
