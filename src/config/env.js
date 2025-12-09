const dotenv = require('dotenv');

// Load variabel dari file .env ke process.env
dotenv.config();

// Objek env yang akan dipakai di seluruh aplikasi
const env = {
  port: process.env.PORT || 4000,
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET || 'default-secret',
  nodeEnv: process.env.NODE_ENV || 'development',

  // Support Admin Emails: "admin1@gmail.com,admin2@gmail.com"
  adminEmails: process.env.ADMIN_EMAILS
    ? process.env.ADMIN_EMAILS.split(',').map(e => e.trim())
    : [],

  // ========================
  // MIDTRANS CONFIG
  // ========================
  midtransServerKey: process.env.MIDTRANS_SERVER_KEY,
  midtransClientKey: process.env.MIDTRANS_CLIENT_KEY,
  midtransMerchantId: process.env.MIDTRANS_MERCHANT_ID,
  midtransIsProduction: process.env.MIDTRANS_IS_PRODUCTION === 'true',

  // ========================
  // EMAIL CONFIG
  // ========================
  mailUser: process.env.MAIL_USER,
  mailPass: process.env.MAIL_PASS,
  mailFrom: process.env.MAIL_FROM || process.env.MAIL_USER,
};

module.exports = env;
