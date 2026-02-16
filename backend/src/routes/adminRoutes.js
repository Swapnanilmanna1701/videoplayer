const express = require('express');
const { authenticate, authorise } = require('../middleware/auth');
const {
  getUsers,
  updateUserRole,
  deleteUser,
  getStats,
} = require('../controllers/adminController');

const router = express.Router();

// All admin routes require authentication + admin role
router.use(authenticate, authorise('admin'));

// GET /api/admin/users - List all users in the organisation
router.get('/users', getUsers);

// PUT /api/admin/users/:id/role - Update a user's role
router.put('/users/:id/role', updateUserRole);

// DELETE /api/admin/users/:id - Delete a user
router.delete('/users/:id', deleteUser);

// GET /api/admin/stats - System statistics
router.get('/stats', getStats);

module.exports = router;
