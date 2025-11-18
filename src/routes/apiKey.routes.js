const express = require('express');
const router = express.Router();
const apiKeyController = require('../controllers/apiKey.controller');
const authMiddleware = require('../middleware/authMiddleware');

router.post('/generate', authMiddleware, apiKeyController.generate);
router.get('/', authMiddleware, apiKeyController.list);
router.delete('/:id', authMiddleware, apiKeyController.revoke);

module.exports = router;
