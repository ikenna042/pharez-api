const pool = require('../config/database');
const Disco = require('../models/Disco');
const Meter = require('../models/Meter');
const InstallationRequest = require('../models/InstallationRequest');
const ExportBatch = require('../models/ExportBatch');
const InstallationExportService = require('../services/installationExportService');
const { asyncHandler } = require('../middleware/errorHandler');

const resolveDiscoId = async (res, discoCode) => {
  if (!discoCode) return undefined;

  const disco = await Disco.findByCode(discoCode);
  if (!disco) {
    res.status(404).json({ success: false, message: `Disco ${discoCode} not found` });
    return null;
  }

  return disco.id;
};

/* ----------------------------- admin ----------------------------- */

const createInstallationRequest = asyncHandler(async (req, res) => {
  const { discoCode, accountNumber, ...rest } = req.body;

  const disco = await Disco.findByCode(discoCode);
  if (!disco) {
    return res.status(404).json({ success: false, message: `Disco ${discoCode} not found` });
  }

  const existing = await InstallationRequest.findByAccountNumber(disco.id, accountNumber);
  if (existing) {
    return res.status(400).json({
      success: false,
      message: `Account ${accountNumber} already exists for ${disco.code}`
    });
  }

  const created = await InstallationRequest.create({
    discoId: disco.id,
    accountNumber,
    ...rest,
    source: 'MANUAL',
    createdBy: req.user ? req.user.id : null
  });

  res.status(201).json({ success: true, message: 'Installation request created', data: created });
});

const getInstallations = asyncHandler(async (req, res) => {
  const q = req.validatedQuery || req.query;

  const discoId = await resolveDiscoId(res, q.discoCode);
  if (discoId === null) return;

  const { requests, pagination } = await InstallationRequest.findAll({
    page: Number(q.page || 1),
    limit: Number(q.limit || 20),
    discoId,
    status: q.status,
    assignedTo: q.installerId,
    assignmentBatchId: q.assignmentBatchId,
    importBatchId: q.importBatchId,
    search: q.search,
    from: q.from,
    to: q.to
  });

  res.json({ success: true, data: requests, pagination });
});

const getInstallationStatistics = asyncHandler(async (req, res) => {
  const q = req.validatedQuery || req.query;

  const discoId = await resolveDiscoId(res, q.discoCode);
  if (discoId === null) return;

  const stats = await InstallationRequest.getStatistics({ discoId });
  res.json({ success: true, data: stats });
});

const getInstallationById = asyncHandler(async (req, res) => {
  const request = await InstallationRequest.findById(req.params.id);

  if (!request) {
    return res.status(404).json({ success: false, message: 'Installation request not found' });
  }

  // An installer may only look at their own work.
  if (req.user.role === 'INSTALLER' && String(request.assignedTo) !== String(req.user.id)) {
    return res.status(403).json({ success: false, message: 'This installation is not assigned to you' });
  }

  res.json({ success: true, data: request });
});

const cancelInstallation = asyncHandler(async (req, res) => {
  const cancelled = await InstallationRequest.cancel(req.params.id, req.body.reason);

  if (!cancelled) {
    return res.status(400).json({
      success: false,
      message: 'Only PENDING or ASSIGNED installations can be cancelled'
    });
  }

  res.json({ success: true, message: 'Installation cancelled', data: cancelled });
});

/* --------------------------- installer --------------------------- */

const getMyJobs = asyncHandler(async (req, res) => {
  const q = req.validatedQuery || req.query;

  const { requests, pagination } = await InstallationRequest.findAll({
    page: Number(q.page || 1),
    limit: Number(q.limit || 20),
    assignedTo: req.user.id,
    status: q.status,
    search: q.search
  });

  res.json({ success: true, data: requests, pagination });
});

const getMyMeters = asyncHandler(async (req, res) => {
  const q = req.validatedQuery || req.query;

  const { meters, pagination } = await Meter.findAssignedToInstaller(req.user.id, {
    page: Number(q.page || 1),
    limit: Number(q.limit || 50),
    phaseType: q.phaseType
  });

  res.json({ success: true, data: meters, pagination });
});

const startInstallation = asyncHandler(async (req, res) => {
  const started = await InstallationRequest.markStarted(req.params.id, req.user.id);

  if (!started) {
    return res.status(400).json({
      success: false,
      message: 'Installation must be ASSIGNED to you before it can be started'
    });
  }

  res.json({ success: true, message: 'Installation started', data: started });
});

// Each refusal from recordInstallation maps to its own status and message.
const REPORT_FAILURES = {
  REQUEST_NOT_FOUND: () => [404, 'Installation request not found'],
  NOT_ASSIGNED_TO_YOU: () => [403, 'This installation is not assigned to you'],
  ILLEGAL_TRANSITION: (r) => [400, `Cannot report a ${r.status} installation`],
  METER_NOT_FOUND: () => [404, 'Meter not found'],
  METER_NOT_YOURS: () => [400, 'That meter is not assigned to you'],
  PHASE_MISMATCH: (r) => [400, `Meter type mismatch. Required: ${r.required}, provided: ${r.provided}`]
};

const reportInstallation = asyncHandler(async (req, res) => {
  const result = await InstallationRequest.recordInstallation({
    requestId: req.params.id,
    installerId: req.user.id,
    ...req.body
  });

  if (result.error) {
    const [status, message] = REPORT_FAILURES[result.error](result);
    return res.status(status).json({ success: false, message });
  }

  res.json({
    success: true,
    message: `Installation completed with meter ${result.meterNumber}`,
    data: result.request
  });
});

const reportFailure = asyncHandler(async (req, res) => {
  const failed = await InstallationRequest.recordFailure(req.params.id, req.user.id, req.body.reason);

  if (!failed) {
    return res.status(400).json({
      success: false,
      message: 'Installation must be ASSIGNED to you or in progress to report a failure'
    });
  }

  res.json({ success: true, message: 'Failure recorded', data: failed });
});

/* ---------------------------- export ----------------------------- */

const exportInstallationResponse = asyncHandler(async (req, res) => {
  const q = req.validatedQuery || req.query;

  const disco = await Disco.findByCode(req.params.discoCode);
  if (!disco) {
    return res.status(404).json({ success: false, message: `Disco ${req.params.discoCode} not found` });
  }

  const template = Disco.getExportTemplate(disco, 'installationResponse');
  if (!template) {
    return res.status(400).json({
      success: false,
      message: `Disco ${disco.code} has no installationResponse export template configured`
    });
  }

  const statuses = q.includeExported ? ['INSTALLED', 'EXPORTED'] : ['INSTALLED'];
  const rows = await InstallationRequest.findForExport({
    discoId: disco.id,
    statuses,
    from: q.from,
    to: q.to
  });

  if (rows.length === 0) {
    return res.status(404).json({ success: false, message: 'No installations found to export' });
  }

  const buffer = InstallationExportService.buildWorkbook(rows, template);
  const fileName = InstallationExportService.buildFileName(template, disco.code);

  // The export batch is recorded, and rows are marked, *before* the file is sent.
  // Doing it afterwards risks marking work as delivered when the send failed.
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const batch = await ExportBatch.create(
      {
        discoId: disco.id,
        discoCode: disco.code,
        filters: { statuses, from: q.from || null, to: q.to || null },
        rowCount: rows.length,
        fileName,
        markedExported: Boolean(q.markExported),
        generatedBy: req.user ? req.user.id : null
      },
      client
    );

    if (q.markExported) {
      await InstallationRequest.markExported(rows.map((r) => r.id), batch.id, client);
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  return res.send(buffer);
});

const listExportBatches = asyncHandler(async (req, res) => {
  const q = req.validatedQuery || req.query;

  const discoId = await resolveDiscoId(res, q.discoCode);
  if (discoId === null) return;

  const { batches, pagination } = await ExportBatch.findAll({
    page: Number(q.page || 1),
    limit: Number(q.limit || 20),
    discoId
  });

  res.json({ success: true, data: batches, pagination });
});

/** Mark rows as delivered after the sheet has actually been emailed to the disco. */
const markExportSent = asyncHandler(async (req, res) => {
  const disco = await Disco.findByCode(req.params.discoCode);
  if (!disco) {
    return res.status(404).json({ success: false, message: `Disco ${req.params.discoCode} not found` });
  }

  const batch = await ExportBatch.findById(req.body.exportBatchId);
  if (!batch || batch.discoId !== disco.id) {
    return res.status(404).json({ success: false, message: 'Export batch not found for this disco' });
  }

  const rows = await InstallationRequest.findForExport({
    discoId: disco.id,
    statuses: ['INSTALLED'],
    from: batch.filters.from,
    to: batch.filters.to
  });

  const marked = await InstallationRequest.markExported(rows.map((r) => r.id), batch.id);

  res.json({
    success: true,
    message: `Marked ${marked.length} installation(s) as exported`,
    data: { exportBatchId: batch.id, markedCount: marked.length }
  });
});

module.exports = {
  createInstallationRequest,
  getInstallations,
  getInstallationStatistics,
  getInstallationById,
  cancelInstallation,
  getMyJobs,
  getMyMeters,
  startInstallation,
  reportInstallation,
  reportFailure,
  exportInstallationResponse,
  listExportBatches,
  markExportSent
};
