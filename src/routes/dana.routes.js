    // src/routes/dana.routes.js
const express = require('express');
const router = express.Router();

const danaController = require('../controllers/dana.controller');

// Webhook dari DANA
// Final URL: POST /api/v1/payments/dana/notify
router.post('/payments/dana/notify', danaController.finishNotify);

module.exports = router;
