const FinanceRevenue = require('../models/FinanceRevenue');
const { resolveRange } = require('../utils/financeFilters');
const { asyncHandler } = require('../middleware/errorHandler');

const CURRENCY = 'NGN';

/**
 * Resolve the shared filters, or send a 400.
 *
 * Returns null once a response has been sent, so callers `if (!f) return;`.
 */
const resolveFilters = (req, res) => {
  const q = req.validatedQuery || req.query;
  const range = resolveRange({ from: q.from, to: q.to, rangePreset: q.rangePreset });

  if (range.error) {
    res.status(400).json({ success: false, message: range.error });
    return null;
  }

  return {
    query: q,
    range,
    filters: {
      discoCode: q.discoCode,
      meterType: q.meterType,
      from: range.from,
      to: range.to,
      search: q.search
    }
  };
};

const describeRange = (range) => ({
  from: range.from ? range.from.toISOString() : null,
  to: range.to ? range.to.toISOString() : null,
  preset: range.preset
});

const getRevenueSummary = asyncHandler(async (req, res) => {
  const resolved = resolveFilters(req, res);
  if (!resolved) return;

  const summary = await FinanceRevenue.summary(resolved.filters);

  res.json({
    success: true,
    data: {
      currency: CURRENCY,
      range: describeRange(resolved.range),
      ...summary
    }
  });
});

const getRevenueBreakdown = asyncHandler(async (req, res) => {
  const resolved = resolveFilters(req, res);
  if (!resolved) return;

  const breakdown = await FinanceRevenue.breakdown(
    resolved.filters,
    resolved.query.groupBy || 'disco'
  );

  res.json({
    success: true,
    data: {
      currency: CURRENCY,
      range: describeRange(resolved.range),
      ...breakdown
    }
  });
});

const getRevenueTransactions = asyncHandler(async (req, res) => {
  const resolved = resolveFilters(req, res);
  if (!resolved) return;

  const { query } = resolved;
  const { transactions, totals, pagination } = await FinanceRevenue.transactions(resolved.filters, {
    page: Number(query.page || 1),
    limit: Number(query.limit || 20),
    sortBy: query.sortBy,
    sortOrder: query.sortOrder
  });

  res.json({
    success: true,
    data: transactions,
    // Totals for the whole filtered set, not just this page, so the UI can show
    // "page 1 of N — ₦X total" without a second request.
    meta: {
      currency: CURRENCY,
      range: describeRange(resolved.range),
      totals
    },
    pagination
  });
});

module.exports = {
  getRevenueSummary,
  getRevenueBreakdown,
  getRevenueTransactions
};
