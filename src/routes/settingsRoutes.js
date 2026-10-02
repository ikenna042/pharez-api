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
 *     summary: Create a meter type price for one disco
 *     description: >
 *       Prices are per disco: the same meter type can cost different amounts at
 *       different discos. Each disco can have only one active price per meter
 *       type name; to change a price, PATCH it (or deactivate it first).
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [discoCode, name, amount]
 *             properties:
 *               discoCode: { type: string, example: ABA_POWER }
 *               name: { type: string, example: Single Phase }
 *               amount: { type: number, example: 107500 }
 *     responses:
 *       201:
 *         description: Meter type created
 *       404:
 *         description: Disco not found
 *       409:
 *         description: This disco already has an active price for that meter type
 */
router.post('/meter-type', authenticate, authorize(['SUPERADMIN', 'ADMIN']), validate(schemas.createMeterType), settingsController.createMeterType);

/**
 * @swagger
 * /settings/meter-type:
 *   get:
 *     summary: List active meter type prices
 *     description: >
 *       Each item includes its discoCode. Pass discoCode to get one disco's price
 *       list; without it, every disco's prices are returned together.
 *     tags: [Settings]
 *     parameters:
 *       - in: query
 *         name: discoCode
 *         schema: { type: string, example: ABA_POWER }
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
 *       404:
 *         description: Disco not found
 */
router.get('/meter-type', validateQuery(schemas.meterTypeListQuery), settingsController.getMeterTypes);

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
 *     description: >
 *       Changes only this price, which belongs to one disco. The disco itself
 *       can't be changed; create a price for the other disco instead.
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
 *       409:
 *         description: Renaming would duplicate an active price for the same disco
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
