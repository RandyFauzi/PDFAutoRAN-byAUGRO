// src/controllers/midtrans.controller.js
// -----------------------------------------------------
// Handle pembuatan transaksi Midtrans (Snap)
// dan callback notifikasi dari Midtrans.
// -----------------------------------------------------

const midtransClient = require('midtrans-client');
const crypto = require('crypto');

const env = require('../config/env');
const { getPlanConfig } = require('../config/creditCost');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const logger = require('../utils/logger');

// Inisialisasi Snap
const snap = new midtransClient.Snap({
  isProduction: process.env.MIDTRANS_IS_PRODUCTION === 'true',
  serverKey: env.midtransServerKey,
  clientKey: env.midtransClientKey,
});

/**
 * POST /api/v1/payments/midtrans/create-subscription
 * Body:
 *  - userId: number
 *  - plan: "BASIC" | "PRO" | "BUSINESS"
 *  - billingCycle: "monthly" | "yearly"
 *  - customer: { name, email }
 */
exports.createSubscription = async (req, res) => {
  try {
    const { userId, plan, billingCycle, customer } = req.body;

    // 1. Validasi basic
    if (!userId || !plan || !billingCycle) {
      return res.status(400).json({
        message: 'userId, plan, dan billingCycle wajib diisi',
      });
    }

    const normalizedPlan = String(plan).toUpperCase();
    const normalizedCycle = String(billingCycle).toLowerCase();

    if (!['BASIC', 'PRO', 'BUSINESS'].includes(normalizedPlan)) {
      return res.status(400).json({ message: 'Plan tidak valid' });
    }
    if (!['monthly', 'yearly'].includes(normalizedCycle)) {
      return res.status(400).json({ message: 'billingCycle tidak valid' });
    }

    if (!customer || !customer.email) {
      return res.status(400).json({
        message: 'customer.name dan customer.email wajib diisi',
      });
    }

    // 2. Ambil konfigurasi plan dari creditCost.js
    const planConfig = getPlanConfig(normalizedPlan, normalizedCycle);
    if (!planConfig) {
      return res.status(400).json({
        message: 'Konfigurasi plan tidak ditemukan di creditCost.js',
      });
    }

    const grossAmount = planConfig.priceIDR;           // harga rupiah
    const creditsPerPeriod = planConfig.creditsPerPeriod;

    // 3. Generate order_id unik
    const orderId = `SUB-${normalizedPlan}-${normalizedCycle.toUpperCase()}-${userId}-${Date.now()}`;

    // 4. Parameter Midtrans Snap
    const parameter = {
      transaction_details: {
        order_id: orderId,
        gross_amount: grossAmount,
      },
      item_details: [
        {
          id: `${normalizedPlan}_${normalizedCycle}`,
          price: grossAmount,
          quantity: 1,
          name: `${normalizedPlan} plan (${normalizedCycle})`,
        },
      ],
      customer_details: {
        first_name: customer.name || customer.email,
        email: customer.email,
      },
    };

    // 5. Simpan transaction di DB sebagai PENDING
    await prisma.transaction.create({
      data: {
        userId: Number(userId),
        type: 'subscription',
        plan: normalizedPlan,
        billingCycle: normalizedCycle.toUpperCase(), // sesuai schema: String
        creditsChange: creditsPerPeriod,
        amount: grossAmount,
        currency: 'IDR',
        orderId,
        status: 'PENDING',
        paymentGateway: 'MIDTRANS_SNAP',
      },
    });

    // 6. Minta Snap Token ke Midtrans
    const transaction = await snap.createTransaction(parameter);
    const snapToken = transaction.token;

    return res.json({
      snapToken,
      orderId,
    });
  } catch (err) {
    logger.error('Error createSubscription Midtrans', {
      error: err.message,
      stack: err.stack,
      body: req.body,
    });

    return res.status(500).json({
      message: 'Gagal membuat transaksi Midtrans',
      error: err.message,
    });
  }
};

/**
 * POST /api/v1/payments/midtrans/callback
 * Endpoint untuk menerima notifikasi status pembayaran dari Midtrans.
 * URL ini harus diisi di dashboard Midtrans (Notification URL).
 */
exports.handleCallback = async (req, res) => {
  try {
    const notif = req.body;

    const {
      order_id,
      transaction_status,
      status_code,
      gross_amount,
      signature_key,
      fraud_status,
    } = notif;

    // 1. Verifikasi signature (security best practice)
    const serverKey = env.midtransServerKey;
    const expectedSignature = crypto
      .createHash('sha512')
      .update(order_id + status_code + gross_amount + serverKey)
      .digest('hex');

    if (expectedSignature !== signature_key) {
      logger.warn('Midtrans callback signature tidak valid', { order_id });
      return res.status(403).json({ message: 'Invalid signature' });
    }

    // 2. Mapping status
    let newStatus = 'PENDING';

    if (transaction_status === 'capture') {
      if (fraud_status === 'accept') {
        newStatus = 'SUCCESS';
      } else if (fraud_status === 'challenge') {
        newStatus = 'CHALLENGE';
      } else {
        newStatus = 'FAILED';
      }
    } else if (transaction_status === 'settlement') {
      newStatus = 'SUCCESS';
    } else if (transaction_status === 'pending') {
      newStatus = 'PENDING';
    } else if (
      transaction_status === 'deny' ||
      transaction_status === 'cancel' ||
      transaction_status === 'expire'
    ) {
      newStatus = 'FAILED';
    } else {
      newStatus = transaction_status.toUpperCase();
    }

    // 3. Update transaksi di DB
    const updatedTx = await prisma.transaction.update({
      where: { orderId: order_id },
      data: {
        status: newStatus,
        rawResponse: notif,
      },
    });

    logger.info('Midtrans callback processed', {
      orderId: order_id,
      status: newStatus,
    });

    // TODO (next step): jika newStatus === 'SUCCESS'
    //  - Update Subscription user
    //  - Set plan & credits di tabel User
    //  - Atur currentPeriodStart & currentPeriodEnd di Subscription

    return res.status(200).json({ message: 'OK' });
  } catch (err) {
    logger.error('Error handleCallback Midtrans', {
      error: err.message,
      body: req.body,
    });
    // Midtrans butuh 200 supaya tidak spam, tapi boleh tetap 500
    return res.status(500).json({ message: 'Internal server error' });
  }
};
