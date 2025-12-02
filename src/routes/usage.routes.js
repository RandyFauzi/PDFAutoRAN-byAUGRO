// src/routes/usage.routes.js
// ---------------------------------------------
// Routing untuk usage logs user (riwayat pemakaian).
// ---------------------------------------------

const express = require('express');
const router = express.Router();

const authMiddleware = require('../middleware/authMiddleware');
const usageController = require('../controllers/usage.controller');

// GET /api/v1/usage/logs
router.get('/logs', authMiddleware, usageController.listForCurrentUser);

module.exports = router;
