// src/services/usage.service.js
// ------------------------------------------------------
// Layanan untuk mencatat penggunaan credits (UsageLog)
// dan menghitung total pemakaian harian.
// ------------------------------------------------------

const prisma = require('../config/prisma');

/**
 * Utility kecil: dapatkan awal & akhir hari (local server time).
 */
function getDayRange(date = new Date()) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);

  const end = new Date(date);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

/**
 * Catat penggunaan credits satu operasi.
 *
 * @param {number} userId
 * @param {string} operation   - misal: 'HTML_TO_PDF', 'MERGE', 'STAMP'
 * @param {number} creditsUsed
 * @param {*} tx               - optional: transaksi Prisma (tx) kalau dipanggil di dalam $transaction
 */
async function logUsage(userId, operation, creditsUsed, tx) {
  const client = tx || prisma;

  return client.usageLog.create({
    data: {
      userId,
      operation,
      creditsUsed,
    },
  });
}

/**
 * Hitung total credits yang sudah dipakai user pada hari ini.
 *
 * @param {number} userId
 * @param {Date} date
 * @param {*} tx         - optional: transaksi Prisma
 * @returns {Promise<number>} total credits hari itu
 */
async function getDailyCreditsUsed(userId, date = new Date(), tx) {
  const client = tx || prisma; // <-- kalau tx tidak dikirim, pakai prisma global

  const { start, end } = getDayRange(date);

  const result = await client.usageLog.aggregate({
    _sum: {
      creditsUsed: true,
    },
    where: {
      userId,
      createdAt: {
        gte: start,
        lt: end,
      },
    },
  });

  return result._sum.creditsUsed || 0;
}

module.exports = {
  logUsage,
  getDailyCreditsUsed,
};
