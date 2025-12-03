// src/routes/midtrans.routes.js
// ------------------------------------------------------
// Routing untuk pembayaran Midtrans (callback).
// Prefix dari server: /api/v1/payments
// ------------------------------------------------------

const express = require('express');
const router = express.Router();
const midtransController = require('../controllers/midtrans.controller');

// callback dari Midtrans
router.post('/midtrans/callback', midtransController.handleCallback);

// endpoint test (yang dipanggil dari BillingTestController Laravel)
router.post('/midtrans/create-test-transaction', midtransController.createTestTransaction);

// endpoint REAL subscription
router.post('/midtrans/create-subscription', midtransController.createSubscription);

// endpoint REAL topup
router.post('/midtrans/create-topup', midtransController.createTopup);

module.exports = router;