// src/app.js
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
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();

// ---------- Global middleware ----------
app.use(helmet());                 // Security headers
app.use(cors());                   // CORS (nanti bisa kita whitelist kalau perlu)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging (development)
if (env.nodeEnv === 'development') {
  app.use(morgan('dev'));
}

// Rate limit untuk semua endpoint /api/*
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,   // 15 menit
  max: 200,                   // max 200 request per IP per 15 menit
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', apiLimiter);

// ---------- Routes sederhana ----------
app.get('/', (req, res) => {
  res.json({
    message: 'PDF AUTORAN API is running.',
    docs: {
      health: '/health',
      register: '/api/v1/auth/register',
      login: '/api/v1/auth/login'
    }
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    env: env.nodeEnv
  });
});

// ---------- API v1 routes ----------
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/pdf', pdfRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/api-keys', apiKeyRoutes);

// ---------- Error handlers ----------
app.use(notFound);
app.use(errorHandler);

module.exports = app;
