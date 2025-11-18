const apiKeyService = require('../services/apiKey.service');

module.exports = {
  async generate(req, res) {
    const userId = req.user.id;
    const { label } = req.body;

    if (!label) return res.status(400).json({ message: "Label is required" });

    const { rawKey, apiKey } = await apiKeyService.createApiKey(userId, label);

    return res.json({
      message: "API Key generated",
      apiKey: rawKey,
      info: {
        id: apiKey.id,
        label: apiKey.label,
        createdAt: apiKey.createdAt
      }
    });
  },

  async list(req, res) {
    const keys = await apiKeyService.listApiKeys(req.user.id);
    res.json(keys);
  },

  async revoke(req, res) {
    const { id } = req.params;
    await apiKeyService.revokeKey(Number(id), req.user.id);

    res.json({ message: "API Key revoked" });
  }
};
