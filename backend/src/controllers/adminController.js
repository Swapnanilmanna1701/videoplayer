const User = require('../models/User');
const Video = require('../models/Video');
const cache = require('../services/cacheService');
const cdn = require('../services/cdnService');

/**
 * GET /api/admin/users
 * List all users. Admin only.
 */
const getUsers = async (req, res, next) => {
  try {
    const users = await User.find({ organisation: req.user.organisation })
      .select('-password')
      .sort({ createdAt: -1 });

    res.json({ users });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/admin/users/:id/role
 * Update a user's role. Admin only.
 */
const updateUserRole = async (req, res, next) => {
  try {
    const { role } = req.body;
    if (!['viewer', 'editor', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Must be viewer, editor, or admin.' });
    }

    // Prevent self-demotion
    if (req.params.id === req.user._id.toString()) {
      return res.status(400).json({ error: 'Cannot change your own role.' });
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { role },
      { new: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // Invalidate user session cache
    cache.invalidateUser(req.params.id);

    res.json({ message: `User role updated to ${role}.`, user });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/admin/users/:id
 * Delete a user and all their videos. Admin only.
 */
const deleteUser = async (req, res, next) => {
  try {
    if (req.params.id === req.user._id.toString()) {
      return res.status(400).json({ error: 'Cannot delete your own account.' });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // Delete all of the user's videos
    await Video.deleteMany({ user: req.params.id });
    await User.findByIdAndDelete(req.params.id);

    // Invalidate caches
    cache.invalidateUser(req.params.id);
    cache.flush('videoList');
    cache.flush('videoMeta');

    res.json({ message: 'User and their videos deleted.' });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/stats
 * Get system-level statistics including performance optimization metrics.
 * Includes cache hit rates, compression stats, and CDN configuration.
 * Admin only.
 */
const getStats = async (req, res, next) => {
  try {
    const org = req.user.organisation;
    const [
      totalUsers,
      totalVideos,
      statusCounts,
      sensitivityCounts,
      compressionCounts,
      totalCompressedSize,
    ] = await Promise.all([
      User.countDocuments({ organisation: org }),
      Video.countDocuments({ organisation: org }),
      Video.aggregate([
        { $match: { organisation: org } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      Video.aggregate([
        { $match: { organisation: org } },
        { $group: { _id: '$sensitivity', count: { $sum: 1 } } },
      ]),
      Video.aggregate([
        { $match: { organisation: org } },
        { $group: { _id: '$compression.status', count: { $sum: 1 } } },
      ]),
      Video.aggregate([
        { $match: { organisation: org, 'compression.status': 'completed' } },
        { $unwind: '$compression.variants' },
        {
          $group: {
            _id: null,
            totalVariantSize: { $sum: '$compression.variants.size' },
            totalOriginalSize: { $sum: '$size' },
            variantCount: { $sum: 1 },
          },
        },
      ]),
    ]);

    // Get cache performance stats
    const cacheStats = cache.getStats();

    // Get CDN configuration
    const cdnConfig = cdn.getConfig();

    // Calculate compression savings
    const compressionStats = totalCompressedSize[0] || {
      totalVariantSize: 0,
      totalOriginalSize: 0,
      variantCount: 0,
    };

    res.json({
      stats: {
        totalUsers,
        totalVideos,
        byStatus: Object.fromEntries(statusCounts.map((s) => [s._id, s.count])),
        bySensitivity: Object.fromEntries(sensitivityCounts.map((s) => [s._id, s.count])),
        compression: {
          byStatus: Object.fromEntries(
            compressionCounts.map((s) => [s._id || 'pending', s.count])
          ),
          totalVariants: compressionStats.variantCount,
          totalVariantSize: compressionStats.totalVariantSize,
          totalOriginalSize: compressionStats.totalOriginalSize,
          spaceSaved: compressionStats.totalOriginalSize - compressionStats.totalVariantSize,
        },
        cache: cacheStats,
        cdn: cdnConfig,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/admin/cache/flush
 * Flush all caches. Admin only.
 * Useful for debugging or after manual database changes.
 */
const flushCache = async (req, res) => {
  const { tier } = req.body;
  if (tier) {
    cache.flush(tier);
    res.json({ message: `Cache tier '${tier}' flushed.` });
  } else {
    cache.flushAll();
    res.json({ message: 'All caches flushed.' });
  }
};

module.exports = { getUsers, updateUserRole, deleteUser, getStats, flushCache };
