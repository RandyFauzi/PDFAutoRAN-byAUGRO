// // src/controllers/midtrans.controller.js
// // ------------------------------------------------------
// // Midtrans SNAP callback + charge handler
// // Endpoint utama:
// //  - POST /api/v1/payments/midtrans/create-subscription
// //  - POST /api/v1/payments/midtrans/create-topup
// //  - POST /api/v1/payments/midtrans/callback
// // ------------------------------------------------------

// const crypto = require('crypto');
// const prisma = require('../config/prisma');
// const env = require('../config/env');
// const { getPlanConfig, getTopupConfig } = require('../config/creditCost');

// // Logger: kalau ../utils/logger tidak ada, fallback ke console
// let logger = console;
// try {
//   // optional custom logger
//   // eslint-disable-next-line global-require
//   logger = require('../utils/logger');
// } catch (e) {
//   logger = console;
// }

// // ------------------ Helper ------------------

// // Map status Midtrans -> status internal Transaction
// function mapMidtransStatus(transactionStatus) {
//   const s = String(transactionStatus || '').toLowerCase();

//   if (s === 'capture' || s === 'settlement') return 'SUCCESS';
//   if (s === 'pending') return 'PENDING';

//   // deny, expire, cancel, refund, chargeback, etc.
//   return 'FAILED';
// }

// // Hitung periode billing dari sekarang
// function getNextPeriodRangeFromNow(billingCycleEnum) {
//   const now = new Date();
//   const periodStart = new Date(now);
//   const periodEnd = new Date(now);

//   if (billingCycleEnum === 'YEARLY') {
//     periodEnd.setFullYear(periodEnd.getFullYear() + 1);
//   } else {
//     // default MONTHLY
//     periodEnd.setMonth(periodEnd.getMonth() + 1);
//   }

//   return { periodStart, periodEnd };
// }

// // ------------------ 0) TEST TRANSACTION (opsional) ------------------

// async function createTestTransaction(req, res, next) {
//   try {
//     const { amount, userId } = req.body;

//     const orderId = `test-${userId}-${Date.now()}`;

//     const serverKey = env.midtransServerKey || process.env.MIDTRANS_SERVER_KEY;
//     const response = await fetch('https://api.sandbox.midtrans.com/v2/charge', {
//       method: 'POST',
//       headers: {
//         'Content-Type': 'application/json',
//         Accept: 'application/json',
//         Authorization:
//           'Basic ' + Buffer.from(serverKey + ':').toString('base64'),
//       },
//       body: JSON.stringify({
//         payment_type: 'qris',
//         transaction_details: {
//           order_id: orderId,
//           gross_amount: amount,
//         },
//         customer_details: {
//           first_name: 'Test User',
//           email: 'test@example.com',
//         },
//       }),
//     });

//     const body = await response.json();

//     if (!response.ok) {
//       logger.error('[Midtrans][createTestTransaction] Error:', body);
//       return res.status(response.status).json(body);
//     }

//     logger.info('[Midtrans][createTestTransaction] Success:', body);

//     return res.json({
//       order_id: body.order_id,
//       token: body.token,
//       redirect_url: body.redirect_url,
//     });
//   } catch (err) {
//     logger.error('[Midtrans][createTestTransaction] Exception:', err);
//     return next(err);
//   }
// }

// // ==============================
// // 1) CREATE SUBSCRIPTION CHARGE
// // ==============================
// async function createSubscription(req, res) {
//   try {
//     const { userId, plan, billingCycle, customer } = req.body || {};

//     if (!userId || !plan || !billingCycle) {
//       return res.status(400).json({
//         message: 'userId, plan, dan billingCycle wajib diisi',
//       });
//     }

//     const planUpper = String(plan).toUpperCase();           // BASIC / PERSONAL / BUSINESS
//     const billingLower = String(billingCycle).toLowerCase(); // monthly / yearly

//     const price = cfg && (cfg.priceIDR || cfg.price);

//     if (!cfg || !price || !cfg.creditsPerPeriod) {
//       return res.status(400).json({
//         message: 'Plan / billingCycle tidak dikenali di config',
//       });
//     }

//     const grossAmount = price;
//     const orderId = `subs-${userId}-${planUpper}-${billingLower}-${Date.now()}`;

//     const serverKey = env.midtransServerKey || process.env.MIDTRANS_SERVER_KEY;
//     if (!serverKey) {
//       logger.error('[createSubscription] MIDTRANS_SERVER_KEY belum di-set');
//       return res.status(500).json({ message: 'Midtrans server key not configured' });
//     }

//     const response = await fetch('https://api.sandbox.midtrans.com/v2/charge', {
//       method: 'POST',
//       headers: {
//         'Content-Type': 'application/json',
//         Accept: 'application/json',
//         Authorization:
//           'Basic ' + Buffer.from(serverKey + ':').toString('base64'),
//       },
//       body: JSON.stringify({
//         payment_type: 'qris',
//         transaction_details: {
//           order_id: orderId,
//           gross_amount: grossAmount,
//         },
//         customer_details: {
//           first_name: customer?.name || 'User',
//           email: customer?.email || 'no-reply@example.com',
//         },
//       }),
//     });

//     const body = await response.json();

//     if (!response.ok) {
//       logger.error('[createSubscription] Midtrans error:', body);
//       return res.status(response.status).json(body);
//     }

//     // Catat transaksi awal (PENDING)
//     try {
//       await prisma.transaction.create({
//         data: {
//           userId: Number(userId),
//           type: 'subscription',
//           plan: planUpper,
//           billingCycle: billingLower === 'yearly' ? 'YEARLY' : 'MONTHLY',
//           creditsChange: 0,
//           amount: grossAmount,
//           currency: 'IDR',
//           orderId,
//           status: 'PENDING',
//           paymentGateway: 'MIDTRANS_SNAP',
//           rawResponse: body,
//         },
//       });
//     } catch (err) {
//       logger.error('[createSubscription] Gagal insert Transaction PENDING:', err);
//       // tetap lanjut; user tetap bisa bayar
//     }

//     return res.json({
//       order_id: orderId,
//       token: body.token,
//       redirect_url: body.redirect_url,
//     });
//   } catch (err) {
//     logger.error('[createSubscription] Unexpected error:', err);
//     return res.status(500).json({ message: 'Internal error' });
//   }
// }

// // ==============================
// // 2) CREATE TOPUP CHARGE
// // ==============================
// async function createTopup(req, res) {
//   try {
//     const { userId, topupCode, customer } = req.body || {};

//     if (!userId || !topupCode) {
//       return res.status(400).json({
//         message: 'userId dan topupCode wajib diisi',
//       });
//     }

//     const cfg = getTopupConfig(topupCode);  
//     const price = cfg && (cfg.priceIDR || cfg.price);

//     if (!cfg || !price || !cfg.credits) {
//       return res.status(400).json({
//         message: 'topupCode tidak dikenali di config',
//       });
//     }

//     const grossAmount = price;
//     const creditsAmount = cfg.credits;
//     const orderId = `topup-${userId}-${creditsAmount}-${Date.now()}`;

//     const serverKey = env.midtransServerKey || process.env.MIDTRANS_SERVER_KEY;
//     if (!serverKey) {
//       logger.error('[createTopup] MIDTRANS_SERVER_KEY belum di-set');
//       return res.status(500).json({ message: 'Midtrans server key not configured' });
//     }

//     const response = await fetch('https://api.sandbox.midtrans.com/v2/charge', {
//       method: 'POST',
//       headers: {
//         'Content-Type': 'application/json',
//         Accept: 'application/json',
//         Authorization:
//           'Basic ' + Buffer.from(serverKey + ':').toString('base64'),
//       },
//       body: JSON.stringify({
//         payment_type: 'qris',
//         transaction_details: {
//           order_id: orderId,
//           gross_amount: grossAmount,
//         },
//         customer_details: {
//           first_name: customer?.name || 'User',
//           email: customer?.email || 'no-reply@example.com',
//         },
//       }),
//     });

//     const body = await response.json();

//     if (!response.ok) {
//       logger.error('[createTopup] Midtrans error:', body);
//       return res.status(response.status).json(body);
//     }

//     // Catat transaksi awal (PENDING)
//     try {
//       await prisma.transaction.create({
//         data: {
//           userId: Number(userId),
//           type: 'topup',
//           plan: null,
//           billingCycle: null,
//           creditsChange: creditsAmount,
//           amount: grossAmount,
//           currency: 'IDR',
//           orderId,
//           status: 'PENDING',
//           paymentGateway: 'MIDTRANS_SNAP',
//           rawResponse: body,
//         },
//       });
//     } catch (err) {
//       logger.error('[createTopup] Gagal insert Transaction PENDING:', err);
//     }

//     return res.json({
//       order_id: orderId,
//       token: body.token,
//       redirect_url: body.redirect_url,
//     });
//   } catch (err) {
//     logger.error('[createTopup] Unexpected error:', err);
//     return res.status(500).json({ message: 'Internal error' });
//   }
// }

// // ------------------ 3) CALLBACK HANDLER ------------------

// async function handleMidtransCallback(req, res) {
//   try {
//     const body = req.body || {};
//     const {
//       order_id: orderId,
//       status_code: statusCode,
//       gross_amount: grossAmount,
//       signature_key: signatureKey,
//       transaction_status: transactionStatus,
//       payment_type: paymentType,
//       fraud_status: fraudStatus,
//     } = body;

//     logger.info('[MidtransCallback] Payload:', body);

//     if (!orderId || !statusCode || !grossAmount || !signatureKey) {
//       return res.status(400).json({
//         message: 'Missing required Midtrans fields',
//       });
//     }

//     const serverKey = env.midtransServerKey || process.env.MIDTRANS_SERVER_KEY;
//     if (!serverKey) {
//       logger.error('[MidtransCallback] MIDTRANS_SERVER_KEY not set');
//       return res.status(500).json({
//         message: 'Midtrans server key not configured',
//       });
//     }

//     const expectedSignature = crypto
//       .createHash('sha512')
//       .update(orderId + statusCode + grossAmount + serverKey)
//       .digest('hex');

//     if (expectedSignature !== signatureKey) {
//       logger.warn('[MidtransCallback] Invalid signature for order', orderId);
//       return res.status(400).json({ message: 'Invalid signature' });
//     }

//     const txStatus = mapMidtransStatus(transactionStatus);

//     const parts = String(orderId).split('-');
//     const prefix = parts[0]; // subs | topup | test

//     if (prefix !== 'subs' && prefix !== 'topup' && prefix !== 'test') {
//       logger.warn('[MidtransCallback] Unknown order prefix:', prefix);
//       return res.status(200).json({ message: 'Ignored unknown order type' });
//     }

//     const userId = Number(parts[1]);
//     if (!userId || Number.isNaN(userId)) {
//       logger.error('[MidtransCallback] Invalid userId in orderId:', orderId);
//       return res.status(400).json({ message: 'Invalid user id in order id' });
//     }

//     const amountInt = parseInt(grossAmount, 10) || 0;

//     let type = '';
//     let plan = null;
//     let billingCycle = null;
//     let creditsChange = 0;

//     if (prefix === 'subs') {
//       const rawPlan = parts[2];
//       const rawBillingCycle = parts[3];

//       plan = String(rawPlan || '').toUpperCase();
//       const billingLower = String(rawBillingCycle || '').toLowerCase();
//       const billingEnum = billingLower === 'yearly' ? 'YEARLY' : 'MONTHLY';

//       billingCycle = billingEnum;
//       type = 'subscription';

//       const cfg = getPlanConfig(plan, billingLower);
//       if (!cfg || !cfg.creditsPerPeriod) {
//         logger.error(
//           '[MidtransCallback] No plan config for plan/billing:',
//           plan,
//           billingLower,
//         );
//       } else if (txStatus === 'SUCCESS') {
//         creditsChange = cfg.creditsPerPeriod;
//       }
//     } else if (prefix === 'topup') {
//       const creditAmountRaw = parts[2];
//       const creditAmount = parseInt(creditAmountRaw, 10) || 0;

//       type = 'topup';
//       creditsChange = txStatus === 'SUCCESS' ? creditAmount : 0;
//     } else if (prefix === 'test') {
//       type = 'test';
//     }

//     // Upsert Transaction
//     try {
//       await prisma.transaction.upsert({
//         where: { orderId },
//         update: {
//           status: txStatus,
//           rawResponse: body,
//           updatedAt: new Date(),
//         },
//         create: {
//           userId,
//           type,
//           plan,
//           billingCycle,
//           creditsChange,
//           amount: amountInt,
//           currency: 'IDR',
//           orderId,
//           status: txStatus,
//           paymentGateway: 'MIDTRANS_SNAP',
//           rawResponse: body,
//         },
//       });
//     } catch (err) {
//       logger.error('[MidtransCallback] upsert Transaction error:', err);
//       return res.status(200).json({ message: 'ERROR_LOGGED' });
//     }

//     // Kalau SUCCESS → update subscription / credits
//     if (txStatus === 'SUCCESS') {
//       if (type === 'subscription' && plan && billingCycle) {
//         const billingLower =
//           billingCycle === 'YEARLY' ? 'yearly' : 'monthly';
//         const cfg = getPlanConfig(plan, billingLower);

//         if (cfg && cfg.creditsPerPeriod) {
//           const { periodStart, periodEnd } =
//             getNextPeriodRangeFromNow(billingCycle);

//           try {
//             await prisma.$transaction(async (tx) => {
//               await tx.subscription.upsert({
//                 where: { userId },
//                 update: {
//                   plan,
//                   billingCycle,
//                   status: 'ACTIVE',
//                   currentPeriodStart: periodStart,
//                   currentPeriodEnd: periodEnd,
//                   updatedAt: new Date(),
//                 },
//                 create: {
//                   userId,
//                   plan,
//                   billingCycle,
//                   status: 'ACTIVE',
//                   currentPeriodStart: periodStart,
//                   currentPeriodEnd: periodEnd,
//                 },
//               });

//               await tx.user.update({
//                 where: { id: userId },
//                 data: {
//                   plan,
//                   credits: cfg.creditsPerPeriod,
//                   updatedAt: new Date(),
//                 },
//               });
//             });

//             logger.info(
//               `[MidtransCallback] Activated subscription for userId=${userId}, plan=${plan}, billing=${billingCycle}`,
//             );
//           } catch (err) {
//             logger.error(
//               '[MidtransCallback] Error updating subscription/user:',
//               err,
//             );
//           }
//         }
//       }

//       if (type === 'topup' && creditsChange > 0) {
//         try {
//           await prisma.user.update({
//             where: { id: userId },
//             data: {
//               credits: { increment: creditsChange },
//               updatedAt: new Date(),
//             },
//           });

//           logger.info(
//             `[MidtransCallback] Topup credits userId=${userId} +${creditsChange}`,
//           );
//         } catch (err) {
//           logger.error('[MidtransCallback] Error topup credits:', err);
//         }
//       }
//     }

//     logger.info('[MidtransCallback] Handled:', {
//       orderId,
//       transactionStatus,
//       paymentType,
//       fraudStatus,
//     });

//     return res.status(200).json({ message: 'OK' });
//   } catch (err) {
//     logger.error('[MidtransCallback] Unexpected error:', err);
//     return res.status(200).json({ message: 'ERROR_LOGGED' });
//   }
// }

// // ------------------ EXPORTS ------------------

// module.exports = {
//   handleMidtransCallback,
//   handleCallback: handleMidtransCallback,

//   createTestTransaction,
//   createSubscription,
//   createTopup,
// };

const midtransClient = require('midtrans-client');
const { getPlanConfig } = require('../config/creditCost');
const prisma = require('../utils/prisma');

// SNAP client
const snap = new midtransClient.Snap({
    isProduction : process.env.MIDTRANS_PRODUCTION === 'true',
    serverKey    : process.env.MIDTRANS_SERVER_KEY,
    clientKey    : process.env.MIDTRANS_CLIENT_KEY
});

exports.createSubscription = async (req, res) => {
    try {
        let { userId, plan, billingCycle, customer } = req.body;

        // FIX: konsistensi format
        plan = String(plan).toUpperCase();              // BASIC / PRO / BUSINESS
        billingCycle = String(billingCycle).toLowerCase();  // monthly / yearly

        const planConfig = getPlanConfig(plan, billingCycle);

        if (!planConfig) {
            return res.status(400).json({
                message: "Plan / billingCycle tidak dikenali di config"
            });
        }

        // Harga dan credits dari creditCost.js
        const price = planConfig.priceIDR;

        const orderId = `SUB-${plan}-${Date.now()}`;

        const parameter = {
            transaction_details: {
                order_id: orderId,
                gross_amount: price,
            },
            customer_details: {
                first_name: customer.name,
                email: customer.email,
            },
            item_details: [
                {
                    id: plan,
                    price: price,
                    quantity: 1,
                    name: `Subscription ${plan} (${billingCycle})`
                }
            ]
        };

        const snapResponse = await snap.createTransaction(parameter);

        // Save pending transaction
        await prisma.transaction.create({
            data: {
                userId: userId,
                type: "subscription",
                plan: plan,
                billingCycle: billingCycle.toUpperCase(),
                creditsChange: 0,
                amount: price,
                orderId: orderId,
                status: "PENDING",
                paymentGateway: "MIDTRANS_SNAP"
            }
        });

        return res.json({
            redirect_url: snapResponse.redirect_url
        });

    } catch (err) {
        console.error("Midtrans Error:", err);
        return res.status(500).json({
            message: "Internal error",
            error: err.message
        });
    }
};

exports.midtransCallback = async (req, res) => {
    try {
        const notification = req.body;

        const orderId = notification.order_id;
        const transactionStatus = notification.transaction_status; // settlement | pending | deny | expire | cancel
        const fraudStatus = notification.fraud_status;

        // Ambil transaksi dari DB
        const trx = await prisma.transaction.findUnique({
            where: { orderId }
        });

        if (!trx) {
            return res.json({ message: "Transaction not found" });
        }

        // Jika sukses
        if (transactionStatus === "settlement" || 
            (transactionStatus === "capture" && fraudStatus === "accept")) {

            // Tandai sebagai sukses
            await prisma.transaction.update({
                where: { orderId },
                data: {
                    status: "SUCCESS",
                },
            });

            // Tambahkan credits otomatis
            if (trx.type === "subscription") {
                const plan = trx.plan.toUpperCase();
                const cycle = trx.billingCycle.toLowerCase();

                const planConfig = getPlanConfig(plan, cycle);
                if (planConfig) {
                    await prisma.user.update({
                        where: { id: trx.userId },
                        data: {
                            credits: {
                                increment: planConfig.creditsPerPeriod
                            },
                            plan: plan,
                        },
                    });
                }
            }

            return res.json({ message: "OK" });
        }

        // Pending → biarkan saja
        if (transactionStatus === "pending") {
            await prisma.transaction.update({
                where: { orderId },
                data: { status: "PENDING" }
            });
            return res.json({ message: "PENDING" });
        }

        // Jika gagal
        if (
            transactionStatus === "deny" ||
            transactionStatus === "expire" ||
            transactionStatus === "cancel"
        ) {
            await prisma.transaction.update({
                where: { orderId },
                data: { status: "FAILED" },
            });

            return res.json({ message: "FAILED" });
        }

        return res.json({ message: "Ignored" });

    } catch (err) {
        console.error("Callback error:", err);
        return res.status(500).json({ message: "Internal error" });
    }
};
