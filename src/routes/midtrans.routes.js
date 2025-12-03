// src/routes/midtrans.routes.js

const express = require('express');
const router = express.Router();

const midtransController = require('../controllers/midtrans.controller');
// Kalau nanti mau pakai auth, bisa aktifkan ini:
// const authMiddleware = require('../middleware/authMiddleware');

// -------------------------------------------
// Route untuk membuat transaksi + Snap Token
// Dipanggil dari FRONTEND (Laravel / dashboard)
// -------------------------------------------

// Tanpa auth (untuk awal development/testing)
router.post(
  '/create-transaction',
  // authMiddleware, // <- aktifkan kalau mau proteksi
  midtransController.createTransaction
);

// -------------------------------------------
// Route untuk menerima NOTIFICATION / WEBHOOK
// dari Midtrans. TIDAK boleh pakai auth,
// harus bisa diakses langsung oleh Midtrans.
// -------------------------------------------

router.post(
  '/notification',
  midtransController.handleNotification
);

module.exports = router;
