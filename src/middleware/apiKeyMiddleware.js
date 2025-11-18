const apiKeyService = require('../services/apiKey.service');

module.exports = async function apiKeyMiddleware(req, res, next) {
  const headerKey = req.headers['x-api-key'];

  if (!headerKey) return next(); // lanjut ke JWT auth kalau tidak ada API key

  const keyRecord = await apiKeyService.validateKey(headerKey);
  if (!keyRecord) return res.status(401).json({ message: "Invalid API Key" });

  req.user = keyRecord.user; // inject user sama seperti JWT
  req.authType = "API_KEY";

  next();
};
