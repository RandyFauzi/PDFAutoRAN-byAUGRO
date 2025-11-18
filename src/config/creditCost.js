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
  MERGE: 15,       // medium
  STAMP: 10,       // ringan
};

// Paket & pricing (dalam Rupiah)
const TIER = {
  FREE: {
    code: 'FREE',
    type: 'free',
    initialCredits: 2000,   // 2.000 credits sekali saat register
    monthlyCredits: 0,      // Tidak ada reset bulanan
    reset: false,           // FREE tidak ikut reset scheduler
    priceIDR: 0,
    maxDailyCredits: 1000,  // batas harian untuk FREE
  },

  BASIC: {
    code: 'BASIC',
    type: 'paid',
    monthly: {
      billingCycle: 'monthly',
      creditsPerPeriod: 18000,   // 18.000 / bulan
      priceIDR: 75000,           // Rp 75.000
      discountPercent: 0,
      maxDailyCredits: 3000,     // max per hari
    },
    yearly: {
      billingCycle: 'yearly',
      creditsPerPeriod: 18000,   // (bisa dinaikkan nanti kalau mau beda)
      priceIDR: 720000,          // Rp 720.000 (diskon ~20% dari 12×75k)
      discountPercent: 20,
      maxDailyCredits: 3000,
    },
  },

  PRO: {
    code: 'PRO',
    type: 'paid',
    monthly: {
      billingCycle: 'monthly',
      creditsPerPeriod: 45000,   // 45.000 / bulan
      priceIDR: 199000,          // Rp 199.000
      discountPercent: 0,
      maxDailyCredits: 3000,
    },
    yearly: {
      billingCycle: 'yearly',
      creditsPerPeriod: 300000,  // 300.000 / tahun
      priceIDR: 1920000,         // Rp 1.920.000 (±20% disc)
      discountPercent: 20,
      maxDailyCredits: 3000,
    },
  },

  BUSINESS: {
    code: 'BUSINESS',
    type: 'paid',
    monthly: {
      billingCycle: 'monthly',
      creditsPerPeriod: 90000,   // 90.000 / bulan
      priceIDR: 300000,          // Rp 300.000 (aku sesuaikan dgn catatanmu)
      discountPercent: 0,
      maxDailyCredits: 5000,
    },
    yearly: {
      billingCycle: 'yearly',
      creditsPerPeriod: 90000,   // (bisa dinaikkan nanti kalau mau beda tahunan)
      priceIDR: 2880000,         // Rp 2.880.000 (~20% disc dari 12×300k)
      discountPercent: 20,
      maxDailyCredits: 5000,
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
