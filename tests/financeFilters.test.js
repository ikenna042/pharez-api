const {
  GROUP_BY,
  resolveGroupBy,
  resolveSortBy,
  resolveSortOrder,
  resolveRangePreset,
  resolveRange
} = require('../src/utils/financeFilters');

// A Wednesday, so weekday maths is visible rather than accidentally right.
const NOW = new Date(2026, 8, 23, 14, 30, 0); // 23 Sep 2026, local time
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

describe('whitelists keep user input out of SQL', () => {
  it('resolves only known groupBy keys', () => {
    expect(resolveGroupBy('disco').column).toBe('disco_code');
    expect(resolveGroupBy('meterType').column).toBe('meter_type');
    expect(resolveGroupBy('month').label).toBe('period');
  });

  it('rejects anything not on the list, including injection attempts', () => {
    expect(resolveGroupBy('disco_code; DROP TABLE users')).toBeNull();
    expect(resolveGroupBy("amount) FROM users--")).toBeNull();
    expect(resolveGroupBy('__proto__')).toBeNull();
    expect(resolveGroupBy('constructor')).toBeNull();
    expect(resolveGroupBy(undefined)).toBeNull();
    expect(resolveGroupBy('')).toBeNull();
  });

  it('rejects unknown sort columns', () => {
    expect(resolveSortBy('amount')).toBe('amount');
    expect(resolveSortBy('amount; DELETE FROM meters')).toBeNull();
    expect(resolveSortBy('toString')).toBeNull();
  });

  it('only ever emits ASC or DESC', () => {
    expect(resolveSortOrder('asc')).toBe('ASC');
    expect(resolveSortOrder('ASC')).toBe('ASC');
    expect(resolveSortOrder('desc')).toBe('DESC');
    expect(resolveSortOrder('; DROP TABLE users')).toBe('DESC');
    expect(resolveSortOrder(undefined)).toBe('DESC');
  });

  it('emits no SQL fragment containing a semicolon or comment marker', () => {
    for (const { column } of Object.values(GROUP_BY)) {
      expect(column).not.toMatch(/;|--|\/\*/);
    }
  });
});

describe('range presets', () => {
  it('today is a single day', () => {
    const { from, to } = resolveRangePreset('today', NOW);
    expect(ymd(from)).toBe('2026-09-23');
    expect(ymd(to)).toBe('2026-09-24');
  });

  it('thisWeek starts on Monday, matching date_trunc(week)', () => {
    const { from, to } = resolveRangePreset('thisWeek', NOW); // Wed 23 Sep
    expect(ymd(from)).toBe('2026-09-21');
    expect(ymd(to)).toBe('2026-09-28');
    expect(from.getDay()).toBe(1);
  });

  it('thisWeek on a Sunday still belongs to the week that began on Monday', () => {
    const sunday = new Date(2026, 8, 27, 9, 0, 0);
    expect(ymd(resolveRangePreset('thisWeek', sunday).from)).toBe('2026-09-21');
  });

  it('thisMonth and thisYear span whole periods', () => {
    expect(ymd(resolveRangePreset('thisMonth', NOW).from)).toBe('2026-09-01');
    expect(ymd(resolveRangePreset('thisMonth', NOW).to)).toBe('2026-10-01');
    expect(ymd(resolveRangePreset('thisYear', NOW).from)).toBe('2026-01-01');
    expect(ymd(resolveRangePreset('thisYear', NOW).to)).toBe('2027-01-01');
  });

  it('thisMonth rolls the year over in December', () => {
    const december = new Date(2026, 11, 15, 12, 0, 0);
    expect(ymd(resolveRangePreset('thisMonth', december).to)).toBe('2027-01-01');
  });

  it('last30days covers 30 days inclusive of today', () => {
    const { from, to } = resolveRangePreset('last30days', NOW);
    expect(ymd(from)).toBe('2026-08-25');
    expect(ymd(to)).toBe('2026-09-24');
    expect(Math.round((to - from) / 86400000)).toBe(30);
  });

  it('ranges are half-open so adjacent periods tile without gap or overlap', () => {
    // This is what makes monthly buckets sum to the all-time total.
    const sep = resolveRangePreset('thisMonth', NOW);
    const oct = resolveRangePreset('thisMonth', new Date(2026, 9, 10));
    expect(sep.to.getTime()).toBe(oct.from.getTime());
  });

  it('returns null for an unknown preset', () => {
    expect(resolveRangePreset('lastFortnight', NOW)).toBeNull();
  });
});

describe('resolveRange', () => {
  it('returns open-ended when nothing is supplied', () => {
    expect(resolveRange({}, NOW)).toEqual({ from: null, to: null, preset: null });
  });

  it('expands a preset', () => {
    const r = resolveRange({ rangePreset: 'thisMonth' }, NOW);
    expect(ymd(r.from)).toBe('2026-09-01');
    expect(r.preset).toBe('thisMonth');
  });

  it('lets an explicit bound win over the preset rather than ignoring it', () => {
    const r = resolveRange({ rangePreset: 'thisYear', from: '2026-06-15' }, NOW);
    expect(ymd(r.from)).toBe('2026-06-15');
    expect(ymd(r.to)).toBe('2027-01-01'); // still the preset's end
  });

  it('accepts a from with no to, and a to with no from', () => {
    expect(resolveRange({ from: '2026-01-01' }, NOW).to).toBeNull();
    expect(resolveRange({ to: '2026-01-01' }, NOW).from).toBeNull();
  });

  it('rejects from >= to', () => {
    expect(resolveRange({ from: '2026-09-30', to: '2026-09-01' }, NOW).error).toMatch(/earlier/);
    expect(resolveRange({ from: '2026-09-01', to: '2026-09-01' }, NOW).error).toMatch(/earlier/);
  });

  it('rejects unparseable dates and unknown presets with a usable message', () => {
    expect(resolveRange({ from: 'not-a-date' }, NOW).error).toMatch(/from is not a valid date/);
    expect(resolveRange({ to: 'nonsense' }, NOW).error).toMatch(/to is not a valid date/);
    expect(resolveRange({ rangePreset: 'lastFortnight' }, NOW).error).toMatch(/Unknown rangePreset/);
  });
});
