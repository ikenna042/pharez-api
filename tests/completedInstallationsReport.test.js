const ExcelJS = require('exceljs');
const CompletedInstallationsReportService = require('../src/services/completedInstallationsReportService');

const read = async (buffer) => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.getWorksheet('Completed Installations');
  const headers = ws.getRow(1).values.slice(1);
  const rows = [];
  for (let r = 2; r <= ws.rowCount; r += 1) {
    rows.push(Object.fromEntries(headers.map((h, i) => [h, ws.getRow(r).getCell(i + 1).value])));
  }
  return { wb, ws, headers, rows };
};

const job = (overrides = {}) => ({
  id: 1,
  discoCode: 'ABA_POWER',
  status: 'INSTALLED',
  accountNumber: '0012345',
  customerName: 'Ada Obi',
  customerAddress: '1 Market Rd',
  meterNumber: '0239110006909',
  meterType: 'SINGLE PHASE',
  sealNumber: 'SL-004512',
  installationDate: '2026-10-08',
  reportedAt: '2026-10-08T17:34:50.000Z',
  installerName: 'Onwe Favour',
  assignedTo: 'u-1',
  latitude: '5.106600',
  longitude: '7.366700',
  installationPhotoUrl: 'https://api.memetering.com/api/v1/files/abc',
  createdAt: '2026-10-07T08:53:19.000Z',
  ...overrides
});

const build = (installations, meters = []) => CompletedInstallationsReportService.buildWorkbook({
  installations,
  meters,
  context: { discoName: 'Aba Power Limited Electric', filters: [] }
});

describe('CompletedInstallationsReportService', () => {
  it('keeps the always-on columns even when blank, and drops other all-blank ones', async () => {
    const { headers } = await read(await build([job({ discoSupervisor: null })]));
    expect(headers).toContain('DisCo Supervisor');
    expect(headers).not.toContain('Customer Email');
    expect(headers).not.toContain('SIM Serial Number');
  });

  it('joins meter inventory details by serial', async () => {
    const { rows, headers } = await read(await build([job()], [
      { meterNumber: '0239110006909', simNumber: '8923420038268090000', meterMake: 'MASTER ENERGY', model: 'ME-1P', sgcNumber: '600123', phaseType: 'SINGLE PHASE', status: 'INSTALLED' }
    ]));
    expect(headers).toEqual(expect.arrayContaining(['SIM Serial Number', 'Meter Make', 'Meter Model', 'SGC Number']));
    expect(rows[0]['SIM Serial Number']).toBe('8923420038268090000');
    expect(rows[0]['Meter Make']).toBe('MASTER ENERGY');
  });

  it('keeps identifiers as text and the picture as a hyperlink', async () => {
    const { rows } = await read(await build([job()]));
    expect(rows[0]['Account Number']).toBe('0012345');
    expect(rows[0]['Installation Picture Link']).toEqual(
      expect.objectContaining({ hyperlink: 'https://api.memetering.com/api/v1/files/abc' })
    );
    expect(rows[0].Latitude).toBeCloseTo(5.1066);
  });

  it('writes dates in Lagos wall-clock time and labels statuses', async () => {
    const { rows } = await read(await build([job({ status: 'EXPORTED' })]));
    // 17:34:50Z is 18:34:50 in Lagos (UTC+1).
    expect(rows[0]['Completed / Reported At'].toISOString()).toBe('2026-10-08T18:34:50.000Z');
    expect(rows[0]['Installation Date'].toISOString()).toBe('2026-10-08T00:00:00.000Z');
    expect(rows[0].Status).toBe('Exported');
  });

  it('lists the newest installation first and adds a Summary sheet', async () => {
    const { rows, wb } = await read(await build([
      job({ id: 1, installationDate: '2026-10-01' }),
      job({ id: 2, installationDate: '2026-10-09' })
    ]));
    expect(rows.map((r) => r['Installation ID'])).toEqual(['2', '1']);
    expect(wb.getWorksheet('Summary')).toBeDefined();
  });

  it('names the file after the disco and date', () => {
    expect(CompletedInstallationsReportService.fileName('ABA_POWER', new Date('2026-10-12T10:00:00Z')))
      .toBe('completed-installations-aba-power-2026-10-12.xlsx');
  });

  it('counts installed meters per installer by the fitted meter\'s phase in the Summary sheet', async () => {
    const buffer = await build([
      job({ id: 1, installerName: 'Ada Installer', meterNumber: 'M1' }),
      job({ id: 2, installerName: 'Ada Installer', meterNumber: 'M2' }),
      // Not in inventory: falls back to the job's meter type.
      job({ id: 3, installerName: 'Ada Installer', meterNumber: 'M9', meterType: 'THREE PHASE' }),
      job({ id: 4, installerName: null, assigneeName: 'Bo Assignee', meterNumber: 'M3' }),
      job({ id: 5, installerName: null, meterNumber: 'M4', meterType: null })
    ], [
      { meterNumber: 'M1', phaseType: 'SINGLE PHASE' },
      { meterNumber: 'M2', phaseType: 'THREE PHASE' },
      { meterNumber: 'M3', phaseType: 'SINGLE PHASE' },
      { meterNumber: 'M4', phaseType: null }
    ]);
    const { wb } = await read(buffer);
    const ws = wb.getWorksheet('Summary');
    const rows = [];
    for (let r = 2; r <= ws.rowCount; r += 1) rows.push(ws.getRow(r).values.slice(1));
    const start = rows.findIndex(([item]) => item === 'Installed meters by installer');
    expect(rows.slice(start + 1)).toEqual([
      ['  Ada Installer', 'Single Phase: 1 · Three Phase: 2 · Total: 3'],
      ['  Bo Assignee', 'Single Phase: 1 · Total: 1'],
      ['  Not recorded', 'Not recorded: 1 · Total: 1'],
      ['  All installers', 'Single Phase: 2 · Three Phase: 2 · Not recorded: 1 · Total: 5']
    ]);
  });

  it('labels blank and unusual meter types and orders them after the two phases', () => {
    const { installedMetersByInstaller, formatTypeCounts } = CompletedInstallationsReportService;
    const counts = installedMetersByInstaller([{ p: '3-PH' }, { p: null }, { p: 'POLY' }, { p: 'single phase' }], {
      installerOf: () => 'X', phaseOf: (r) => r.p
    });
    expect(formatTypeCounts(counts[0])).toBe('Single Phase: 1 · Three Phase: 1 · POLY: 1 · Not recorded: 1 · Total: 4');
  });
});
