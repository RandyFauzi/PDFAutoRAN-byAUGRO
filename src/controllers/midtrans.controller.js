// src/controllers/midtrans.controller.js

const { snap, coreApi } = require('../config/midtrans');
const { getPlanConfig } = require('../config/creditCost');
const prisma = require('../config/prisma');
const logger = require('../utils/logger');

const VALID_PLANS = ['BASIC', 'PRO', 'BUSINESS'];

/**
 * POST /api/midtrans/create-transaction
 *
 * Body contoh:
 * {
 *   "userId": 1,
 *   "plan": "PRO",
 *   "billingCycle": "monthly",   // atau "yearly"
 *   "customer": {
 *     "name": "Randy",
 *     "email": "ran@example.com"
 *   }
 * }
 */
async function createTransaction(req, res, next) {
  try {
    const { userId, plan, billingCycle, customer } = req.body;

    // 1. Validasi dasar
    if (!userId || !plan || !billingCycle) {
      return res.status(400).json({
        success: false,
        message: 'userId, plan, dan billingCycle wajib diisi',
      });
    }

    const planUpper = String(plan).toUpperCase();
    if (!VALID_PLANS.includes(planUpper)) {
      return res.status(400).json({
        success: false,
        message: 'Plan tidak valid (hanya BASIC, PRO, BUSINESS)',
      });
    }

    const billingLower = String(billingCycle).toLowerCase(); // "monthly"|"yearly"

    // 2. Ambil config plan dari creditCost.js
    const planConfig = getPlanConfig(planUpper, billingLower);
    if (!planConfig) {
      return res.status(400).json({
        success: false,
        message: 'Konfigurasi plan/billingCycle tidak ditemukan di creditCost.js',
      });
    }

    const grossAmount = planConfig.priceIDR;           // nominal bayar
    const creditsChange = planConfig.creditsPerPeriod; // jumlah credits per periode

    if (!grossAmount || !creditsChange) {
      return res.status(500).json({
        success: false,
        message: 'priceIDR atau creditsPerPeriod belum diset untuk plan ini',
      });
    }

    // 3. Ambil user
    const user = await prisma.user.findUnique({
      where: { id: Number(userId) },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User tidak ditemukan',
      });
    }

    // 4. Generate order_id unik
    const orderId = `PDFAUTORAN-${userId}-${Date.now()}`;

    // 5. Siapkan payload ke Midtrans
    const customerName = customer?.name || user.email.split('@')[0];
    const customerEmail = customer?.email || user.email;

    const parameter = {
      transaction_details: {
        order_id: orderId,
        gross_amount: grossAmount,
      },
      customer_details: {
        first_name: customerName,
        email: customerEmail,
      },
      item_details: [
        {
          id: planUpper,
          price: grossAmount,
          quantity: 1,
          name: `Subscription ${planUpper} (${billingLower})`,
        },
      ],
    };

    // 6. Panggil Midtrans Snap
    const transaction = await snap.createTransaction(parameter);

    const snapToken = transaction.token;
    const redirectUrl = transaction.redirect_url;

    // 7. Simpan Transaction di DB (status awal: PENDING)
    await prisma.transaction.create({
      data: {
        userId: Number(userId),
        type: 'subscription',
        plan: planUpper,                          // "BASIC"|"PRO"|"BUSINESS"
        billingCycle: billingLower.toUpperCase(), // "MONTHLY"|"YEARLY"
        creditsChange,
        amount: grossAmount,
        currency: 'IDR',
        orderId,
        status: 'PENDING',
        paymentGateway: 'MIDTRANS_SNAP',
        rawResponse: transaction,
      },
    });

    logger.info?.(
      `[MIDTRANS] Created transaction ${orderId} for user ${userId} plan ${planUpper} (${billingLower})`
    );

    return res.json({
      success: true,
      orderId,
      snapToken,
      redirectUrl,
      amount: grossAmount,
      credits: creditsChange,
    });
  } catch (err) {
    logger.error?.('[MIDTRANS] createTransaction error', err);
    return next(err);
  }
}

/**
 * POST /api/midtrans/notification
 * Endpoint untuk menerima webhook dari Midtrans
 */
async function handleNotification(req, res, next) {
  try {
    const notificationJson = req.body;

    const statusResponse = await coreApi.transaction.notification(notificationJson);

    const orderId = statusResponse.order_id;
    const transactionStatus = statusResponse.transaction_status;
    const fraudStatus = statusResponse.fraud_status;

    logger.info?.(`[MIDTRANS] Notification: ${orderId} - ${transactionStatus} - ${fraudStatus}`);

    const existingTx = await prisma.transaction.findUnique({
      where: { orderId },
    });

    if (!existingTx) {
      logger.warn?.(`[MIDTRANS] Transaction not found: ${orderId}`);
      return res.status(200).send('OK');
    }

    let newStatus = existingTx.status;

    // Mapping status Midtrans -> status internal
    if (transactionStatus === 'capture') {
      if (fraudStatus === 'challenge') {
        newStatus = 'PENDING';
      } else if (fraudStatus === 'accept') {
        newStatus = 'SUCCESS';
      }
    } else if (transactionStatus === 'settlement') {
      newStatus = 'SUCCESS';
    } else if (transactionStatus === 'pending') {
      newStatus = 'PENDING';
    } else if (
      transactionStatus === 'deny' ||
      transactionStatus === 'cancel' ||
      transactionStatus === 'expire'
    ) {
      newStatus = 'FAILED';
    }

    // 1) Update Transaction
    const updatedTx = await prisma.transaction.update({
      where: { orderId },
      data: {
        status: newStatus,
        rawResponse: statusResponse,
      },
    });

    // 2) Jika SUCCESS → update User & Subscription
    if (newStatus === 'SUCCESS') {
      const userId = updatedTx.userId;
      const plan = updatedTx.plan;                        // "BASIC"|"PRO"|"BUSINESS"
      const billingCycle = (updatedTx.billingCycle || 'MONTHLY').toUpperCase();
      const creditsChange = updatedTx.creditsChange;

      // 2a. Tambah credits & update plan user
      await prisma.user.update({
        where: { id: userId },
        data: {
          credits: { increment: creditsChange },
          plan: plan, // simpan string "BASIC"/"PRO"/"BUSINESS"
        },
      });

      // 2b. Hitung periode subscription
      const now = new Date();
      const end = new Date(now);

      if (billingCycle === 'YEARLY') {
        end.setFullYear(end.getFullYear() + 1);
      } else {
        // default MONTHLY
        end.setMonth(end.getMonth() + 1);
      }

      // 2c. Upsert Subscription
      await prisma.subscription.upsert({
        where: { userId },
        update: {
          plan,                  // enum Plan di Prisma
          billingCycle,          // enum BillingCycle (string "MONTHLY"/"YEARLY")
          status: 'ACTIVE',
          currentPeriodStart: now,
          currentPeriodEnd: end,
        },
        create: {
          userId,
          plan,
          billingCycle,
          status: 'ACTIVE',
          currentPeriodStart: now,
          currentPeriodEnd: end,
        },
      });

      logger.info?.(
        `[MIDTRANS] Payment success -> user ${userId} plan ${plan} (${billingCycle}), credits +${creditsChange}`
      );
    }

    return res.status(200).send('OK');
  } catch (err) {
    logger.error?.('[MIDTRANS] handleNotification error', err);
    // Tetap balas 200 supaya Midtrans tidak spam
    return res.status(200).send('OK');
  }
}

module.exports = {
  createTransaction,
  handleNotification,
};
