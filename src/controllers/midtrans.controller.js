// src/controllers/midtrans.controller.js
const midtransClient = require('midtrans-client');
const crypto = require('crypto');
const env = require('../config/env');
const { getPlanConfig } = require('../config/creditCost');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const logger = require('../utils/logger');

const snap = new midtransClient.Snap({
  isProduction: env.midtransIsProduction, // <-- pakai env config
  serverKey: env.midtransServerKey,
  clientKey: env.midtransClientKey,
});

// POST /api/v1/payments/midtrans/create-subscription
exports.createSubscription = async (req, res) => {
  try {
    const { userId, plan, billingCycle, customer } = req.body;

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

    const planConfig = getPlanConfig(normalizedPlan, normalizedCycle);
    if (!planConfig) {
      return res.status(400).json({
        message: 'Konfigurasi plan tidak ditemukan di creditCost.js',
      });
    }

    const grossAmount = planConfig.priceIDR;
    const creditsPerPeriod = planConfig.creditsPerPeriod;

    const orderId = `SUB-${normalizedPlan}-${normalizedCycle.toUpperCase()}-${userId}-${Date.now()}`;

    await prisma.transaction.create({
      data: {
        userId: Number(userId),
        type: 'subscription',
        plan: normalizedPlan,
        billingCycle: normalizedCycle.toUpperCase(),
        creditsChange: creditsPerPeriod,
        amount: grossAmount,
        currency: 'IDR',
        orderId,
        status: 'PENDING',
        paymentGateway: 'MIDTRANS_SNAP',
      },
    });

    const transaction = await snap.createTransaction({
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
    });

    return res.json({
      snapToken: transaction.token,
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

// POST /api/v1/payments/midtrans/callback
exports.handleCallback = async (req, res) => {
  try {
    logger.info('Midtrans callback HIT', { body: req.body });

    const notif = req.body;
    const {
      order_id,
      transaction_status,
      status_code,
      gross_amount,
      signature_key,
      fraud_status,
    } = notif;

    const serverKey = env.midtransServerKey;
    const expectedSignature = crypto
      .createHash('sha512')
      .update(order_id + status_code + gross_amount + serverKey)
      .digest('hex');

    if (expectedSignature !== signature_key) {
      logger.warn('Midtrans callback signature tidak valid', { order_id });
      return res.status(403).json({ message: 'Invalid signature' });
    }

    let newStatus = 'PENDING';

    if (transaction_status === 'capture') {
      if (fraud_status === 'accept') newStatus = 'SUCCESS';
      else if (fraud_status === 'challenge') newStatus = 'CHALLENGE';
      else newStatus = 'FAILED';
    } else if (transaction_status === 'settlement') {
      newStatus = 'SUCCESS';
    } else if (transaction_status === 'pending') {
      newStatus = 'PENDING';
    } else if (
      ['deny', 'cancel', 'expire'].includes(transaction_status)
    ) {
      newStatus = 'FAILED';
    } else {
      newStatus = transaction_status.toUpperCase();
    }

    const updatedTx = await prisma.transaction.updateMany({
      where: { orderId: order_id },
      data: {
        status: newStatus,
        rawResponse: notif,
      },
    });

    if (updatedTx.count === 0) {
      logger.warn('Midtrans callback: transaction not found', { orderId: order_id });
    }

    logger.info('Midtrans callback processed', {
      orderId: order_id,
      status: newStatus,
    });

    return res.status(200).json({ message: 'OK' });
  } catch (err) {
    logger.error('Error handleCallback Midtrans', {
      error: err.message,
      body: req.body,
    });
    return res.status(500).json({ message: 'Internal server error' });
  }
};
