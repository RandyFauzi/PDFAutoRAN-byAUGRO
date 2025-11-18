// src/services/subscription.service.js
// --------------------------------------------
// Logika utama untuk mengelola plan & subscription:
// - FREE: initial credits 1x, tidak ada subscription aktif.
// - BASIC/PRO/BUSINESS: punya subscription + periode (monthly/yearly).
// --------------------------------------------

const prisma = require('../config/prisma');
const { TIER, getPlanConfig } = require('../config/creditCost');

// Helper sederhana untuk menambah bulan/tahun
function addMonths(date, months) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function addYears(date, years) {
  const d = new Date(date);
  d.setFullYear(d.getFullYear() + years);
  return d;
}

/**
 * applyFreePlan(userId)
 * ----------------------
 * - Set user.plan = FREE
 * - Jika user belum pernah dapat initial, tambahkan TIER.FREE.initialCredits
 * - Tandai freeInitialGranted = true agar tidak dobel
 * - Nonaktifkan subscription ACTIVE (jika ada)
 */
async function applyFreePlan(userId) {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId } });

    if (!user) throw new Error('User not found');

    let creditsToSet = user.credits;
    let freeInitialGranted = user.freeInitialGranted;

    if (!freeInitialGranted) {
      const initial = TIER.FREE.initialCredits || 0;
      creditsToSet += initial;
      freeInitialGranted = true;
    }

    const updatedUser = await tx.user.update({
      where: { id: userId },
      data: {
        plan: 'FREE',              // enum Plan di Prisma
        credits: creditsToSet,
        freeInitialGranted,
      },
    });

    // Cancel subscription aktif kalau ada
    await tx.subscription.updateMany({
      where: { userId, status: 'ACTIVE' },
      data: { status: 'CANCELED' },
    });

    return updatedUser;
  });
}

/**
 * applyPaidPlan(userId, plan, billingCycle)
 * -----------------------------------------
 * plan          : 'BASIC' | 'PRO' | 'BUSINESS'
 * billingCycle  : 'MONTHLY' | 'YEARLY'
 *
 * - Set user.plan = plan
 * - Reset credits = creditsPerPeriod dari TIER
 * - Upsert subscription (ACTIVE) dengan periode baru
 */
async function applyPaidPlan(userId, plan, billingCycle) {
  const planKey = String(plan).toUpperCase();            // BASIC/PRO/BUSINESS
  const cycleEnum = String(billingCycle).toUpperCase();  // MONTHLY/YEARLY

  if (!['BASIC', 'PRO', 'BUSINESS'].includes(planKey)) {
    throw new Error('Invalid paid plan');
  }

  if (!['MONTHLY', 'YEARLY'].includes(cycleEnum)) {
    throw new Error('Invalid billing cycle');
  }

  // Ambil config dari TIER:
  // TIER.BASIC.monthly / TIER.BASIC.yearly / dst.
  const cfg = getPlanConfig(planKey, cycleEnum);
  if (!cfg) {
    throw new Error(`No TIER config for ${planKey} ${cycleEnum}`);
  }

  const now = new Date();
  const creditsPerPeriod = cfg.creditsPerPeriod || 0;

  const [start, end] =
    cycleEnum === 'MONTHLY'
      ? [now, addMonths(now, 1)]
      : [now, addYears(now, 1)];

  return prisma.$transaction(async (tx) => {
    // Reset credits user ke base plan
    const updatedUser = await tx.user.update({
      where: { id: userId },
      data: {
        plan: planKey,
        credits: creditsPerPeriod,
      },
    });

    // 1 user : 1 subscription aktif (upsert by userId)
    await tx.subscription.upsert({
      where: { userId },
      update: {
        plan: planKey,
        billingCycle: cycleEnum, // enum BillingCycle di Prisma
        status: 'ACTIVE',
        currentPeriodStart: start,
        currentPeriodEnd: end,
      },
      create: {
        userId,
        plan: planKey,
        billingCycle: cycleEnum,
        status: 'ACTIVE',
        currentPeriodStart: start,
        currentPeriodEnd: end,
      },
    });

    return updatedUser;
  });
}

module.exports = {
  applyFreePlan,
  applyPaidPlan,
};
