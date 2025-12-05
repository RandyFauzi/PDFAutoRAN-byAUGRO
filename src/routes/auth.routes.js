const express = require('express');
const router = express.Router();

const authController = require('../controllers/auth.controller');
const authMiddleware = require('../middleware/authMiddleware');

// POST /api/v1/auth/register
router.post('/register', authController.register);

// POST /api/v1/auth/login
router.post('/login', authController.login);

// GET /api/v1/auth/me
// Hanya bisa diakses jika sudah login (punya JWT valid)
router.get('/me', authMiddleware, authController.me);

// GANTI PASSWORD (butuh user login / JWT)
router.post(
  '/change-password',        // ✅ BUKAN '/auth/change-password'
  authMiddleware,
  authController.changePassword
);

module.exports = router;