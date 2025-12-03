// src/controllers/midtrans.controller.js
// ------------------------------------------------------
// Handle callback / notification dari Midtrans Snap.
// Endpoint (di-route): POST /api/v1/payments/midtrans/callback
// ------------------------------------------------------

const crypto = require('crypto');
const prisma = require('../config/prisma');
const env = require('../config/env');
const { applyPaidPlan } = require('../services/subscription.service');
const userService = require('../services/user.service');
const { getPlanConfig } = require('../config/creditCost');

// 👉 Tambahkan test code ini persis setelah require env
console.log('[MIDTRANS CONFIG CHECK]', {
  serverKey: env.midtransServerKey ? 'OK' : 'MISSING',
  clientKey: env.midtransClientKey ? 'OK' : 'MISSING',
  merchantId: env.midtransMerchantId ? 'OK' : 'MISSING',
});

/**
 * Hitung signature sesuai dokumentasi Midtrans:
 * sha512(order_id + status_code + gross_amount + serverKey)
 */
function computeSignature(orderId, statusCode, grossAmount) {
  if (!env.midtransServerKey) {
    throw new Error('MIDTRANS server key (env.midtransServerKey) belum diset');
  }

  const base = String(orderId) + String(statusCode) + String(grossAmount) + env.midtransServerKey;

  return crypto.createHash('sha512').update(base).digest('hex');
}

/**
 * Parse order_id berdasarkan kontrak:
 *
 * Subscription:
 *   subs-{userId}-{planId}-{billingCycle}-{timestamp}
 *   contoh: subs-12-BASIC-monthly-1733206150
 *
 * Topup:
 *   topup-{userId}-{creditAmount}-{timestamp}
 */
function parseOrderId(orderId) {
  if (!orderId || typeof orderId !== 'string') return null;

  const parts = orderId.split('-');
  if (parts.length < 4) return null;

  const [prefix] = parts;

  if (prefix === 'subs') {
    // subs-{userId}-{planId}-{billingCycle}-{timestamp}
    const [, userIdStr, planIdRaw, billingCycleRaw] = parts;

    const userId = parseInt(userIdStr, 10);
    if (!Number.isFinite(userId)) return null;

    const planId = String(planIdRaw || '').toUpperCase(); // BASIC/PRO/BUSINESS
    const rawCycle = String(billingCycleRaw || '');

    // Konversi ke enum BillingCycle untuk Prisma (MONTHLY/YEARLY)
    const lowerCycle = rawCycle.toLowerCase();
    let billingCycleEnum = 'MONTHLY';
    if (lowerCycle === 'yearly' || lowerCycle === 'annual' || lowerCycle === 'annually') {
      billingCycleEnum = 'YEARLY';
    }

    return {
      kind: 'subscription',
      userId,
      planId,             // BASIC/PRO/BUSINESS
      rawCycle,           // monthly/yearly (dari order_id)
      billingCycleEnum,   // MONTHLY/YEARLY untuk Prisma
    };
  }

  if (prefix === 'topup') {
    // topup-{userId}-{creditAmount}-{timestamp}
    const [, userIdStr, creditStr] = parts;

    const userId = parseInt(userIdStr, 10);
    const creditsAmount = parseInt(creditStr, 10);

    if (!Number.isFinite(userId) || !Number.isFinite(creditsAmount)) {
      return null;
    }

    return {
      kind: 'topup',
      userId,
      creditsAmount,
    };
  }

  return null;
}

/**
 * Mapping status Midtrans → status internal Transaction
 */
function mapTransactionStatus(transactionStatus, fraudStatus) {
  const ts = String(transactionStatus || '').toLowerCase();
  const fs = String(fraudStatus || '').toLowerCase();

  // SUCCESS conditions
  if (ts === 'capture' && fs === 'accept') return 'SUCCESS';
  if (ts === 'settlement') return 'SUCCESS';

  if (ts === 'pending') return 'PENDING';

  // Semua status lain kita anggap FAILED
  return 'FAILED';
}

/**
 * Callback / notification endpoint dari Midtrans.
 * Wajib return 200 supaya Midtrans tidak retry terus.
 */
async function handleCallback(req, res) {
  try {
    const payload = req.body || {};

    const {
      order_id,
      status_code,
      gross_amount,
      signature_key,
      transaction_status,
      fraud_status,
      currency,
    } = payload;

    if (!order_id || !status_code || !gross_amount || !signature_key) {
      console.error('[MidtransCallback] Payload tidak lengkap:', payload);
      return res.status(400).json({ message: 'Invalid Midtrans callback payload' });
    }

    // 1. Validasi signature
    let expectedSignature;
    try {
      expectedSignature = computeSignature(order_id, status_code, gross_amount);
    } catch (err) {
      console.error('[MidtransCallback] Error computeSignature:', err);
      return res.status(500).json({ message: 'Server misconfigured for Midtrans' });
    }

    if (expectedSignature !== signature_key) {
      console.error('[MidtransCallback] Invalid signature for order_id:', order_id);
      return res.status(403).json({ message: 'Invalid signature' });
    }

    // 2. Parse order_id
    const parsed = parseOrderId(order_id);
    if (!parsed) {
      console.error('[MidtransCallback] Gagal parse order_id:', order_id);
      return res.status(400).json({ message: 'Unknown order_id format' });
    }

    const txStatus = mapTransactionStatus(transaction_status, fraud_status);
    const isSuccess = txStatus === 'SUCCESS';

    const amountInt = parseInt(gross_amount, 10) || 0;
    const currencyCode = currency || 'IDR';

    // 3. Upsert Transaction (idempotent untuk repeated notification)
    const existingTx = await prisma.transaction.findUnique({
      where: { orderId: order_id },
    });

    if (!existingTx) {
      // Create baru
      await prisma.transaction.create({
        data: {
          userId: parsed.userId,
          type: parsed.kind === 'subscription' ? 'subscription' : 'topup',
          plan: parsed.kind === 'subscription' ? parsed.planId : null,
          billingCycle: parsed.kind === 'subscription' ? parsed.billingCycleEnum : null,
          creditsChange:
            isSuccess && parsed.kind === 'topup' ? parsed.creditsAmount : 0,
          amount: amountInt,
          currency: currencyCode,
          orderId: order_id,
          status: txStatus,
          paymentGateway: 'MIDTRANS_SNAP',
          rawResponse: payload,
        },
      });
    } else {
      // Update status & rawResponse saja
      await prisma.transaction.update({
        where: { orderId: order_id },
        data: {
          status: txStatus,
          rawResponse: payload,
        },
      });
    }

    // 4. Kalau status SUCCESS → update bisnis logic (subscription / topup)
    //    Untuk menghindari double process, cek perubahan dari non-SUCCESS → SUCCESS.
    const wasSuccessBefore = existingTx && existingTx.status === 'SUCCESS';

    if (isSuccess && !wasSuccessBefore) {
      if (parsed.kind === 'subscription') {
        // OPTIONAL: validasi plan & cycle dengan getPlanConfig (logging saja)
        const cfg = getPlanConfig(parsed.planId, parsed.billingCycleEnum);
        if (!cfg || !cfg.creditsPerPeriod) {
          console.warn(
            `[MidtransCallback] getPlanConfig tidak valid untuk plan=${parsed.planId}, cycle=${parsed.billingCycleEnum}`,
          );
        }

        // Terapkan paid plan → reset credits & set subscription periode
        await applyPaidPlan(parsed.userId, parsed.planId, parsed.billingCycleEnum);
      } else if (parsed.kind === 'topup') {
        // Tambahkan credits user
        await userService.increaseCredits(parsed.userId, parsed.creditsAmount);
      }
    }

    // 5. Wajib return 200 ke Midtrans
    return res.status(200).json({ message: 'OK' });
  } catch (err) {
    console.error('[MidtransCallback] Unhandled error:', err);
    // Tetap return 200 supaya Midtrans tidak spam retry dengan error 5xx,
    // tapi log error untuk investigasi.
    return res.status(200).json({ message: 'ERROR_LOGGED' });
  }
}

module.exports = {
  handleCallback,
};
