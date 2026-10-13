const Disco = require('../models/Disco');
const ImportBatch = require('../models/ImportBatch');
const InstallationRequest = require('../models/InstallationRequest');
const Meter = require('../models/Meter');
const DiscoImportService = require('../services/discoImportService');
const CompletedInstallationsReportService = require('../services/completedInstallationsReportService');
const { asyncHandler } = require('../middleware/errorHandler');
const { canAccessDisco, resolveAccessibleDisco, resolveListScope } = require('../utils/discoAccess');

const loadDisco = async (req, res, discoCode) => {
  const disco = await resolveAccessibleDisco(req, res, discoCode);
  if (!disco) return null;

  if (!disco.isActive) {
    res.status(400).json({ success: false, message: `Disco ${disco.code} is not active` });
    return null;
  }

  return disco;
};

const requireFile = (req, res) => {
  if (!req.file) {
    res.status(400).json({ success: false, message: 'No file uploaded. Send the spreadsheet as "file".' });
    return false;
  }
  return true;
};

const respondToImport = (res, batch) => {
  const { skippedDetails, ...summary } = batch;
  const { completedExport } = summary;

  let message = summary.created > 0
    ? 'Import completed'
    : 'Import completed, but no new records were created';

  // Also in the message so the link shows wherever the message does, without
  // the frontend having to know about completedExport.
  if (completedExport && completedExport.downloadUrl) {
    message += `. ${completedExport.rowCount} already-completed installation(s) found; download: ${completedExport.downloadUrl}`;
  }

  // 201 when something landed, 200 when the file was valid but wholly redundant.
  return res.status(summary.created > 0 ? 201 : 200).json({
    success: true,
    message,
    data: { ...summary, skippedDetails: (skippedDetails || []).slice(0, 50) }
  });
};

const importPendingInstallations = asyncHandler(async (req, res) => {
  const disco = await loadDisco(req, res, req.params.discoCode);
  if (!disco || !requireFile(req, res)) return;

  const batch = await DiscoImportService.importPendingInstallations({
    buffer: req.file.buffer,
    fileName: req.file.originalname,
    fileSize: req.file.size,
    disco,
    uploadedBy: req.user ? req.user.id : null
  });

  return respondToImport(res, batch);
});

const importMeterInventory = asyncHandler(async (req, res) => {
  const disco = await loadDisco(req, res, req.params.discoCode);
  if (!disco || !requireFile(req, res)) return;

  const batch = await DiscoImportService.importMeterInventory({
    buffer: req.file.buffer,
    fileName: req.file.originalname,
    fileSize: req.file.size,
    disco,
    uploadedBy: req.user ? req.user.id : null
  });

  return respondToImport(res, batch);
});

/**
 * The "Completed installations" workbook (the portal's export layout) for the
 * already-completed accounts an import repeated. Opened as a plain link, so
 * the token is the only credential (as with /files/:token). Rebuilt from
 * current data on every request; jobs reverted since the import drop out.
 * Not a disco response sheet, so it isn't recorded in export_batches.
 */
const downloadCompletedExport = asyncHandler(async (req, res) => {
  const batch = await ImportBatch.findByCompletedExportToken(req.params.token);
  if (!batch) {
    return res.status(404).json({ success: false, message: 'Download link not found' });
  }
  if (new Date(batch.expiresAt) < new Date()) {
    return res.status(410).json({ success: false, message: 'Download link expired' });
  }

  const installations = await InstallationRequest.findManyByIds(batch.requestIds, {
    statuses: ['INSTALLED', 'EXPORTED']
  });
  if (installations.length === 0) {
    return res.status(404).json({ success: false, message: 'No completed installations left to export' });
  }

  const serials = installations.map((r) => r.meterNumber).filter(Boolean);
  const meters = serials.length ? await Meter.findManyByNumbers(serials) : [];
  const disco = await Disco.findById(batch.discoId);
  const importBatch = await ImportBatch.findById(batch.id);

  const buffer = await CompletedInstallationsReportService.buildWorkbook({
    installations,
    meters,
    context: {
      discoName: disco.name,
      filters: [`Accounts in import ${importBatch.batchRef}${importBatch.fileName ? ` (${importBatch.fileName})` : ''} that were already completed`]
    }
  });
  const fileName = CompletedInstallationsReportService.fileName(disco.code);

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  return res.send(buffer);
});

const listImportBatches = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, discoCode, importType, status } = req.validatedQuery || req.query;

  const scope = await resolveListScope(req, res, discoCode);
  if (!scope) return;

  const { batches, pagination } = await ImportBatch.findAll({
    page: Number(page),
    limit: Number(limit),
    discoIds: scope.discoIds,
    importType,
    status
  });

  res.json({ success: true, data: batches, pagination });
});

const getImportBatch = asyncHandler(async (req, res) => {
  const batch = await ImportBatch.findById(req.params.id);

  // Outside the caller's discos reads as not found, so its existence isn't confirmed.
  if (!batch || !canAccessDisco(req.user, batch.discoId)) {
    return res.status(404).json({ success: false, message: 'Import batch not found' });
  }

  res.json({ success: true, data: batch });
});

const undoImportBatch = asyncHandler(async (req, res) => {
  const batch = await ImportBatch.findById(req.params.id);

  if (!batch || !canAccessDisco(req.user, batch.discoId)) {
    return res.status(404).json({ success: false, message: 'Import batch not found' });
  }

  const result = await ImportBatch.undo(req.params.id);

  res.json({
    success: true,
    message: result.deletedCount > 0
      ? `Removed ${result.deletedCount} row(s) created by this import`
      : 'Nothing eligible to remove -- every row from this import is already in use',
    data: result
  });
});

const sendTemplate = async (res, disco, importType, label) => {
  const buffer = DiscoImportService.buildTemplate(disco, importType);
  const fileName = `${disco.code.toLowerCase()}_${label}_template.xlsx`;

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  return res.send(buffer);
};

const downloadPendingInstallationTemplate = asyncHandler(async (req, res) => {
  const disco = await loadDisco(req, res, req.params.discoCode);
  if (!disco) return;
  return sendTemplate(res, disco, 'pendingInstallations', 'pending_installations');
});

const downloadMeterInventoryTemplate = asyncHandler(async (req, res) => {
  const disco = await loadDisco(req, res, req.params.discoCode);
  if (!disco) return;
  return sendTemplate(res, disco, 'meterInventory', 'meter_inventory');
});

module.exports = {
  downloadCompletedExport,
  importPendingInstallations,
  importMeterInventory,
  listImportBatches,
  getImportBatch,
  undoImportBatch,
  downloadPendingInstallationTemplate,
  downloadMeterInventoryTemplate
};
