const express = require('express');
const { validate, validateQuery, validateParams, schemas } = require('../middleware/validation');
const { authenticate, authorize } = require('../middleware/auth');
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
  authorize(['SUPERADMIN', 'ADMIN']),
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
 *     responses:
 *       200:
 *         description: Meters returned
 */
router.post(
  '/meters/return',
  authenticate,
  authorize(['SUPERADMIN', 'ADMIN']),
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
  authorize(['SUPERADMIN', 'ADMIN']),
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
 *     responses:
 *       200:
 *         description: Installations unassigned
 */
router.post(
  '/installations/unassign',
  authenticate,
  authorize(['SUPERADMIN', 'ADMIN']),
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
  authorize(['SUPERADMIN', 'ADMIN']),
  validateQuery(schemas.getAssignmentBatchesQuery),
  assignmentController.listAssignmentBatches
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
  authorize(['SUPERADMIN', 'ADMIN']),
  validateParams(schemas.idParam),
  assignmentController.getAssignmentBatch
);

module.exports = router;
