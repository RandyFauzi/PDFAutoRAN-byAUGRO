const env = require('./config/env');
const app = require('./app');
const { startSubscriptionResetScheduler } = require('./jobs/subscriptionReset.job');

const PORT = env.port || process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`PDF AUTORAN API running on port ${PORT}`);
  startSubscriptionResetScheduler();
});
