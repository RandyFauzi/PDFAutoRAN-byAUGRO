// src/middleware/creditMiddleware.js
// ------------------------------------------------------
// Middleware untuk:
// 1. Mengecek saldo credits user
// 2. (opsional) Mengecek pemakaian harian
// 3. Memotong credits + mencatat UsageLog dalam 1 transaksi
// ------------------------------------------------------

const prisma = require('../config/prisma');
const { COST } = require('../config/creditCost');
const { logUsage, getDailyCreditsUsed } = require('../services/usage.service');

/**
 * Middleware lawas: hanya cek minimal credits, TANPA memotong.
 * Kalau kamu sudah pakai useCredit saja, ini boleh tidak dipakai,
 * tapi kita tetap export biar kompatibel.
 */
function requireCredits(requiredCredits = 1) {
  return async (req, res, next) => {
    try {
      const userId = req.user && req.user.id;

      if (!userId) {
        return res.status(401).json({ message: 'User belum terautentikasi.' });
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        return res.status(404).json({ message: 'User tidak ditemukan.' });
      }

      if (user.credits < requiredCredits) {
        return res.status(402).json({
          message: 'Credits tidak cukup. Silakan top-up paket terlebih dahulu.',
        });
      }

      // simpan ke req kalau dibutuhkan
      req.currentUser = user;
      req.requiredCredits = requiredCredits;

      next();
    } catch (err) {
      console.error('requireCredits error:', err);
      return res
        .status(500)
        .json({ message: 'Terjadi kesalahan pada server (credits).' });
    }
  };
}

/**
 * Middleware utama untuk potong credits per operasi.
 *
 * Contoh di routes:
 *   router.post(
 *     '/html-to-pdf',
 *     authMiddleware,
 *     useCredit('HTML_TO_PDF'),
 *     pdfController.htmlToPdf
 *   );
 */
function useCredit(operationKey) {
  return async (req, res, next) => {
    try {
      const userId = req.user && req.user.id;

      if (!userId) {
        return res.status(401).json({ message: 'User belum terautentikasi.' });
      }

      const cost = COST[operationKey];

      if (typeof cost !== 'number') {
        console.error(`[useCredit] Unknown credit cost for operation ${operationKey}`);
        return res.status(500).json({
          message: `Unknown credit cost for operation ${operationKey}`,
        });
      }

      // Ambil user + cek saldo
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        return res.status(404).json({ message: 'User tidak ditemukan.' });
      }

      if (user.credits < cost) {
        return res.status(402).json({
          message: 'Not enough credits',
          currentCredits: user.credits,
          required: cost,
        });
      }

      // (Opsional) Cek pemakaian harian jika nanti kamu mau limit per hari.
      // Untuk sekarang, hanya kita hitung saja (tidak membatasi).
      try {
        const usedToday = await getDailyCreditsUsed(userId);
        console.log(
          `[useCredit] User ${userId} sudah pakai ${usedToday} credits hari ini sebelum operasi ${operationKey}`,
        );
        // Nanti kalau mau limit, tinggal tambah if di sini.
      } catch (innerErr) {
        // Kalau perhitungan daily usage error, JANGAN potong credits & JANGAN lanjut.
        console.error('[useCredit] getDailyCreditsUsed error:', innerErr);
        return res.status(500).json({
          message: 'Failed to calculate daily credit usage',
        });
      }

      // Potong credits + catat usage dalam 1 transaksi.
      await prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: userId },
          data: {
            credits: user.credits - cost,
          },
        });

        await logUsage(userId, operationKey, cost, tx);
      });

      // Kalau semua sukses → lanjut ke controller
      return next();
    } catch (err) {
      console.error('[useCredit] error:', err);
      return res.status(500).json({
        message: 'Failed to process credits',
      });
    }
  };
}

module.exports = {
  requireCredits,
  useCredit,
};
