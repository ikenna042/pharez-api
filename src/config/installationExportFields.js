/**
 * Every field the custom installations export can show, filter or group on.
 *
 * Whitelist, not interpolation: a request names fields by KEY, and only the
 * `sql` stored here ever reaches a query. Values are always bound parameters.
 * Lookups go through own(), so inherited names ('constructor', 'toString')
 * are not fields (same rule as src/utils/financeFilters.js).
 *
 * Every expression is written against the aliases of FROM_CLAUSE.
 *
 * Field shape:
 *   label      column header and UI label
 *   section    UI grouping for the column picker
 *   type       text | enum | number | currency | coordinate | date | datetime | link | boolean
 *   sql        the value expression
 *   groupable  may appear in groupBy (dates group by a day/week/month/year bucket)
 *   values     enum members
 *   access     'contact' (customer phone/email) or 'finance' (money); absent = every export role
 *   default    part of the default column set
 */

const TZ = 'Africa/Lagos';

const FROM_CLAUSE = `
  FROM installation_request r
  JOIN discos d ON d.id = r.disco_id
  LEFT JOIN users ua ON ua.id = r.assigned_to
  LEFT JOIN users ub ON ub.id = r.assigned_by
  LEFT JOIN users ui ON ui.id = r.installed_by
  LEFT JOIN users uc ON uc.id = r.completed_by
  LEFT JOIN meters m ON m.id = r.meter_id
  LEFT JOIN import_batches ib ON ib.id = r.import_batch_id
  LEFT JOIN assignment_batches ab ON ab.id = r.assignment_batch_id
  LEFT JOIN export_batches eb ON eb.id = r.export_batch_id
`;

const fullName = (alias) => `NULLIF(TRIM(CONCAT_WS(' ', ${alias}.first_name, ${alias}.last_name)), '')`;
const lagosDate = (expr) => `(${expr} AT TIME ZONE '${TZ}')::date`;
const sealDigits = (alias) => `regexp_replace(${alias}.seal_number, '[^0-9]', '', 'g')`;

const STATUSES = ['PENDING', 'ASSIGNED', 'IN_PROGRESS', 'INSTALLED', 'EXPORTED', 'FAILED', 'CANCELLED'];
const PHASES = ['SINGLE PHASE', 'THREE PHASE'];
const ROLES = ['SUPERADMIN', 'ADMIN', 'SUPERVISOR', 'INSTALLER'];

const FIELDS = {
  // Record
  id: { label: 'Installation ID', section: 'Record', type: 'number', sql: 'r.id', default: true },
  discoCode: { label: 'DisCo', section: 'Record', type: 'text', sql: 'd.code', groupable: true, default: true },
  discoName: { label: 'DisCo Name', section: 'Record', type: 'text', sql: 'd.name', groupable: true },
  status: { label: 'Status', section: 'Record', type: 'enum', values: STATUSES, sql: 'r.status', groupable: true, default: true },
  source: { label: 'Source', section: 'Record', type: 'enum', values: ['IMPORT', 'API', 'MANUAL'], sql: 'r.source', groupable: true },
  createdAt: { label: 'Imported / Created At', section: 'Record', type: 'datetime', sql: 'r.created_at', groupable: true },
  updatedAt: { label: 'Last Updated', section: 'Record', type: 'datetime', sql: 'r.updated_at', groupable: true },

  // Customer
  accountNumber: { label: 'Account Number', section: 'Customer', type: 'text', sql: 'r.account_number', default: true },
  customerName: { label: 'Customer Name', section: 'Customer', type: 'text', sql: 'r.customer_name', default: true },
  customerPhone: { label: 'Customer Phone', section: 'Customer', type: 'text', sql: 'r.customer_phone', access: 'contact' },
  customerEmail: { label: 'Customer Email', section: 'Customer', type: 'text', sql: 'r.customer_email', access: 'contact' },
  customerAddress: { label: 'Customer Address', section: 'Customer', type: 'text', sql: 'r.customer_address' },
  region: { label: 'Region', section: 'Customer', type: 'text', sql: 'r.region', groupable: true },
  area: { label: 'Area', section: 'Customer', type: 'text', sql: 'r.area', groupable: true },

  // Network
  feederName: { label: 'Feeder', section: 'Network', type: 'text', sql: 'r.feeder_name', groupable: true, default: true },
  transformerName: { label: 'Transformer', section: 'Network', type: 'text', sql: 'r.transformer_name', groupable: true },
  transformerCode: { label: 'Transformer Code', section: 'Network', type: 'text', sql: 'r.transformer_code', groupable: true },
  installationPosition: { label: 'Installation Position', section: 'Network', type: 'text', sql: 'r.installation_position', groupable: true },
  meterType: { label: 'Meter Type (job)', section: 'Network', type: 'enum', values: PHASES, sql: 'r.meter_type', groupable: true, default: true },
  meterVendor: { label: 'Meter Vendor', section: 'Network', type: 'text', sql: 'r.meter_vendor', groupable: true },

  // Import
  importBatchRef: { label: 'Import Batch', section: 'Import', type: 'text', sql: 'ib.batch_ref', groupable: true },
  importFileName: { label: 'Import File', section: 'Import', type: 'text', sql: 'ib.file_name', groupable: true },
  sourceRowNumber: { label: 'Source Sheet Row', section: 'Import', type: 'number', sql: 'r.source_row_number' },

  // Assignment
  assignmentBatchRef: { label: 'Assignment Batch', section: 'Assignment', type: 'text', sql: 'ab.batch_ref', groupable: true },
  dispatchRef: { label: 'Dispatch Reference', section: 'Assignment', type: 'text', sql: 'ab.dispatch_ref', groupable: true },
  assigneeName: { label: 'Assigned Installer', section: 'Assignment', type: 'text', sql: fullName('ua'), groupable: true, default: true },
  assigneePhone: { label: 'Assigned Installer Phone', section: 'Assignment', type: 'text', sql: 'ua.phone' },
  assignedByName: { label: 'Assigned By', section: 'Assignment', type: 'text', sql: fullName('ub'), groupable: true },
  assignedAt: { label: 'Assigned At', section: 'Assignment', type: 'datetime', sql: 'r.assigned_at', groupable: true },
  startedAt: { label: 'Started At', section: 'Assignment', type: 'datetime', sql: 'r.started_at', groupable: true },

  // Completion
  meterNumber: { label: 'Meter Number', section: 'Completion', type: 'text', sql: 'r.meter_number', default: true },
  sealNumber: { label: 'Seal Number', section: 'Completion', type: 'text', sql: 'r.seal_number', default: true },
  sealDigits: { label: 'Seal Number (digits)', section: 'Completion', type: 'text', sql: sealDigits('r') },
  installationDate: { label: 'Installation Date', section: 'Completion', type: 'date', sql: 'r.installation_date', groupable: true, default: true },
  reportedAt: { label: 'Completed / Reported At', section: 'Completion', type: 'datetime', sql: 'r.reported_at', groupable: true, default: true },
  latitude: { label: 'Latitude', section: 'Completion', type: 'coordinate', sql: 'r.latitude' },
  longitude: { label: 'Longitude', section: 'Completion', type: 'coordinate', sql: 'r.longitude' },
  hasGps: { label: 'Has GPS', section: 'Completion', type: 'boolean', sql: '(r.latitude IS NOT NULL AND r.longitude IS NOT NULL)', groupable: true },
  installationPhotoUrl: { label: 'Installation Picture Link', section: 'Completion', type: 'link', sql: 'r.installation_photo_url' },
  hasPicture: { label: 'Has Picture', section: 'Completion', type: 'boolean', sql: "(NULLIF(TRIM(r.installation_photo_url), '') IS NOT NULL)", groupable: true },
  discoSupervisor: { label: 'DisCo Supervisor', section: 'Completion', type: 'text', sql: 'r.disco_supervisor', groupable: true },
  installerName: { label: 'Installer (of record)', section: 'Completion', type: 'text', sql: fullName('ui'), groupable: true, default: true },
  completedByName: { label: 'Completed By', section: 'Completion', type: 'text', sql: fullName('uc'), groupable: true },
  completedByRole: { label: 'Completed By Role', section: 'Completion', type: 'enum', values: ROLES, sql: 'uc.role', groupable: true },
  installationNotes: { label: 'Installation Notes', section: 'Completion', type: 'text', sql: 'r.installation_notes' },
  failureReason: { label: 'Failure Reason', section: 'Completion', type: 'text', sql: 'r.failure_reason' },

  // Meter inventory (the meter fitted on the job)
  meterSimNumber: { label: 'SIM Serial Number', section: 'Meter', type: 'text', sql: 'm.sim_number' },
  meterMake: { label: 'Meter Make', section: 'Meter', type: 'text', sql: 'm.meter_make', groupable: true },
  meterModel: { label: 'Meter Model', section: 'Meter', type: 'text', sql: 'm.model', groupable: true },
  meterSgcNumber: { label: 'SGC Number', section: 'Meter', type: 'text', sql: 'm.sgc_number', groupable: true },
  meterManufacturedDate: { label: 'Meter Manufactured Date', section: 'Meter', type: 'text', sql: 'm.manufactured_date', groupable: true },
  meterPhase: { label: 'Meter Phase (inventory)', section: 'Meter', type: 'enum', values: PHASES, sql: 'm.phase_type', groupable: true },
  meterStatus: { label: 'Meter Status (inventory)', section: 'Meter', type: 'enum', values: ['AVAILABLE', 'INSTALLED', 'FAULTY', 'RETIRED'], sql: 'm.status', groupable: true },

  // Export to the disco
  exportBatchRef: { label: 'Export Batch', section: 'Export to DisCo', type: 'text', sql: 'eb.batch_ref', groupable: true },
  exportedAt: { label: 'Exported At', section: 'Export to DisCo', type: 'datetime', sql: 'r.exported_at', groupable: true },
  exportCount: { label: 'Times Exported', section: 'Export to DisCo', type: 'number', sql: 'COALESCE(r.export_count, 0)', groupable: true },

  // Revenue (SUPERADMIN, ADMIN -- the /finance roles)
  revenueAmount: { label: 'Revenue (₦)', section: 'Revenue', type: 'currency', sql: 'r.payment_amount', access: 'finance' },
  revenueStatus: { label: 'Revenue Status', section: 'Revenue', type: 'enum', values: ['EARNED', 'ESTIMATED'], sql: 'r.payment_status', groupable: true, access: 'finance' },
  revenueSource: { label: 'Revenue Source', section: 'Revenue', type: 'text', sql: 'r.payment_source', groupable: true, access: 'finance' },

  // Derived
  daysImportToInstall: {
    label: 'Days from Import to Install', section: 'Derived', type: 'number', groupable: true,
    sql: `(${lagosDate('r.reported_at')} - ${lagosDate('r.created_at')})`
  },
  daysAssignToInstall: {
    label: 'Days from Assignment to Install', section: 'Derived', type: 'number', groupable: true,
    sql: `(${lagosDate('r.reported_at')} - ${lagosDate('r.assigned_at')})`
  },
  sealUsedElsewhere: {
    label: 'Seal Used on Another Job', section: 'Derived', type: 'boolean', groupable: true,
    sql: `(r.seal_number IS NOT NULL AND EXISTS (
      SELECT 1 FROM installation_request r2
      WHERE ${sealDigits('r2')} = ${sealDigits('r')} AND r2.id <> r.id))`
  }
};

// Operators each type accepts.
const OPS = {
  text: ['eq', 'in', 'contains', 'startsWith', 'isBlank', 'isNotBlank'],
  link: ['contains', 'isBlank', 'isNotBlank'],
  enum: ['in', 'notIn', 'isBlank', 'isNotBlank'],
  number: ['eq', 'gte', 'lte', 'between', 'isBlank', 'isNotBlank'],
  currency: ['eq', 'gte', 'lte', 'between', 'isBlank', 'isNotBlank'],
  coordinate: ['gte', 'lte', 'between', 'isBlank', 'isNotBlank'],
  date: ['on', 'gte', 'lte', 'between', 'preset', 'isBlank', 'isNotBlank'],
  datetime: ['on', 'gte', 'lte', 'between', 'preset', 'isBlank', 'isNotBlank'],
  boolean: ['eq']
};

// Date range presets, as calendar days in Lagos. [from, to) bounds built from
// T = today's Lagos date; no user input reaches these strings.
const T = `(now() AT TIME ZONE '${TZ}')::date`;
const DATE_PRESETS = {
  today: [T, `${T} + 1`],
  yesterday: [`${T} - 1`, T],
  last7days: [`${T} - 6`, `${T} + 1`],
  last30days: [`${T} - 29`, `${T} + 1`],
  thisWeek: [`date_trunc('week', ${T})::date`, `date_trunc('week', ${T})::date + 7`],
  lastWeek: [`date_trunc('week', ${T})::date - 7`, `date_trunc('week', ${T})::date`],
  thisMonth: [`date_trunc('month', ${T})::date`, `(date_trunc('month', ${T}) + interval '1 month')::date`],
  lastMonth: [`(date_trunc('month', ${T}) - interval '1 month')::date`, `date_trunc('month', ${T})::date`],
  thisYear: [`date_trunc('year', ${T})::date`, `(date_trunc('year', ${T}) + interval '1 year')::date`]
};

// Grouping buckets for date fields, with the label each produces.
const DATE_BUCKETS = {
  day: { trunc: 'day', format: 'YYYY-MM-DD' },
  week: { trunc: 'week', format: 'YYYY-MM-DD' }, // Monday of the week
  month: { trunc: 'month', format: 'YYYY-MM' },
  year: { trunc: 'year', format: 'YYYY' }
};

// Grouped-totals metrics.
const installedSql = "r.status IN ('INSTALLED', 'EXPORTED')";
const METRICS = {
  count: { label: 'Installations', type: 'number', sql: 'COUNT(*)', summable: true },
  installed: { label: 'Completed (Installed/Exported)', type: 'number', sql: `COUNT(*) FILTER (WHERE ${installedSql})`, summable: true },
  pending: { label: 'Not Yet Completed', type: 'number', sql: "COUNT(*) FILTER (WHERE r.status IN ('PENDING', 'ASSIGNED', 'IN_PROGRESS'))", summable: true },
  failed: { label: 'Failed', type: 'number', sql: "COUNT(*) FILTER (WHERE r.status = 'FAILED')", summable: true },
  withPicture: { label: 'Completed With Picture', type: 'number', sql: `COUNT(*) FILTER (WHERE ${installedSql} AND ${FIELDS.hasPicture.sql})`, summable: true },
  withGps: { label: 'Completed With GPS', type: 'number', sql: `COUNT(*) FILTER (WHERE ${installedSql} AND ${FIELDS.hasGps.sql})`, summable: true },
  avgDaysToInstall: { label: 'Avg Days Import to Install', type: 'number', sql: `ROUND(AVG(${FIELDS.daysImportToInstall.sql})::numeric, 1)` },
  revenueSum: { label: 'Revenue (₦)', type: 'currency', sql: 'COALESCE(SUM(r.payment_amount), 0)', access: 'finance', summable: true },
  revenueAvg: { label: 'Avg Revenue per Job (₦)', type: 'currency', sql: 'ROUND(AVG(r.payment_amount)::numeric, 2)', access: 'finance' }
};

const LIMITS = { xlsx: 100000, csv: 500000, filters: 50, groupBy: 4, sort: 3 };

const own = (map, key) =>
  (typeof key === 'string' && Object.prototype.hasOwnProperty.call(map, key) ? map[key] : null);

// Contact details and money: the admin tier, as on screen and on /finance.
const ACCESS_ROLES = {
  contact: ['SUPERADMIN', 'ADMIN'],
  finance: ['SUPERADMIN', 'ADMIN']
};

const canSee = (entry, user) => !entry.access || ACCESS_ROLES[entry.access].includes(user && user.role);

module.exports = {
  TZ,
  FROM_CLAUSE,
  FIELDS,
  OPS,
  DATE_PRESETS,
  DATE_BUCKETS,
  METRICS,
  LIMITS,
  lagosDate,
  own,
  canSee
};
