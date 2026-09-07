const Disco = require('../models/Disco');
const User = require('../models/User');
const AssignmentBatch = require('../models/AssignmentBatch');
const { asyncHandler } = require('../middleware/errorHandler');

const loadDisco = async (res, discoCode) => {
  const disco = await Disco.findByCode(discoCode);

  if (!disco) {
    res.status(404).json({ success: false, message: `Disco ${discoCode} not found` });
    return null;
  }

  return disco;
};

/** Assignments only make sense to an active installer, so check before writing. */
const loadInstaller = async (res, installerId) => {
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

  return installer;
};

const assignMeters = asyncHandler(async (req, res) => {
  const { discoCode, installerId, meterNumbers, note, dispatchRef } = req.body;

  const disco = await loadDisco(res, discoCode);
  if (!disco) return;

  const installer = await loadInstaller(res, installerId);
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
    returnedBy: req.user ? req.user.id : null
  });

  res.json({
    success: true,
    message: `Returned ${returned.length} meter(s) to stock`,
    data: { returnedCount: returned.length, rejectedCount: rejected.length, returned, rejected }
  });
});

const assignInstallations = asyncHandler(async (req, res) => {
  const { discoCode, installerId, ids, accountNumbers, note, dispatchRef } = req.body;

  const disco = await loadDisco(res, discoCode);
  if (!disco) return;

  const installer = await loadInstaller(res, installerId);
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

  const disco = await loadDisco(res, discoCode);
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

  let discoId;
  if (discoCode) {
    const disco = await Disco.findByCode(discoCode);
    if (!disco) {
      return res.status(404).json({ success: false, message: `Disco ${discoCode} not found` });
    }
    discoId = disco.id;
  }

  const { batches, pagination } = await AssignmentBatch.findAll({
    page: Number(page),
    limit: Number(limit),
    assignmentType,
    installerId,
    discoId,
    status
  });

  res.json({ success: true, data: batches, pagination });
});

const getAssignmentBatch = asyncHandler(async (req, res) => {
  const batch = await AssignmentBatch.findById(req.params.id);

  if (!batch) {
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
  getAssignmentBatch
};
