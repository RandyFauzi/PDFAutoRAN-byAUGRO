// src/routes/midtrans.routes.js
// ------------------------------------------------------
// Routing untuk pembayaran Midtrans (callback).
// Prefix dari server: /api/v1/payments
// ------------------------------------------------------

const express = require('express');
const router = express.Router();
const midtransController = require('../controllers/midtrans.controller');

// POST /api/v1/payments/midtrans/callback
router.post('/midtrans/callback', midtransController.handleMidtransCallback);

module.exports = router;