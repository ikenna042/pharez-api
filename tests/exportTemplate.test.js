const XLSX = require('xlsx');
const InstallationExportService = require('../src/services/installationExportService');
const { ABA_POWER_EXPORT_TEMPLATE } = require('../src/config/discoDefaults');

const template = ABA_POWER_EXPORT_TEMPLATE.installationResponse;

// The exact 11 columns Aba Power expects back, in order.
const ABA_HEADERS = [
  'Timestamp',
  'Installation Date',
  'Customer Name',
  'Customer Account number',
  'Meter Number',
  'APLE Seal Number',
  'Latitude',
  'Longitude',
  'Aba power Supervisor',
  'Installer Name',
  'Picture of installation (URL)'
];

const sampleRow = {
  reportedAt: new Date(2026, 8, 7, 22, 2, 41),
  installationDate: new Date(2026, 8, 5, 0, 0, 0), // how pg returns a DATE column: local midnight
  customerName: 'ISREAL OGEAMARA',
  accountNumber: '7276355438',
  meterNumber: '0239110006909',
  sealNumber: '0136155',
  latitude: 5.1066,
  longitude: 7.3667,
  discoSupervisor: 'Micheal Emmanuel',
  installerName: 'Mike Installer',
  installationPhotoUrl: 'https://drive.google.com/file/d/xyz/view'
};

const readBack = (rows) => {
  const buffer = InstallationExportService.buildWorkbook(rows, template);
  const workbook = XLSX.read(buffer);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return { workbook, sheet, aoa: XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false }) };
};

describe('formatValue', () => {
  it('renders a DATE using local calendar parts, not UTC', () => {
    // In WAT (+01:00) toISOString() would report 2026-09-04 and the disco would
    // see every installation dated a day early.
    expect(InstallationExportService.formatValue(new Date(2026, 8, 5, 0, 0, 0), 'date'))
      .toBe('2026-09-05');
  });

  it('renders a datetime in local time', () => {
    expect(InstallationExportService.formatValue(new Date(2026, 8, 7, 22, 2, 41), 'datetime'))
      .toBe('2026-09-07 22:02:41');
  });

  it('renders nulls as empty cells rather than the string "null"', () => {
    expect(InstallationExportService.formatValue(null, 'date')).toBe('');
    expect(InstallationExportService.formatValue(undefined, 'text')).toBe('');
  });

  it('keeps identifiers as strings', () => {
    expect(InstallationExportService.formatValue('0239110006909', 'text')).toBe('0239110006909');
  });

  it('coerces numbers and rejects junk', () => {
    expect(InstallationExportService.formatValue('5.1066', 'number')).toBe(5.1066);
    expect(InstallationExportService.formatValue('abc', 'number')).toBe('');
  });
});

describe('buildWorkbook', () => {
  it('emits Aba Power\'s exact columns in order', () => {
    expect(readBack([sampleRow]).aoa[0]).toEqual(ABA_HEADERS);
  });

  it('names the sheet from the template', () => {
    expect(readBack([sampleRow]).workbook.SheetNames[0]).toBe('Installations');
  });

  it('keeps meter and account numbers as text so Excel does not eat leading zeros', () => {
    const { sheet } = readBack([sampleRow]);
    expect(sheet.E2.t).toBe('s');          // Meter Number
    expect(sheet.E2.v).toBe('0239110006909');
    expect(sheet.D2.t).toBe('s');          // Customer Account number
    expect(sheet.F2.v).toBe('0136155');    // APLE Seal Number keeps its leading zero
  });

  it('writes the installation date the installer actually reported', () => {
    expect(readBack([sampleRow]).aoa[1][1]).toBe('2026-09-05');
  });

  it('keeps every column present even when a value is missing in every row', () => {
    const sparse = { ...sampleRow, installationPhotoUrl: null, discoSupervisor: null };
    const { aoa } = readBack([sparse]);
    expect(aoa[0]).toEqual(ABA_HEADERS);
    expect(aoa[0]).toHaveLength(11);
  });

  it('emits a header-only sheet for an empty result', () => {
    expect(readBack([]).aoa[0]).toEqual(ABA_HEADERS);
  });
});
