const { asyncHandler } = require('../middleware/errorHandler');
const MeterType = require('../models/MeterType');

const createMeterType = asyncHandler(async (req, res) => {
  const { name, amount } = req.body;
  const createdBy = req.user ? req.user.id : null;

  const newType = await MeterType.create({ name, amount, createdBy });

  res.status(201).json({
    success: true,
    message: 'Meter type created',
    data: newType
  });
});

const getMeterTypes = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const data = await MeterType.findAll({ page: parseInt(page, 10), limit: parseInt(limit, 10) });

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

  const updated = await MeterType.update(id, { name, amount, updatedBy });
  if (!updated) return res.status(404).json({ success: false, message: 'Meter type not found or not active' });

  res.json({ success: true, message: 'Meter type updated', data: updated });
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
