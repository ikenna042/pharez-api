const ExcelJS = require('exceljs');
const Cursor = require('pg-cursor');
const XLSX = require('xlsx');
const pool = require('../config/database');
const MeterAssignment = require('../models/MeterAssignment');
const { headerKey, restoreIntegerText } = require('../utils/normalizers');
const {
  TYPES, addSheet, formatGeneratedAt, lagosParts
} = require('../utils/xlsxWriter');
const { installedMetersByInstaller, formatTypeCounts } = require('./completedInstallationsReportService');

/** The assigned-meters files: the filtered list, and bulk search results. */

const LIMITS = { xlsx: 100000, csv: 500000 };

const COLUMNS = [
  { key: 'meterNumber', header: 'Meter Number', type: TYPES.TEXT },
  { key: 'simNumber', header: 'SIM Serial Number', type: TYPES.TEXT },
  { key: 'meterMake', header: 'Meter Make', type: TYPES.TEXT },
  { key: 'model', header: 'Meter Model', type: TYPES.TEXT },
  { key: 'phaseType', header: 'Phase', type: TYPES.TEXT },
  { key: 'sgcNumber', header: 'SGC Number', type: TYPES.TEXT },
  { key: 'meterStatus', header: 'Inventory Status', type: TYPES.TEXT },
  { key: 'assignmentStatus', header: 'Dispatch Status', type: TYPES.TEXT },
  { key: 'discoCode', header: 'DisCo', type: TYPES.TEXT },
  { key: 'installerName', header: 'Installer', type: TYPES.TEXT },
  { key: 'installerPhone', header: 'Installer Phone', type: TYPES.TEXT },
  { key: 'batchRef', header: 'Batch', type: TYPES.TEXT },
  { key: 'dispatchRef', header: 'Dispatch Reference', type: TYPES.TEXT },
  { key: 'assignedByName', header: 'Assigned By', type: TYPES.TEXT },
  { key: 'assignedAt', header: 'Assigned At', type: TYPES.DATETIME },
  { key: 'releasedAt', header: 'Released At', type: TYPES.DATETIME },
  { key: 'accountNumber', header: 'Installed on Account', type: TYPES.TEXT }
];

const RESULT_LABELS = { ASSIGNED: 'Assigned', NOT_ASSIGNED: 'Not assigned', NOT_FOUND: 'Not found' };
const SEARCH_COLUMNS = [{ key: 'resultLabel', header: 'Result', type: TYPES.TEXT }, ...COLUMNS];

const METER_HEADERS = ['METERNUMBER', 'METERNO', 'METER', 'METERSERIAL', 'METERSERIALNUMBER', 'SERIALNUMBER', 'SERIAL'];

/**
 * The meter numbers in an uploaded sheet: the column with a meter-number
 * header, else the first column (a plain list may have no header at all).
 * Read as formatted text, so leading zeros survive.
 */
const parseMeterNumbersFile = (buffer) => {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellText: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return [];

  const rows = XLSX.utils.sheet_to_json(restoreIntegerText(sheet), {
    header: 1, raw: false, defval: '', blankrows: false
  });
  if (rows.length === 0) return [];

  const column = rows[0].findIndex((cell) => METER_HEADERS.includes(headerKey(cell)));
  const dataRows = column >= 0 ? rows.slice(1) : rows;
  const index = column >= 0 ? column : 0;
  const numbers = dataRows.map((row) => String(row[index] ?? '').trim()).filter(Boolean);

  // A first row of words is a header we don't recognise, not a meter number.
  if (column < 0 && numbers.length > 0 && !/\d/.test(numbers[0])) numbers.shift();
  return numbers;
};

const pad = (n) => String(n).padStart(2, '0');

const csvDate = (value) => {
  if (!value) return '';
  const p = lagosParts(value);
  return p ? `${p.y}-${pad(p.mo + 1)}-${pad(p.d)} ${pad(p.h)}:${pad(p.mi)}:${pad(p.s)}` : '';
};

const csvCell = (value, type) => {
  if (value === null || value === undefined) return '';
  const s = type === TYPES.DATETIME ? csvDate(value) : String(value);
  return /[",\r\n]/.test(s) || /^[=+\-@]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const csvLine = (columns, row) => `${columns.map((c) => csvCell(row[c.key], c.type)).join(',')}\r\n`;
const csvHeader = (columns) => `﻿${columns.map((c) => csvCell(c.header, TYPES.TEXT)).join(',')}\r\n`;

/** Summary rows: meters per installer by type, then all installers. */
const installerRows = (rows, heading) => {
  const counts = installedMetersByInstaller(rows, {
    installerOf: (r) => r.installerName,
    phaseOf: (r) => r.phaseType
  });
  if (counts.length === 0) return [];

  const all = { byType: {}, total: 0 };
  counts.forEach((c) => {
    Object.entries(c.byType).forEach(([t, n]) => { all.byType[t] = (all.byType[t] || 0) + n; });
    all.total += c.total;
  });
  return [
    { item: heading, value: '' },
    ...counts.map((c) => ({ item: `  ${c.installer}`, value: formatTypeCounts(c) })),
    { item: '  All installers', value: formatTypeCounts(all) }
  ];
};

const addSummary = (workbook, rows) => addSheet(workbook, {
  name: 'Summary',
  autoFilter: false,
  columns: [
    { key: 'item', header: 'Item', type: TYPES.TEXT, width: 36 },
    { key: 'value', header: 'Value', type: TYPES.TEXT, width: 80 }
  ],
  rows
});

class AssignedMetersExportService {
  static fileName(prefix, format, date = new Date()) {
    return `${prefix}-${date.toISOString().slice(0, 10)}.${format}`;
  }

  /** The filtered list as a workbook. `filterNotes` describe the filters in words. */
  static async buildListWorkbook(filters, context) {
    const { text, params } = MeterAssignment.exportQuery(filters);
    const result = await pool.query(text, params);
    const rows = result.rows.map((row) => MeterAssignment.format(row));

    const workbook = new ExcelJS.Workbook();
    addSheet(workbook, { name: 'Assigned Meters', columns: COLUMNS, rows });
    addSummary(workbook, [
      { item: 'Report', value: 'Assigned meters' },
      { item: 'Generated', value: formatGeneratedAt() },
      { item: 'Generated by', value: context.generatedBy },
      { item: 'DisCo scope', value: context.scopeLabel },
      { item: 'Dispatch status', value: filters.statuses.join(', ') },
      { item: 'Filters', value: context.filterNotes.length ? context.filterNotes.join('; ') : 'None' },
      { item: 'Rows', value: String(rows.length) },
      { item: 'Times', value: 'Lagos time (WAT). Assigned-date filters are whole days, both ends included.' },
      ...installerRows(rows, 'Meters by installer')
    ]);

    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  /** Stream the filtered list as CSV. A pg cursor keeps memory flat. */
  static async streamListCsv(filters, out) {
    const { text, params } = MeterAssignment.exportQuery(filters);
    out.write(csvHeader(COLUMNS));

    const client = await pool.connect();
    try {
      const cursor = client.query(new Cursor(text, params));
      const read = () => new Promise((resolve, reject) => cursor.read(2000, (err, rows) => (err ? reject(err) : resolve(rows))));
      let rows = await read();
      while (rows.length > 0) {
        const chunk = rows.map((row) => csvLine(COLUMNS, MeterAssignment.format(row))).join('');
        if (!out.write(chunk)) await new Promise((resolve) => out.once('drain', resolve));
        rows = await read();
      }
      await new Promise((resolve, reject) => cursor.close((err) => (err ? reject(err) : resolve())));
    } finally {
      client.release();
    }
    out.end();
  }

  /** Bulk search results as a workbook, one row per number requested. */
  static async buildSearchWorkbook({ results, summary }, context) {
    const rows = results.map((r) => ({ ...r, resultLabel: RESULT_LABELS[r.result] }));

    const workbook = new ExcelJS.Workbook();
    addSheet(workbook, { name: 'Search Results', columns: SEARCH_COLUMNS, rows });
    addSummary(workbook, [
      { item: 'Report', value: 'Assigned meters: bulk search' },
      { item: 'Generated', value: formatGeneratedAt() },
      { item: 'Generated by', value: context.generatedBy },
      { item: 'DisCo scope', value: context.scopeLabel },
      { item: 'Numbers searched', value: String(summary.requested) },
      { item: '  Assigned', value: String(summary.assigned) },
      { item: '  Not assigned', value: String(summary.notAssigned) },
      { item: '  Not found', value: String(summary.notFound) },
      { item: 'Duplicates removed', value: String(summary.duplicatesRemoved) },
      { item: 'Not assigned rows', value: "The meter isn't with an installer now; its most recent dispatch is shown, if it has one." },
      { item: 'Times', value: 'Lagos time (WAT).' },
      ...installerRows(rows.filter((r) => r.result === 'ASSIGNED'), 'Assigned meters by installer')
    ]);

    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  static searchCsv({ results }) {
    const rows = results.map((r) => ({ ...r, resultLabel: RESULT_LABELS[r.result] }));
    return csvHeader(SEARCH_COLUMNS) + rows.map((r) => csvLine(SEARCH_COLUMNS, r)).join('');
  }
}

module.exports = AssignedMetersExportService;
module.exports.LIMITS = LIMITS;
module.exports.parseMeterNumbersFile = parseMeterNumbersFile;
module.exports.COLUMNS = COLUMNS;
