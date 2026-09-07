const Disco = require('../models/Disco');
const { asyncHandler } = require('../middleware/errorHandler');

const createDisco = asyncHandler(async (req, res) => {
  const { code, name, integrationMode, contactEmail, importMapping, exportTemplate } = req.body;

  const existing = await Disco.findByCode(code);
  if (existing) {
    return res.status(400).json({
      success: false,
      message: `Disco ${code} already exists`
    });
  }

  const disco = await Disco.create({
    code,
    name,
    integrationMode,
    contactEmail: contactEmail || null,
    importMapping: importMapping || {},
    exportTemplate: exportTemplate || {},
    createdBy: req.user ? req.user.id : null
  });

  res.status(201).json({
    success: true,
    message: 'Disco created',
    data: disco
  });
});

const getDiscos = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, isActive } = req.validatedQuery || req.query;

  const { discos, pagination } = await Disco.findAll({
    page: Number(page),
    limit: Number(limit),
    isActive
  });

  res.json({
    success: true,
    data: discos,
    pagination
  });
});

const getDiscoByCode = asyncHandler(async (req, res) => {
  const disco = await Disco.findByCode(req.params.code);

  if (!disco) {
    return res.status(404).json({
      success: false,
      message: `Disco ${req.params.code} not found`
    });
  }

  res.json({ success: true, data: disco });
});

const updateDisco = asyncHandler(async (req, res) => {
  const disco = await Disco.update(req.params.code, {
    ...req.body,
    updatedBy: req.user ? req.user.id : null
  });

  if (!disco) {
    return res.status(404).json({
      success: false,
      message: `Disco ${req.params.code} not found`
    });
  }

  res.json({ success: true, message: 'Disco updated', data: disco });
});

const updateImportMapping = asyncHandler(async (req, res) => {
  const disco = await Disco.updateImportMapping(
    req.params.code,
    req.body,
    req.user ? req.user.id : null
  );

  if (!disco) {
    return res.status(404).json({
      success: false,
      message: `Disco ${req.params.code} not found`
    });
  }

  res.json({
    success: true,
    message: 'Import mapping updated',
    data: { code: disco.code, importMapping: disco.importMapping }
  });
});

const updateExportTemplate = asyncHandler(async (req, res) => {
  const disco = await Disco.updateExportTemplate(
    req.params.code,
    req.body,
    req.user ? req.user.id : null
  );

  if (!disco) {
    return res.status(404).json({
      success: false,
      message: `Disco ${req.params.code} not found`
    });
  }

  res.json({
    success: true,
    message: 'Export template updated',
    data: { code: disco.code, exportTemplate: disco.exportTemplate }
  });
});

module.exports = {
  createDisco,
  getDiscos,
  getDiscoByCode,
  updateDisco,
  updateImportMapping,
  updateExportTemplate
};
