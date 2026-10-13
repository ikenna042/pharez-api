const ExcelJS = require('exceljs');

/**
 * The "Completed installations" workbook, server-side.
 *
 * Mirrors the portal's "Export Completed Installations" report
 * (m-web src/utils/completedInstallationsReport.js and src/utils/xlsx.js) for
 * imported jobs, so the file a pending-installations import offers for its
 * already-completed accounts looks like the one staff export from the
 * Installation Requests screen. Keep the two column lists in step.
 *
 * Differences from the portal, both deliberate:
 *  - Pictures are not embedded; every row keeps its clickable picture link.
 *  - JED Remita columns (payment, request reference) are never filled for
 *    imported jobs, so the blank-column rule drops them, as in the portal.
 */

const TYPES = Object.freeze({
  TEXT: 'text',
  COORDINATE: 'coordinate',
  DATE: 'date',
  DATETIME: 'datetime',
  LINK: 'link'
});

const NUM_FMT = {
  text: '@',
  coordinate: '0.000000',
  date: 'dd mmm yyyy',
  datetime: 'dd mmm yyyy hh:mm',
  link: '@'
};

// The portal writes dates and times in the viewer's local time. Its users are
// in Nigeria, so the server writes Lagos wall-clock time to match.
const TIME_ZONE = 'Africa/Lagos';

const STATUS_LABELS = {
  PENDING: 'Unassigned',
  ASSIGNED: 'Assigned',
  IN_PROGRESS: 'In Progress',
  INSTALLED: 'Installed',
  EXPORTED: 'Exported',
  FAILED: 'Failed',
  CANCELLED: 'Cancelled'
};

const PLAIN_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const HTTP_URL_RE = /^https?:\/\/\S+$/i;

const isBlank = (v) => v === null || v === undefined || String(v).trim() === '';
const pick = (...values) => values.find((v) => !isBlank(v));

/** { y, mo (0-based), d, h, mi, s } of an instant in Lagos time. */
const lagosParts = (value) => {
  const t = new Date(value);
  if (Number.isNaN(t.getTime())) return null;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
    }).formatToParts(t).map((p) => [p.type, p.value])
  );
  return {
    y: Number(parts.year), mo: Number(parts.month) - 1, d: Number(parts.day),
    h: Number(parts.hour), mi: Number(parts.minute), s: Number(parts.second)
  };
};

const pad = (n) => String(n).padStart(2, '0');

/** 'YYYY-MM-DD' for a plain date or an instant (in Lagos), else null. */
const localDate = (value) => {
  if (isBlank(value)) return null;
  if (typeof value === 'string' && PLAIN_DATE_RE.test(value)) return value;
  const p = lagosParts(value);
  return p ? `${p.y}-${pad(p.mo + 1)}-${pad(p.d)}` : null;
};

/** The installer's installation date, falling back to when it was reported. */
const completionDateOf = (r) => localDate(r.installationDate) || localDate(r.reportedAt);

// Same collapse as the portal's normalizePhase: every spelling of the two real
// types becomes the API enum; anything else is kept, tidied.
const normalizePhase = (value) => {
  const key = String(value ?? '').replace(/[_-]+/g, ' ').trim().replace(/\s+/g, ' ').toUpperCase();
  const compact = key.replace(/\bMETERS?\b/g, '').replace(/\s+/g, '');
  if (/^(3|THREE|TRIPLE)(PHASE|PH|P)?$/.test(compact)) return 'THREE PHASE';
  if (/^(1|ONE|SINGLE)(PHASE|PH|P)?$/.test(compact)) return 'SINGLE PHASE';
  return key;
};

const coordinatesOf = (r) => {
  if (r.latitude == null || r.longitude == null) return null;
  const lat = Number(r.latitude);
  const lng = Number(r.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { latitude: lat, longitude: lng };
};

const text = (v) => (isBlank(v) ? null : String(v).trim());

// [key, header, type, value(installation, meter)] -- the portal's COLUMNS,
// in its order, for imported jobs.
const COLUMNS = [
  ['source', 'Source', TYPES.TEXT, () => 'Imported job'],
  ['disco', 'DisCo', TYPES.TEXT, (r) => r.discoCode],
  ['installationId', 'Installation ID', TYPES.TEXT, (r) => r.id],
  ['status', 'Status', TYPES.TEXT, (r) => STATUS_LABELS[r.status] || r.status || 'Unknown'],
  ['accountNumber', 'Account Number', TYPES.TEXT, (r) => r.accountNumber],
  ['customerName', 'Customer Name', TYPES.TEXT, (r) => r.customerName],
  ['customerPhone', 'Customer Phone', TYPES.TEXT, (r) => r.customerPhone],
  ['customerEmail', 'Customer Email', TYPES.TEXT, (r) => r.customerEmail],
  ['customerAddress', 'Customer / Installation Address', TYPES.TEXT, (r) => r.customerAddress],
  ['region', 'Region', TYPES.TEXT, (r) => r.region],
  ['area', 'Area', TYPES.TEXT, (r) => r.area],
  ['requestDate', 'Request Date', TYPES.DATETIME, (r) => r.createdAt],
  // An imported job is created by its import, so createdAt is the import time.
  ['importedDate', 'Imported Date', TYPES.DATETIME, (r) => r.createdAt],
  ['installationDate', 'Installation Date', TYPES.DATE, (r) => completionDateOf(r)],
  ['completedAt', 'Completed / Reported At', TYPES.DATETIME, (r) => r.reportedAt],
  ['installerName', 'Installer', TYPES.TEXT, (r) => pick(r.installerName, r.assigneeName)],
  ['installerId', 'Installer ID', TYPES.TEXT, (r) => r.assignedTo],
  ['completedByName', 'Completed By', TYPES.TEXT, (r) => r.completedByName],
  ['assignedAt', 'Assigned At', TYPES.DATETIME, (r) => r.assignedAt],
  ['meterNumber', 'Meter Number', TYPES.TEXT, (r) => r.meterNumber],
  ['meterType', 'Meter Type', TYPES.TEXT, (r) => (isBlank(r.meterType) ? null : normalizePhase(r.meterType))],
  ['sealNumber', 'Seal Number', TYPES.TEXT, (r) => r.sealNumber],
  ['installationPosition', 'Installation Position', TYPES.TEXT, (r) => r.installationPosition],
  ['feederName', 'Feeder', TYPES.TEXT, (r) => r.feederName],
  ['transformerName', 'Transformer', TYPES.TEXT, (r) => r.transformerName],
  ['transformerCode', 'Transformer Code', TYPES.TEXT, (r) => r.transformerCode],
  ['latitude', 'Latitude', TYPES.COORDINATE, (r) => coordinatesOf(r)?.latitude ?? null],
  ['longitude', 'Longitude', TYPES.COORDINATE, (r) => coordinatesOf(r)?.longitude ?? null],
  ['discoSupervisor', 'DisCo Supervisor', TYPES.TEXT, (r) => r.discoSupervisor],
  ['photoUrl', 'Installation Picture Link', TYPES.LINK, (r) => r.installationPhotoUrl],
  ['notes', 'Installation Notes', TYPES.TEXT, (r) => r.installationNotes],
  ['meterVendor', 'Meter Vendor', TYPES.TEXT, (r) => r.meterVendor],
  // Meter record, joined by serial.
  ['simNumber', 'SIM Serial Number', TYPES.TEXT, (r, m) => m?.simNumber],
  ['meterMake', 'Meter Make', TYPES.TEXT, (r, m) => text(m?.meterMake)],
  ['meterModel', 'Meter Model', TYPES.TEXT, (r, m) => text(m?.model)],
  ['manufacturedDate', 'Meter Manufactured Date', TYPES.TEXT, (r, m) => text(m?.manufacturedDate)],
  ['sgcNumber', 'SGC Number', TYPES.TEXT, (r, m) => m?.sgcNumber],
  ['meterPhase', 'Meter Phase (inventory)', TYPES.TEXT, (r, m) => m?.phaseType],
  ['meterStatus', 'Meter Status (inventory)', TYPES.TEXT, (r, m) => m?.status]
];

// Kept even when blank in every row, as in the portal: the installation facts
// the report exists for. Any other all-blank column is dropped.
const ALWAYS_KEYS = new Set([
  'accountNumber', 'customerName', 'customerAddress', 'status', 'installationDate', 'installerName',
  'assignedAt', 'meterNumber', 'meterType', 'sealNumber', 'latitude', 'longitude', 'discoSupervisor',
  'photoUrl'
]);

/** Excel has no time zones: a Date built from wall-clock parts as UTC shows exactly them. */
const wallClock = (p, withTime) => new Date(Date.UTC(p.y, p.mo, p.d, withTime ? p.h : 0, withTime ? p.mi : 0, withTime ? p.s : 0));

const toCellValue = (value, type) => {
  if (isBlank(value)) return null;
  switch (type) {
    case TYPES.COORDINATE: {
      const n = Number(value);
      return Number.isFinite(n) ? n : null;
    }
    case TYPES.DATE: {
      const plain = typeof value === 'string' ? value.match(PLAIN_DATE_RE) : null;
      if (plain) return new Date(Date.UTC(Number(plain[1]), Number(plain[2]) - 1, Number(plain[3])));
      const p = lagosParts(value);
      return p ? wallClock(p, false) : null;
    }
    case TYPES.DATETIME: {
      const p = lagosParts(value);
      return p ? wallClock(p, true) : null;
    }
    case TYPES.LINK: {
      const url = String(value).trim();
      return HTTP_URL_RE.test(url) ? { text: url, hyperlink: url } : url;
    }
    default:
      return String(value);
  }
};

const displayLength = (v) => {
  if (v === null || v === undefined) return 0;
  if (v instanceof Date) return 17;
  if (typeof v === 'object' && v.text) return String(v.text).length;
  return String(v).length;
};

/** Same look as the portal's fillWorkbook: frozen bold header, filters, formats. */
const addSheet = (workbook, { name, columns, rows, autoFilter = true }) => {
  const ws = workbook.addWorksheet(name.slice(0, 31), { views: [{ state: 'frozen', ySplit: 1 }] });

  ws.columns = columns.map((c) => {
    const longest = Math.max(
      c.header.length,
      ...rows.slice(0, 500).map((r) => displayLength(toCellValue(r[c.key], c.type)))
    );
    return {
      header: c.header,
      key: c.key,
      width: c.width || Math.min(Math.max(longest + 2, 10), 60),
      style: { numFmt: NUM_FMT[c.type] || NUM_FMT.text }
    };
  });

  rows.forEach((r) => {
    const values = {};
    columns.forEach((c) => { values[c.key] = toCellValue(r[c.key], c.type); });
    const row = ws.addRow(values);
    columns.forEach((c) => {
      if (c.type === TYPES.LINK && values[c.key] && typeof values[c.key] === 'object') {
        row.getCell(c.key).font = { color: { argb: 'FF1D4ED8' }, underline: true };
      }
    });
  });

  const header = ws.getRow(1);
  header.font = { bold: true };
  header.alignment = { vertical: 'middle' };
  header.eachCell((cell) => {
    cell.numFmt = 'General';
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } } };
  });

  if (autoFilter && columns.length > 0) {
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  }
};

class CompletedInstallationsReportService {
  static fileName(discoCode, date = new Date()) {
    const slug = String(discoCode || 'all-discos').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
    return `completed-installations-${slug}-${date.toISOString().slice(0, 10)}.xlsx`;
  }

  /**
   * @param {object} args
   * @param {object[]} args.installations - formatted installation requests (with names)
   * @param {object[]} args.meters - formatted meters for their serials
   * @param {{ discoName: string, filters: string[], generatedAt?: Date }} args.context
   * @returns {Promise<Buffer>}
   */
  static async buildWorkbook({ installations, meters = [], context }) {
    const meterIndex = new Map();
    meters.forEach((m) => {
      const serial = m?.meterNumber != null ? String(m.meterNumber).trim() : '';
      if (serial && !meterIndex.has(serial)) meterIndex.set(serial, m);
    });
    const serialOf = (r) => (r.meterNumber != null ? String(r.meterNumber).trim() : '');

    // Newest installation first, as in the portal.
    const sorted = [...installations]
      .map((r) => ({ r, date: completionDateOf(r) || '' }))
      .sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? 1 : -1))
      .map((x) => x.r);

    const records = sorted.map((r) => {
      const meter = meterIndex.get(serialOf(r));
      const out = {};
      COLUMNS.forEach(([key, , , get]) => {
        const v = get(r, meter);
        out[key] = isBlank(v) ? null : v;
      });
      return out;
    });

    const columns = COLUMNS
      .filter(([key]) => ALWAYS_KEYS.has(key) || records.some((r) => !isBlank(r[key])))
      .map(([key, header, type]) => ({ key, header, type }));

    const byDisco = {};
    records.forEach((r) => { const d = r.disco || 'Not recorded'; byDisco[d] = (byDisco[d] || 0) + 1; });
    const withPicture = records.filter((r) => !isBlank(r.photoUrl)).length;
    const matchedMeters = sorted.filter((r) => meterIndex.has(serialOf(r))).length;
    const generated = lagosParts(context.generatedAt || new Date());

    const summaryRows = [
      { item: 'Report', value: 'Completed installations' },
      { item: 'Generated', value: `${generated.d}/${generated.mo + 1}/${generated.y}, ${pad(generated.h)}:${pad(generated.mi)}:${pad(generated.s)} (WAT)` },
      { item: 'DisCo scope', value: context.discoName },
      { item: 'Filters', value: context.filters.length ? context.filters.join('; ') : 'None' },
      { item: 'Completed statuses included', value: 'Installed, Exported (imported jobs)' },
      { item: 'Completed installations', value: String(records.length) },
      { item: '  Imported job', value: String(records.length) },
      ...Object.entries(byDisco).sort().map(([k, v]) => ({ item: `  DisCo ${k}`, value: String(v) })),
      { item: 'Installation pictures', value: `${withPicture} of ${records.length} have a picture link` },
      { item: 'Meter details matched', value: `${matchedMeters} of ${records.length}` },
      { item: 'Data completeness', value: 'Every completed installation in the selected scope is included.' }
    ];

    const workbook = new ExcelJS.Workbook();
    addSheet(workbook, { name: 'Completed Installations', columns, rows: records });
    addSheet(workbook, {
      name: 'Summary',
      autoFilter: false,
      columns: [
        { header: 'Item', key: 'item', type: TYPES.TEXT, width: 42 },
        { header: 'Value', key: 'value', type: TYPES.TEXT, width: 70 }
      ],
      rows: summaryRows
    });

    return Buffer.from(await workbook.xlsx.writeBuffer());
  }
}

module.exports = CompletedInstallationsReportService;
