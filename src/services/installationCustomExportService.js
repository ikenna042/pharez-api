const ExcelJS = require('exceljs');
const Cursor = require('pg-cursor');
const pool = require('../config/database');
const {
  TZ, FROM_CLAUSE, FIELDS, OPS, DATE_PRESETS, DATE_BUCKETS, METRICS, LIMITS, lagosDate, own, canSee
} = require('../config/installationExportFields');
const { TYPES, addSheet, formatGeneratedAt } = require('../utils/xlsxWriter');

/**
 * The custom installations export: the caller picks columns, filters and an
 * optional grouping; the result is an Excel workbook or a CSV.
 *
 * All SQL comes from src/config/installationExportFields.js. A request only
 * ever names keys from it; every value is a bound parameter.
 */

const FORMATS = ['xlsx', 'csv'];
const PLAIN_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_TYPES = ['date', 'datetime'];
const NUMERIC_TYPES = ['number', 'currency', 'coordinate'];

const OP_WORDS = {
  eq: 'is', in: 'is one of', notIn: 'is not one of', contains: 'contains', startsWith: 'starts with',
  isBlank: 'is blank', isNotBlank: 'is not blank', gte: 'is at least', lte: 'is at most',
  between: 'is between', on: 'is on', preset: 'is in'
};

const isPlainDate = (v) => typeof v === 'string' && PLAIN_DATE_RE.test(v) && !Number.isNaN(new Date(`${v}T00:00:00Z`).getTime());
const isNumberLike = (v) => (typeof v === 'number' && Number.isFinite(v)) || (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)));
const escapeLike = (s) => String(s).replace(/[\\%_]/g, (c) => `\\${c}`);

// How a field is SELECTed for output. Dates leave the database as text so no
// driver time-zone conversion can shift them: dates as 'YYYY-MM-DD', times as
// Lagos wall-clock 'YYYY-MM-DDTHH24:MI:SS'.
const outputSql = (field) => {
  if (field.type === 'date') return `to_char(${field.sql}, 'YYYY-MM-DD')`;
  if (field.type === 'datetime') return `to_char(${field.sql} AT TIME ZONE '${TZ}', 'YYYY-MM-DD"T"HH24:MI:SS')`;
  return field.sql;
};

// The calendar-day expression a date filter compares.
const dayExpr = (field) => (field.type === 'datetime' ? lagosDate(field.sql) : field.sql);

const XLSX_TYPE = {
  text: TYPES.TEXT, enum: TYPES.TEXT, number: TYPES.NUMBER, currency: TYPES.CURRENCY,
  coordinate: TYPES.COORDINATE, date: TYPES.DATE, datetime: TYPES.DATETIME, link: TYPES.LINK, boolean: TYPES.BOOLEAN
};

class InstallationCustomExportService {
  /** What the caller may use, for building the export screen. */
  static describe(user) {
    const fields = Object.entries(FIELDS)
      .filter(([, f]) => canSee(f, user))
      .map(([key, f]) => ({
        key,
        label: f.label,
        section: f.section,
        type: f.type,
        ops: OPS[f.type],
        groupable: Boolean(f.groupable),
        ...(f.values ? { values: f.values } : {}),
        default: Boolean(f.default)
      }));

    return {
      fields,
      datePresets: Object.keys(DATE_PRESETS),
      dateBuckets: Object.keys(DATE_BUCKETS),
      metrics: Object.entries(METRICS)
        .filter(([, m]) => canSee(m, user))
        .map(([key, m]) => ({ key, label: m.label })),
      formats: FORMATS,
      limits: { ...LIMITS }
    };
  }

  /**
   * Check a request against the catalogue and the caller's role. Collects
   * every problem rather than stopping at the first. Returns { errors } or
   * { spec } (normalised).
   */
  static validate(body, user) {
    const errors = [];
    const input = body || {};
    const fieldFor = (key, where) => {
      const field = own(FIELDS, key);
      if (!field) { errors.push(`${where}: unknown field "${key}"`); return null; }
      if (!canSee(field, user)) { errors.push(`${where}: "${key}" is not available to your role`); return null; }
      return field;
    };

    const format = input.format || 'xlsx';
    if (!FORMATS.includes(format)) errors.push(`format must be one of: ${FORMATS.join(', ')}`);

    // Columns: default set when none are given; duplicates collapse.
    const requested = Array.isArray(input.columns) && input.columns.length > 0
      ? input.columns
      : Object.keys(FIELDS).filter((k) => FIELDS[k].default && canSee(FIELDS[k], user));
    const columns = [...new Set(requested)].filter((key) => fieldFor(key, 'columns'));

    // Filters
    const filters = [];
    (Array.isArray(input.filters) ? input.filters : []).forEach((f, i) => {
      const where = `filters[${i}]`;
      if (!f || typeof f !== 'object') { errors.push(`${where}: must be an object`); return; }
      const field = fieldFor(f.field, where);
      if (!field) return;
      const op = f.op;
      if (!OPS[field.type].includes(op)) {
        errors.push(`${where}: "${f.field}" (${field.type}) does not support "${op}". Use one of: ${OPS[field.type].join(', ')}`);
        return;
      }
      const problem = this.checkValue(field, op, f.value);
      if (problem) { errors.push(`${where} (${f.field} ${op}): ${problem}`); return; }
      filters.push({ key: f.field, op, value: f.value });
    });
    if (filters.length > LIMITS.filters) errors.push(`At most ${LIMITS.filters} filters`);

    // Grouping: "field" or "field:bucket" (dates default to day).
    const groupBy = [];
    (Array.isArray(input.groupBy) ? input.groupBy : []).forEach((g, i) => {
      const where = `groupBy[${i}]`;
      const [key, bucketKey] = String(g).split(':');
      const field = fieldFor(key, where);
      if (!field) return;
      if (!field.groupable) { errors.push(`${where}: "${key}" can't be grouped on`); return; }
      const isDate = DATE_TYPES.includes(field.type);
      if (bucketKey && !isDate) { errors.push(`${where}: only date fields take a bucket (":day", ":week"...)`); return; }
      const bucket = isDate ? (bucketKey || 'day') : null;
      if (bucket && !own(DATE_BUCKETS, bucket)) {
        errors.push(`${where}: unknown bucket "${bucket}". Use one of: ${Object.keys(DATE_BUCKETS).join(', ')}`);
        return;
      }
      groupBy.push({ key, bucket });
    });
    if (groupBy.length > LIMITS.groupBy) errors.push(`At most ${LIMITS.groupBy} groupBy fields`);

    // Metrics only mean something with a grouping.
    let metrics = [];
    if (Array.isArray(input.metrics) && input.metrics.length > 0) {
      if (groupBy.length === 0) errors.push('metrics need groupBy');
      input.metrics.forEach((key, i) => {
        const metric = own(METRICS, key);
        if (!metric) errors.push(`metrics[${i}]: unknown metric "${key}"`);
        else if (!canSee(metric, user)) errors.push(`metrics[${i}]: "${key}" is not available to your role`);
        else if (!metrics.includes(key)) metrics.push(key);
      });
    } else if (groupBy.length > 0) {
      metrics = ['count'];
    }

    const sort = [];
    (Array.isArray(input.sort) ? input.sort : []).forEach((s, i) => {
      const where = `sort[${i}]`;
      const field = s && fieldFor(s.field, where);
      if (!field) return;
      const dir = String(s.dir || 'asc').toLowerCase();
      if (!['asc', 'desc'].includes(dir)) { errors.push(`${where}: dir must be asc or desc`); return; }
      sort.push({ key: s.field, dir });
    });
    if (sort.length > LIMITS.sort) errors.push(`At most ${LIMITS.sort} sort fields`);

    if (groupBy.length === 0 && columns.length === 0 && errors.length === 0) errors.push('Choose at least one column');

    return errors.length > 0 ? { errors } : { spec: { format, columns, filters, groupBy, metrics, sort } };
  }

  /** null when the value suits the operator, else what's wrong. */
  static checkValue(field, op, value) {
    if (op === 'isBlank' || op === 'isNotBlank') return null;
    const isDate = DATE_TYPES.includes(field.type);
    const isNumeric = NUMERIC_TYPES.includes(field.type);
    const scalarOk = (v) => (isDate ? isPlainDate(v) : isNumeric ? isNumberLike(v) : typeof v === 'string' && v.trim() !== '');
    const expected = isDate ? 'a YYYY-MM-DD date' : isNumeric ? 'a number' : 'non-empty text';

    switch (op) {
      case 'preset':
        return own(DATE_PRESETS, value) ? null : `value must be one of: ${Object.keys(DATE_PRESETS).join(', ')}`;
      case 'in':
      case 'notIn':
        if (!Array.isArray(value) || value.length === 0 || value.length > 500) return 'value must be a list of 1-500 items';
        if (field.values) {
          const bad = value.filter((v) => !field.values.includes(v));
          return bad.length ? `unknown value(s) ${bad.join(', ')}. Use: ${field.values.join(', ')}` : null;
        }
        return value.every((v) => typeof v === 'string' && v.trim() !== '') ? null : 'every item must be non-empty text';
      case 'between':
        if (!Array.isArray(value) || value.length !== 2 || !value.every(scalarOk)) return `value must be [from, to], each ${expected}`;
        return (isDate ? value[0] > value[1] : Number(value[0]) > Number(value[1])) ? 'from must not be after to' : null;
      case 'eq':
        if (field.type === 'boolean') return typeof value === 'boolean' ? null : 'value must be true or false';
        return scalarOk(value) ? null : `value must be ${expected}`;
      default: // contains, startsWith, gte, lte, on
        if (op === 'contains' || op === 'startsWith') return typeof value === 'string' && value.trim() !== '' ? null : 'value must be non-empty text';
        return scalarOk(value) ? null : `value must be ${expected}`;
    }
  }

  /** WHERE clause and params for the spec's filters plus the disco scope. */
  static buildWhere(spec, discoIds) {
    const params = [];
    const p = (v) => { params.push(v); return `$${params.length}`; };
    const clauses = [];

    // null = every disco (SUPERADMIN); [] = none.
    if (discoIds) clauses.push(`r.disco_id = ANY(${p(discoIds)}::int[])`);

    spec.filters.forEach(({ key, op, value }) => {
      const field = FIELDS[key];
      const e = field.sql;
      const textual = ['text', 'link', 'enum'].includes(field.type);
      const isDate = DATE_TYPES.includes(field.type);
      const day = isDate ? dayExpr(field) : null;

      switch (op) {
        case 'isBlank':
          clauses.push(textual ? `NULLIF(TRIM((${e})::text), '') IS NULL` : `(${e}) IS NULL`);
          break;
        case 'isNotBlank':
          clauses.push(textual ? `NULLIF(TRIM((${e})::text), '') IS NOT NULL` : `(${e}) IS NOT NULL`);
          break;
        case 'eq':
          if (field.type === 'boolean') clauses.push(`(${e}) = ${p(value)}`);
          else if (textual) clauses.push(`LOWER(TRIM((${e})::text)) = LOWER(TRIM(${p(value)}))`);
          else clauses.push(`(${e}) = ${p(Number(value))}`);
          break;
        case 'in':
          clauses.push(field.values
            ? `(${e}) = ANY(${p(value)}::text[])`
            : `LOWER(TRIM((${e})::text)) = ANY(${p(value.map((v) => v.trim().toLowerCase()))}::text[])`);
          break;
        case 'notIn':
          clauses.push(`((${e}) IS NULL OR (${e}) <> ALL(${p(value)}::text[]))`);
          break;
        case 'contains':
          clauses.push(`(${e})::text ILIKE ${p(`%${escapeLike(value.trim())}%`)}`);
          break;
        case 'startsWith':
          clauses.push(`(${e})::text ILIKE ${p(`${escapeLike(value.trim())}%`)}`);
          break;
        case 'on':
          clauses.push(`${day} = ${p(value)}::date`);
          break;
        case 'gte':
          clauses.push(isDate ? `${day} >= ${p(value)}::date` : `(${e}) >= ${p(Number(value))}`);
          break;
        case 'lte':
          clauses.push(isDate ? `${day} <= ${p(value)}::date` : `(${e}) <= ${p(Number(value))}`);
          break;
        case 'between':
          clauses.push(isDate
            ? `${day} BETWEEN ${p(value[0])}::date AND ${p(value[1])}::date`
            : `(${e}) BETWEEN ${p(Number(value[0]))} AND ${p(Number(value[1]))}`);
          break;
        case 'preset': {
          const [from, to] = DATE_PRESETS[value];
          clauses.push(`(${day} >= ${from} AND ${day} < ${to})`);
          break;
        }
        default:
          throw new Error(`Unhandled operator ${op}`);
      }
    });

    return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
  }

  /** The grouping expression and output label for one groupBy entry. */
  static groupExpr({ key, bucket }) {
    const field = FIELDS[key];
    if (!bucket) return field.sql;
    const b = DATE_BUCKETS[bucket];
    return `to_char(date_trunc('${b.trunc}', ${dayExpr(field)}), '${b.format}')`;
  }

  static groupLabel({ key, bucket }) {
    return bucket ? `${FIELDS[key].label} (${bucket})` : FIELDS[key].label;
  }

  /** SELECT for the detail rows. Aliases are c0, c1... in column order. */
  static rowsQuery(spec, discoIds) {
    const { where, params } = this.buildWhere(spec, discoIds);
    const select = spec.columns.map((key, i) => `${outputSql(FIELDS[key])} AS c${i}`).join(', ');
    const order = [
      ...spec.sort.map(({ key, dir }) => `${FIELDS[key].sql} ${dir.toUpperCase()} NULLS LAST`),
      'r.created_at DESC', 'r.id DESC'
    ].join(', ');
    return { text: `SELECT ${select} ${FROM_CLAUSE} ${where} ORDER BY ${order}`, params };
  }

  /** SELECT for grouped totals. Aliases g0.. for groups, m0.. for metrics. */
  static groupsQuery(spec, discoIds) {
    const { where, params } = this.buildWhere(spec, discoIds);
    const groups = spec.groupBy.map((g, i) => `${this.groupExpr(g)} AS g${i}`);
    const metrics = spec.metrics.map((key, i) => `${METRICS[key].sql} AS m${i}`);
    const positions = spec.groupBy.map((_, i) => i + 1).join(', ');
    return {
      text: `SELECT ${[...groups, ...metrics].join(', ')} ${FROM_CLAUSE} ${where}
             GROUP BY ${positions} ORDER BY ${spec.groupBy.map((_, i) => `${i + 1} ASC NULLS LAST`).join(', ')}`,
      params
    };
  }

  /** Rows the export would contain (detail rows, or groups when grouped). */
  static async count(spec, discoIds) {
    if (spec.groupBy.length > 0) {
      const { text, params } = this.groupsQuery(spec, discoIds);
      const r = await pool.query(`SELECT COUNT(*)::int AS n FROM (${text}) g`, params);
      return r.rows[0].n;
    }
    const { where, params } = this.buildWhere(spec, discoIds);
    const r = await pool.query(`SELECT COUNT(*)::int AS n ${FROM_CLAUSE} ${where}`, params);
    return r.rows[0].n;
  }

  /** Every filter as a sentence, for the Summary sheet and the log. */
  static describeFilters(spec) {
    return spec.filters.map(({ key, op, value }) => {
      const field = FIELDS[key];
      let shown = '';
      if (op === 'between') shown = ` ${value[0]} and ${value[1]}`;
      else if (Array.isArray(value)) shown = ` ${value.join(', ')}`;
      else if (op === 'preset') shown = ` ${value}`;
      else if (value !== undefined && op !== 'isBlank' && op !== 'isNotBlank') shown = ` ${value}`;
      return `${field.label} ${OP_WORDS[op]}${shown}`;
    });
  }

  static outputColumns(spec) {
    return spec.columns.map((key, i) => ({ key: `c${i}`, header: FIELDS[key].label, type: XLSX_TYPE[FIELDS[key].type] }));
  }

  static groupColumns(spec) {
    return [
      ...spec.groupBy.map((g, i) => {
        const field = FIELDS[g.key];
        return { key: `g${i}`, header: this.groupLabel(g), type: g.bucket ? TYPES.TEXT : XLSX_TYPE[field.type] };
      }),
      ...spec.metrics.map((key, i) => ({ key: `m${i}`, header: METRICS[key].label, type: XLSX_TYPE[METRICS[key].type] }))
    ];
  }

  /** The grouped rows, with a closing Total row for the summable metrics. */
  static withTotalRow(spec, rows) {
    if (rows.length === 0) return rows;
    const total = { g0: 'Total' };
    spec.metrics.forEach((key, i) => {
      if (METRICS[key].summable) total[`m${i}`] = rows.reduce((sum, r) => sum + Number(r[`m${i}`] || 0), 0);
    });
    return [...rows, total];
  }

  static fileName(spec, date = new Date()) {
    return `installations-export-${date.toISOString().slice(0, 10)}.${spec.format}`;
  }

  /**
   * The Excel workbook: a Data sheet when columns were chosen, a Totals sheet
   * when grouped, and a Summary sheet describing the request.
   */
  static async buildWorkbook(spec, discoIds, context) {
    const workbook = new ExcelJS.Workbook();
    let rowCount = 0;

    if (spec.columns.length > 0) {
      const { text, params } = this.rowsQuery(spec, discoIds);
      const { rows } = await pool.query(text, params);
      rowCount = rows.length;
      addSheet(workbook, { name: 'Data', columns: this.outputColumns(spec), rows });
    }

    let groupCount = null;
    if (spec.groupBy.length > 0) {
      const { text, params } = this.groupsQuery(spec, discoIds);
      const { rows } = await pool.query(text, params);
      groupCount = rows.length;
      addSheet(workbook, { name: 'Totals', columns: this.groupColumns(spec), rows: this.withTotalRow(spec, rows) });
    }

    const filters = this.describeFilters(spec);
    addSheet(workbook, {
      name: 'Summary',
      autoFilter: false,
      columns: [
        { key: 'item', header: 'Item', type: TYPES.TEXT, width: 32 },
        { key: 'value', header: 'Value', type: TYPES.TEXT, width: 90 }
      ],
      rows: [
        { item: 'Report', value: 'Custom installations export' },
        { item: 'Generated', value: formatGeneratedAt() },
        { item: 'Generated by', value: context.generatedBy },
        { item: 'DisCo scope', value: context.scopeLabel },
        { item: 'Filters', value: filters.length ? filters[0] : 'None' },
        ...filters.slice(1).map((f) => ({ item: '', value: f })),
        { item: 'Grouped by', value: spec.groupBy.length ? spec.groupBy.map((g) => this.groupLabel(g)).join(', ') : 'None' },
        ...(spec.groupBy.length ? [{ item: 'Totals', value: spec.metrics.map((k) => METRICS[k].label).join(', ') }] : []),
        ...(spec.columns.length ? [{ item: 'Rows', value: String(rowCount) }] : []),
        ...(groupCount !== null ? [{ item: 'Groups', value: String(groupCount) }] : []),
        { item: 'Columns', value: spec.columns.map((k) => FIELDS[k].label).join(', ') || 'None (totals only)' },
        { item: 'Times', value: 'Lagos time (WAT). Date filters are whole calendar days, both ends included.' }
      ]
    });

    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  /**
   * Stream a CSV to `out`: the detail rows, or the grouped totals when
   * grouped. A pg cursor keeps memory flat on large exports.
   */
  static async streamCsv(spec, discoIds, out) {
    const grouped = spec.groupBy.length > 0;
    const columns = grouped ? this.groupColumns(spec) : this.outputColumns(spec);
    const { text, params } = grouped ? this.groupsQuery(spec, discoIds) : this.rowsQuery(spec, discoIds);

    const cell = (value, type) => {
      if (value === null || value === undefined) return '';
      let s;
      if (type === TYPES.BOOLEAN) s = value ? 'Yes' : 'No';
      else if (type === TYPES.DATETIME) s = String(value).replace('T', ' ');
      else s = String(value);
      return /[",\r\n]/.test(s) || /^[=+\-@]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const line = (values) => `${values.join(',')}\r\n`;

    // BOM so Excel reads the file as UTF-8 (₦, accented names).
    out.write(`﻿${line(columns.map((c) => cell(c.header, TYPES.TEXT)))}`);

    const client = await pool.connect();
    try {
      const cursor = client.query(new Cursor(text, params));
      const read = () => new Promise((resolve, reject) => cursor.read(2000, (err, rows) => (err ? reject(err) : resolve(rows))));
      let rows = await read();
      const totals = {};
      while (rows.length > 0) {
        let chunk = '';
        rows.forEach((r) => {
          if (grouped) spec.metrics.forEach((key, i) => { if (METRICS[key].summable) totals[i] = (totals[i] || 0) + Number(r[`m${i}`] || 0); });
          chunk += line(columns.map((c) => cell(r[c.key], c.type)));
        });
        if (!out.write(chunk)) await new Promise((resolve) => out.once('drain', resolve));
        rows = await read();
      }
      if (grouped) {
        out.write(line(columns.map((c, i) => {
          if (i === 0) return 'Total';
          const m = c.key.startsWith('m') ? Number(c.key.slice(1)) : null;
          return m !== null && totals[m] !== undefined ? cell(totals[m], c.type) : '';
        })));
      }
      await new Promise((resolve, reject) => cursor.close((err) => (err ? reject(err) : resolve())));
    } finally {
      client.release();
    }
    out.end();
  }
}

module.exports = InstallationCustomExportService;
