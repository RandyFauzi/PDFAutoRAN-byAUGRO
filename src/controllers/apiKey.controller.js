const apiKeyService = require('../services/apiKey.service');

module.exports = {
  async generate(req, res) {
    try {
      const userId = req.user.id;
      const { label } = req.body;

      if (!label) {
        return res.status(400).json({ message: 'Label is required' });
      }

      const { rawKey, apiKey } = await apiKeyService.createApiKey(userId, label);

      return res.json({
        message: 'API Key generated',
        apiKey: rawKey, // plain sekali saat generate
        info: {
          id: apiKey.id,
          label: apiKey.label,
          createdAt: apiKey.createdAt,
        },
      });
    } catch (err) {
      console.error('[ApiKeyController] generate error:', err);
      return res.status(500).json({ message: 'Failed to generate API key' });
    }
  },

  async list(req, res) {
    try {
      const keys = await apiKeyService.listApiKeys(req.user.id);

      // Kalau mau array langsung (seperti sekarang)
      // return res.json(keys);

      // Atau kalau mau lebih konsisten:
      return res.json({ data: keys });
    } catch (err) {
      console.error('[ApiKeyController] list error:', err);
      return res.status(500).json({ message: 'Failed to list API keys' });
    }
  },

  async revoke(req, res) {
    try {
      const { id } = req.params;

      await apiKeyService.revokeKey(Number(id), req.user.id);

      return res.json({ message: 'API Key revoked' });
    } catch (err) {
      console.error('[ApiKeyController] revoke error:', err);
      return res.status(500).json({ message: 'Failed to revoke API key' });
    }
  },
};
