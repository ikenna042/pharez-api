const FinanceRevenue = require('../models/FinanceRevenue');
const { allowedDiscoCodes } = require('../utils/discoAccess');
const { resolveRange } = require('../utils/financeFilters');
const { asyncHandler } = require('../middleware/errorHandler');

const CURRENCY = 'NGN';

/**
 * Disco codes the caller may see revenue for: null (every disco) for
 * SUPERADMIN. Sends a 403 and returns false when a requested discoCode is
 * outside them.
 */
const resolveFinanceDiscos = async (req, res, discoCode) => {
  const codes = await allowedDiscoCodes(req.user);
  if (codes && discoCode && !codes.includes(String(discoCode).toUpperCase())) {
    res.status(403).json({ success: false, message: `You don't have access to ${String(discoCode).toUpperCase()}` });
    return false;
  }
  return codes;
};

/**
 * Resolve the shared filters, or send a 400/403.
 *
 * Returns null once a response has been sent, so callers `if (!f) return;`.
 */
const resolveFilters = async (req, res) => {
  const q = req.validatedQuery || req.query;
  const range = resolveRange({ from: q.from, to: q.to, rangePreset: q.rangePreset });

  if (range.error) {
    res.status(400).json({ success: false, message: range.error });
    return null;
  }

  const discoCodes = await resolveFinanceDiscos(req, res, q.discoCode);
  if (discoCodes === false) return null;

  return {
    query: q,
    range,
    filters: {
      discoCode: q.discoCode,
      discoCodes,
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
  const resolved = await resolveFilters(req, res);
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
  const resolved = await resolveFilters(req, res);
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
  const resolved = await resolveFilters(req, res);
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
