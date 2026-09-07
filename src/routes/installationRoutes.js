const express = require('express');
const { validate, validateQuery, validateParams, schemas } = require('../middleware/validation');
const { authenticate, authorize } = require('../middleware/auth');
const installationController = require('../controllers/installationController');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Installations
 *   description: >
 *     Disco-agnostic installation requests: the admin view, the installer's own
 *     work, and the response sheet sent back to the disco.
 */

/*
 * Route order matters: every literal path is registered before '/:id', so
 * '/statistics', '/exports' and '/me/...' are not swallowed by the id matcher.
 */

/**
 * @swagger
 * /installations:
 *   get:
 *     summary: List installation requests
 *     tags: [Installations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: discoCode
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [PENDING, ASSIGNED, IN_PROGRESS, INSTALLED, EXPORTED, FAILED, CANCELLED] }
 *       - in: query
 *         name: installerId
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Paginated installation requests
 */
router.get(
  '/',
  authenticate,
  authorize(['SUPERADMIN', 'ADMIN']),
  validateQuery(schemas.getInstallationsQuery),
  installationController.getInstallations
);

/**
 * @swagger
 * /installations:
 *   post:
 *     summary: Manually add one pending installation
 *     tags: [Installations]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Installation request created
 *       400:
 *         description: Account already exists for this disco
 */
router.post(
  '/',
  authenticate,
  authorize(['SUPERADMIN', 'ADMIN']),
  validate(schemas.createInstallationRequest),
  installationController.createInstallationRequest
);

/**
 * @swagger
 * /installations/statistics:
 *   get:
 *     summary: Counts per status, optionally for one disco
 *     tags: [Installations]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Status counts
 */
router.get(
  '/statistics',
  authenticate,
  authorize(['SUPERADMIN', 'ADMIN']),
  validateQuery(schemas.installationStatsQuery),
  installationController.getInstallationStatistics
);

/**
 * @swagger
 * /installations/exports:
 *   get:
 *     summary: List generated response sheets
 *     tags: [Installations]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Paginated export batches
 */
router.get(
  '/exports',
  authenticate,
  authorize(['SUPERADMIN', 'ADMIN']),
  validateQuery(schemas.getExportBatchesQuery),
  installationController.listExportBatches
);

/**
 * @swagger
 * /installations/me/jobs:
 *   get:
 *     summary: The installations assigned to the calling installer
 *     tags: [Installations]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: The installer's own jobs
 */
router.get(
  '/me/jobs',
  authenticate,
  authorize(['INSTALLER']),
  validateQuery(schemas.getMyJobsQuery),
  installationController.getMyJobs
);

/**
 * @swagger
 * /installations/me/meters:
 *   get:
 *     summary: The meters currently in the calling installer's hands
 *     tags: [Installations]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: The installer's assigned meter stock
 */
router.get(
  '/me/meters',
  authenticate,
  authorize(['INSTALLER']),
  validateQuery(schemas.getMyMetersQuery),
  installationController.getMyMeters
);

/**
 * @swagger
 * /installations/export/{discoCode}:
 *   get:
 *     summary: Download a disco's response sheet
 *     description: >
 *       Generates the disco's exact column layout from its stored export template.
 *       With markExported=true the included rows move to EXPORTED in the same
 *       transaction that records the batch.
 *     tags: [Installations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: discoCode
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: markExported
 *         schema: { type: boolean, default: false }
 *       - in: query
 *         name: includeExported
 *         schema: { type: boolean, default: false }
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date }
 *     responses:
 *       200:
 *         description: XLSX response sheet
 *       404:
 *         description: Disco not found, or nothing to export
 */
router.get(
  '/export/:discoCode',
  authenticate,
  authorize(['SUPERADMIN', 'ADMIN']),
  validateParams(schemas.discoCodeParam),
  validateQuery(schemas.exportInstallationsQuery),
  installationController.exportInstallationResponse
);

/**
 * @swagger
 * /installations/export/{discoCode}/mark-sent:
 *   post:
 *     summary: Mark a generated export's rows as delivered
 *     tags: [Installations]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Rows marked as exported
 */
router.post(
  '/export/:discoCode/mark-sent',
  authenticate,
  authorize(['SUPERADMIN', 'ADMIN']),
  validateParams(schemas.discoCodeParam),
  validate(schemas.markExportSent),
  installationController.markExportSent
);

/**
 * @swagger
 * /installations/{id}/start:
 *   patch:
 *     summary: Mark one of your assigned jobs as started
 *     tags: [Installations]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Installation started
 *       400:
 *         description: Not assigned to you, or not in ASSIGNED state
 */
router.patch(
  '/:id/start',
  authenticate,
  authorize(['INSTALLER']),
  validateParams(schemas.idParam),
  installationController.startInstallation
);

/**
 * @swagger
 * /installations/{id}/report:
 *   post:
 *     summary: Report a completed installation
 *     description: >
 *       The meter named must currently be assigned to the calling installer and
 *       match the recommended phase. On success the request becomes INSTALLED and
 *       the meter becomes USED/INSTALLED in the same transaction.
 *     tags: [Installations]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [meterNumber]
 *             properties:
 *               meterNumber: { type: string, example: "0239110006909" }
 *               sealNumber: { type: string, example: "APLE0099123" }
 *               installationDate: { type: string, format: date }
 *               latitude: { type: number, example: 5.1066 }
 *               longitude: { type: number, example: 7.3667 }
 *               installationPhotoUrl: { type: string }
 *               discoSupervisor: { type: string }
 *               notes: { type: string }
 *     responses:
 *       200:
 *         description: Installation recorded
 *       400:
 *         description: Meter not assigned to you, phase mismatch, or illegal transition
 *       403:
 *         description: Installation is not assigned to you
 *       404:
 *         description: Installation or meter not found
 */
router.post(
  '/:id/report',
  authenticate,
  authorize(['INSTALLER']),
  validateParams(schemas.idParam),
  validate(schemas.reportInstallation),
  installationController.reportInstallation
);

/**
 * @swagger
 * /installations/{id}/fail:
 *   post:
 *     summary: Report a failed attempt
 *     description: The meter stays assigned to the installer so the job can be retried.
 *     tags: [Installations]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Failure recorded
 */
router.post(
  '/:id/fail',
  authenticate,
  authorize(['INSTALLER']),
  validateParams(schemas.idParam),
  validate(schemas.reportInstallationFailure),
  installationController.reportFailure
);

/**
 * @swagger
 * /installations/{id}/cancel:
 *   patch:
 *     summary: Cancel a pending or assigned installation
 *     tags: [Installations]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Installation cancelled
 */
router.patch(
  '/:id/cancel',
  authenticate,
  authorize(['SUPERADMIN', 'ADMIN']),
  validateParams(schemas.idParam),
  validate(schemas.cancelInstallation),
  installationController.cancelInstallation
);

/**
 * @swagger
 * /installations/{id}:
 *   get:
 *     summary: Get one installation request
 *     description: An installer may only read a job assigned to them.
 *     tags: [Installations]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Installation request
 *       403:
 *         description: Not assigned to you
 *       404:
 *         description: Not found
 */
router.get(
  '/:id',
  authenticate,
  authorize(['SUPERADMIN', 'ADMIN', 'INSTALLER']),
  validateParams(schemas.idParam),
  installationController.getInstallationById
);

module.exports = router;
