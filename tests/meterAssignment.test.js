const XLSX = require('xlsx');
const {
  buildListWhere, normalizeMeterNumbers, mergeSearchResults
} = require('../src/models/MeterAssignment');
const { parseMeterNumbersFile } = require('../src/services/assignedMetersExportService');

const sheetBuffer = (rows, bookType = 'xlsx') => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Sheet1');
  return XLSX.write(wb, { type: 'buffer', bookType });
};

describe('assigned meters: list filters', () => {
  it('shows held meters by default and binds every value', () => {
    const { where, params } = buildListWhere({ discoIds: [1] });
    expect(where).toContain('ma.status = ANY($1::varchar[])');
    expect(where).toContain('b.disco_id = ANY($2::int[])');
    expect(params).toEqual([['ASSIGNED'], [1]]);
  });

  it('applies no disco filter for SUPERADMIN scope (null)', () => {
    expect(buildListWhere({}).where).not.toContain('disco_id');
  });

  it('filters by Lagos calendar days and escapes search wildcards', () => {
    const { where, params } = buildListWhere({ from: '2026-10-01', to: '2026-10-12', q: "50%_'" });
    expect(where).toContain("(ma.assigned_at AT TIME ZONE 'Africa/Lagos')::date >= $2::date");
    expect(where).toContain("(ma.assigned_at AT TIME ZONE 'Africa/Lagos')::date <= $3::date");
    expect(params[3]).toBe("%50\\%\\_'%");
    expect(where).not.toContain('50%');
  });
});

describe('assigned meters: bulk search', () => {
  it('trims, drops blanks and counts repeats, keeping the order given', () => {
    expect(normalizeMeterNumbers([' 0239 ', '0111', '', '0239', null, '0111'])).toEqual({
      numbers: ['0239', '0111'],
      duplicates: 2
    });
  });

  it('returns one result per number, in order, and nothing disappears', () => {
    const meters = [
      { meterNumber: 'B', phaseType: 'SINGLE PHASE' },
      { meterNumber: 'A', phaseType: 'THREE PHASE' },
      { meterNumber: 'D', phaseType: 'SINGLE PHASE' }
    ];
    const dispatches = [
      { meterNumber: 'A', assignmentStatus: 'ASSIGNED', installerName: 'Ada' },
      { meterNumber: 'D', assignmentStatus: 'USED', installerName: 'Bo' }
    ];
    const { results, summary } = mergeSearchResults(['A', 'B', 'C', 'D'], meters, dispatches);
    expect(results.map((r) => [r.meterNumber, r.result, r.installerName])).toEqual([
      ['A', 'ASSIGNED', 'Ada'],
      ['B', 'NOT_ASSIGNED', undefined],
      ['C', 'NOT_FOUND', undefined],
      ['D', 'NOT_ASSIGNED', 'Bo']
    ]);
    expect(summary).toEqual({ requested: 4, assigned: 1, notAssigned: 2, notFound: 1 });
  });
});

describe('assigned meters: reading an uploaded file', () => {
  it('finds the meter column by its header and keeps leading zeros', () => {
    const buffer = sheetBuffer([['Name', 'Meter Number'], ['x', '0239110211103'], ['y', '0239110211111']]);
    expect(parseMeterNumbersFile(buffer)).toEqual(['0239110211103', '0239110211111']);
  });

  it('reads a plain list with no header', () => {
    expect(parseMeterNumbersFile(sheetBuffer([['0239110211103'], ['0239110211111']])))
      .toEqual(['0239110211103', '0239110211111']);
  });

  it('skips an unrecognised text header, and reads CSV too', () => {
    expect(parseMeterNumbersFile(sheetBuffer([['Numbers'], ['0239110211103']], 'csv'))).toEqual(['0239110211103']);
  });
});
