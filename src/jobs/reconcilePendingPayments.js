const cron = require('node-cron');
const JedService = require('../services/jedService');

// Runs at the top of every hour: '0 * * * *'
function startReconcilePendingPaymentsJob() {
  cron.schedule('0 * * * *', async () => {
    console.log('Reconcile job: starting scheduled run at', new Date().toISOString());
    try {
      await JedService.reconcilePendingPayments();
    } catch (error) {
      console.error('Reconcile job: unhandled error during scheduled run:', error.message);
    }
  });

  console.log('Reconcile pending payments job scheduled (hourly)');
}

module.exports = { startReconcilePendingPaymentsJob };
