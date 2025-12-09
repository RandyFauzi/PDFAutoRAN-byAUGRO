// src/app.js
// ----------------------------------------------------
// Main Express app configuration for PDF AUTORAN API
// ----------------------------------------------------
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');


const env = require('./config/env');

// Import routes
const authRoutes = require('./routes/auth.routes');
const pdfRoutes = require('./routes/pdf.routes');
const adminRoutes = require('./routes/admin.routes');
const apiKeyRoutes = require('./routes/apiKey.routes');
const usageRoutes = require('./routes/usage.routes');
const midtransRoutes = require('./routes/midtrans.routes');
const danaRoutes = require('./routes/dana.routes');


const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();


// ----------------------------------------------------
// Global middleware
// ----------------------------------------------------
app.use(helmet()); // Security headers
app.use(cors());   // CORS (nantinya bisa dibuat whitelist origin)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set('trust proxy', 1);
app.use('/api/v1', danaRoutes);
app.use('/api/v1/admin', adminRoutes);

// Logging (development only)
if (env.nodeEnv === 'development') {
  app.use(morgan('dev'));
}

// ----------------------------------------------------
// Rate limiter
// Hanya diterapkan ke endpoint yang diakses user biasa.
// Endpoint webhook Midtrans sengaja TIDAK di-limit.
// ----------------------------------------------------
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 menit
  max: 200,                 // 200 request per IP per 15 menit
  standardHeaders: true,
  legacyHeaders: false,
});

// ----------------------------------------------------
// Routes sederhana / health check
// ----------------------------------------------------
app.get('/', (req, res) => {
  res.json({
    message: 'PDF AUTORAN API is running.',
    docs: {
      health: '/health',
      register: '/api/v1/auth/register',
      login: '/api/v1/auth/login',
    },
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    env: env.nodeEnv,
  });
});

// ----------------------------------------------------
// API v1 routes (dengan rate limiter)
// ----------------------------------------------------
app.use('/api/v1/auth', apiLimiter, authRoutes);
app.use('/api/v1/pdf', apiLimiter, pdfRoutes);
app.use('/api/v1/admin', apiLimiter, adminRoutes);
app.use('/api/v1/api-keys', apiLimiter, apiKeyRoutes);
app.use('/api/v1/usage', apiLimiter, usageRoutes);

// ----------------------------------------------------
// Midtrans payment routes
// Catatan:
// - create-transaction bisa di-limit jika mau,
//   tapi webhook /notification TIDAK boleh kena limiter.
//   Cara paling aman: limiter di dalam midtrans.routes
//   kalau nanti dibutuhkan.
// ----------------------------------------------------
app.use('/api/v1/payments/midtrans', midtransRoutes);

// ----------------------------------------------------
// Error handlers
// ----------------------------------------------------
app.use(notFound);
app.use(errorHandler);

module.exports = app;
