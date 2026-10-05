const Meter = require('../models/Meter');
const JedCustomerRequest = require('../models/JedCustomerRequest');
const ExcelService = require('../services/excelService');
const { asyncHandler } = require('../middleware/errorHandler');
const { canAccessDisco, resolveAccessibleDisco, resolveListScope } = require('../utils/discoAccess');

// A meter in a disco the caller isn't profiled for reads as not found.
const meterNotFound = (res) => res.status(404).json({ success: false, message: 'Meter not found' });

const uploadMeters = asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      message: 'No file uploaded'
    });
  }

  if (!req.body.discoCode) {
    return res.status(400).json({ success: false, message: 'discoCode is required' });
  }

  // Every meter belongs to one disco's stock.
  const disco = await resolveAccessibleDisco(req, res, req.body.discoCode);
  if (!disco) return;

  // Parse Excel file
  const meters = ExcelService.parseMeterExcel(req.file.buffer);

  // Bulk create meters
  const result = await Meter.bulkCreate(meters, req.user?.id, disco.id);

  res.status(201).json({
    success: true,
    message: 'Meters uploaded successfully',
    data: {
      totalRows: meters.length,
      created: result.created,
      failed: result.errors,
      errors: result.details
    }
  });
});

const downloadMeterTemplate = asyncHandler(async (req, res) => {
  const buffer = ExcelService.generateMeterTemplate();

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=meter_upload_template.xlsx');
  res.send(buffer);
});

const exportMeters = asyncHandler(async (req, res) => {
  const { status, phaseType, discoCode } = req.query;

  const scope = await resolveListScope(req, res, discoCode);
  if (!scope) return;

  // Get all meters based on filters
  const result = await Meter.findAll({
    page: 1,
    limit: 10000, // Get all meters
    status,
    phaseType,
    discoIds: scope.discoIds
  });

  if (result.meters.length === 0) {
    return res.status(404).json({
      success: false,
      message: 'No meters found to export'
    });
  }

  const buffer = ExcelService.exportMetersToExcel(result.meters);

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=meters_export_${Date.now()}.xlsx`);
  res.send(buffer);
});

const getMeters = asyncHandler(async (req, res) => {
  const { page, limit, status, phaseType, discoCode } = req.query;

  const scope = await resolveListScope(req, res, discoCode);
  if (!scope) return;

  const result = await Meter.findAll({ page, limit, status, phaseType, discoIds: scope.discoIds });

  res.json({
    success: true,
    data: result.meters,
    pagination: result.pagination
  });
});

const searchMeters = asyncHandler(async (req, res) => {
  const q = req.validatedQuery || req.query;

  const scope = await resolveListScope(req, res, q.discoCode);
  if (!scope) return;

  const result = await Meter.findAll({
    page: q.page,
    limit: q.limit,
    status: q.status,
    phaseType: q.phaseType,
    search: q.q,
    discoIds: scope.discoIds
  });

  res.json({
    success: true,
    data: result.meters,
    pagination: result.pagination
  });
});

const getMeterById = asyncHandler(async (req, res) => {
  console.log('Fetching meter by ID:', req.params);
  const { id } = req.params;

  const meter = await Meter.findById(id);

  if (!meter || !canAccessDisco(req.user, meter.discoId)) return meterNotFound(res);

  res.json({
    success: true,
    data: meter
  });
});

const getMeterByMeterNumber = asyncHandler(async (req, res) => {
  const { meterNumber } = req.params;
  console.log('Fetching meter by Meter Number:', meterNumber);

  const meter = await Meter.findByMeterNumber(meterNumber);

  if (!meter || !canAccessDisco(req.user, meter.discoId)) return meterNotFound(res);

  res.json({
    success: true,
    data: meter
  });
});


const getMeterStatistics = asyncHandler(async (req, res) => {
  const scope = await resolveListScope(req, res, req.query.discoCode);
  if (!scope) return;

  const stats = await Meter.getStatistics({ discoIds: scope.discoIds });

  res.json({
    success: true,
    data: stats
  });
});

const deleteMeter = asyncHandler(async (req, res) => {
  const { meterNumber } = req.params;

  const deleted = await Meter.delete(meterNumber);

  if (!deleted) {
    return res.status(404).json({
      success: false,
      message: 'Meter not found'
    });
  }

  res.json({
    success: true,
    message: 'Meter deleted successfully'
  });
});

const exportCustomerRequests = asyncHandler(async (req, res) => {
  const { status } = req.query;

  // Get all customer requests based on filters
  const result = await JedCustomerRequest.findAll({
    page: 1,
    limit: 10000, // Get all requests
    status
  });

  if (result.requests.length === 0) {
    return res.status(404).json({
      success: false,
      message: 'No customer requests found to export'
    });
  }

  const buffer = ExcelService.exportCustomerRequestsToExcel(result.requests);

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=customer_requests_export_${Date.now()}.xlsx`);
  res.send(buffer);
});

module.exports = {
  uploadMeters,
  downloadMeterTemplate,
  exportMeters,
  getMeters,
  searchMeters,
  getMeterById,
  getMeterByMeterNumber,
  getMeterStatistics,
  deleteMeter,
  exportCustomerRequests
};