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
 *         example: ABA_POWER
 *     requestBody:
 *       required: true
 *       description: At least one field must be supplied.
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             minProperties: 1
 *             properties:
 *               name:
 *                 type: string
 *                 example: Aba Power Limited Electric
 *               integrationMode:
 *                 type: string
 *                 enum: [OFFLINE, API]
 *               contactEmail:
 *                 type: string
 *                 format: email
 *               isActive:
 *                 type: boolean
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
 *         example: ABA_POWER
 *     requestBody:
 *       required: true
 *       description: >
 *         REPLACES the entire mapping. Anything you leave out is dropped, so fetch
 *         GET /discos/{code} first and edit what it returns. The prefilled example
 *         is the full current default, so executing it as-is is a safe restore.
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             additionalProperties:
 *               type: object
 *               required: [keyField, fields]
 *               properties:
 *                 sheetIndex: { type: integer, default: 0 }
 *                 headerRow: { type: integer, default: 1 }
 *                 keyField: { type: string, example: accountNumber }
 *                 captureExtras: { type: boolean, default: false }
 *                 fields:
 *                   type: object
 *                   additionalProperties:
 *                     type: object
 *                     required: [headers]
 *                     properties:
 *                       headers:
 *                         type: array
 *                         items: { type: string }
 *                       required: { type: boolean }
 *                       transform:
 *                         type: string
 *                         enum: [trim, upper, text, number, ngPhone, phase, date]
 *                       keepRaw: { type: boolean }
 *                       padStart: { type: integer }
 *           examples:
 *             abaPower:
 *               $ref: '#/components/examples/AbaPowerImportMapping'
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
 *         example: ABA_POWER
 *     requestBody:
 *       required: true
 *       description: >
 *         REPLACES the entire template; anything omitted is dropped. Column order
 *         here is the column order in the generated sheet. The prefilled example is
 *         the full current default, so executing it as-is is a safe restore.
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             additionalProperties:
 *               type: object
 *               required: [columns]
 *               properties:
 *                 sheetName: { type: string, example: Installations }
 *                 fileNamePrefix: { type: string, example: aba_power_installations }
 *                 columns:
 *                   type: array
 *                   items:
 *                     type: object
 *                     required: [header, source]
 *                     properties:
 *                       header: { type: string, example: Meter Number }
 *                       source: { type: string, example: meterNumber }
 *                       format:
 *                         type: string
 *                         enum: [text, number, date, datetime]
 *                       width: { type: integer, example: 18 }
 *           examples:
 *             abaPower:
 *               $ref: '#/components/examples/AbaPowerExportTemplate'
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
