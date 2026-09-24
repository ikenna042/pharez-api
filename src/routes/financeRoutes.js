const express = require('express');
const { validateQuery, schemas } = require('../middleware/validation');
const { authenticate, authorize } = require('../middleware/auth');
const financeController = require('../controllers/financeController');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Finance
 *   description: >
 *     Revenue across every disco. Recognition differs per disco: JED counts
 *     once Remita confirms the customer's payment, Aba Power counts once the
 *     installation is completed. Both are valued from a price frozen onto the
 *     record, so past periods do not change when the price book is edited.
 */

/**
 * @swagger
 * /finance/revenue/summary:
 *   get:
 *     summary: Total revenue, with a per-disco split
 *     description: >
 *       `dataQuality.estimatedAmount` is revenue valued at a later price than the
 *       one in force when the work completed (rows backfilled before pricing was
 *       captured). `missingAmountCount` is completed work with no price at all.
 *       Surface both rather than presenting the total as exact.
 *     tags: [Finance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: discoCode
 *         schema: { type: string }
 *         example: ABA_POWER
 *       - in: query
 *         name: meterType
 *         schema: { type: string, enum: [SINGLE PHASE, THREE PHASE] }
 *       - in: query
 *         name: rangePreset
 *         schema: { type: string, enum: [today, thisWeek, thisMonth, thisYear, last30days] }
 *       - in: query
 *         name: from
 *         description: Inclusive lower bound. Overrides rangePreset.
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: to
 *         description: Exclusive upper bound. Overrides rangePreset.
 *         schema: { type: string, format: date }
 *     responses:
 *       200:
 *         description: Revenue totals
 *       400:
 *         description: Invalid range (for example from on or after to)
 */
router.get(
  '/revenue/summary',
  authenticate,
  authorize(['SUPERADMIN', 'ADMIN']),
  validateQuery(schemas.financeRevenueQuery),
  financeController.getRevenueSummary
);

/**
 * @swagger
 * /finance/revenue/breakdown:
 *   get:
 *     summary: Revenue grouped for charts and tables
 *     description: >
 *       Period buckets are half-open and tile exactly, so monthly rows sum to the
 *       same figure the summary reports for the same filters.
 *     tags: [Finance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: groupBy
 *         schema: { type: string, enum: [disco, meterType, day, week, month], default: disco }
 *       - in: query
 *         name: discoCode
 *         schema: { type: string }
 *       - in: query
 *         name: meterType
 *         schema: { type: string, enum: [SINGLE PHASE, THREE PHASE] }
 *       - in: query
 *         name: rangePreset
 *         schema: { type: string, enum: [today, thisWeek, thisMonth, thisYear, last30days] }
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date }
 *     responses:
 *       200:
 *         description: Grouped revenue rows
 *       400:
 *         description: Unsupported groupBy, or an invalid range
 */
router.get(
  '/revenue/breakdown',
  authenticate,
  authorize(['SUPERADMIN', 'ADMIN']),
  validateQuery(schemas.financeBreakdownQuery),
  financeController.getRevenueBreakdown
);

/**
 * @swagger
 * /finance/revenue/transactions:
 *   get:
 *     summary: The individual records behind the totals
 *     description: >
 *       `dateBasis` names the column that supplied `revenueAt`. JED rows can
 *       reach CONFIRMED without ever recording date_paid, so the query falls back
 *       to date_completed then date_requested; without that, dated reports would
 *       drop real revenue that the all-time total still counted.
 *     tags: [Finance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20, maximum: 100 }
 *       - in: query
 *         name: search
 *         description: Matches account number or customer name
 *         schema: { type: string }
 *       - in: query
 *         name: sortBy
 *         schema: { type: string, enum: [revenueAt, amount, discoCode, customerName], default: revenueAt }
 *       - in: query
 *         name: sortOrder
 *         schema: { type: string, enum: [asc, desc], default: desc }
 *       - in: query
 *         name: discoCode
 *         schema: { type: string }
 *       - in: query
 *         name: meterType
 *         schema: { type: string, enum: [SINGLE PHASE, THREE PHASE] }
 *       - in: query
 *         name: rangePreset
 *         schema: { type: string, enum: [today, thisWeek, thisMonth, thisYear, last30days] }
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date }
 *     responses:
 *       200:
 *         description: Paginated revenue records, with totals for the whole filtered set
 *       400:
 *         description: Invalid range or sort field
 */
router.get(
  '/revenue/transactions',
  authenticate,
  authorize(['SUPERADMIN', 'ADMIN']),
  validateQuery(schemas.financeTransactionsQuery),
  financeController.getRevenueTransactions
);

module.exports = router;
