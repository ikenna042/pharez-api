/**
 * Shared, pure helpers for the finance endpoints: date-range presets and the
 * whitelists that keep user input out of SQL.
 *
 * Everything here is DB-free and side-effect-free so it can be unit tested
 * without a database connection.
 */

/**
 * Whitelists, not interpolation.
 *
 * `JedCustomerRequest.sum()` builds `SUM(${column})` by string interpolation
 * and is safe today only because its single caller passes a literal. Forwarding
 * a query parameter into that shape would be a live injection, so every
 * caller-supplied grouping or sort here is a KEY into these maps; the value is
 * the only thing that ever reaches SQL.
 */
const GROUP_BY = {
  disco: { column: 'disco_code', label: 'discoCode' },
  meterType: { column: 'meter_type', label: 'meterType' },
  day: { column: "to_char(date_trunc('day', revenue_at), 'YYYY-MM-DD')", label: 'period' },
  week: { column: "to_char(date_trunc('week', revenue_at), 'YYYY-MM-DD')", label: 'period' },
  month: { column: "to_char(date_trunc('month', revenue_at), 'YYYY-MM')", label: 'period' }
};

const SORT_BY = {
  revenueAt: 'revenue_at',
  amount: 'amount',
  discoCode: 'disco_code',
  customerName: 'customer_name'
};

const SORT_ORDER = { asc: 'ASC', desc: 'DESC' };

const RANGE_PRESETS = ['today', 'thisWeek', 'thisMonth', 'thisYear', 'last30days'];

/**
 * Own-property lookup only.
 *
 * A plain `MAP[key]` also finds inherited members, so `sortBy=toString` would
 * return Object.prototype.toString and `groupBy=constructor` the Object
 * constructor -- both of which would then be interpolated into SQL. The
 * whitelist has to mean "one of these exact keys", not "anything reachable".
 */
const own = (map, key) =>
  (typeof key === 'string' && Object.prototype.hasOwnProperty.call(map, key) ? map[key] : null);

const resolveGroupBy = (key) => own(GROUP_BY, key);
const resolveSortBy = (key) => own(SORT_BY, key);
const resolveSortOrder = (key) => own(SORT_ORDER, String(key || '').toLowerCase()) || 'DESC';

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/**
 * Turn a preset into a half-open [from, to) range in server-local time.
 *
 * Half-open deliberately: an inclusive end date would either drop everything
 * recorded after 00:00 on the final day, or need a fragile "end of day"
 * timestamp. `revenue_at >= from AND revenue_at < to` has neither problem and
 * makes adjacent periods tile exactly, so monthly buckets sum to the total.
 *
 * Weeks start Monday, matching Postgres date_trunc('week', ...).
 */
const resolveRangePreset = (preset, now = new Date()) => {
  const today = startOfDay(now);

  switch (preset) {
    case 'today':
      return { from: today, to: addDays(today, 1) };

    case 'thisWeek': {
      // getDay(): 0=Sunday. Shift so Monday is day 0.
      const mondayOffset = (today.getDay() + 6) % 7;
      const monday = addDays(today, -mondayOffset);
      return { from: monday, to: addDays(monday, 7) };
    }

    case 'thisMonth': {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: first, to: new Date(now.getFullYear(), now.getMonth() + 1, 1) };
    }

    case 'thisYear': {
      const first = new Date(now.getFullYear(), 0, 1);
      return { from: first, to: new Date(now.getFullYear() + 1, 0, 1) };
    }

    case 'last30days':
      return { from: addDays(today, -29), to: addDays(today, 1) };

    default:
      return null;
  }
};

/**
 * Reconcile an explicit from/to with an optional preset.
 *
 * An explicit bound always wins over the preset, so `rangePreset=thisMonth&from=...`
 * is not silently ignored. Returns { from, to, preset, error }; `error` is a
 * human-readable message the controller turns into a 400.
 */
const resolveRange = ({ from, to, rangePreset } = {}, now = new Date()) => {
  const preset = rangePreset ? resolveRangePreset(rangePreset, now) : null;

  if (rangePreset && !preset) {
    return { error: `Unknown rangePreset "${rangePreset}". Use one of: ${RANGE_PRESETS.join(', ')}` };
  }

  const resolvedFrom = from ? new Date(from) : (preset ? preset.from : null);
  const resolvedTo = to ? new Date(to) : (preset ? preset.to : null);

  if (resolvedFrom && Number.isNaN(resolvedFrom.getTime())) return { error: 'from is not a valid date' };
  if (resolvedTo && Number.isNaN(resolvedTo.getTime())) return { error: 'to is not a valid date' };

  if (resolvedFrom && resolvedTo && resolvedFrom >= resolvedTo) {
    return { error: 'from must be earlier than to' };
  }

  return {
    from: resolvedFrom,
    to: resolvedTo,
    preset: rangePreset || null
  };
};

module.exports = {
  GROUP_BY,
  SORT_BY,
  RANGE_PRESETS,
  resolveGroupBy,
  resolveSortBy,
  resolveSortOrder,
  resolveRangePreset,
  resolveRange
};
