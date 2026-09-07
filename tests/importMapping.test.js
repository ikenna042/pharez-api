const XLSX = require('xlsx');
const { resolveColumns, applyMapping } = require('../src/utils/normalizers');
const { ABA_POWER_IMPORT_MAPPING } = require('../src/config/discoDefaults');

// The real header rows from the Aba Power spreadsheets.
const PENDING_HEADERS = [
  'CUSTOMER NAME', 'CUSTOMER ADDRESS', 'CUSTOMER PHONE NUMBER', 'FEEDER NAME',
  'RECOMMENDED METER INSTALLATION POSITION', 'RECOMMENDED METER TYPE',
  'ACCOUNT NUMBER', 'TRANSFORMER NAME', 'METER VENDOR'
];
const INVENTORY_HEADERS = ['Meter No', 'Sim card serial number', 'Column1'];

/** Round-trips rows through a real workbook so the test exercises the same read path as the importer. */
const parse = (headers, dataRows, config) => {
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '', blankrows: false });
  const columns = resolveColumns(rows[0], config.fields);
  return rows.slice(1).map((r) =>
    applyMapping(r, columns, config.fields, {
      captureExtras: config.captureExtras,
      headerRowValues: rows[0]
    })
  );
};

describe('pendingInstallations mapping', () => {
  const config = ABA_POWER_IMPORT_MAPPING.pendingInstallations;

  it('maps a real row from the 13OCT25 sheet', () => {
    const [{ values }] = parse(PENDING_HEADERS, [[
      'ISREAL OGEAMARA',
      'FLAT 3, BY ODOGWU ROAD, OBINGWA L.G.A ABIA STATE.',
      8033425896,
      '7-UP 11KV',
      'HIGH WALL',
      'SINGLE PHASE',
      '7276355438',
      'UMUOHIA VILLAGE',
      'MASTER ENERGY'
    ]], config);

    expect(values).toEqual({
      customerName: 'ISREAL OGEAMARA',
      customerAddress: 'FLAT 3, BY ODOGWU ROAD, OBINGWA L.G.A ABIA STATE.',
      customerPhone: '08033425896',
      feederName: '7-UP 11KV',
      installationPosition: 'HIGH WALL',
      meterType: 'SINGLE PHASE',
      accountNumber: '7276355438',
      transformerName: 'UMUOHIA VILLAGE',
      meterVendor: 'MASTER ENERGY'
    });
  });

  it('absorbs the SINGLE PPHASE typo that appears in the source data', () => {
    const [{ values }] = parse(PENDING_HEADERS, [[
      'IFEME PAUL', '3 NWEKE STREET', 8063484323, 'ABA INDUSTRIAL 11KV',
      'POLE', 'SINGLE PPHASE', '8275057715', 'IJEOMA BREAD', 'MASTER ENERGY'
    ]], config);

    expect(values.meterType).toBe('SINGLE PHASE');
  });

  it('matches headers regardless of case, spacing or punctuation', () => {
    const scrambled = PENDING_HEADERS.map((h) => h.toLowerCase().replace(/ /g, '_'));
    const [{ values }] = parse(scrambled, [[
      'ISAAC ISAAC', '3 NWACHUKWU STREET', 8149454601, 'ABA GRA 11KV',
      'HIGH WALL', 'SINGLE PHASE', '4571086214', 'JOHNSON', 'MASTER ENERGY'
    ]], config);

    expect(values.accountNumber).toBe('4571086214');
    expect(values.customerName).toBe('ISAAC ISAAC');
  });

  it('fails the whole import, with a useful message, when a required column is absent', () => {
    const withoutAccount = PENDING_HEADERS.filter((h) => h !== 'ACCOUNT NUMBER');
    expect(() => parse(withoutAccount, [], config))
      .toThrow(/accountNumber.*ACCOUNTNUMBER/s);
  });
});

describe('meterInventory mapping', () => {
  const config = ABA_POWER_IMPORT_MAPPING.meterInventory;

  it('preserves zero-padded serials and 19-digit SIMs', () => {
    const [{ values }] = parse(INVENTORY_HEADERS, [
      ['0239110006909', '8923420038268091235', 'Single Phase']
    ], config);

    expect(values.meterNumber).toBe('0239110006909');
    expect(values.simNumber).toBe('8923420038268091235');
    expect(values.phaseType).toBe('SINGLE PHASE');
  });

  it('normalizes the Single Phase(TIS&P) variant and keeps the original', () => {
    const [{ values, raw }] = parse(INVENTORY_HEADERS, [
      ['0239110006917', '8923420038268091227', 'Single Phase(TIS&P)']
    ], config);

    expect(values.phaseType).toBe('SINGLE PHASE');
    expect(raw.phaseType).toBe('Single Phase(TIS&P)');
  });

  it('maps Unknown phase to null, which the column permits', () => {
    const [{ values }] = parse(INVENTORY_HEADERS, [
      ['0239110006925', '8923420038268091219', 'Unknown']
    ], config);

    expect(values.phaseType).toBeNull();
  });

  it('rejects the pending-installations sheet with a message naming the missing columns', () => {
    expect(() => parse(PENDING_HEADERS, [], config)).toThrow(/meterNumber.*METERNO/s);
  });
});
