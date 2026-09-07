/**
 * Spreadsheet normalization helpers for disco-driven imports.
 *
 * Every function here is pure and DB-free so it can be unit tested without a
 * database connection. The `transforms` registry is what disco import mappings
 * refer to by name (see src/config/discoDefaults.js), which keeps the mapping
 * JSON pure data instead of executable configuration.
 */

/**
 * Normalize a spreadsheet header for matching: uppercase, non-alphanumerics stripped.
 * Same idiom as ExcelService.parseMeterExcel so both parsers agree on what
 * "CUSTOMER ACCOUNT NUMBER" and "Customer Account number" mean.
 */
const headerKey = (header) => String(header ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/**
 * Expand "8.92342003826809e+18" to "8923420038268090000" using string math only.
 *
 * Float arithmetic must not be used here: SIM serials are 19 digits, far beyond
 * Number.MAX_SAFE_INTEGER, so Number(s).toFixed(0) silently yields wrong trailing
 * digits. Any precision Excel already discarded is genuinely unrecoverable, but
 * this at least preserves exactly the digits the cell showed us and pads zeros
 * rather than inventing float noise.
 */
const expandScientific = (s) => {
  const match = s.match(/^([+-]?)(\d+)(?:\.(\d+))?[eE]\+?(\d+)$/);
  if (!match) return s;

  const [, sign, intPart, frac = '', expStr] = match;
  const digits = intPart + frac;
  const pointPos = intPart.length + parseInt(expStr, 10);

  return pointPos >= digits.length
    ? sign + digits + '0'.repeat(pointPos - digits.length)
    : sign + digits.slice(0, pointPos) + '.' + digits.slice(pointPos);
};

const trim = (value) => {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s === '' ? null : s;
};

const transforms = {
  trim,

  upper: (value) => {
    const s = trim(value);
    return s === null ? null : s.toUpperCase();
  },

  /**
   * Identifier-ish text: whitespace removed entirely, scientific notation undone,
   * optionally zero-padded to a fixed width.
   *
   * Meter serials such as "0239110006909" are zero-padded 13-character strings.
   * Reading the sheet with { raw: false } keeps them as text, but if a cell was
   * genuinely stored as a number the leading zero is gone before we ever see it,
   * which is what `padStart` recovers.
   */
  text: (value, field) => {
    let s = trim(value);
    if (s === null) return null;

    s = s.replace(/\s+/g, '');
    if (/e\+?\d+$/i.test(s)) s = expandScientific(s);
    if (field && field.padStart && s.length < field.padStart) {
      s = s.padStart(field.padStart, '0');
    }

    return s;
  },

  number: (value) => {
    const s = trim(value);
    if (s === null) return null;
    const n = Number(s.replace(/[^0-9.\-]/g, ''));
    return Number.isFinite(n) ? n : null;
  },

  /**
   * Nigerian mobile numbers. Excel stores them as numbers and eats the leading
   * zero, so 08033425896 arrives as 8033425896.
   * Never rejects: an unrecognised shape is kept as digits rather than dropped.
   */
  ngPhone: (value) => {
    const digits = String(value ?? '').replace(/\D/g, '');
    if (!digits) return null;
    if (digits.length === 10) return `0${digits}`;
    if (digits.length === 13 && digits.startsWith('234')) return `0${digits.slice(3)}`;
    if (digits.length === 14 && digits.startsWith('2340')) return digits.slice(3);
    return digits;
  },

  /**
   * Meter phase. Deliberately structural rather than a lookup table, so the
   * source-data typo "SINGLE PPHASE" and the variant "Single Phase(TIS&P)" both
   * resolve correctly, as will future variants of the same class.
   * "Unknown" resolves to null, which the meter_type CHECK constraint allows.
   */
  phase: (value) => {
    const s = String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!s) return null;
    if (s.includes('THREE') || s.startsWith('3')) return 'THREE PHASE';
    if (s.includes('SINGLE') || s.startsWith('1')) return 'SINGLE PHASE';
    return null;
  },

  /**
   * Dates arrive as JS Date (cellDates), an ISO-ish string, or D/M/YYYY text.
   * Returns YYYY-MM-DD, or null when unparseable.
   */
  date: (value) => {
    if (value === null || value === undefined || value === '') return null;

    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value.toISOString().slice(0, 10);
    }

    const s = String(value).trim();

    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

    // D/M/YYYY or M/D/YYYY -- ambiguous, so prefer day-first (how these sheets are filled)
    const slash = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/);
    if (slash) {
      let [, a, b, year] = slash;
      let day = parseInt(a, 10);
      let month = parseInt(b, 10);
      if (day > 12 && month <= 12) {
        // unambiguous day-first
      } else if (month > 12 && day <= 12) {
        [day, month] = [month, day];
      }
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
    }

    const parsed = new Date(s);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
  }
};

const applyTransform = (name, value, field) => {
  const fn = transforms[name || 'trim'];
  if (!fn) throw new Error(`Unknown transform "${name}"`);
  return fn(value, field);
};

/**
 * Resolve each mapped field to a column index in the sheet's header row, once
 * per import rather than once per row.
 *
 * Throws when a required field has no matching column, naming the aliases we
 * looked for and the headers we actually saw. That single up-front check turns
 * "wrong file uploaded" into one clear message instead of N identical row errors.
 */
const resolveColumns = (headerRowValues, fields) => {
  const seen = new Map();
  headerRowValues.forEach((raw, index) => {
    const key = headerKey(raw);
    if (key && !seen.has(key)) seen.set(key, index);
  });

  const resolved = {};
  const missing = [];

  for (const [fieldName, field] of Object.entries(fields)) {
    const aliases = field.headers || [];
    const match = aliases.map((a) => headerKey(a)).find((a) => seen.has(a));

    if (match === undefined) {
      if (field.required) missing.push({ fieldName, aliases });
      continue;
    }

    resolved[fieldName] = seen.get(match);
  }

  if (missing.length > 0) {
    const observed = headerRowValues.map((h) => String(h ?? '').trim()).filter(Boolean).join(', ');
    const details = missing
      .map((m) => `"${m.fieldName}" (expected one of: ${m.aliases.join(', ')})`)
      .join('; ');
    throw new Error(`Could not find a column for ${details}. Sheet headers are: ${observed || '(none)'}`);
  }

  return resolved;
};

/**
 * Turn one raw sheet row (array of cells) into a normalized object.
 * Returns { values, extras } where extras holds every unmapped column, kept for
 * provenance when the mapping sets captureExtras.
 */
const applyMapping = (rowValues, columns, fields, options = {}) => {
  const { captureExtras = false, headerRowValues = [] } = options;
  const values = {};
  const raw = {};

  for (const [fieldName, field] of Object.entries(fields)) {
    const index = columns[fieldName];
    if (index === undefined) {
      values[fieldName] = null;
      continue;
    }

    const cell = rowValues[index];
    values[fieldName] = applyTransform(field.transform, cell, field);
    if (field.keepRaw) raw[fieldName] = trim(cell);
  }

  let extras = null;
  if (captureExtras) {
    const mappedIndexes = new Set(Object.values(columns));
    extras = {};
    headerRowValues.forEach((header, index) => {
      if (mappedIndexes.has(index)) return;
      const label = String(header ?? '').trim();
      const cell = trim(rowValues[index]);
      if (label && cell !== null) extras[label] = cell;
    });
    if (Object.keys(extras).length === 0) extras = null;
  }

  return { values, raw, extras };
};

module.exports = {
  headerKey,
  expandScientific,
  transforms,
  applyTransform,
  resolveColumns,
  applyMapping
};
