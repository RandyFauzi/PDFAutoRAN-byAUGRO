// src/routes/midtrans.routes.js
const express = require('express');
const router = express.Router();

const midtransController = require('../controllers/midtrans.controller');

// =====================================
// Dipanggil dari Laravel:
// POST /api/v1/payments/midtrans/create-subscription
// =====================================
router.post('/create-subscription', midtransController.createSubscription);

// =====================================
// Webhook / Notification dari Midtrans:
// POST /api/v1/payments/midtrans/callback
// (endpoint ini yang kamu set di dashboard Midtrans)
// =====================================
router.post('/callback', midtransController.handleCallback);

module.exports = router;
