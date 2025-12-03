// src/config/midtrans.js
const midtransClient = require('midtrans-client');

const {
  MIDTRANS_SERVER_KEY,
  MIDTRANS_CLIENT_KEY,
  MIDTRANS_IS_PRODUCTION,
} = process.env;

if (!MIDTRANS_SERVER_KEY) {
  console.warn('[MIDTRANS] MIDTRANS_SERVER_KEY is not set in environment variables');
}

const isProduction = MIDTRANS_IS_PRODUCTION === 'true';

// Client untuk buat SNAP transaction
const snap = new midtransClient.Snap({
  isProduction,
  serverKey: MIDTRANS_SERVER_KEY,
  clientKey: MIDTRANS_CLIENT_KEY,
});

// Client untuk handle notification & cek status
const coreApi = new midtransClient.CoreApi({
  isProduction,
  serverKey: MIDTRANS_SERVER_KEY,
  clientKey: MIDTRANS_CLIENT_KEY,
});

module.exports = {
  snap,
  coreApi,
  isProduction,
};
