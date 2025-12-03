// src/routes/midtrans.routes.js

const express = require('express');
const router = express.Router();

const midtransController = require('../controllers/midtrans.controller');

// Webhook / notification dari Midtrans Snap
// Full path (di app.js): /api/v1/payments/midtrans/callback
router.post('/midtrans/callback', midtransController.handleCallback);

module.exports = router;
