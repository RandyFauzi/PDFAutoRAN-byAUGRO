// src/services/user.service.js
// ------------------------------------------------------
// Layer service untuk operasi ke tabel User menggunakan Prisma.
// ------------------------------------------------------

const prisma = require('../config/prisma');
const { TIER } = require('../config/creditCost');

// Cari user berdasarkan email
async function findUserByEmail(email) {
  return prisma.user.findUnique({
    where: { email }
  });
}

// Buat user baru
async function createUser(email, passwordHash) {
  return prisma.user.create({
    data: {
      email,
      password: passwordHash,
      credits: 0 // default 0 credits, nanti bisa di-topup oleh admin
    }
  });
}

// Ambil user berdasarkan ID
async function getUserById(id) {
  return prisma.user.findUnique({
    where: { id }
  });
}

// Tambah credits untuk user (dipakai saat admin approve pembayaran)
async function increaseCredits(userId, amount) {
  if (amount <= 0) {
    throw new Error('Amount untuk increaseCredits harus > 0');
  }

  return prisma.user.update({
    where: { id: userId },
    data: {
      credits: {
        increment: amount
      }
    }
  });
}

// Kurangi credits untuk user (dipakai setelah eksekusi endpoint PDF)
async function decreaseCredits(userId, amount) {
  if (amount <= 0) {
    throw new Error('Amount untuk decreaseCredits harus > 0');
  }

  // Untuk keamanan, kita pastikan credits tidak pernah menjadi negatif.
  // Cara mudah: pakai transaction.
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { credits: true }
    });

    if (!user) {
      throw new Error('User tidak ditemukan saat decreaseCredits');
    }

    if (user.credits < amount) {
      throw new Error('Credits tidak cukup untuk decreaseCredits');
    }

    const updated = await tx.user.update({
      where: { id: userId },
      data: {
        credits: {
          decrement: amount
        }
      }
    });

    return updated;
  });
}

// Ambil semua user (untuk admin)
async function listUsers() {
  return prisma.user.findMany({
    orderBy: { id: 'asc' },
    select: {
      id: true,
      email: true,
      plan: true,
      credits: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

// Update plan user (FREE / BASIC / PRO / BUSINESS)
// options:
//   - billingCycle: 'monthly' | 'yearly' (untuk paket berbayar)
//   - setDefaultCredits: boolean -> kalau true, credits di-set ke default paket
async function updateUserPlan(userId, plan, options = {}) {
  const upperPlan = String(plan).toUpperCase();

  if (!TIER[upperPlan]) {
    throw new Error(`Plan tidak dikenal: ${plan}`);
  }

  const dataToUpdate = {
    plan: upperPlan,
  };

  // Jika diminta, set credits ke default
  if (options.setDefaultCredits) {
    if (upperPlan === 'FREE') {
      const initial = TIER.FREE.initialCredits || 0;
      dataToUpdate.credits = initial;
    } else {
      // Paket berbayar: pilih monthly / yearly
      const billingCycle = options.billingCycle || 'monthly';
      const tierCfg = TIER[upperPlan][billingCycle];

      if (!tierCfg) {
        throw new Error(
          `Billing cycle tidak valid untuk plan ${upperPlan}: ${billingCycle}`
        );
      }

      dataToUpdate.credits = tierCfg.creditsPerPeriod || 0;
    }
  }

  return prisma.user.update({
    where: { id: Number(userId) },
    data: dataToUpdate,
  });
}

// Set credits user ke angka tertentu (misalnya 50.000)
async function setUserCredits(userId, credits) {
  const value = Number(credits);
  if (Number.isNaN(value) || value < 0) {
    throw new Error('Nilai credits tidak valid');
  }

  return prisma.user.update({
    where: { id: Number(userId) },
    data: { credits: value },
  });
}

// Tambah credits (top-up manual)
async function addUserCredits(userId, amount) {
  const value = Number(amount);
  if (Number.isNaN(value)) {
    throw new Error('Nilai amount tidak valid');
  }

  return prisma.user.update({
    where: { id: Number(userId) },
    data: {
      credits: { increment: value },
    },
  });
}


module.exports = {
  findUserByEmail,
  createUser,
  getUserById,
  increaseCredits,
  decreaseCredits,

  // Admin utilities
  listUsers,
  updateUserPlan,
  setUserCredits,
  addUserCredits,
};

