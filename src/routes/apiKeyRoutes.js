const express = require('express');
const apiKeyController = require('../controllers/apiKeyController');
const { validate, validateQuery, schemas } = require('../middleware/validation');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: API Keys
 *   description: Manage API keys for programmatic access
 */


/**
 * @swagger
 * /apikeys:
 *   post:
 *     summary: Create a new API key
 *     tags: [API Keys]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [keyName]
 *             properties:
 *               keyName:
 *                 type: string
 *               description:
 *                 type: string
 *               permissions:
 *                 type: array
 *                 items:
 *                   type: string
 *               expiresAt:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       201:
 *         description: API Key created successfully
 */
router.post('/', authenticate, authorize(['SUPERADMIN', 'ADMIN']), validate(schemas.createApiKey), apiKeyController.createApiKey);

/**
 * @swagger
 * /apikeys:
 *   get:
 *     summary: List API keys
 *     tags: [API Keys]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Items per page
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: boolean
 *         description: Filter active keys
 *     responses:
 *       200:
 *         description: List of API keys
 */
router.get('/', authenticate, authorize(['SUPERADMIN', 'ADMIN']), validateQuery(schemas.getListQuery), apiKeyController.getApiKeys);

/**
 * @swagger
 * /apikeys/{id}:
 *   get:
 *     summary: Get API key by id
 *     tags: [API Keys]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: API key details
 */
router.get('/:id', authenticate, authorize(['SUPERADMIN', 'ADMIN']), apiKeyController.getApiKeyById);

/**
 * @swagger
 * /apikeys/{id}/deactivate:
 *   post:
 *     summary: Deactivate an API key
 *     tags: [API Keys]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: API key deactivated
 */
router.post('/:id/deactivate', authenticate, authorize(['SUPERADMIN', 'ADMIN']), apiKeyController.deactivateApiKey);

/**
 * @swagger
 * /apikeys/{id}:
 *   delete:
 *     summary: Delete an API key
 *     tags: [API Keys]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: API key deleted
 */
router.delete('/:id', authenticate, authorize(['SUPERADMIN', 'ADMIN']), apiKeyController.deleteApiKey);

/**
 * @swagger
 * /apikeys/{id}/usage:
 *   get:
 *     summary: Get API key usage statistics for the last N days
 *     tags: [API Keys]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *         description: Number of days to look back
 *     responses:
 *       200:
 *         description: Usage statistics
 */
router.get('/:id/usage', authenticate, authorize(['SUPERADMIN', 'ADMIN']), apiKeyController.getApiKeyUsageStats);

module.exports = router;
