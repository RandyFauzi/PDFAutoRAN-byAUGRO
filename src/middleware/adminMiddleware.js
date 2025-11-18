// src/middleware/adminMiddleware.js
// ------------------------------------------------------
// Middleware untuk membatasi akses hanya ke admin.
// Admin ditentukan dari daftar email di ENV:
//   ADMIN_EMAILS=user1@domain.com,user2@domain.com
// ------------------------------------------------------

const env = require('../config/env');

function getAdminEmails() {
  let raw = process.env.ADMIN_EMAILS || '';

  // Pastikan selalu string
  if (typeof raw !== 'string') {
    raw = String(raw || '');
  }

  if (!raw.trim()) {
    return [];
  }

  return raw
    .split(',')                     // pisah koma kalau lebih dari 1
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Middleware utama.
 * Syarat:
 * - authMiddleware sudah jalan duluan, jadi req.user sudah terisi
 */
async function adminMiddleware(req, res, next) {
  try {
    if (!req.user || !req.user.email) {
      return res.status(401).json({
        message: 'Unauthorized: user belum terautentikasi.',
      });
    }

    const adminEmails = getAdminEmails();
    const userEmail = String(req.user.email).toLowerCase();

    const isAdmin = adminEmails.includes(userEmail);

    if (!isAdmin) {
      return res.status(403).json({
        message: 'Forbidden: hanya admin yang boleh mengakses endpoint ini.',
      });
    }

    // Lolos → lanjut ke controller admin.*
    return next();
  } catch (err) {
    console.error('adminMiddleware error:', err);
    return res.status(500).json({
      message: 'Terjadi kesalahan pada admin middleware.',
    });
  }
}

module.exports = adminMiddleware;
