/**
 * Shared ExcelJS sheet writer for the staff-facing exports, matching the
 * portal's workbooks (m-web src/utils/xlsx.js): bold shaded header, frozen
 * first row, auto-filter, per-type number formats, clickable links.
 *
 * Excel has no time zones. Dates and times are written as Lagos wall-clock
 * time (the portal's users are in Nigeria), by building a Date from the
 * wall-clock parts as UTC.
 */

const TYPES = Object.freeze({
  TEXT: 'text',
  NUMBER: 'number',
  CURRENCY: 'currency',
  COORDINATE: 'coordinate',
  DATE: 'date',
  DATETIME: 'datetime',
  LINK: 'link',
  BOOLEAN: 'boolean'
});

const NUM_FMT = {
  text: '@',
  number: '#,##0.##',
  currency: '"₦"#,##0.00',
  coordinate: '0.000000',
  date: 'dd mmm yyyy',
  datetime: 'dd mmm yyyy hh:mm',
  link: '@',
  boolean: '@'
};

const TIME_ZONE = 'Africa/Lagos';

const PLAIN_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
// A wall-clock time with no zone, as the custom export selects it.
const WALL_CLOCK_RE = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})$/;
const HTTP_URL_RE = /^https?:\/\/\S+$/i;

const isBlank = (v) => v === null || v === undefined || String(v).trim() === '';
const pad = (n) => String(n).padStart(2, '0');

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

const wallClock = (p, withTime) =>
  new Date(Date.UTC(p.y, p.mo, p.d, withTime ? p.h : 0, withTime ? p.mi : 0, withTime ? p.s : 0));

const toNumber = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const n = Number(String(value).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : null;
};

/** The value to store in a cell for a column type, or null for an empty cell. */
const toCellValue = (value, type) => {
  if (isBlank(value)) return null;
  switch (type) {
    case TYPES.NUMBER:
    case TYPES.CURRENCY:
    case TYPES.COORDINATE:
      return toNumber(value);
    case TYPES.DATE: {
      const plain = typeof value === 'string' ? value.match(PLAIN_DATE_RE) : null;
      if (plain) return new Date(Date.UTC(Number(plain[1]), Number(plain[2]) - 1, Number(plain[3])));
      const p = lagosParts(value);
      return p ? wallClock(p, false) : null;
    }
    case TYPES.DATETIME: {
      const wall = typeof value === 'string' ? value.match(WALL_CLOCK_RE) : null;
      if (wall) {
        const [, y, mo, d, h, mi, s] = wall.map(Number);
        return new Date(Date.UTC(y, mo - 1, d, h, mi, s));
      }
      const p = lagosParts(value);
      return p ? wallClock(p, true) : null;
    }
    case TYPES.LINK: {
      const url = String(value).trim();
      return HTTP_URL_RE.test(url) ? { text: url, hyperlink: url } : url;
    }
    case TYPES.BOOLEAN:
      return value === true || value === 'true' ? 'Yes' : 'No';
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

/**
 * Add one sheet. `columns` are { key, header, type, width? }; `rows` are plain
 * objects keyed by column key.
 */
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
      // A long URL is capped in width; it stays whole in the cell.
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

  return ws;
};

/** "13/10/2026, 08:24:00 (WAT)" for a Summary sheet. */
const formatGeneratedAt = (date = new Date()) => {
  const p = lagosParts(date);
  return `${p.d}/${p.mo + 1}/${p.y}, ${pad(p.h)}:${pad(p.mi)}:${pad(p.s)} (WAT)`;
};

module.exports = {
  TYPES,
  NUM_FMT,
  TIME_ZONE,
  isBlank,
  lagosParts,
  toCellValue,
  addSheet,
  formatGeneratedAt
};
