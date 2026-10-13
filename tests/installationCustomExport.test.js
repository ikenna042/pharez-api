const Service = require('../src/services/installationCustomExportService');
const { FIELDS, DATE_PRESETS } = require('../src/config/installationExportFields');

const admin = { id: 'a', role: 'ADMIN' };
const supervisor = { id: 's', role: 'SUPERVISOR' };

const validSpec = (body, user = admin) => {
  const result = Service.validate(body, user);
  if (result.errors) throw new Error(result.errors.join('; '));
  return result.spec;
};

describe('custom export: validate', () => {
  it('uses the default columns when none are given', () => {
    const spec = validSpec({});
    expect(spec.format).toBe('xlsx');
    expect(spec.columns).toEqual(Object.keys(FIELDS).filter((k) => FIELDS[k].default));
  });

  it('rejects inherited and unknown keys rather than reaching for them', () => {
    const { errors } = Service.validate({ columns: ['constructor', 'toString', 'nope'] }, admin);
    expect(errors).toEqual([
      'columns: unknown field "constructor"',
      'columns: unknown field "toString"',
      'columns: unknown field "nope"'
    ]);
  });

  it('keeps contact and money fields from a supervisor', () => {
    const { errors } = Service.validate({
      columns: ['customerPhone', 'revenueAmount'],
      groupBy: ['installerName'],
      metrics: ['revenueSum']
    }, supervisor);
    expect(errors).toEqual(expect.arrayContaining([
      'columns: "customerPhone" is not available to your role',
      'columns: "revenueAmount" is not available to your role',
      'metrics[0]: "revenueSum" is not available to your role'
    ]));
    expect(Service.describe(supervisor).fields.map((f) => f.key)).not.toContain('customerPhone');
    expect(Service.describe(admin).fields.map((f) => f.key)).toContain('customerPhone');
  });

  it('reports every bad filter at once', () => {
    const { errors } = Service.validate({
      filters: [
        { field: 'status', op: 'contains', value: 'X' },
        { field: 'status', op: 'in', value: ['DONE'] },
        { field: 'reportedAt', op: 'between', value: ['2026-10-12', '2026-10-01'] },
        { field: 'reportedAt', op: 'preset', value: 'forever' },
        { field: 'hasPicture', op: 'eq', value: 'yes' },
        { field: 'latitude', op: 'gte', value: 'north' }
      ]
    }, admin);
    expect(errors).toHaveLength(6);
    expect(errors[0]).toMatch(/does not support "contains"/);
    expect(errors[1]).toMatch(/unknown value\(s\) DONE/);
    expect(errors[2]).toMatch(/from must not be after to/);
    expect(errors[3]).toMatch(/value must be one of: today/);
    expect(errors[4]).toMatch(/true or false/);
    expect(errors[5]).toMatch(/a number/);
  });

  it('parses date buckets and defaults metrics to count', () => {
    const spec = validSpec({ groupBy: ['installerName', 'reportedAt:week', 'installationDate'] });
    expect(spec.groupBy).toEqual([
      { key: 'installerName', bucket: null },
      { key: 'reportedAt', bucket: 'week' },
      { key: 'installationDate', bucket: 'day' }
    ]);
    expect(spec.metrics).toEqual(['count']);
  });

  it('refuses buckets on non-dates, ungroupable fields and metrics without groupBy', () => {
    const { errors } = Service.validate({ groupBy: ['status:week', 'accountNumber'], metrics: ['count'] }, admin);
    expect(errors).toEqual(expect.arrayContaining([
      'groupBy[0]: only date fields take a bucket (":day", ":week"...)',
      'groupBy[1]: "accountNumber" can\'t be grouped on',
      'metrics need groupBy'
    ]));
  });
});

describe('custom export: SQL', () => {
  it('binds every value and scopes to the discos', () => {
    const spec = validSpec({
      filters: [
        { field: 'status', op: 'in', value: ['INSTALLED', 'EXPORTED'] },
        { field: 'feederName', op: 'contains', value: "50%_off'; DROP TABLE users;--" },
        { field: 'reportedAt', op: 'between', value: ['2026-10-01', '2026-10-12'] },
        { field: 'installationPhotoUrl', op: 'isBlank' },
        { field: 'hasGps', op: 'eq', value: true }
      ]
    });
    const { where, params } = Service.buildWhere(spec, [1]);
    expect(params).toEqual([[1], ['INSTALLED', 'EXPORTED'], "%50\\%\\_off'; DROP TABLE users;--%", '2026-10-01', '2026-10-12', true]);
    expect(where).not.toMatch(/DROP TABLE/);
    expect(where).toContain('r.disco_id = ANY($1::int[])');
    expect(where).toContain("(r.reported_at AT TIME ZONE 'Africa/Lagos')::date BETWEEN $4::date AND $5::date");
    expect(where).toContain("NULLIF(TRIM((r.installation_photo_url)::text), '') IS NULL");
  });

  it('applies no disco filter for SUPERADMIN scope (null)', () => {
    const { where, params } = Service.buildWhere(validSpec({}), null);
    expect(where).toBe('');
    expect(params).toEqual([]);
  });

  it('compares free text case-insensitively and lists exactly', () => {
    const spec = validSpec({ filters: [{ field: 'region', op: 'in', value: [' Bayelsa ', 'ABIA'] }] });
    const { where, params } = Service.buildWhere(spec, null);
    expect(where).toContain('LOWER(TRIM((r.region)::text)) = ANY($1::text[])');
    expect(params).toEqual([['bayelsa', 'abia']]);
  });

  it('turns presets into whole Lagos days', () => {
    const spec = validSpec({ filters: [{ field: 'installationDate', op: 'preset', value: 'thisMonth' }] });
    const { where } = Service.buildWhere(spec, null);
    expect(where).toContain(`r.installation_date >= ${DATE_PRESETS.thisMonth[0]}`);
    expect(where).toContain(`r.installation_date < ${DATE_PRESETS.thisMonth[1]}`);
  });

  it('groups by bucketed dates and orders by the groups', () => {
    const spec = validSpec({ groupBy: ['installerName', 'reportedAt:month'], metrics: ['count', 'withPicture'] });
    const { text } = Service.groupsQuery(spec, null);
    expect(text).toContain("to_char(date_trunc('month', (r.reported_at AT TIME ZONE 'Africa/Lagos')::date), 'YYYY-MM') AS g1");
    expect(text).toContain('COUNT(*) AS m0');
    expect(text).toMatch(/GROUP BY 1, 2 ORDER BY 1 ASC NULLS LAST, 2 ASC NULLS LAST/);
  });

  it('adds a Total row for summable metrics only', () => {
    const spec = validSpec({ groupBy: ['status'], metrics: ['count', 'avgDaysToInstall'] });
    const rows = Service.withTotalRow(spec, [{ g0: 'INSTALLED', m0: 3, m1: '2.0' }, { g0: 'FAILED', m0: 2, m1: '1.0' }]);
    expect(rows[2]).toEqual({ g0: 'Total', m0: 5 });
  });

  it('describes filters in words', () => {
    const spec = validSpec({
      filters: [
        { field: 'reportedAt', op: 'between', value: ['2026-10-01', '2026-10-12'] },
        { field: 'hasPicture', op: 'eq', value: false },
        { field: 'installationDate', op: 'preset', value: 'lastWeek' }
      ]
    });
    expect(Service.describeFilters(spec)).toEqual([
      'Completed / Reported At is between 2026-10-01 and 2026-10-12',
      'Has Picture is false',
      'Installation Date is in lastWeek'
    ]);
  });
});
