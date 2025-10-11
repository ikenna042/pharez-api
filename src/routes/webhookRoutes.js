const express = require('express');
const webhookController = require('../controllers/webhookController');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Webhooks
 *   description: External webhook endpoints (No authentication required)
 */

/**
 * @swagger
 * /webhooks/remita/payment:
 *   post:
 *     summary: Remita payment webhook notification
 *     tags: [Webhooks]
 *     description: |
 *       Receives payment notifications from Remita and automatically confirms payment with JED.
 *       This endpoint should be configured in your Remita merchant dashboard.
 *       
 *       **Webhook URL to configure in Remita:**
 *       `https://yourdomain.com/api/v1/webhooks/remita/payment`
 *       
 *       **Process Flow:**
 *       1. Remita sends payment notification
 *       2. System finds customer request by RRR
 *       3. Validates payment details
 *       4. Confirms payment with JED automatically
 *       5. Updates customer request status to PAID
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
 *                   example: "110002071256"
 *                 channel:
 *                   type: string
 *                   example: "CARDPAYMENT"
 *                 billerName:
 *                   type: string
 *                   example: "SYSTEMSPECS"
 *                 amount:
 *                   type: number
 *                   example: 200.0
 *                 transactiondate:
 *                   type: string
 *                   example: "2020-12-20 00:00:00"
 *                 debitdate:
 *                   type: string
 *                   example: "2020-12-20 11:17:03"
 *                 bank:
 *                   type: string
 *                   example: "232"
 *                 branch:
 *                   type: string
 *                 serviceTypeId:
 *                   type: string
 *                   example: "2020978"
 *                 orderRef:
 *                   type: string
 *                   example: "6954148807"
 *                 orderId:
 *                   type: string
 *                   example: "6954148807"
 *                 payerName:
 *                   type: string
 *                   example: "Test Test"
 *                 payerPhoneNumber:
 *                   type: string
 *                   example: "07055542122"
 *                 payerEmail:
 *                   type: string
 *                   example: "test@test.com.ng"
 *                 type:
 *                   type: string
 *                   example: "PY"
 *                   description: Transaction type (PY = Payment)
 *                 chargeFee:
 *                   type: number
 *                   example: 101.61
 *                 paymentDescription:
 *                   type: string
 *                   example: "SYSTEMSPECS WALLET"
 *           example:
 *             - rrr: "110002071256"
 *               channel: "CARDPAYMENT"
 *               billerName: "SYSTEMSPECS"
 *               amount: 10000.0
 *               transactiondate: "2024-10-11 00:00:00"
 *               debitdate: "2024-10-11 11:17:03"
 *               bank: "232"
 *               serviceTypeId: "4430731"
 *               orderRef: "1728648000000"
 *               orderId: "1728648000000"
 *               payerName: "ABUTU AUGUSTINE"
 *               payerPhoneNumber: "08036233685"
 *               payerEmail: "customer@example.com"
 *               type: "PY"
 *               chargeFee: 150.0
 *               paymentDescription: "Payment for Meter"
 *     responses:
 *       200:
 *         description: Webhook processed successfully
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
 *                   example: "Webhook processed"
 *                 totalNotifications:
 *                   type: integer
 *                   example: 1
 *                 processed:
 *                   type: integer
 *                   example: 1
 *                 failed:
 *                   type: integer
 *                   example: 0
 *                 results:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       rrr:
 *                         type: string
 *                       accountNumber:
 *                         type: string
 *                       success:
 *                         type: boolean
 *                       message:
 *                         type: string
 *                       status:
 *                         type: string
 *                       jedConfirmed:
 *                         type: boolean
 *             examples:
 *               success:
 *                 value:
 *                   success: true
 *                   message: "Webhook processed"
 *                   totalNotifications: 1
 *                   processed: 1
 *                   failed: 0
 *                   results:
 *                     - rrr: "110002071256"
 *                       accountNumber: "477014"
 *                       success: true
 *                       message: "Payment confirmed successfully via webhook"
 *                       status: "PAID"
 *                       jedConfirmed: true
 *               partial_success:
 *                 value:
 *                   success: true
 *                   message: "Webhook processed"
 *                   totalNotifications: 3
 *                   processed: 2
 *                   failed: 1
 *                   results:
 *                     - rrr: "110002071256"
 *                       accountNumber: "477014"
 *                       success: true
 *                       message: "Payment confirmed successfully via webhook"
 *                       status: "PAID"
 *                       jedConfirmed: true
 *                     - rrr: "110002071257"
 *                       accountNumber: "477015"
 *                       success: true
 *                       message: "Payment confirmed successfully via webhook"
 *                       status: "PAID"
 *                       jedConfirmed: true
 *                     - rrr: "110002071258"
 *                       success: false
 *                       message: "No customer request found for RRR: 110002071258"
 *       400:
 *         description: Invalid payload format
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Invalid payload format. Expected an array of payment notifications"
 */
router.post('/remita/payment', webhookController.handleRemitaWebhook);

/**
 * @swagger
 * /webhooks/verify-payment/{rrr}:
 *   get:
 *     summary: Verify payment status by RRR
 *     tags: [Webhooks]
 *     description: Check the payment status of a customer request using the Remita RRR
 *     parameters:
 *       - in: path
 *         name: rrr
 *         required: true
 *         schema:
 *           type: string
 *         description: Remita Retrieval Reference (RRR)
 *         example: "110002071256"
 *     responses:
 *       200:
 *         description: Payment status retrieved successfully
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
 *                     rrr:
 *                       type: string
 *                     accountNumber:
 *                       type: string
 *                     custNames:
 *                       type: string
 *                     amount:
 *                       type: string
 *                     status:
 *                       type: string
 *                     dateRequested:
 *                       type: string
 *                       format: date-time
 *                     datePaid:
 *                       type: string
 *                       format: date-time
 *                     orderRef:
 *                       type: string
 *       404:
 *         description: No customer request found for the provided RRR
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "No customer request found for RRR: 110002071256"
 *       400:
 *         description: RRR is required
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "RRR is required"
 */
router.get('/verify-payment/:rrr', webhookController.verifyRemitaPayment);

module.exports = router;