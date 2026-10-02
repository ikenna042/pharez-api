const { asyncHandler } = require('../middleware/errorHandler');
const MeterType = require('../models/MeterType');
const Disco = require('../models/Disco');

/**
 * One active price per meter type per disco is enforced by the partial unique
 * index uq_meter_types_disco_active_name. Left to the global error handler,
 * a violation becomes a generic 400 naming an unreadable index expression;
 * this turns it into a 409 that says what to do instead.
 */
const isDuplicatePrice = (error) =>
  error.code === '23505' && error.constraint === 'uq_meter_types_disco_active_name';

const duplicatePrice = (res, name, discoCode) =>
  res.status(409).json({
    success: false,
    message: `An active '${name}' price already exists for ${discoCode}. Update it or deactivate it first.`
  });

const createMeterType = asyncHandler(async (req, res) => {
  const { discoCode, name, amount } = req.body;
  const createdBy = req.user ? req.user.id : null;

  const disco = await Disco.findByCode(discoCode);
  if (!disco) {
    return res.status(404).json({ success: false, message: `Disco ${discoCode} not found` });
  }

  try {
    const newType = await MeterType.create({ discoId: disco.id, name, amount, createdBy });

    return res.status(201).json({
      success: true,
      message: 'Meter type created',
      data: newType
    });
  } catch (error) {
    if (isDuplicatePrice(error)) return duplicatePrice(res, name, disco.code);
    throw error;
  }
});

const getMeterTypes = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, discoCode } = req.validatedQuery || req.query;

  if (discoCode && !(await Disco.findByCode(discoCode))) {
    return res.status(404).json({ success: false, message: `Disco ${discoCode} not found` });
  }

  const data = await MeterType.findAll({
    page: parseInt(page, 10),
    limit: parseInt(limit, 10),
    discoCode
  });

  res.json({ success: true, data: data.meterTypes, pagination: data.pagination });
});

const getMeterTypeById = asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const mt = await MeterType.findById(id);
  if (!mt) return res.status(404).json({ success: false, message: 'Meter type not found' });
  res.json({ success: true, data: mt });
});

const updateMeterType = asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { name, amount } = req.body;
  const updatedBy = req.user ? req.user.id : null;

  try {
    const updated = await MeterType.update(id, { name, amount, updatedBy });
    if (!updated) return res.status(404).json({ success: false, message: 'Meter type not found or not active' });

    return res.json({ success: true, message: 'Meter type updated', data: updated });
  } catch (error) {
    // Renaming onto a name this disco already has an active price for.
    if (isDuplicatePrice(error)) {
      const existing = await MeterType.findById(id);
      return duplicatePrice(res, name, existing ? existing.discoCode : 'this disco');
    }
    throw error;
  }
});

const deleteMeterType = asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const deleted = await MeterType.deactivate(id);
  if (!deleted) return res.status(404).json({ success: false, message: 'Meter type not found' });

  res.json({ success: true, message: 'Meter type deactivated', data: deleted });
});

module.exports = {
  createMeterType,
  getMeterTypes,
  getMeterTypeById,
  updateMeterType,
  deleteMeterType
};
