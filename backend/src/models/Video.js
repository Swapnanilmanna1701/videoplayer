const mongoose = require('mongoose');

/**
 * Video model storing metadata, processing status, and sensitivity results.
 * Multi-tenant: each video belongs to a specific user.
 */
const videoSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Video title is required'],
      trim: true,
      maxlength: [200, 'Title cannot exceed 200 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [2000, 'Description cannot exceed 2000 characters'],
      default: '',
    },
    filename: {
      type: String,
      required: true,
    },
    originalName: {
      type: String,
      required: true,
    },
    mimetype: {
      type: String,
      required: true,
    },
    size: {
      type: Number,
      required: true,
    },
    duration: {
      type: Number, // Duration in seconds
      default: null,
    },
    // Processing pipeline status
    status: {
      type: String,
      enum: ['uploading', 'processing', 'completed', 'failed'],
      default: 'uploading',
    },
    processingProgress: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },
    // Sensitivity analysis result
    sensitivity: {
      type: String,
      enum: ['safe', 'flagged', 'pending'],
      default: 'pending',
    },
    sensitivityDetails: {
      score: { type: Number, default: 0 },
      categories: [String],
      analysedAt: { type: Date, default: null },
    },
    // Custom user-defined category
    category: {
      type: String,
      trim: true,
      default: 'uncategorised',
    },
    // Multi-tenant ownership
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    organisation: {
      type: String,
      default: 'default',
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for efficient user-scoped queries
videoSchema.index({ user: 1, createdAt: -1 });
videoSchema.index({ organisation: 1, sensitivity: 1 });

module.exports = mongoose.model('Video', videoSchema);
