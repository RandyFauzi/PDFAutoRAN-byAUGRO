// src/routes/midtrans.routes.js
const express = require('express');
const router = express.Router();

// Import controller sebagai object, TIDAK di-destructure
const midtransController = require('../controllers/midtrans.controller');

// POST /api/v1/payments/midtrans/create-subscription
router.post(
  '/create-subscription',
  midtransController.createSubscription
);

// POST /api/v1/payments/midtrans/create-topup
router.post(
  '/create-topup',
  midtransController.createTopup
);

// POST /api/v1/payments/midtrans/webhook
router.post(
  '/webhook',
  midtransController.handleNotification
);

module.exports = router;
