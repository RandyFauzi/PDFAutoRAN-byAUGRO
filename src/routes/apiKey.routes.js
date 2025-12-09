const express = require('express');
const router = express.Router();
const apiKeyController = require('../controllers/apiKey.controller');
const authMiddleware = require('../middleware/authMiddleware');

// Bisa pakai POST /api/v1/api-keys (lebih RESTful)
router.post('/', authMiddleware, apiKeyController.generate);

// Tetap support endpoint lama: POST /api/v1/api-keys/generate
router.post('/generate', authMiddleware, apiKeyController.generate);

router.get('/', authMiddleware, apiKeyController.list);
router.delete('/:id', authMiddleware, apiKeyController.revoke);

module.exports = router;
