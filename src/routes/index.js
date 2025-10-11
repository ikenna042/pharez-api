const express = require('express');
const authRoutes = require('./authRoutes');
const userRoutes = require('./userRoutes');
const verificationRoutes = require('./verificationRoutes');
const jedRoutes = require('./jedRoutes');
const meterRoutes = require('./meterRoutes');
const webhookRoutes = require('./webhookRoutes');

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
      external: {
        jed: '/external/jed'
      }
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

module.exports = router;