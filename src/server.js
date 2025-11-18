// src/server.js
//---------------------------------------
// PDF AUTORUN API – Server Entry Point
//---------------------------------------

const env = require('./config/env');
const app = require('./app');
const { startSubscriptionResetScheduler } = require('./jobs/subscriptionReset.job');

// Gunakan port dari env.js (konsisten dengan proyekmu)
const PORT = env.port || process.env.PORT || 3000;

// Jalankan server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`PDF AUTORAN API running on http://0.0.0.0:${PORT}`);

  // Start scheduler (reset periodik credits untuk subscription)
  startSubscriptionResetScheduler();
});
