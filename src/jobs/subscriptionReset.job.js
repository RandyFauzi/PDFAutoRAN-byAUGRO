// src/jobs/subscriptionReset.job.js
// ------------------------------------------------------
// Job untuk auto-reset credits bulanan/tahunan
// berdasarkan tabel "subscription".
// ------------------------------------------------------

const prisma = require('../config/prisma');
const { getPlanConfig } = require('../config/creditCost');

/**
 * Hitung periode berikutnya berdasarkan currentPeriodEnd & billingCycle.
 * Jika currentPeriodEnd sudah lewat, jadikan currentPeriodEnd sebagai start baru.
 */
function getNextPeriodRange(currentPeriodEnd, billingCycle) {
  const now = new Date();

  // Start periode baru = maksimal antara now dan currentPeriodEnd
  let periodStart = currentPeriodEnd && currentPeriodEnd > now
    ? currentPeriodEnd
    : currentPeriodEnd || now;

  periodStart = new Date(periodStart); // clone

  const periodEnd = new Date(periodStart);

  if (billingCycle === 'MONTHLY') {
    periodEnd.setMonth(periodEnd.getMonth() + 1);
  } else if (billingCycle === 'YEARLY') {
    periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  } else {
    // fallback: anggap monthly
    periodEnd.setMonth(periodEnd.getMonth() + 1);
  }

  return { periodStart, periodEnd };
}

/**
 * Job utama: mencari subscription yang sudah lewat periodenya
 * lalu reset credits user + geser currentPeriodStart/End.
 */
async function runSubscriptionResetJob() {
  const now = new Date();
  console.log(`[SubscriptionReset] Running at ${now.toISOString()}`);

  // Ambil semua subscription ACTIVE yang sudah lewat periode
  const subscriptions = await prisma.subscription.findMany({
    where: {
      status: 'ACTIVE',
      currentPeriodEnd: {
        lte: now,
      },
    },
  });

  console.log(
    `[SubscriptionReset] Found ${subscriptions.length} subscription(s) to reset.`,
  );

  for (const sub of subscriptions) {
    try {
      // Ambil config plan + billingCycle
      const cfg = getPlanConfig(sub.plan, sub.billingCycle);
      if (!cfg || !cfg.creditsPerPeriod) {
        console.warn(
          `[SubscriptionReset] No plan config for userId=${sub.userId}, plan=${sub.plan}, billing=${sub.billingCycle}`,
        );
        continue;
      }

      const { periodStart, periodEnd } = getNextPeriodRange(
        sub.currentPeriodEnd,
        sub.billingCycle,
      );

      await prisma.$transaction(async (tx) => {
        // Update subscription periode
        await tx.subscription.update({
          where: { id: sub.id },
          data: {
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
            updatedAt: new Date(),
          },
        });

        // Reset credits user sesuai creditsPerPeriod
        await tx.user.update({
          where: { id: sub.userId },
          data: {
            credits: cfg.creditsPerPeriod,
            updatedAt: new Date(),
          },
        });
      });

      console.log(
        `[SubscriptionReset] Reset userId=${sub.userId} to ${cfg.creditsPerPeriod} credits. Next period: ${periodStart.toISOString()} - ${periodEnd.toISOString()}`,
      );
    } catch (err) {
      console.error(
        `[SubscriptionReset] Error processing subscription id=${sub.id}, userId=${sub.userId}:`,
        err,
      );
    }
  }

  console.log('[SubscriptionReset] Job finished.');
}

/**
 * Scheduler sederhana: menjalankan job setiap 24 jam.
 * (Nanti kalau mau pakai node-cron untuk jam tertentu, bisa di-upgrade.)
 */
function startSubscriptionResetScheduler() {
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;

  console.log(
    '[SubscriptionReset] Scheduler started. Job will run every 24 hours.',
  );

  // Jalankan sekali saat server start (opsional, bisa kamu matikan kalau mau)
  runSubscriptionResetJob().catch((err) => {
    console.error('[SubscriptionReset] Initial run error:', err);
  });

  // Lalu ulangi tiap 24 jam
  setInterval(() => {
    runSubscriptionResetJob().catch((err) => {
      console.error('[SubscriptionReset] Scheduled run error:', err);
    });
  }, ONE_DAY_MS);
}


module.exports = {
  startSubscriptionResetScheduler,
  runSubscriptionResetJob,
};

