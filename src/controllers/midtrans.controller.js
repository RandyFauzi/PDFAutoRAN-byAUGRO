// src/controllers/midtrans.controller.js
// ------------------------------------------------------
// Midtrans SNAP callback handler
// Endpoint: POST /api/v1/payments/midtrans/callback
// ------------------------------------------------------

const crypto = require('crypto');
const prisma = require('../config/prisma');
const env = require('../config/env');
const { getPlanConfig } = require('../config/creditCost');

// Map status Midtrans -> status internal Transaction
function mapMidtransStatus(transactionStatus) {
  const s = String(transactionStatus || '').toLowerCase();

  if (s === 'capture' || s === 'settlement') return 'SUCCESS';
  if (s === 'pending') return 'PENDING';

  // deny, expire, cancel, refund, chargeback, etc.
  return 'FAILED';
}

// Hitung periode billing dari sekarang
function getNextPeriodRangeFromNow(billingCycleEnum) {
  const now = new Date();
  const periodStart = new Date(now);
  const periodEnd = new Date(now);

  if (billingCycleEnum === 'MONTHLY') {
    periodEnd.setMonth(periodEnd.getMonth() + 1);
  } else if (billingCycleEnum === 'YEARLY') {
    periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  } else {
    periodEnd.setMonth(periodEnd.getMonth() + 1);
  }

  return { periodStart, periodEnd };
}

// ------------------------------------------------------
// POST /api/v1/payments/midtrans/callback
// ------------------------------------------------------
async function handleMidtransCallback(req, res) {
  try {
    const body = req.body || {};
    const {
      order_id: orderId,
      status_code: statusCode,
      gross_amount: grossAmount,
      signature_key: signatureKey,
      transaction_status: transactionStatus,
    } = body;

    if (!orderId || !statusCode || !grossAmount || !signatureKey) {
      return res.status(400).json({
        message: 'Missing required Midtrans fields',
      });
    }

    // 1. Validasi signature
    const serverKey =
      env.midtransServerKey || process.env.MIDTRANS_SERVER_KEY;

    if (!serverKey) {
      console.error('[MidtransCallback] MIDTRANS_SERVER_KEY not set');
      return res.status(500).json({
        message: 'Midtrans server key not configured',
      });
    }

    const expectedSignature = crypto
      .createHash('sha512')
      .update(orderId + statusCode + grossAmount + serverKey)
      .digest('hex');

    if (expectedSignature !== signatureKey) {
      console.warn('[MidtransCallback] Invalid signature for order', orderId);
      return res.status(400).json({ message: 'Invalid signature' });
    }

    const txStatus = mapMidtransStatus(transactionStatus);

    // 2. Parse order_id
    // subs-{userId}-{planId}-{billingCycle}-{timestamp}
    // topup-{userId}-{creditAmount}-{timestamp}
    const parts = String(orderId).split('-');
    const prefix = parts[0];

    if (prefix !== 'subs' && prefix !== 'topup') {
      console.warn('[MidtransCallback] Unknown order prefix:', prefix);
      // tetap 200 supaya Midtrans tidak retry terus, tapi tandai failed
      return res.status(200).json({ message: 'Ignored unknown order type' });
    }

    const userId = Number(parts[1]);
    if (!userId || Number.isNaN(userId)) {
      console.error('[MidtransCallback] Invalid userId in orderId:', orderId);
      return res.status(400).json({ message: 'Invalid user id in order id' });
    }

    const amountInt = parseInt(grossAmount, 10) || 0;

    let type = '';
    let plan = null;
    let billingCycle = null;
    let creditsChange = 0;

    if (prefix === 'subs') {
      // subs-12-BASIC-monthly-1733206150
      const rawPlan = parts[2]; // BASIC / PRO / BUSINESS
      const rawBillingCycle = parts[3]; // monthly / yearly

      plan = String(rawPlan || '').toUpperCase(); // BASIC
      const billingLower = String(rawBillingCycle || '').toLowerCase();
      const billingEnum =
        billingLower === 'yearly'
          ? 'YEARLY'
          : billingLower === 'monthly'
          ? 'MONTHLY'
          : 'MONTHLY';

      billingCycle = billingEnum;
      type = 'subscription';

      // Ambil config plan untuk base credits
      const cfg = getPlanConfig(plan, billingLower);
      if (!cfg || !cfg.creditsPerPeriod) {
        console.error(
          '[MidtransCallback] No plan config for plan/billing:',
          plan,
          billingLower,
        );
        // tetap catat transaksi tapi tidak ubah user
      } else if (txStatus === 'SUCCESS') {
        creditsChange = cfg.creditsPerPeriod;
      }
    } else if (prefix === 'topup') {
      // topup-12-5000-1733206150
      const creditAmountRaw = parts[2];
      const creditAmount = parseInt(creditAmountRaw, 10) || 0;

      type = 'topup';
      creditsChange = txStatus === 'SUCCESS' ? creditAmount : 0;
    }

    // 3. Upsert Transaction
    let transaction;
    try {
      transaction = await prisma.transaction.upsert({
        where: { orderId },
        update: {
          status: txStatus,
          rawResponse: body,
          updatedAt: new Date(),
        },
        create: {
          userId,
          type,
          plan,
          billingCycle,
          creditsChange,
          amount: amountInt,
          currency: 'IDR',
          orderId,
          status: txStatus,
          paymentGateway: 'MIDTRANS_SNAP',
          rawResponse: body,
        },
      });
    } catch (err) {
      console.error('[MidtransCallback] upsert Transaction error:', err);
      // tetap 200 ke Midtrans biar tidak retry, tapi log error
      return res.status(200).json({ message: 'ERROR_LOGGED' });
    }

    // 4. Kalau payment SUCCESS → update Subscription / Credits
    if (txStatus === 'SUCCESS') {
      if (type === 'subscription' && plan && billingCycle) {
        const billingLower =
          billingCycle === 'YEARLY' ? 'yearly' : 'monthly';
        const cfg = getPlanConfig(plan, billingLower);

        if (cfg && cfg.creditsPerPeriod) {
          const { periodStart, periodEnd } =
            getNextPeriodRangeFromNow(billingCycle);

          try {
            await prisma.$transaction(async (tx) => {
              // Upsert subscription user
              await tx.subscription.upsert({
                where: { userId },
                update: {
                  plan,
                  billingCycle,
                  status: 'ACTIVE',
                  currentPeriodStart: periodStart,
                  currentPeriodEnd: periodEnd,
                  updatedAt: new Date(),
                },
                create: {
                  userId,
                  plan,
                  billingCycle,
                  status: 'ACTIVE',
                  currentPeriodStart: periodStart,
                  currentPeriodEnd: periodEnd,
                },
              });

              // Set credits user ke base credits plan
              await tx.user.update({
                where: { id: userId },
                data: {
                  plan,
                  credits: cfg.creditsPerPeriod,
                  updatedAt: new Date(),
                },
              });
            });

            console.log(
              `[MidtransCallback] Activated subscription for userId=${userId}, plan=${plan}, billing=${billingCycle}`,
            );
          } catch (err) {
            console.error(
              '[MidtransCallback] Error updating subscription/user:',
              err,
            );
            // Jangan balas error ke Midtrans, cukup log
          }
        }
      }

      if (type === 'topup' && creditsChange > 0) {
        try {
          await prisma.user.update({
            where: { id: userId },
            data: {
              credits: { increment: creditsChange },
              updatedAt: new Date(),
            },
          });

          console.log(
            `[MidtransCallback] Topup credits userId=${userId} +${creditsChange}`,
          );
        } catch (err) {
          console.error('[MidtransCallback] Error topup credits:', err);
        }
      }
    }

    // Wajib 200 supaya Midtrans tidak retry
    return res.status(200).json({ message: 'OK' });
  } catch (err) {
    console.error('[MidtransCallback] Unexpected error:', err);
    // Tetap 200 ke Midtrans, tapi beri info
    return res.status(200).json({ message: 'ERROR_LOGGED' });
  }
}

module.exports = {
  handleMidtransCallback,
};
