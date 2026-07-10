const express = require('express');
const meterController = require('../controllers/meterController');
const { authenticate, authorize } = require('../middleware/auth');
const { validateQuery, schemas } = require('../middleware/validation');
const upload = require('../config/multer');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Meters
 *   description: Meter inventory management and Excel operations
 */

/**
 * @swagger
 * /meters/upload:
 *   post:
 *     summary: Upload meters from Excel file
 *     tags: [Meters]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: Excel file (.xlsx or .xls) with meter data
 *     responses:
 *       201:
 *         description: Meters uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Meters uploaded successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalRows:
 *                       type: integer
 *                       example: 100
 *                     created:
 *                       type: integer
 *                       example: 95
 *                     failed:
 *                       type: integer
 *                       example: 5
 *                     errors:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           row:
 *                             type: integer
 *                           meterNumber:
 *                             type: string
 *                           error:
 *                             type: string
 *       400:
 *         description: No file uploaded or validation error
 *       401:
 *         description: Authentication required
 *       500:
 *         description: Server error
 */
router.post('/upload', authenticate, authorize('SUPERADMIN', 'ADMIN'), upload.single('file'), meterController.uploadMeters);

/**
 * @swagger
 * /meters/template:
 *   get:
 *     summary: Download Excel template for meter upload
 *     tags: [Meters]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Excel template file
 *         content:
 *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
 *             schema:
 *               type: string
 *               format: binary
 *       401:
 *         description: Authentication required
 */
router.get('/template', authenticate, meterController.downloadMeterTemplate);

/**
 * @swagger
 * /meters/export:
 *   get:
 *     summary: Export meters to Excel
 *     tags: [Meters]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [AVAILABLE, INSTALLED, FAULTY, RETIRED]
 *         description: Filter by meter status
 *       - in: query
 *         name: phaseType
 *         schema:
 *           type: string
 *           enum: [SINGLE PHASE, THREE PHASE]
 *         description: Filter by phase type
 *     responses:
 *       200:
 *         description: Excel file with meter data
 *         content:
 *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: No meters found to export
 *       401:
 *         description: Authentication required
 */
router.get('/export', authenticate, authorize('SUPERADMIN', 'ADMIN'), meterController.exportMeters);

/**
 * @swagger
 * /meters:
 *   get:
 *     summary: Get all meters with pagination
 *     tags: [Meters]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 10
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [AVAILABLE, INSTALLED, FAULTY, RETIRED]
 *       - in: query
 *         name: phaseType
 *         schema:
 *           type: string
 *           enum: [SINGLE PHASE, THREE PHASE]
 *     responses:
 *       200:
 *         description: List of meters
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       meterNumber:
 *                         type: string
 *                       simNumber:
 *                         type: string
 *                       manufacturedDate:
 *                         type: string
 *                       meterMake:
 *                         type: string
 *                       model:
 *                         type: string
 *                       phaseType:
 *                         type: string
 *                       sgcNumber:
 *                         type: string
 *                       status:
 *                         type: string
 *                       uploadedAt:
 *                         type: string
 *                         format: date-time
 *                       installedAt:
 *                         type: string
 *                         format: date-time
 *                 pagination:
 *                   type: object
 *       401:
 *         description: Authentication required
 */
router.get('/', authenticate, authorize('SUPERADMIN', 'ADMIN', 'INSTALLER'), meterController.getMeters);

/**
 * @swagger
 * /meters/statistics:
 *   get:
 *     summary: Get meter inventory statistics
 *     tags: [Meters]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Meter statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalMeters:
 *                       type: integer
 *                       example: 1000
 *                     available:
 *                       type: integer
 *                       example: 750
 *                     installed:
 *                       type: integer
 *                       example: 200
 *                     faulty:
 *                       type: integer
 *                       example: 30
 *                     retired:
 *                       type: integer
 *                       example: 20
 *                     singlePhase:
 *                       type: integer
 *                       example: 600
 *                     threePhase:
 *                       type: integer
 *                       example: 400
 *       401:
 *         description: Authentication required
 */
router.get('/statistics', authenticate, authorize('SUPERADMIN', 'ADMIN'), meterController.getMeterStatistics);

/**
 * @swagger
 * /meters/{id}:
 *   get:
 *     summary: Get meter by ID
 *     tags: [Meters]
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
 *         description: Meter details
 *       404:
 *         description: Meter not found
 *       401:
 *         description: Authentication required
 */
router.get('/:id', authenticate, authorize('SUPERADMIN', 'ADMIN', 'INSTALLER'), meterController.getMeterById);

/**
 * @swagger
 * /meters/meter-number/{meterNumber}:
 *   get:
 *     summary: Get meter by meter number
 *     tags: [Meters]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: meterNumber
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Meter details
 *       404:
 *         description: Meter not found
 *       401:
 *         description: Authentication required
 */
router.get('/meter-number/:meterNumber', authenticate, authorize('SUPERADMIN', 'ADMIN', 'INSTALLER'), meterController.getMeterByMeterNumber);

/**
 * @swagger
 * /meters/{meterNumber}:
 *   delete:
 *     summary: Delete meter by meter number
 *     tags: [Meters]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: meterNumber
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Meter deleted successfully
 *       404:
 *         description: Meter not found
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 */
router.delete('/:meterNumber', authenticate, authorize('SUPERADMIN'), meterController.deleteMeter);

/**
 * @swagger
 * /meters/customer-requests/export:
 *   get:
 *     summary: Export customer requests to Excel
 *     tags: [Meters]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [INITIATED, PAID, COMPLETED]
 *         description: Filter by request status
 *     responses:
 *       200:
 *         description: Excel file with customer requests
 *         content:
 *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: No requests found to export
 *       401:
 *         description: Authentication required
 */
router.get('/customer-requests/export', authenticate, authorize('SUPERADMIN', 'ADMIN'), meterController.exportCustomerRequests);

module.exports = router;