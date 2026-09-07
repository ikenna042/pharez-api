const express = require('express');
const upload = require('../config/multer');
const { validateQuery, validateParams, schemas } = require('../middleware/validation');
const { authenticate, authorize } = require('../middleware/auth');
const importController = require('../controllers/importController');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Imports
 *   description: >
 *     Spreadsheet ingestion for offline discos. Columns are matched using the
 *     disco's own import mapping, so a new disco needs a mapping row, not a deploy.
 */

/**
 * @swagger
 * /imports:
 *   get:
 *     summary: List import batches
 *     tags: [Imports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: discoCode
 *         schema: { type: string }
 *       - in: query
 *         name: importType
 *         schema: { type: string, enum: [PENDING_INSTALLATIONS, METER_INVENTORY] }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [PROCESSING, COMPLETED, FAILED] }
 *     responses:
 *       200:
 *         description: Paginated batch history (per-row errors omitted)
 */
router.get(
  '/',
  authenticate,
  authorize(['SUPERADMIN', 'ADMIN']),
  validateQuery(schemas.getImportBatchesQuery),
  importController.listImportBatches
);

/**
 * @swagger
 * /imports/{discoCode}/pending-installations/template:
 *   get:
 *     summary: Download a blank pending-installations template for a disco
 *     description: Headers are generated from the disco's own mapping, so they are by construction the headers the importer accepts.
 *     tags: [Imports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: discoCode
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: XLSX template
 */
router.get(
  '/:discoCode/pending-installations/template',
  authenticate,
  validateParams(schemas.discoCodeParam),
  importController.downloadPendingInstallationTemplate
);

/**
 * @swagger
 * /imports/{discoCode}/meters/template:
 *   get:
 *     summary: Download a blank meter-inventory template for a disco
 *     tags: [Imports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: discoCode
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: XLSX template
 */
router.get(
  '/:discoCode/meters/template',
  authenticate,
  validateParams(schemas.discoCodeParam),
  importController.downloadMeterInventoryTemplate
);

/**
 * @swagger
 * /imports/{discoCode}/pending-installations:
 *   post:
 *     summary: Import a disco's pending-installations spreadsheet
 *     description: >
 *       Creates PENDING installation requests. Rows whose account number already
 *       exists for this disco are skipped, not errored. Returns a batch summary.
 *     tags: [Imports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: discoCode
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: Import completed and records were created
 *       200:
 *         description: Import completed but every row was already known
 *       400:
 *         description: Missing file, missing required column, or empty sheet
 *       404:
 *         description: Disco not found
 */
router.post(
  '/:discoCode/pending-installations',
  authenticate,
  authorize(['SUPERADMIN', 'ADMIN']),
  validateParams(schemas.discoCodeParam),
  upload.single('file'),
  importController.importPendingInstallations
);

/**
 * @swagger
 * /imports/{discoCode}/meters:
 *   post:
 *     summary: Import a meter + SIM inventory spreadsheet
 *     description: >
 *       Writes into the single shared `meters` table. Serials already present are
 *       skipped. This route exists alongside POST /meters/upload because that
 *       endpoint's column names are hardcoded; this one uses the disco mapping.
 *     tags: [Imports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: discoCode
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: Import completed and meters were created
 *       200:
 *         description: Import completed but every serial was already known
 */
router.post(
  '/:discoCode/meters',
  authenticate,
  authorize(['SUPERADMIN', 'ADMIN']),
  validateParams(schemas.discoCodeParam),
  upload.single('file'),
  importController.importMeterInventory
);

/**
 * @swagger
 * /imports/{id}:
 *   get:
 *     summary: Get one import batch including every per-row error
 *     tags: [Imports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Batch detail
 *       404:
 *         description: Import batch not found
 */
router.get(
  '/:id',
  authenticate,
  authorize(['SUPERADMIN', 'ADMIN']),
  validateParams(schemas.idParam),
  importController.getImportBatch
);

module.exports = router;
