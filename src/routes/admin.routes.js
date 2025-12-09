// src/routes/admin.routes.js
// ------------------------------------------------------
// Routing untuk fitur Admin (kelola user, plan, credits).
// ------------------------------------------------------

const express = require('express');
const router = express.Router();

const authMiddleware = require('../middleware/authMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');
const adminController = require('../controllers/admin.controller');

// >>> IMPORT JOB RESET SUBSCRIPTION
const { runSubscriptionResetJob } = require('../jobs/subscriptionReset.job');

// Semua endpoint admin:
// - harus login (authMiddleware)
// - harus admin (adminMiddleware)

router.get(
  '/users',
  authMiddleware,
  adminMiddleware,
  adminController.listUsers
);

router.patch(
  '/users/:id/plan',
  authMiddleware,
  adminMiddleware,
  adminController.updateUserPlan
);

router.patch(
  '/users/:id/credits',
  authMiddleware,
  adminMiddleware,
  adminController.updateUserCredits
);

// HAPUS USER
// DELETE /api/v1/admin/users/:id
router.delete(
  '/users/:id',
  authMiddleware,
  adminMiddleware,
  adminController.deleteUser
);


// ------------------------------------------------------
// DEBUG: jalankan job reset subscription secara manual
// POST /api/v1/admin/debug/run-reset
// ------------------------------------------------------
router.post(
  '/debug/run-reset',
  authMiddleware,
  adminMiddleware,
  async (req, res) => {
    try {
      await runSubscriptionResetJob();  // <<< DI SINI variabelnya HARUS ada
      return res.json({
        message: 'Subscription reset job executed.',
      });
    } catch (err) {
      console.error('Debug run-reset error:', err);
      return res.status(500).json({
        message: 'Gagal menjalankan reset bulanan.',
        detail: err.message,
      });
    }
  }
);

module.exports = router;
