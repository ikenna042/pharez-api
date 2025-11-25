const express = require('express');
const jedController = require('../controllers/jedController');
const { validate, validateQuery, schemas } = require('../middleware/validation');
const { apiKeyAuth } = require('../middleware/apiKeyAuth');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: JED Integration
 *   description: External JED meter installation and payment integration
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     JedCustomerRequest:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           example: 1
 *         accountNumber:
 *           type: string
 *           example: "477014"
 *         custNames:
 *           type: string
 *           example: "ABUTU AUGUSTINE"
 *         gsm:
 *           type: string
 *           example: "+2348036233685"
 *         email:
 *           type: string
 *           example: "customer@example.com"
 *         address:
 *           type: string
 *           example: "UPHILLS BRIGHTWAY RUKUBA ROAD"
 *         meterRecommended:
 *           type: string
 *           enum: [Single Phase, Three Phase]
 *           example: "Three Phase"
 *         discoCode:
 *           type: string
 *           example: "JED001"
 *         requestRef:
 *           type: string
 *           example: "REF123456"
 *         region:
 *           type: string
 *           example: "DILIMI"
 *         rrr:
 *           type: string
 *           example: "120799142825"
 *         amount:
 *           type: number
 *           example: 67000
 *         orderId:
 *           type: string
 *           example: "1633177984000"
 *         status:
 *           type: string
 *           enum: [INITIATED, PAID, COMPLETED]
 *           example: "INITIATED"
 *         meterType:
 *           type: string
 *           example: "Three Phase"
 *         sealNo:
 *           type: string
 *           example: "9900"
 *         meterNo:
 *           type: string
 *           example: "01234567678898"
 *         dateRequested:
 *           type: string
 *           format: date-time
 *         datePaid:
 *           type: string
 *           format: date-time
 *         dateCompleted:
 *           type: string
 *           format: date-time
 */

/**
 * @swagger
 * /external/jed/generate-ref:
 *   post:
 *     security:
 *       - ApiKeyAuth: []
 *     summary: Generate Remita payment reference for meter installation
 *     tags: [JED Integration]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - accountNumber
 *               - custNames
 *               - gsm
 *               - email
 *               - address
 *               - meterRecommended
 *               - discoCode
 *             properties:
 *               accountNumber:
 *                 type: string
 *                 description: Customer account number
 *                 example: "477014"
 *               custNames:
 *                 type: string
 *                 description: Customer full name
 *                 example: "ABUTU AUGUSTINE"
 *               gsm:
 *                 type: string
 *                 description: Customer phone number
 *                 example: "+2348036233685"
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Customer email address
 *                 example: "customer@example.com"
 *               address:
 *                 type: string
 *                 description: Customer address
 *                 example: "UPHILLS BRIGHTWAY RUKUBA ROAD"
 *               meterRecommended:
 *                 type: string
 *                 enum: [Single Phase, Three Phase]
 *                 description: Type of meter recommended
 *                 example: "Three Phase"
 *               discoCode:
 *                 type: string
 *                 description: Distribution company code
 *                 example: "JED001"
 *               requestRef:
 *                 type: string
 *                 description: Optional request reference
 *                 example: "REF123456"
 *               region:
 *                 type: string
 *                 description: Customer region
 *                 example: "DILIMI"
 *     responses:
 *       201:
 *         description: Payment reference generated successfully
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
 *                   example: "Payment reference generated successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     statuscode:
 *                       type: string
 *                       example: "025"
 *                     RRR:
 *                       type: string
 *                       example: "120799142825"
 *                     status:
 *                       type: string
 *                       example: "Payment Reference generated"
 *                     gateway:
 *                       type: string
 *                       example: "Remita"
 *                     accountNumber:
 *                       type: string
 *                       example: "477014"
 *                     amount:
 *                       type: string
 *                       example: "10000"
 *                     orderId:
 *                       type: string
 *                       example: "1633177984000"
 *       400:
 *         description: Validation error or request already exists
 *         content:
 *           application/json:
 *             schema:
 *               oneOf:
 *                 - $ref: '#/components/schemas/ValidationError'
 *                 - type: object
 *                   properties:
 *                     success:
 *                       type: boolean
 *                       example: false
 *                     message:
 *                       type: string
 *                       example: "Request already exists for account number 477014"
 *                     data:
 *                       type: object
 *                       properties:
 *                         rrr:
 *                           type: string
 *                         status:
 *                           type: string
 *                         accountNumber:
 *                           type: string
 *       500:
 *         description: Failed to generate payment reference
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/generate-ref', apiKeyAuth, validate(schemas.generateRef), jedController.generateRef);

/**
 * @swagger
 * /external/jed/confirm-payment:
 *   post:
 *     summary: Confirm payment with JED after customer pays via Remita
 *     tags: [JED Integration]
 *     description: This endpoint notifies JED that payment has been received and retrieves installation details
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - accountNumber
 *             properties:
 *               accountNumber:
 *                 type: string
 *                 description: Customer account number
 *                 example: "477014"
 *     responses:
 *       200:
 *         description: Payment confirmed successfully
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
 *                   example: "Payment confirmed successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     accountNumber:
 *                       type: string
 *                       example: "477014"
 *                     status:
 *                       type: string
 *                       example: "PAID"
 *                     pendingInstallation:
 *                       type: object
 *                       properties:
 *                         applicantName:
 *                           type: string
 *                           example: "ABUTU AUGUSTINE"
 *                         address:
 *                           type: string
 *                           example: "UPHILLS BRIGHTWAY RUKUBA ROAD"
 *                         phone1:
 *                           type: string
 *                           example: "008036233685"
 *                         phone2:
 *                           type: string
 *                         area:
 *                           type: string
 *                           example: "DILIMI"
 *                         feeder:
 *                           type: string
 *                           example: "RUKUBA ROAD"
 *                         dtCode:
 *                           type: string
 *                           example: "JO-01-53-5B-75-07"
 *                         meterType:
 *                           type: string
 *                           example: "Three Phase"
 *                         pendingSince:
 *                           type: string
 *                           format: date-time
 *       400:
 *         description: Payment already confirmed or validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: No request found for account number
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Failed to confirm payment with JED
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/confirm-payment', validate(schemas.confirmPayment), jedController.confirmPayment);

/**
 * @swagger
 * /external/jed/complete-installation:
 *   post:
 *     security:
 *       - bearerAuth: []
 *     summary: Complete meter installation and notify JED
 *     tags: [JED Integration]
 *     description: Send installation details to JED after meter has been installed
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - sealNo
 *               - meterNo
 *               - accountNumber
 *             properties:
 *               sealNo:
 *                 type: string
 *                 description: Seal number of installed meter
 *                 example: "9900"
 *               meterNo:
 *                 type: string
 *                 description: Meter number (must exist in meters table)
 *                 example: "01234567678898"
 *               accountNumber:
 *                 type: string
 *                 description: Customer account number
 *                 example: "477014"
 *     responses:
 *       200:
 *         description: Installation completed successfully
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
 *                   example: "Installation completed successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     accountNumber:
 *                       type: string
 *                       example: "477014"
 *                     sealNo:
 *                       type: string
 *                       example: "9900"
 *                     meterNo:
 *                       type: string
 *                       example: "01234567678898"
 *                     status:
 *                       type: string
 *                       example: "COMPLETED"
 *                     dateCompleted:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Validation error, payment not confirmed, meter type mismatch, or already completed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Request or meter not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Failed to send installation details to JED
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/complete-installation', authenticate, validate(schemas.completeInstallation), jedController.completeInstallation);

/**
 * @swagger
 * /external/jed/remita/webhook:
 *   post:
 *     summary: Remita webhook endpoint (array of webhook events)
 *     tags: [JED Integration]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: array
 *             items:
 *               type: object
 *               properties:
 *                 rrr:
 *                   type: string
 *                 orderRef:
 *                   type: string
 *     responses:
 *       200:
 *         description: Plain text response 'Ok' or 'Not Ok' expected by Remita
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *               example: Ok
 */
router.post('/remita/webhook', jedController.remitaWebhook);

/**
 * @swagger
 * /external/jed/requests/{accountNumber}:
 *   get:
 *     summary: Get single customer request by account number
 *     tags: [JED Integration]
 *     parameters:
 *       - in: path
 *         name: accountNumber
 *         required: true
 *         schema:
 *           type: string
 *         description: Customer account number
 *         example: "477014"
 *     responses:
 *       200:
 *         description: Customer request retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/JedCustomerRequest'
 *       404:
 *         description: No request found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 * 
 */
/**
 * @swagger
 * /external/jed/requests/export:
 *   get:
 *     summary: Export customer requests to Excel (.xlsx)
 *     tags: [JED Integration]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number (ignored when exportAll=true)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 10000
 *         description: Number of records per page (use large number to export more rows)
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [INITIATED, PAID, COMPLETED]
 *         description: Filter by status
 *       - in: query
 *         name: exportAll
 *         schema:
 *           type: string
 *           enum: ['true','false']
 *         description: If set to 'true', export all matching requests ignoring pagination
 *     responses:
 *       200:
 *         description: Excel file (.xlsx) download
 *         content:
 *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
 *             schema:
 *               type: string
 *               format: binary
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - insufficient permissions
 */
router.get('/requests/export', authenticate, authorize(['SUPERADMIN','ADMIN']), validateQuery(schemas.getRequestsQuery), jedController.getRequestsExport);
/**
 * @swagger
 * /external/jed/requests/installer:
 *   get:
 *     summary: Get customer requests for installers (non-sensitive fields only)
 *     tags: [JED Integration]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 10
 *         description: Number of records per page
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [INITIATED, PAID, COMPLETED]
 *         description: Filter by status
 *     responses:
 *       200:
 *         description: Customer requests retrieved successfully (sensitive fields removed)
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
 *                       accountNumber:
 *                         type: string
 *                       custNames:
 *                         type: string
 *                       gsm:
 *                         type: string
 *                       email:
 *                         type: string
 *                       address:
 *                         type: string
 *                       meterRecommended:
 *                         type: string
 *                       discoCode:
 *                         type: string
 *                       requestRef:
 *                         type: string
 *                       region:
 *                         type: string
 *                       status:
 *                         type: string
 *                       meterType:
 *                         type: string
 *                       applicantName:
 *                         type: string
 *                       phone1:
 *                         type: string
 *                       dateRequested:
 *                         type: string
 *                         format: date-time
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     currentPage:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
 *                     totalCount:
 *                       type: integer
 *                     hasNext:
 *                       type: boolean
 *                     hasPrev:
 *                       type: boolean
 *       401:
 *         description: Unauthorized - missing or invalid token
 *       403:
 *         description: Forbidden - insufficient permissions (INSTALLER required)
 */
router.get('/requests/installer', authenticate, authorize(['INSTALLER']), validateQuery(schemas.getRequestsQuery), jedController.getRequestsForInstaller);
router.get('/requests/:accountNumber', authenticate, jedController.getRequest);

/**
 * @swagger
 * /external/jed/requests:
 *   get:
 *     summary: Get all customer requests with pagination
 *     tags: [JED Integration]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 10
 *         description: Number of records per page
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [INITIATED, PAID, COMPLETED]
 *         description: Filter by status
 *     responses:
 *       200:
 *         description: Customer requests retrieved successfully
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
 *                     $ref: '#/components/schemas/JedCustomerRequest'
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     currentPage:
 *                       type: integer
 *                       example: 1
 *                     totalPages:
 *                       type: integer
 *                       example: 5
 *                     totalCount:
 *                       type: integer
 *                       example: 50
 *                     hasNext:
 *                       type: boolean
 *                       example: true
 *                     hasPrev:
 *                       type: boolean
 *                       example: false
 */
router.get('/requests', authenticate, authorize(['SUPERADMIN','ADMIN']), validateQuery(schemas.getRequestsQuery), jedController.getAllRequests);


/**
 * @swagger
 * /external/jed/requests/status/{status}:
 *   get:
 *     summary: Get customer requests by status
 *     tags: [JED Integration]
 *     parameters:
 *       - in: path
 *         name: status
 *         required: true
 *         schema:
 *           type: string
 *           enum: [INITIATED, PAID, COMPLETED]
 *         description: Request status to filter by
 *         example: "PAID"
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 10
 *         description: Number of records per page
 *     responses:
 *       200:
 *         description: Customer requests retrieved successfully
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
 *                     $ref: '#/components/schemas/JedCustomerRequest'
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     currentPage:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
 *                     totalCount:
 *                       type: integer
 *                     hasNext:
 *                       type: boolean
 *                     hasPrev:
 *                       type: boolean
 *       400:
 *         description: Invalid status
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/requests/status/:status', authenticate, authorize(['SUPERADMIN','ADMIN']), validateQuery(schemas.getRequestsQuery), jedController.getRequestsByStatus);

/**
 * @swagger
 * /external/jed/payments:
 *   get:
 *     summary: Get payments (paid or completed) with optional date range and presets
 *     tags: [JED Integration]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Number of records per page
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [PAID, COMPLETED]
 *         description: Filter by status
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: ISO start date for filtering (inclusive)
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: ISO end date for filtering (inclusive)
 *       - in: query
 *         name: rangePreset
 *         schema:
 *           type: string
 *           enum: [today, thisMonth, thisYear]
 *         description: Convenience presets for common date ranges
 *     responses:
 *       200:
 *         description: Payments retrieved successfully
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
 *                       custNames:
 *                         type: string
 *                       accountNumber:
 *                         type: string
 *                       amount:
 *                         type: number
 *                       meterType:
 *                         type: string
 *                       datePaid:
 *                         type: string
 *                         format: date-time
 *                       dateCompleted:
 *                         type: string
 *                         format: date-time
 *                       status:
 *                         type: string
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     currentPage:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
 *                     totalCount:
 *                       type: integer
 *                     hasNext:
 *                       type: boolean
 *                     hasPrev:
 *                       type: boolean
 *       401:
 *         description: Unauthorized - missing or invalid token
 *       403:
 *         description: Forbidden - insufficient permissions
 */
router.get('/payments', authenticate, authorize(['SUPERADMIN','ADMIN']), validateQuery(schemas.getPaymentsQuery), jedController.getPayments);


module.exports = router;