const env = require('./config/env');
const app = require('./app');
const { startSubscriptionResetScheduler } = require('./jobs/subscriptionReset.job');

const PORT = env.port || process.env.PORT || 3000;

// Jalankan server
app.listen(PORT, () => {
  console.log(`PDF AUTORUN API running on http://localhost:${PORT}`);

  // Start scheduler (reset periodik credits untuk subscription)
  startSubscriptionResetScheduler();
});
