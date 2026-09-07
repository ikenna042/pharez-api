const express = require('express');
const { validate, validateQuery, validateParams, schemas } = require('../middleware/validation');
const { authenticate, authorize } = require('../middleware/auth');
const discoController = require('../controllers/discoController');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Discos
 *   description: Distribution companies and their per-disco import/export configuration
 */

/**
 * @swagger
 * /discos:
 *   post:
 *     summary: Register a distribution company
 *     tags: [Discos]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [code, name]
 *             properties:
 *               code:
 *                 type: string
 *                 example: ABA_POWER
 *               name:
 *                 type: string
 *                 example: Aba Power Limited Electric
 *               integrationMode:
 *                 type: string
 *                 enum: [OFFLINE, API]
 *               contactEmail:
 *                 type: string
 *               importMapping:
 *                 type: object
 *               exportTemplate:
 *                 type: object
 *     responses:
 *       201:
 *         description: Disco created
 *       400:
 *         description: Disco already exists or validation failed
 */
router.post(
  '/',
  authenticate,
  authorize(['SUPERADMIN']),
  validate(schemas.createDisco),
  discoController.createDisco
);

/**
 * @swagger
 * /discos:
 *   get:
 *     summary: List distribution companies
 *     tags: [Discos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *       - in: query
 *         name: isActive
 *         schema: { type: boolean }
 *     responses:
 *       200:
 *         description: Paginated list of discos
 */
router.get(
  '/',
  authenticate,
  validateQuery(schemas.getDiscosQuery),
  discoController.getDiscos
);

/**
 * @swagger
 * /discos/{code}:
 *   get:
 *     summary: Get one disco including its import mapping and export template
 *     tags: [Discos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: code
 *         required: true
 *         schema: { type: string }
 *         example: ABA_POWER
 *     responses:
 *       200:
 *         description: Disco record
 *       404:
 *         description: Disco not found
 */
router.get(
  '/:code',
  authenticate,
  validateParams(schemas.discoCodeOnlyParam),
  discoController.getDiscoByCode
);

/**
 * @swagger
 * /discos/{code}:
 *   patch:
 *     summary: Update a disco's name, mode, contact or active flag
 *     tags: [Discos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: code
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Disco updated
 *       404:
 *         description: Disco not found
 */
router.patch(
  '/:code',
  authenticate,
  authorize(['SUPERADMIN']),
  validateParams(schemas.discoCodeOnlyParam),
  validate(schemas.updateDisco),
  discoController.updateDisco
);

/**
 * @swagger
 * /discos/{code}/import-mapping:
 *   put:
 *     summary: Replace a disco's spreadsheet import mapping
 *     description: >
 *       Maps spreadsheet headers to fields per import type
 *       (pendingInstallations, meterInventory). Header aliases are matched after
 *       normalization, so casing, spacing and punctuation do not matter.
 *     tags: [Discos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: code
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Import mapping updated
 *       404:
 *         description: Disco not found
 */
router.put(
  '/:code/import-mapping',
  authenticate,
  authorize(['SUPERADMIN']),
  validateParams(schemas.discoCodeOnlyParam),
  validate(schemas.discoImportMapping),
  discoController.updateImportMapping
);

/**
 * @swagger
 * /discos/{code}/export-template:
 *   put:
 *     summary: Replace a disco's response-sheet export template
 *     description: Defines the exact columns, order and formatting of the sheet sent back to the disco.
 *     tags: [Discos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: code
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Export template updated
 *       404:
 *         description: Disco not found
 */
router.put(
  '/:code/export-template',
  authenticate,
  authorize(['SUPERADMIN']),
  validateParams(schemas.discoCodeOnlyParam),
  validate(schemas.discoExportTemplate),
  discoController.updateExportTemplate
);

module.exports = router;
