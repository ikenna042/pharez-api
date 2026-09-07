const XLSX = require('xlsx');
const pool = require('../config/database');
const Disco = require('../models/Disco');
const ImportBatch = require('../models/ImportBatch');
const InstallationRequest = require('../models/InstallationRequest');
const Meter = require('../models/Meter');
const { resolveColumns, applyMapping } = require('../utils/normalizers');

/**
 * Reads a disco's spreadsheet according to that disco's configured column
 * mapping, so supporting a new disco is a data change rather than a code change.
 */
class DiscoImportService {
  /**
   * Read a sheet as an array of arrays.
   *
   * `raw: false` is what makes each cell come back as its *formatted text*
   * rather than a number. Without it, meter serials like "0239110006909" lose
   * their leading zero and 19-digit SIM serials lose precision before any
   * normalizer can help.
   */
  static readSheet(buffer, config) {
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true, cellText: true });
    const sheetName = workbook.SheetNames[config.sheetIndex];

    if (!sheetName) {
      throw Object.assign(
        new Error(`Sheet index ${config.sheetIndex} not found. Workbook has: ${workbook.SheetNames.join(', ')}`),
        { statusCode: 400 }
      );
    }

    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
      header: 1,
      raw: false,
      defval: '',
      blankrows: false
    });

    if (rows.length <= config.headerRow - 1) {
      throw Object.assign(new Error('Spreadsheet contains no data rows'), { statusCode: 400 });
    }

    return {
      sheetName,
      headerRowValues: rows[config.headerRow - 1] || [],
      dataRows: rows.slice(config.headerRow)
    };
  }

  /**
   * Normalize every data row, collecting per-row errors instead of aborting.
   * Duplicate keys *within the file* are errors; duplicates against the database
   * are handled later by ON CONFLICT and counted as skipped.
   */
  static normalizeRows({ dataRows, headerRowValues, columns, config }) {
    const clean = [];
    const errors = [];
    const seenKeys = new Set();

    dataRows.forEach((rowValues, index) => {
      const sheetRow = config.headerRow + index + 1;

      // A row of entirely blank cells is padding, not an error.
      if (rowValues.every((cell) => cell === '' || cell === null || cell === undefined)) return;

      try {
        const { values, raw, extras } = applyMapping(rowValues, columns, config.fields, {
          captureExtras: config.captureExtras,
          headerRowValues
        });

        const key = values[config.keyField];
        if (!key) {
          errors.push({ row: sheetRow, error: `${config.keyField} is required` });
          return;
        }

        if (seenKeys.has(key)) {
          errors.push({ row: sheetRow, key, error: `Duplicate ${config.keyField} within file` });
          return;
        }
        seenKeys.add(key);

        for (const [fieldName, field] of Object.entries(config.fields)) {
          if (field.required && !values[fieldName]) {
            throw new Error(`${fieldName} is required`);
          }
        }

        clean.push({ values, raw, extras, sheetRow });
      } catch (error) {
        errors.push({ row: sheetRow, error: error.message });
      }
    });

    return { clean, errors };
  }

  static prepare(buffer, disco, importType) {
    const config = Disco.getImportConfig(disco, importType);

    if (!config) {
      throw Object.assign(
        new Error(`Disco ${disco.code} has no "${importType}" import mapping configured`),
        { statusCode: 400 }
      );
    }

    const { sheetName, headerRowValues, dataRows } = this.readSheet(buffer, config);

    let columns;
    try {
      columns = resolveColumns(headerRowValues, config.fields);
    } catch (error) {
      // A missing required column means the wrong file was uploaded. Fail the
      // whole import with one clear message rather than N identical row errors.
      throw Object.assign(error, { statusCode: 400 });
    }

    const { clean, errors } = this.normalizeRows({ dataRows, headerRowValues, columns, config });

    return { config, sheetName, dataRows, clean, errors };
  }

  static async importPendingInstallations({ buffer, fileName, fileSize, disco, uploadedBy }) {
    const { sheetName, dataRows, clean, errors } = this.prepare(buffer, disco, 'pendingInstallations');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const batch = await ImportBatch.create(
        {
          discoId: disco.id,
          discoCode: disco.code,
          importType: 'PENDING_INSTALLATIONS',
          fileName,
          fileSize,
          sheetName,
          uploadedBy
        },
        client
      );

      const rows = clean.map(({ values, extras, sheetRow }) => ({
        discoId: disco.id,
        accountNumber: values.accountNumber,
        customerName: values.customerName,
        customerPhone: values.customerPhone,
        customerEmail: values.customerEmail,
        customerAddress: values.customerAddress,
        feederName: values.feederName,
        transformerName: values.transformerName,
        transformerCode: values.transformerCode,
        region: values.region,
        area: values.area,
        meterType: values.meterType,
        installationPosition: values.installationPosition,
        meterVendor: values.meterVendor,
        source: 'IMPORT',
        importBatchId: batch.id,
        sourceRowNumber: sheetRow,
        sourceRow: extras,
        createdBy: uploadedBy
      }));

      const result = await InstallationRequest.bulkCreate(rows, client);
      const allErrors = [...errors, ...result.errors];

      const completed = await ImportBatch.complete(
        batch.id,
        {
          totalRows: dataRows.length,
          createdCount: result.created.length,
          skippedCount: result.skipped.length,
          errors: allErrors
        },
        client
      );

      await client.query('COMMIT');

      return { ...completed, skippedDetails: result.skipped };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async importMeterInventory({ buffer, fileName, fileSize, disco, uploadedBy }) {
    const { sheetName, dataRows, clean, errors } = this.prepare(buffer, disco, 'meterInventory');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const batch = await ImportBatch.create(
        {
          discoId: disco.id,
          discoCode: disco.code,
          importType: 'METER_INVENTORY',
          fileName,
          fileSize,
          sheetName,
          uploadedBy
        },
        client
      );

      const rows = clean.map(({ values, raw, sheetRow }) => ({
        meterNumber: values.meterNumber,
        simNumber: values.simNumber,
        phaseType: values.phaseType,
        phaseTypeRaw: raw.phaseType ?? null,
        manufacturedDate: values.manufacturedDate,
        meterMake: values.meterMake,
        model: values.model,
        sgcNumber: values.sgcNumber,
        sourceRowNumber: sheetRow
      }));

      const result = await Meter.bulkCreateFromImport(rows, {
        client,
        uploadedBy,
        importBatchId: batch.id
      });

      const allErrors = [...errors, ...result.errors];

      const completed = await ImportBatch.complete(
        batch.id,
        {
          totalRows: dataRows.length,
          createdCount: result.created.length,
          skippedCount: result.skipped.length,
          errors: allErrors
        },
        client
      );

      await client.query('COMMIT');

      return { ...completed, skippedDetails: result.skipped };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Build a blank upload template from the disco's own mapping, so the headers
   * we hand out are by construction the headers the importer accepts.
   */
  static buildTemplate(disco, importType) {
    const config = Disco.getImportConfig(disco, importType);

    if (!config) {
      throw Object.assign(
        new Error(`Disco ${disco.code} has no "${importType}" import mapping configured`),
        { statusCode: 400 }
      );
    }

    const headers = Object.values(config.fields).map((field) => field.headers[0]);
    const worksheet = XLSX.utils.aoa_to_sheet([headers]);
    worksheet['!cols'] = headers.map((h) => ({ wch: Math.max(14, Math.min(40, h.length + 4)) }));

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Template');

    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  }
}

module.exports = DiscoImportService;
