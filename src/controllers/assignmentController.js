const User = require('../models/User');
const AssignmentBatch = require('../models/AssignmentBatch');
const MeterAssignment = require('../models/MeterAssignment');
const AssignedMetersExportService = require('../services/assignedMetersExportService');
const { asyncHandler } = require('../middleware/errorHandler');
const {
  allowedDiscoIds, canAccessDisco, resolveAccessibleDisco, resolveListScope
} = require('../utils/discoAccess');

const MAX_SEARCH_NUMBERS = 5000;

/**
 * Assignments only make sense to an active installer profiled for the disco
 * the work belongs to, so check all of that before writing.
 */
const loadInstaller = async (res, installerId, disco) => {
  const installer = await User.findById(installerId);

  if (!installer) {
    res.status(404).json({ success: false, message: 'Installer not found' });
    return null;
  }

  if (installer.role !== 'INSTALLER') {
    res.status(400).json({
      success: false,
      message: `User ${installerId} is a ${installer.role}, not an INSTALLER`
    });
    return null;
  }

  if (installer.isActive === false) {
    res.status(400).json({ success: false, message: 'Installer account is not active' });
    return null;
  }

  const discos = await User.getDiscos(installer.id);
  if (!discos.some((d) => d.id === disco.id)) {
    res.status(400).json({
      success: false,
      message: `${installer.firstName} ${installer.lastName} isn't profiled for ${disco.code}`
    });
    return null;
  }

  return installer;
};

const assignMeters = asyncHandler(async (req, res) => {
  const { discoCode, installerId, meterNumbers, note, dispatchRef } = req.body;

  const disco = await resolveAccessibleDisco(req, res, discoCode);
  if (!disco) return;

  const installer = await loadInstaller(res, installerId, disco);
  if (!installer) return;

  const { batch, assigned, rejected } = await AssignmentBatch.assignMeters({
    disco,
    installerId,
    assignedBy: req.user ? req.user.id : null,
    meterNumbers,
    note,
    dispatchRef
  });

  return res.status(assigned.length > 0 ? 201 : 200).json({
    success: true,
    message: assigned.length > 0
      ? `Assigned ${assigned.length} meter(s) to ${installer.firstName} ${installer.lastName}`
      : 'No meters were assigned',
    data: {
      batch,
      assignedCount: assigned.length,
      rejectedCount: rejected.length,
      assigned,
      rejected
    }
  });
});

const returnMeters = asyncHandler(async (req, res) => {
  const { meterNumbers } = req.body;

  const { returned, rejected } = await AssignmentBatch.returnMeters({
    meterNumbers,
    returnedBy: req.user ? req.user.id : null,
    allowedDiscoIds: allowedDiscoIds(req.user)
  });

  res.json({
    success: true,
    message: `Returned ${returned.length} meter(s) to stock`,
    data: { returnedCount: returned.length, rejectedCount: rejected.length, returned, rejected }
  });
});

const assignInstallations = asyncHandler(async (req, res) => {
  const { discoCode, installerId, ids, accountNumbers, note, dispatchRef } = req.body;

  const disco = await resolveAccessibleDisco(req, res, discoCode);
  if (!disco) return;

  const installer = await loadInstaller(res, installerId, disco);
  if (!installer) return;

  const { batch, assigned, rejected } = await AssignmentBatch.assignInstallations({
    disco,
    installerId,
    assignedBy: req.user ? req.user.id : null,
    ids,
    accountNumbers,
    note,
    dispatchRef
  });

  return res.status(assigned.length > 0 ? 201 : 200).json({
    success: true,
    message: assigned.length > 0
      ? `Assigned ${assigned.length} installation(s) to ${installer.firstName} ${installer.lastName}`
      : 'No installations were assigned',
    data: {
      batch,
      assignedCount: assigned.length,
      rejectedCount: rejected.length,
      assigned,
      rejected
    }
  });
});

const unassignInstallations = asyncHandler(async (req, res) => {
  const { discoCode, ids, accountNumbers } = req.body;

  const disco = await resolveAccessibleDisco(req, res, discoCode);
  if (!disco) return;

  const unassigned = await AssignmentBatch.unassignInstallations({
    discoId: disco.id,
    ids,
    accountNumbers
  });

  res.json({
    success: true,
    message: `Returned ${unassigned.length} installation(s) to the pending pool`,
    data: { unassignedCount: unassigned.length, unassigned }
  });
});

const listAssignmentBatches = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, assignmentType, installerId, discoCode, status } =
    req.validatedQuery || req.query;

  const scope = await resolveListScope(req, res, discoCode);
  if (!scope) return;

  const { batches, pagination } = await AssignmentBatch.findAll({
    page: Number(page),
    limit: Number(limit),
    assignmentType,
    installerId,
    discoIds: scope.discoIds,
    status
  });

  res.json({ success: true, data: batches, pagination });
});

const getMeterHolders = asyncHandler(async (req, res) => {
  const { discoCode, installerId } = req.validatedQuery || req.query;

  const scope = await resolveListScope(req, res, discoCode);
  if (!scope) return;

  const holders = await MeterAssignment.findHolders({ discoIds: scope.discoIds, installerId });
  res.json({ success: true, data: holders });
});

const assignedMeterFilters = (q, discoIds) => ({
  discoIds,
  statuses: q.status ? [...new Set(q.status.split(','))] : ['ASSIGNED'],
  installerId: q.installerId,
  phaseType: q.phaseType,
  from: q.from,
  to: q.to,
  q: q.q
});

const listAssignedMeters = asyncHandler(async (req, res) => {
  const q = req.validatedQuery || req.query;

  const scope = await resolveListScope(req, res, q.discoCode);
  if (!scope) return;

  const { assignments, pagination } = await MeterAssignment.findAll({
    page: Number(q.page || 1),
    limit: Number(q.limit || 20),
    ...assignedMeterFilters(q, scope.discoIds)
  });

  res.json({ success: true, data: assignments, pagination });
});

const generatedBy = (user) => `${[user.firstName, user.lastName].filter(Boolean).join(' ')} (${user.role})`;

const sendFile = (res, buffer, format, fileName) => {
  res.setHeader('Content-Type', format === 'csv'
    ? 'text/csv; charset=utf-8'
    : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  return res.send(buffer);
};

const exportAssignedMeters = asyncHandler(async (req, res) => {
  const q = req.validatedQuery || req.query;
  const format = q.format || 'xlsx';

  const scope = await resolveListScope(req, res, q.discoCode);
  if (!scope) return undefined;

  const filters = assignedMeterFilters(q, scope.discoIds);
  const rowCount = await MeterAssignment.count(filters);
  if (rowCount === 0) {
    return res.status(404).json({ success: false, message: 'No assigned meters match these filters' });
  }
  const limit = AssignedMetersExportService.LIMITS[format];
  if (rowCount > limit) {
    return res.status(400).json({
      success: false,
      message: `This export has ${rowCount.toLocaleString()} rows; ${format.toUpperCase()} allows at most ${limit.toLocaleString()}. Narrow the filters.`
    });
  }

  const fileName = AssignedMetersExportService.fileName('assigned-meters', format);
  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    return AssignedMetersExportService.streamListCsv(filters, res);
  }

  const filterNotes = [
    q.installerId && `Installer ${q.installerId}`,
    q.phaseType && `Phase ${q.phaseType}`,
    q.from && `Assigned from ${q.from}`,
    q.to && `Assigned to ${q.to}`,
    q.q && `Meter or SIM contains "${q.q}"`
  ].filter(Boolean);

  const buffer = await AssignedMetersExportService.buildListWorkbook(filters, {
    generatedBy: generatedBy(req.user),
    scopeLabel: q.discoCode || (scope.discoIds === null ? 'All discos' : 'All discos you can access'),
    filterNotes
  });
  return sendFile(res, buffer, format, fileName);
});

// The numbers to search: an uploaded sheet, or the JSON list. Sends the 400 itself.
const searchNumbers = (req, res) => {
  const numbers = req.file
    ? AssignedMetersExportService.parseMeterNumbersFile(req.file.buffer)
    : (req.body.meterNumbers || []);

  if (numbers.filter((n) => String(n ?? '').trim()).length === 0) {
    res.status(400).json({ success: false, message: 'Provide meterNumbers or upload a file containing meter numbers' });
    return null;
  }
  if (numbers.length > MAX_SEARCH_NUMBERS) {
    res.status(400).json({
      success: false,
      message: `At most ${MAX_SEARCH_NUMBERS.toLocaleString()} meter numbers at a time; this has ${numbers.length.toLocaleString()}`
    });
    return null;
  }
  return numbers;
};

const runSearch = async (req, res) => {
  const meterNumbers = searchNumbers(req, res);
  if (!meterNumbers) return null;
  const scope = await resolveListScope(req, res, req.body.discoCode);
  if (!scope) return null;
  return MeterAssignment.search({ meterNumbers, discoIds: scope.discoIds });
};

const searchAssignedMeters = asyncHandler(async (req, res) => {
  const found = await runSearch(req, res);
  if (!found) return;
  res.json({ success: true, data: found.results, summary: found.summary });
});

const exportAssignedMeterSearch = asyncHandler(async (req, res) => {
  const found = await runSearch(req, res);
  if (!found) return undefined;

  const format = req.body.format || 'xlsx';
  const fileName = AssignedMetersExportService.fileName('assigned-meters-search', format);
  if (format === 'csv') return sendFile(res, AssignedMetersExportService.searchCsv(found), format, fileName);

  const buffer = await AssignedMetersExportService.buildSearchWorkbook(found, {
    generatedBy: generatedBy(req.user),
    scopeLabel: req.body.discoCode || (req.user.role === 'SUPERADMIN' ? 'All discos' : 'All discos you can access')
  });
  return sendFile(res, buffer, format, fileName);
});

const getAssignmentBatch = asyncHandler(async (req, res) => {
  const batch = await AssignmentBatch.findById(req.params.id);

  // Outside the caller's discos reads as not found, so its existence isn't confirmed.
  if (!batch || !canAccessDisco(req.user, batch.discoId)) {
    return res.status(404).json({ success: false, message: 'Assignment batch not found' });
  }

  const items = await AssignmentBatch.findItems(batch);

  res.json({ success: true, data: { ...batch, items } });
});

module.exports = {
  assignMeters,
  returnMeters,
  assignInstallations,
  unassignInstallations,
  listAssignmentBatches,
  getMeterHolders,
  listAssignedMeters,
  exportAssignedMeters,
  searchAssignedMeters,
  exportAssignedMeterSearch,
  getAssignmentBatch
};
