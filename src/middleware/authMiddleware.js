const jwt = require('jsonwebtoken');
const apiKeyMiddleware = require('./apiKeyMiddleware');
const env = require('../config/env'); // env.jwtSecret

async function authMiddleware(req, res, next) {
  // 1️⃣ Cek API Key dulu
  const apiKey = req.headers['x-api-key'];
  if (apiKey) {
    return apiKeyMiddleware(req, res, next);
  }

  // 2️⃣ Kalau tidak ada API Key → pakai JWT
  const authHeader = req.headers['authorization'];

  if (!authHeader) {
    return res.status(401).json({ message: 'Authorization header missing' });
  }

  const parts = authHeader.split(' ');

  // Format harus: "Bearer <token>"
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({ message: 'Invalid Authorization header format' });
  }

  const token = parts[1];

  try {
    // Verifikasi token pakai secret dari env.js
    const payload = jwt.verify(token, env.jwtSecret);

    // Simpan data user di request untuk handler berikutnya
    req.user = {
      id: payload.id,
      email: payload.email,
    };
    req.authType = 'JWT';

    // Lanjut ke middleware/handler berikutnya
    return next();
  } catch (err) {
    console.error('JWT verify error:', err.message);
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

module.exports = authMiddleware;
