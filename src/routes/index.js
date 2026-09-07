const express = require('express');
const authRoutes = require('./authRoutes');
const userRoutes = require('./userRoutes');
const verificationRoutes = require('./verificationRoutes');
const jedRoutes = require('./jedRoutes');
const meterRoutes = require('./meterRoutes');
const webhookRoutes = require('./webhookRoutes');
const apiKeyRoutes = require('./apiKeyRoutes');
const settingsRoutes = require('./settingsRoutes');
const dashboardRoutes = require('./dashboardRoutes');
const discoRoutes = require('./discoRoutes');
const importRoutes = require('./importRoutes');
const assignmentRoutes = require('./assignmentRoutes');
const installationRoutes = require('./installationRoutes');

const router = express.Router();

// API status endpoint
router.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'PharezAPI v1.0.0',
    endpoints: {
      auth: '/auth',
      users: '/users',
      verification: '/verification',
      meters: '/meters',
      webhooks: '/webhooks',
      apiKeys: '/apikeys',
      external: {
        jed: '/external/jed'
      },
      dashboard: './dashboard-stats',
      discos: '/discos',
      imports: '/imports',
      assignments: '/assignments',
      installations: '/installations'
    },
    documentation: '/api-docs'
  });
});

// Mount route modules
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/verification', verificationRoutes);
router.use('/meters', meterRoutes);
router.use('/webhooks', webhookRoutes);
router.use('/external/jed', jedRoutes);
router.use('/apikeys', apiKeyRoutes);
router.use('/settings', settingsRoutes);
router.use('/dashboard-stats', dashboardRoutes);
router.use('/discos', discoRoutes);
router.use('/imports', importRoutes);
router.use('/assignments', assignmentRoutes);
router.use('/installations', installationRoutes);
module.exports = router;