const Disco = require('../models/Disco');
const ImportBatch = require('../models/ImportBatch');
const DiscoImportService = require('../services/discoImportService');
const { asyncHandler } = require('../middleware/errorHandler');

const loadDisco = async (res, discoCode) => {
  const disco = await Disco.findByCode(discoCode);

  if (!disco) {
    res.status(404).json({ success: false, message: `Disco ${discoCode} not found` });
    return null;
  }

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

  // 201 when something landed, 200 when the file was valid but wholly redundant.
  return res.status(summary.created > 0 ? 201 : 200).json({
    success: true,
    message:
      summary.created > 0
        ? 'Import completed'
        : 'Import completed, but no new records were created',
    data: { ...summary, skippedDetails: (skippedDetails || []).slice(0, 50) }
  });
};

const importPendingInstallations = asyncHandler(async (req, res) => {
  const disco = await loadDisco(res, req.params.discoCode);
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
  const disco = await loadDisco(res, req.params.discoCode);
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

const listImportBatches = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, discoCode, importType, status } = req.validatedQuery || req.query;

  let discoId;
  if (discoCode) {
    const disco = await Disco.findByCode(discoCode);
    if (!disco) {
      return res.status(404).json({ success: false, message: `Disco ${discoCode} not found` });
    }
    discoId = disco.id;
  }

  const { batches, pagination } = await ImportBatch.findAll({
    page: Number(page),
    limit: Number(limit),
    discoId,
    importType,
    status
  });

  res.json({ success: true, data: batches, pagination });
});

const getImportBatch = asyncHandler(async (req, res) => {
  const batch = await ImportBatch.findById(req.params.id);

  if (!batch) {
    return res.status(404).json({ success: false, message: 'Import batch not found' });
  }

  res.json({ success: true, data: batch });
});

const sendTemplate = async (res, disco, importType, label) => {
  const buffer = DiscoImportService.buildTemplate(disco, importType);
  const fileName = `${disco.code.toLowerCase()}_${label}_template.xlsx`;

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  return res.send(buffer);
};

const downloadPendingInstallationTemplate = asyncHandler(async (req, res) => {
  const disco = await loadDisco(res, req.params.discoCode);
  if (!disco) return;
  return sendTemplate(res, disco, 'pendingInstallations', 'pending_installations');
});

const downloadMeterInventoryTemplate = asyncHandler(async (req, res) => {
  const disco = await loadDisco(res, req.params.discoCode);
  if (!disco) return;
  return sendTemplate(res, disco, 'meterInventory', 'meter_inventory');
});

module.exports = {
  importPendingInstallations,
  importMeterInventory,
  listImportBatches,
  getImportBatch,
  downloadPendingInstallationTemplate,
  downloadMeterInventoryTemplate
};
