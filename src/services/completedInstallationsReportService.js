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

const {
  TYPES, isBlank, lagosParts, addSheet, formatGeneratedAt
} = require('../utils/xlsxWriter');

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

const pick = (...values) => values.find((v) => !isBlank(v));

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

// Per-installer meter counts for the Summary sheet. Kept identical to the
// portal's installedMetersByInstaller (m-web completedInstallationsReport.js).
const NOT_RECORDED = 'Not recorded';
const PHASE_LABELS = { 'SINGLE PHASE': 'Single Phase', 'THREE PHASE': 'Three Phase' };
const PHASE_ORDER = ['Single Phase', 'Three Phase'];

/** The fitted meter's phase (inventory), else the job's meter type, as a label. */
const meterTypeLabel = (phase) => {
  if (isBlank(phase)) return NOT_RECORDED;
  const key = normalizePhase(phase);
  return PHASE_LABELS[key] || key;
};

const typeOrder = (a, b) => {
  const rank = (t) => (PHASE_ORDER.includes(t) ? PHASE_ORDER.indexOf(t) : t === NOT_RECORDED ? 99 : 2);
  return rank(a) - rank(b) || a.localeCompare(b);
};

/** "Single Phase: 20 · Three Phase: 3 · Total: 23" (non-zero types only). */
const formatTypeCounts = ({ byType, total }) =>
  [...Object.keys(byType).sort(typeOrder).map((t) => `${t}: ${byType[t]}`), `Total: ${total}`].join(' · ');

/**
 * [{ installer, byType: { label: n }, total }] for the given rows, busiest
 * installer first, "Not recorded" last. `installerOf` and `phaseOf` read one
 * row each.
 */
const installedMetersByInstaller = (rows, { installerOf, phaseOf }) => {
  const byInstaller = new Map();
  rows.forEach((row) => {
    const installer = installerOf(row) || NOT_RECORDED;
    const type = meterTypeLabel(phaseOf(row));
    const entry = byInstaller.get(installer) || { installer, byType: {}, total: 0 };
    entry.byType[type] = (entry.byType[type] || 0) + 1;
    entry.total += 1;
    byInstaller.set(installer, entry);
  });
  return [...byInstaller.values()].sort((a, b) =>
    (a.installer === NOT_RECORDED) - (b.installer === NOT_RECORDED)
    || b.total - a.total
    || a.installer.localeCompare(b.installer));
};

/** Summary rows: a heading, one row per installer, then all installers. */
const installerSummaryRows = (counts) => {
  const all = { byType: {}, total: 0 };
  counts.forEach((c) => {
    Object.entries(c.byType).forEach(([t, n]) => { all.byType[t] = (all.byType[t] || 0) + n; });
    all.total += c.total;
  });
  return [
    { item: 'Installed meters by installer', value: "Meter type is the phase of the meter fitted (inventory), else the job's meter type" },
    ...counts.map((c) => ({ item: `  ${c.installer}`, value: formatTypeCounts(c) })),
    { item: '  All installers', value: formatTypeCounts(all) }
  ];
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

    const summaryRows = [
      { item: 'Report', value: 'Completed installations' },
      { item: 'Generated', value: formatGeneratedAt(context.generatedAt) },
      { item: 'DisCo scope', value: context.discoName },
      { item: 'Filters', value: context.filters.length ? context.filters.join('; ') : 'None' },
      { item: 'Completed statuses included', value: 'Installed, Exported (imported jobs)' },
      { item: 'Completed installations', value: String(records.length) },
      { item: '  Imported job', value: String(records.length) },
      ...Object.entries(byDisco).sort().map(([k, v]) => ({ item: `  DisCo ${k}`, value: String(v) })),
      { item: 'Installation pictures', value: `${withPicture} of ${records.length} have a picture link` },
      { item: 'Meter details matched', value: `${matchedMeters} of ${records.length}` },
      { item: 'Data completeness', value: 'Every completed installation in the selected scope is included.' },
      ...installerSummaryRows(installedMetersByInstaller(sorted, {
        installerOf: (r) => pick(r.installerName, r.assigneeName),
        phaseOf: (r) => pick(meterIndex.get(serialOf(r))?.phaseType, r.meterType)
      }))
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
module.exports.installedMetersByInstaller = installedMetersByInstaller;
module.exports.formatTypeCounts = formatTypeCounts;
