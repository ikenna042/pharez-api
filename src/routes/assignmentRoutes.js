const express = require('express');
const { validate, validateQuery, validateParams, schemas } = require('../middleware/validation');
const { authenticate, authorize } = require('../middleware/auth');
const upload = require('../config/multer');
const assignmentController = require('../controllers/assignmentController');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Assignments
 *   description: >
 *     Batch handover of meters and jobs to installers. Meter stock and job lists
 *     are assigned independently; the installer names which meter they used when
 *     reporting an installation.
 */

/**
 * @swagger
 * /assignments/meters:
 *   post:
 *     summary: Assign specific meter serials to an installer
 *     description: >
 *       Partial success: unknown, already-assigned or already-installed serials are
 *       reported individually rather than failing the whole dispatch. Assignment
 *       does not change meters.status, so the JED flow is unaffected.
 *     tags: [Assignments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [discoCode, installerId, meterNumbers]
 *             properties:
 *               discoCode: { type: string, example: ABA_POWER }
 *               installerId: { type: string, format: uuid, example: 3904aad1-2f27-42d1-9c33-fe87502ea594 }
 *               meterNumbers:
 *                 type: array
 *                 items: { type: string }
 *                 example: ["0239110006909", "0239110006917"]
 *               note: { type: string }
 *               dispatchRef: { type: string }
 *     responses:
 *       201:
 *         description: Meters assigned
 *       200:
 *         description: Nothing could be assigned; see rejected[]
 *       400:
 *         description: User is not an active installer
 *       404:
 *         description: Disco or installer not found
 */
router.post(
  '/meters',
  authenticate,
  authorize(['SUPERADMIN', 'ADMIN', 'SUPERVISOR']),
  validate(schemas.assignMeters),
  assignmentController.assignMeters
);

/**
 * @swagger
 * /assignments/meters/return:
 *   post:
 *     summary: Return meters to stock
 *     description: Releases assigned serials and closes their batch once nothing is left out.
 *     tags: [Assignments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [meterNumbers]
 *             properties:
 *               meterNumbers:
 *                 type: array
 *                 items: { type: string }
 *                 example: ["0239110006925"]
 *     responses:
 *       200:
 *         description: Meters returned
 */
router.post(
  '/meters/return',
  authenticate,
  authorize(['SUPERADMIN', 'ADMIN', 'SUPERVISOR']),
  validate(schemas.returnMeters),
  assignmentController.returnMeters
);

/**
 * @swagger
 * /assignments/installations:
 *   post:
 *     summary: Assign pending installations to an installer
 *     description: >
 *       Address jobs by internal id or by account number (exactly one of the two).
 *       Only PENDING and FAILED requests move, so in-flight or finished work is
 *       never silently reassigned.
 *     tags: [Assignments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [discoCode, installerId]
 *             properties:
 *               discoCode: { type: string, example: ABA_POWER }
 *               installerId: { type: string, format: uuid, example: 3904aad1-2f27-42d1-9c33-fe87502ea594 }
 *               accountNumbers:
 *                 type: array
 *                 items: { type: string }
 *               ids:
 *                 type: array
 *                 items: { type: integer }
 *               note: { type: string }
 *               dispatchRef: { type: string }
 *     responses:
 *       201:
 *         description: Installations assigned
 *       200:
 *         description: Nothing could be assigned; see rejected[]
 */
router.post(
  '/installations',
  authenticate,
  authorize(['SUPERADMIN', 'ADMIN', 'SUPERVISOR']),
  validate(schemas.assignInstallations),
  assignmentController.assignInstallations
);

/**
 * @swagger
 * /assignments/installations/unassign:
 *   post:
 *     summary: Return assigned installations to the pending pool
 *     tags: [Assignments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       description: Supply exactly one of ids or accountNumbers.
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [discoCode]
 *             properties:
 *               discoCode:
 *                 type: string
 *                 example: ABA_POWER
 *               accountNumbers:
 *                 type: array
 *                 items: { type: string }
 *                 example: ["730352416"]
 *               ids:
 *                 type: array
 *                 items: { type: integer }
 *     responses:
 *       200:
 *         description: Installations unassigned
 */
router.post(
  '/installations/unassign',
  authenticate,
  authorize(['SUPERADMIN', 'ADMIN', 'SUPERVISOR']),
  validate(schemas.unassignInstallations),
  assignmentController.unassignInstallations
);

/**
 * @swagger
 * /assignments:
 *   get:
 *     summary: List assignment batches
 *     tags: [Assignments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: assignmentType
 *         schema: { type: string, enum: [METER, INSTALLATION] }
 *       - in: query
 *         name: installerId
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: discoCode
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [ACTIVE, PARTIALLY_RETURNED, CLOSED, CANCELLED] }
 *     responses:
 *       200:
 *         description: Paginated batches
 */
router.get(
  '/',
  authenticate,
  authorize(['SUPERADMIN', 'ADMIN', 'SUPERVISOR']),
  validateQuery(schemas.getAssignmentBatchesQuery),
  assignmentController.listAssignmentBatches
);

/*
 * Literal paths stay above '/:id', so they aren't read as a batch id.
 */

/**
 * @swagger
 * /assignments/meter-holders:
 *   get:
 *     summary: Every meter out with an installer right now
 *     description: >
 *       One row per held meter (ASSIGNED items of open METER batches), in one
 *       request, limited to the caller's discos. Not paginated.
 *     tags: [Assignments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: discoCode
 *         schema: { type: string }
 *       - in: query
 *         name: installerId
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Held meters
 */
router.get(
  '/meter-holders',
  authenticate,
  authorize(['SUPERADMIN', 'ADMIN', 'SUPERVISOR']),
  validateQuery(schemas.meterHoldersQuery),
  assignmentController.getMeterHolders
);

/**
 * @swagger
 * /assignments/meters:
 *   get:
 *     summary: List assigned meters
 *     description: >
 *       Meters currently held by default. status also takes USED, RETURNED and
 *       LOST (comma-separated) for dispatch history; a meter dispatched twice
 *       then appears once per dispatch.
 *     tags: [Assignments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: query, name: status, schema: { type: string, example: "ASSIGNED,USED" } }
 *       - { in: query, name: discoCode, schema: { type: string } }
 *       - { in: query, name: installerId, schema: { type: string, format: uuid } }
 *       - { in: query, name: phaseType, schema: { type: string, enum: [SINGLE PHASE, THREE PHASE] } }
 *       - { in: query, name: from, description: Assigned on or after (YYYY-MM-DD, Lagos), schema: { type: string } }
 *       - { in: query, name: to, description: Assigned on or before (YYYY-MM-DD, Lagos), schema: { type: string } }
 *       - { in: query, name: q, description: Part of a meter or SIM number, schema: { type: string } }
 *       - { in: query, name: page, schema: { type: integer, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, default: 20, maximum: 100 } }
 *     responses:
 *       200:
 *         description: Paginated assigned meters
 */
router.get(
  '/meters',
  authenticate,
  authorize(['SUPERADMIN', 'ADMIN', 'SUPERVISOR']),
  validateQuery(schemas.assignedMetersQuery),
  assignmentController.listAssignedMeters
);

/**
 * @swagger
 * /assignments/meters/export:
 *   get:
 *     summary: Export assigned meters as Excel or CSV
 *     description: >
 *       Same filters as GET /assignments/meters, plus format (xlsx by default).
 *       Excel has a Summary sheet with meters per installer by type. At most
 *       100,000 rows for Excel and 500,000 for CSV.
 *     tags: [Assignments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: query, name: format, schema: { type: string, enum: [xlsx, csv], default: xlsx } }
 *     responses:
 *       200:
 *         description: The file
 *       400:
 *         description: Too many rows
 *       404:
 *         description: Nothing matches
 */
router.get(
  '/meters/export',
  authenticate,
  authorize(['SUPERADMIN', 'ADMIN', 'SUPERVISOR']),
  validateQuery(schemas.assignedMetersQuery),
  assignmentController.exportAssignedMeters
);

/**
 * @swagger
 * /assignments/meters/search:
 *   post:
 *     summary: Bulk search meters by number
 *     description: >
 *       Send meterNumbers as JSON (up to 5,000) or upload an Excel/CSV file as
 *       "file". One result per number, in the order given: ASSIGNED (who holds
 *       it now), NOT_ASSIGNED (exists but isn't held; its last dispatch is
 *       shown) or NOT_FOUND (no such meter, or outside the caller's discos).
 *     tags: [Assignments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               meterNumbers: { type: array, items: { type: string }, example: ["0239110211103"] }
 *               discoCode: { type: string }
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file: { type: string, format: binary }
 *               discoCode: { type: string }
 *     responses:
 *       200:
 *         description: Results and a summary of counts
 *       400:
 *         description: No numbers, or more than 5,000
 */
router.post(
  '/meters/search',
  authenticate,
  authorize(['SUPERADMIN', 'ADMIN', 'SUPERVISOR']),
  upload.single('file'),
  validate(schemas.assignedMetersSearch),
  assignmentController.searchAssignedMeters
);

/**
 * @swagger
 * /assignments/meters/search/export:
 *   post:
 *     summary: Export bulk search results as Excel or CSV
 *     description: Same input as the search, plus format (xlsx by default). Returns exactly those results.
 *     tags: [Assignments]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: The file
 *       400:
 *         description: No numbers, or more than 5,000
 */
router.post(
  '/meters/search/export',
  authenticate,
  authorize(['SUPERADMIN', 'ADMIN', 'SUPERVISOR']),
  upload.single('file'),
  validate(schemas.assignedMetersSearch),
  assignmentController.exportAssignedMeterSearch
);

/**
 * @swagger
 * /assignments/{id}:
 *   get:
 *     summary: Get one batch with its items
 *     description: Items are meters for a METER batch and installation requests for an INSTALLATION batch.
 *     tags: [Assignments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Batch with items
 *       404:
 *         description: Assignment batch not found
 */
router.get(
  '/:id',
  authenticate,
  authorize(['SUPERADMIN', 'ADMIN', 'SUPERVISOR']),
  validateParams(schemas.idParam),
  assignmentController.getAssignmentBatch
);

module.exports = router;
