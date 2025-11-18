// src/config/creditCost.js
// ------------------------------------------------------
// Konfigurasi biaya (credits) per fitur dan paket tier.
// - COST : biaya per 1x eksekusi endpoint.
// - TIER : definisi paket FREE, BASIC, PRO, BUSINESS
//          termasuk varian bulanan & tahunan.
// ------------------------------------------------------

// Cost per operasi
const COST = {
  HTML_TO_PDF: 20, // tugas paling berat (Puppeteer/Chromium)
  MERGE: 8,        // medium
  STAMP: 5,        // sangat ringan
};

// Paket & pricing (dalam Rupiah)
const TIER = {
  FREE: {
    code: 'FREE',
    type: 'free',
    initialCredits: 10000, // DIBERIKAN 1x saat user register
    monthlyCredits: 0,     // Tidak ada reset bulanan
    reset: false,
    priceIDR: 0,
    maxDailyCredits: 2000, // contoh: limit harian untuk FREE
  },

  BASIC: {
    code: 'BASIC',
    type: 'paid',
    monthly: {
      billingCycle: 'monthly',
      creditsPerPeriod: 100000, // 100k credits / bulan
      priceIDR: 75000,
      discountPercent: 0,
      maxDailyCredits: 20000,
    },
    yearly: {
      billingCycle: 'yearly',
      creditsPerPeriod: 100000,
      priceIDR: 720000,
      discountPercent: 20,
      maxDailyCredits: 20000,
    },
  },

  PRO: {
    code: 'PRO',
    type: 'paid',
    monthly: {
      billingCycle: 'monthly',
      creditsPerPeriod: 300000,
      priceIDR: 199000,
      discountPercent: 0,
      maxDailyCredits: 60000,
    },
    yearly: {
      billingCycle: 'yearly',
      creditsPerPeriod: 300000,
      priceIDR: 1920000,
      discountPercent: 20,
      maxDailyCredits: 60000,
    },
  },

  BUSINESS: {
    code: 'BUSINESS',
    type: 'paid',
    monthly: {
      billingCycle: 'monthly',
      creditsPerPeriod: 1000000,
      priceIDR: 499000,
      discountPercent: 0,
      maxDailyCredits: 200000,
    },
    yearly: {
      billingCycle: 'yearly',
      creditsPerPeriod: 1000000,
      priceIDR: 4800000,
      discountPercent: 20,
      maxDailyCredits: 200000,
    },
  },
};

// Helper: ambil config plan + billingCycle
function getPlanConfig(plan, billingCycle) {
  const planKey = String(plan).toUpperCase(); // FREE/BASIC/PRO/BUSINESS
  const tier = TIER[planKey];
  if (!tier) return null;

  if (planKey === 'FREE') {
    return tier;
  }

  if (!billingCycle) return null;

  const cycleKey = String(billingCycle).toLowerCase(); // monthly/yearly
  return tier[cycleKey] || null;
}

module.exports = {
  COST,
  TIER,
  getPlanConfig,
};
