const {
  headerKey,
  transforms,
  resolveColumns,
  applyMapping
} = require('../src/utils/normalizers');

describe('headerKey', () => {
  it('normalizes real Aba Power headers for matching', () => {
    expect(headerKey('Customer Account number')).toBe('CUSTOMERACCOUNTNUMBER');
    expect(headerKey('CUSTOMER PHONE NUMBER')).toBe('CUSTOMERPHONENUMBER');
    expect(headerKey('Sim card serial number')).toBe('SIMCARDSERIALNUMBER');
    expect(headerKey('Picture of installation')).toBe('PICTUREOFINSTALLATION');
  });

  it('is stable across spacing, case and punctuation', () => {
    expect(headerKey('meter_no')).toBe(headerKey('METER NO'));
    expect(headerKey('  Meter-No.  ')).toBe('METERNO');
  });

  it('handles null and undefined without throwing', () => {
    expect(headerKey(null)).toBe('');
    expect(headerKey(undefined)).toBe('');
  });
});

describe('transforms.phase', () => {
  it('accepts the SINGLE PPHASE typo present in the source data', () => {
    expect(transforms.phase('SINGLE PPHASE')).toBe('SINGLE PHASE');
  });

  it('accepts the Single Phase(TIS&P) inventory variant', () => {
    expect(transforms.phase('Single Phase(TIS&P)')).toBe('SINGLE PHASE');
  });

  it('normalizes the ordinary spellings', () => {
    expect(transforms.phase('SINGLE PHASE')).toBe('SINGLE PHASE');
    expect(transforms.phase('Single Phase')).toBe('SINGLE PHASE');
    expect(transforms.phase('THREE PHASE')).toBe('THREE PHASE');
    expect(transforms.phase('Three Phase')).toBe('THREE PHASE');
    expect(transforms.phase('3 phase')).toBe('THREE PHASE');
    expect(transforms.phase('1 phase')).toBe('SINGLE PHASE');
  });

  it('maps Unknown and blanks to null, which the CHECK constraint allows', () => {
    expect(transforms.phase('Unknown')).toBeNull();
    expect(transforms.phase('')).toBeNull();
    expect(transforms.phase(null)).toBeNull();
  });
});

describe('transforms.ngPhone', () => {
  it('restores the leading zero Excel strips from a stored number', () => {
    expect(transforms.ngPhone(8033425896)).toBe('08033425896');
    expect(transforms.ngPhone(8149454601)).toBe('08149454601');
  });

  it('converts international format to local', () => {
    expect(transforms.ngPhone('2348033425896')).toBe('08033425896');
    expect(transforms.ngPhone('+234 803 342 5896')).toBe('08033425896');
  });

  it('leaves an already-correct number alone', () => {
    expect(transforms.ngPhone('08033425896')).toBe('08033425896');
  });

  it('keeps unrecognised shapes rather than dropping the data', () => {
    expect(transforms.ngPhone('123')).toBe('123');
    expect(transforms.ngPhone('')).toBeNull();
    expect(transforms.ngPhone(null)).toBeNull();
  });
});

describe('transforms.text', () => {
  it('zero-pads meter serials back to 13 characters', () => {
    expect(transforms.text('239110006909', { padStart: 13 })).toBe('0239110006909');
  });

  it('leaves an already-padded serial untouched', () => {
    expect(transforms.text('0239110006909', { padStart: 13 })).toBe('0239110006909');
  });

  it('expands scientific notation without float rounding artefacts', () => {
    // A 19-digit SIM serial exceeds float64 precision; Number().toFixed(0) would
    // return ...090368 here, inventing digits the cell never contained.
    expect(transforms.text('8.92342003826809e+18')).toBe('8923420038268090000');
    expect(transforms.text('2.39110006909e+11', { padStart: 13 })).toBe('0239110006909');
  });

  it('strips internal whitespace from identifiers', () => {
    expect(transforms.text(' 0239 1100 06909 ')).toBe('0239110006909');
  });

  it('returns null for empty cells', () => {
    expect(transforms.text('')).toBeNull();
    expect(transforms.text(null)).toBeNull();
  });
});

describe('transforms.date', () => {
  it('accepts Date objects from cellDates parsing', () => {
    expect(transforms.date(new Date(Date.UTC(2025, 9, 13)))).toBe('2025-10-13');
  });

  it('accepts ISO strings', () => {
    expect(transforms.date('2025-10-13')).toBe('2025-10-13');
  });

  it('reads unambiguous day-first dates correctly', () => {
    expect(transforms.date('13/10/2025')).toBe('2025-10-13');
  });

  it('returns null for unparseable input', () => {
    expect(transforms.date('not a date')).toBeNull();
    expect(transforms.date('')).toBeNull();
  });
});

describe('transforms.trim / upper / number', () => {
  it('trims and nulls blank strings', () => {
    expect(transforms.trim('  ISAAC ISAAC  ')).toBe('ISAAC ISAAC');
    expect(transforms.trim('   ')).toBeNull();
  });

  it('uppercases installation positions', () => {
    expect(transforms.upper('High Wall')).toBe('HIGH WALL');
    expect(transforms.upper('pole')).toBe('POLE');
  });

  it('parses numbers, including GPS coordinates', () => {
    expect(transforms.number('5.145166')).toBe(5.145166);
    expect(transforms.number('')).toBeNull();
  });
});

describe('resolveColumns', () => {
  const fields = {
    accountNumber: { headers: ['ACCOUNTNUMBER', 'ACCTNO'], required: true },
    customerName: { headers: ['CUSTOMERNAME'], required: true },
    meterVendor: { headers: ['METERVENDOR'] }
  };

  it('maps each field to its column index regardless of header formatting', () => {
    const header = ['CUSTOMER NAME', 'Meter Vendor', 'Account Number'];
    expect(resolveColumns(header, fields)).toEqual({
      customerName: 0,
      meterVendor: 1,
      accountNumber: 2
    });
  });

  it('omits optional fields that are absent', () => {
    const resolved = resolveColumns(['ACCOUNT NUMBER', 'CUSTOMER NAME'], fields);
    expect(resolved.meterVendor).toBeUndefined();
  });

  it('throws a message naming the field, the aliases and the observed headers', () => {
    expect(() => resolveColumns(['CUSTOMER NAME', 'METER VENDOR'], fields))
      .toThrow(/accountNumber.*ACCOUNTNUMBER, ACCTNO.*Sheet headers are: CUSTOMER NAME, METER VENDOR/s);
  });
});

describe('applyMapping', () => {
  const fields = {
    accountNumber: { headers: ['ACCOUNTNUMBER'], transform: 'text' },
    customerName: { headers: ['CUSTOMERNAME'], transform: 'trim' },
    customerPhone: { headers: ['CUSTOMERPHONENUMBER'], transform: 'ngPhone' },
    meterType: { headers: ['RECOMMENDEDMETERTYPE'], transform: 'phase' }
  };
  const headerRowValues = ['CUSTOMER NAME', 'CUSTOMER PHONE NUMBER', 'RECOMMENDED METER TYPE', 'ACCOUNT NUMBER', 'FEEDER NAME'];
  const columns = resolveColumns(headerRowValues, fields);

  it('normalizes a real row end to end', () => {
    const row = ['ISREAL OGEAMARA', 8033425896, 'SINGLE PPHASE', '7276355438', '7-UP 11KV'];
    const { values } = applyMapping(row, columns, fields);

    expect(values).toEqual({
      customerName: 'ISREAL OGEAMARA',
      customerPhone: '08033425896',
      meterType: 'SINGLE PHASE',
      accountNumber: '7276355438'
    });
  });

  it('captures unmapped columns as extras when asked', () => {
    const row = ['ISREAL OGEAMARA', 8033425896, 'SINGLE PHASE', '7276355438', '7-UP 11KV'];
    const { extras } = applyMapping(row, columns, fields, { captureExtras: true, headerRowValues });
    expect(extras).toEqual({ 'FEEDER NAME': '7-UP 11KV' });
  });

  it('returns no extras when capture is off', () => {
    const row = ['ISREAL OGEAMARA', 8033425896, 'SINGLE PHASE', '7276355438', '7-UP 11KV'];
    expect(applyMapping(row, columns, fields).extras).toBeNull();
  });

  it('keeps the original value when keepRaw is set', () => {
    const rawFields = { phaseType: { headers: ['PHASE'], transform: 'phase', keepRaw: true } };
    const rawColumns = resolveColumns(['Phase'], rawFields);
    const { values, raw } = applyMapping(['Single Phase(TIS&P)'], rawColumns, rawFields);

    expect(values.phaseType).toBe('SINGLE PHASE');
    expect(raw.phaseType).toBe('Single Phase(TIS&P)');
  });

  it('yields null for a mapped column missing from the sheet', () => {
    const partial = resolveColumns(['CUSTOMER NAME'], { customerName: fields.customerName });
    const { values } = applyMapping(['ISAAC ISAAC'], partial, fields);
    expect(values.accountNumber).toBeNull();
  });
});
