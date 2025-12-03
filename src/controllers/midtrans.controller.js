// src/controllers/midtrans.controller.js
// ------------------------------------------------------
// Midtrans SNAP callback handler
// Endpoint: POST /api/v1/payments/midtrans/callback
// ------------------------------------------------------

const crypto = require('crypto');
const prisma = require('../config/prisma');
const env = require('../config/env');
const { getPlanConfig } = require('../config/creditCost');
const logger = require('../utils/logger'); // kalau belum ada, pakai console.log saja

// ------------------ Helper ------------------

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

  if (billingCycleEnum === 'YEARLY') {
    periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  } else {
    // default MONTHLY
    periodEnd.setMonth(periodEnd.getMonth() + 1);
  }

  return { periodStart, periodEnd };
}

// ------------------ 1) TEST TRANSACTION ------------------

async function createTestTransaction(req, res, next) {
  try {
    const { amount, userId } = req.body;

    const orderId = `test-${userId}-${Date.now()}`;

    const response = await fetch('https://api.sandbox.midtrans.com/v2/charge', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization:
          'Basic ' +
          Buffer.from((env.midtransServerKey || process.env.MIDTRANS_SERVER_KEY) + ':').toString('base64'),
      },
      body: JSON.stringify({
        payment_type: 'qris',
        transaction_details: {
          order_id: orderId,
          gross_amount: amount,
        },
        customer_details: {
          first_name: 'Test User',
          email: 'test@example.com',
        },
      }),
    });

    const body = await response.json();

    if (!response.ok) {
      logger.error('[Midtrans][createTestTransaction] Error:', body);
      return res.status(response.status).json(body);
    }

    logger.info('[Midtrans][createTestTransaction] Success:', body);

    return res.json({
      order_id: body.order_id,
      token: body.token,
      redirect_url: body.redirect_url,
    });
  } catch (err) {
    logger.error('[Midtrans][createTestTransaction] Exception:', err);
    next(err);
  }
}

// ==============================
// 1) CREATE SUBSCRIPTION CHARGE
// ==============================
async function createSubscription(req, res) {
  try {
    const { userId, plan, billingCycle, customer } = req.body || {};

    if (!userId || !plan || !billingCycle) {
      return res.status(400).json({
        message: 'userId, plan, dan billingCycle wajib diisi',
      });
    }

    const planUpper = String(plan).toUpperCase();      // BASIC / PRO / BUSINESS
    const billingLower = String(billingCycle).toLowerCase(); // monthly / yearly

    // Ambil config plan dari creditCost.js
    const cfg = getPlanConfig(planUpper, billingLower);
    if (!cfg || !cfg.price || !cfg.creditsPerPeriod) {
      return res.status(400).json({
        message: 'Plan / billingCycle tidak dikenali di config',
      });
    }

    const grossAmount = cfg.price; // harga dalam rupiah

    // Pola order_id: subs-{userId}-{PLAN}-{monthly|yearly}-{timestamp}
    const orderId = `subs-${userId}-${planUpper}-${billingLower}-${Date.now()}`;

    const serverKey = env.midtransServerKey || process.env.MIDTRANS_SERVER_KEY;
    if (!serverKey) {
      console.error('[createSubscription] MIDTRANS_SERVER_KEY belum di-set');
      return res.status(500).json({ message: 'Midtrans server key not configured' });
    }

    // Panggil Midtrans Snap API
    const response = await fetch('https://api.sandbox.midtrans.com/v2/charge', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization:
          'Basic ' + Buffer.from(serverKey + ':').toString('base64'),
      },
      body: JSON.stringify({
        payment_type: 'qris', // sementara kita pakai QRIS
        transaction_details: {
          order_id: orderId,
          gross_amount: grossAmount,
        },
        customer_details: {
          first_name: customer?.name || 'User',
          email: customer?.email || 'no-reply@example.com',
        },
      }),
    });

    const body = await response.json();

    if (!response.ok) {
      console.error('[createSubscription] Midtrans error:', body);
      return res.status(response.status).json(body);
    }

    // Catat transaksi awal (status PENDING) di DB
    try {
      await prisma.transaction.create({
        data: {
          userId: Number(userId),
          type: 'subscription',
          plan: planUpper,
          billingCycle: billingLower === 'yearly' ? 'YEARLY' : 'MONTHLY',
          creditsChange: 0, // credits baru akan di-set saat callback SUCCESS
          amount: grossAmount,
          currency: 'IDR',
          orderId,
          status: 'PENDING',
          paymentGateway: 'MIDTRANS_SNAP',
          rawResponse: body,
        },
      });
    } catch (err) {
      console.error('[createSubscription] Gagal insert Transaction PENDING:', err);
      // kita tetap kirim response ke frontend supaya user bisa bayar
    }

    // Kembalikan data penting ke Laravel
    return res.json({
      order_id: orderId,
      token: body.token,
      redirect_url: body.redirect_url,
    });
  } catch (err) {
    console.error('[createSubscription] Unexpected error:', err);
    return res.status(500).json({ message: 'Internal error' });
  }
}

// ==============================
// 2) CREATE TOPUP CHARGE
// ==============================
async function createTopup(req, res) {
  try {
    const { userId, topupCode, customer } = req.body || {};

    if (!userId || !topupCode) {
      return res.status(400).json({
        message: 'userId dan topupCode wajib diisi',
      });
    }

    // Kalau di creditCost.js sudah ada getTopupConfig, pakai ini
    const { getTopupConfig } = require('../config/creditCost');
    const cfg = getTopupConfig(topupCode);

    if (!cfg || !cfg.price || !cfg.credits) {
      return res.status(400).json({
        message: 'topupCode tidak dikenali di config',
      });
    }

    const grossAmount = cfg.price;
    const creditsAmount = cfg.credits;

    // Pola order_id: topup-{userId}-{credits}-{timestamp}
    const orderId = `topup-${userId}-${creditsAmount}-${Date.now()}`;

    const serverKey = env.midtransServerKey || process.env.MIDTRANS_SERVER_KEY;
    if (!serverKey) {
      console.error('[createTopup] MIDTRANS_SERVER_KEY belum di-set');
      return res.status(500).json({ message: 'Midtrans server key not configured' });
    }

    const response = await fetch('https://api.sandbox.midtrans.com/v2/charge', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization:
          'Basic ' + Buffer.from(serverKey + ':').toString('base64'),
      },
      body: JSON.stringify({
        payment_type: 'qris',
        transaction_details: {
          order_id: orderId,
          gross_amount: grossAmount,
        },
        customer_details: {
          first_name: customer?.name || 'User',
          email: customer?.email || 'no-reply@example.com',
        },
      }),
    });

    const body = await response.json();

    if (!response.ok) {
      console.error('[createTopup] Midtrans error:', body);
      return res.status(response.status).json(body);
    }

    // Catat transaksi awal (PENDING)
    try {
      await prisma.transaction.create({
        data: {
          userId: Number(userId),
          type: 'topup',
          plan: null,
          billingCycle: null,
          creditsChange: creditsAmount, // akan dipakai saat SUCCESS
          amount: grossAmount,
          currency: 'IDR',
          orderId,
          status: 'PENDING',
          paymentGateway: 'MIDTRANS_SNAP',
          rawResponse: body,
        },
      });
    } catch (err) {
      console.error('[createTopup] Gagal insert Transaction PENDING:', err);
    }

    return res.json({
      order_id: orderId,
      token: body.token,
      redirect_url: body.redirect_url,
    });
  } catch (err) {
    console.error('[createTopup] Unexpected error:', err);
    return res.status(500).json({ message: 'Internal error' });
  }
}



// ------------------ 2) CALLBACK HANDLER ------------------

async function handleMidtransCallback(req, res) {
  try {
    const body = req.body || {};
    const {
      order_id: orderId,
      status_code: statusCode,
      gross_amount: grossAmount,
      signature_key: signatureKey,
      transaction_status: transactionStatus,
      payment_type: paymentType,
      fraud_status: fraudStatus,
    } = body;

    logger.info('[MidtransCallback] Payload:', body);

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
    // subs-{userId}-{PLAN}-{monthly|yearly}-{timestamp}
    // topup-{userId}-{creditAmount}-{timestamp}
    const parts = String(orderId).split('-');
    const prefix = parts[0]; // subs | topup | test

    if (prefix !== 'subs' && prefix !== 'topup' && prefix !== 'test') {
      console.warn('[MidtransCallback] Unknown order prefix:', prefix);
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

      plan = String(rawPlan || '').toUpperCase();
      const billingLower = String(rawBillingCycle || '').toLowerCase();
      const billingEnum =
        billingLower === 'yearly'
          ? 'YEARLY'
          : 'MONTHLY';

      billingCycle = billingEnum;
      type = 'subscription';

      const cfg = getPlanConfig(plan, billingLower);
      if (!cfg || !cfg.creditsPerPeriod) {
        console.error(
          '[MidtransCallback] No plan config for plan/billing:',
          plan,
          billingLower,
        );
      } else if (txStatus === 'SUCCESS') {
        creditsChange = cfg.creditsPerPeriod;
      }
    } else if (prefix === 'topup') {
      // topup-12-5000-1733206150
      const creditAmountRaw = parts[2];
      const creditAmount = parseInt(creditAmountRaw, 10) || 0;

      type = 'topup';
      creditsChange = txStatus === 'SUCCESS' ? creditAmount : 0;
    } else if (prefix === 'test') {
      type = 'test';
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

    logger.info('[MidtransCallback] Handled:', {
      orderId,
      transactionStatus,
      paymentType,
      fraudStatus,
    });

    return res.status(200).json({ message: 'OK' });
  } catch (err) {
    console.error('[MidtransCallback] Unexpected error:', err);
    return res.status(200).json({ message: 'ERROR_LOGGED' });
  }
}

module.exports = {
  // supaya kompatibel dengan routes lama:
  handleMidtransCallback,
  handleCallback: handleMidtransCallback,

  createTestTransaction,
};
