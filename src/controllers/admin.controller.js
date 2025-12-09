// src/controllers/admin.controller.js
// ------------------------------------------------------
// Endpoint admin untuk kelola user, plan, dan credits.
// ------------------------------------------------------

const userService = require('../services/user.service');
const { applyFreePlan, applyPaidPlan } = require('../services/subscription.service');
// NEW: untuk manual trigger reset subscription (opsional)
const { runSubscriptionResetJob } = require('../jobs/subscriptionReset.job');

// GET /api/v1/admin/users
async function listUsers(req, res) {
  try {
    const users = await userService.listUsers();
    return res.json({ data: users });
  } catch (err) {
    console.error('Admin listUsers error:', err);
    return res
      .status(500)
      .json({ message: 'Gagal mengambil data user (admin).' });
  }
}

/**
 * PATCH /api/v1/admin/users/:id/plan
 * body:
 *   {
 *     plan: 'FREE' | 'BASIC' | 'PRO' | 'BUSINESS',
 *     billingCycle?: 'monthly' | 'yearly'
 *   }
 *
 * Catatan:
 * - FREE: tidak butuh billingCycle
 * - BASIC/PRO/BUSINESS: WAJIB kirim billingCycle
 */
async function updateUserPlan(req, res) {
  try {
    const userId = parseInt(req.params.id, 10);
    const { plan, billingCycle } = req.body;

    if (!plan) {
      return res
        .status(400)
        .json({ message: 'Field "plan" wajib diisi (FREE/BASIC/PRO/BUSINESS).' });
    }

    const upperPlan = String(plan).toUpperCase();

    // FREE plan: tidak butuh subscription aktif
    if (upperPlan === 'FREE') {
      const user = await applyFreePlan(userId);
      return res.json({
        message: 'User plan diubah ke FREE (initial credits diberikan jika belum pernah).',
        data: {
          id: user.id,
          email: user.email,
          plan: user.plan,
          credits: user.credits,
        },
      });
    }

    // Paid plan: BASIC / PRO / BUSINESS
    if (!['BASIC', 'PRO', 'BUSINESS'].includes(upperPlan)) {
      return res
        .status(400)
        .json({ message: `Plan tidak dikenal: ${plan}` });
    }

    if (!billingCycle) {
      return res
        .status(400)
        .json({ message: 'Field "billingCycle" wajib diisi untuk plan berbayar (monthly/yearly).' });
    }

    const upperCycle = String(billingCycle).toUpperCase(); // 'monthly' -> 'MONTHLY'

    if (!['MONTHLY', 'YEARLY'].includes(upperCycle)) {
      return res
        .status(400)
        .json({ message: 'billingCycle harus "monthly" atau "yearly".' });
    }

    const user = await applyPaidPlan(userId, upperPlan, upperCycle);

    return res.json({
      message: `User plan berhasil diperbarui ke ${upperPlan} (${upperCycle}).`,
      data: {
        id: user.id,
        email: user.email,
        plan: user.plan,
        credits: user.credits,
      },
    });
  } catch (err) {
    console.error('Admin updateUserPlan error:', err);
    return res
      .status(500)
      .json({ message: 'Gagal mengubah plan user (admin).' });
  }
}

/**
 * PATCH /api/v1/admin/users/:id/credits
 * body:
 *   {
 *     mode: 'set' | 'add',
 *     amount: number
 *   }
 */
async function updateUserCredits(req, res) {
  try {
    // FIX: pastikan userId integer
    const userId = parseInt(req.params.id, 10);
    const { mode, amount } = req.body;

    if (!mode || !['set', 'add'].includes(mode)) {
      return res.status(400).json({
        message: 'Field "mode" wajib diisi dengan "set" atau "add".',
      });
    }

    if (amount === undefined) {
      return res
        .status(400)
        .json({ message: 'Field "amount" wajib diisi.' });
    }

    // FIX: pastikan amount adalah angka
    const numericAmount = Number(amount);
    if (Number.isNaN(numericAmount)) {
      return res
        .status(400)
        .json({ message: 'Field "amount" harus berupa angka.' });
    }

    let updated;

    if (mode === 'set') {
      updated = await userService.setUserCredits(userId, numericAmount);
    } else {
      // mode === 'add'
      updated = await userService.addUserCredits(userId, numericAmount);
    }

    return res.json({
      message: 'Credits user berhasil diperbarui.',
      data: {
        id: updated.id,
        email: updated.email,
        plan: updated.plan,
        credits: updated.credits,
      },
    });
  } catch (err) {
    console.error('Admin updateUserCredits error:', err);
    return res
      .status(500)
      .json({ message: 'Gagal mengubah credits user (admin).' });
  }
}

/**
 * DELETE /api/v1/admin/users/:id
 *
 * Menghapus user dari sistem.
 * Catatan: pastikan service userService.deleteUser(userId) sudah ada.
 */
async function deleteUser(req, res) {
  try {
    const userId = parseInt(req.params.id, 10);

    if (!userId || Number.isNaN(userId)) {
      return res.status(400).json({
        message: 'ID user tidak valid.',
      });
    }

    // Opsional: cegah hapus super admin ID 1 kalau mau
    // if (userId === 1) {
    //   return res.status(403).json({ message: 'User ini tidak boleh dihapus.' });
    // }

    await userService.deleteUser(userId);

    return res.json({
      success: true,
      message: 'User berhasil dihapus.',
    });
  } catch (err) {
    console.error('Admin deleteUser error:', err);
    return res
      .status(500)
      .json({ message: 'Gagal menghapus user (admin).' });
  }
}



/**
 * NEW (opsional, tapi sangat berguna untuk testing)
 * POST /api/v1/admin/subscriptions/reset-now
 *
 * Menjalankan job reset subscription (yang biasanya jalan via cron)
 * secara manual, sekali saja.
 */
async function runSubscriptionResetNow(req, res) {
  try {
    await runSubscriptionResetJob();
    return res.json({
      message: 'Subscription reset job berhasil dijalankan secara manual.',
    });
  } catch (err) {
    console.error('Admin runSubscriptionResetNow error:', err);
    return res
      .status(500)
      .json({ message: 'Gagal menjalankan subscription reset job (admin).' });
  }
}

module.exports = {
  listUsers,
  updateUserPlan,
  updateUserCredits,
  deleteUser,
  runSubscriptionResetNow,
};
