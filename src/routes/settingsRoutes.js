const express = require('express');
const { validate, validateQuery, schemas } = require('../middleware/validation');
const { authenticate, authorize } = require('../middleware/auth');
const settingsController = require('../controllers/settingsController');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Settings
 *   description: Application settings (meter types, etc.)
 */

/**
 * @swagger
 * /settings/meter-type:
 *   post:
 *     summary: Create a meter type
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, amount]
 *             properties:
 *               name:
 *                 type: string
 *               amount:
 *                 type: number
 *     responses:
 *       201:
 *         description: Meter type created
 */
router.post('/meter-type', authenticate, authorize(['SUPERADMIN', 'ADMIN']), validate(schemas.createMeterType), settingsController.createMeterType);

/**
 * @swagger
 * /settings/meter-type:
 *   get:
 *     summary: List meter types
 *     tags: [Settings]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: List of meter types
 */
router.get('/meter-type', validateQuery(schemas.getListQuery), settingsController.getMeterTypes);

/**
 * @swagger
 * /settings/meter-type/{id}:
 *   get:
 *     summary: Get meter type by id
 *     tags: [Settings]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Meter type details
 */
router.get('/meter-type/:id', settingsController.getMeterTypeById);

/**
 * @swagger
 * /settings/meter-type/{id}:
 *   patch:
 *     summary: Update meter type (partial)
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               amount:
 *                 type: number
 *     responses:
 *       200:
 *         description: Meter type updated
 */
router.patch('/meter-type/:id', authenticate, authorize(['SUPERADMIN', 'ADMIN']), validate(schemas.updateMeterType), settingsController.updateMeterType);

/**
 * @swagger
 * /settings/meter-type/{id}:
 *   delete:
 *     summary: Deactivate (soft-delete) a meter type
 *     tags: [Settings]
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
 *         description: Meter type deactivated
 */
router.delete('/meter-type/:id', authenticate, authorize(['SUPERADMIN', 'ADMIN']), settingsController.deleteMeterType);

module.exports = router;
