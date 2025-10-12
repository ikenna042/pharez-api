const ApiKey = require('../models/ApiKey');
const { asyncHandler } = require('../middleware/errorHandler');

const createApiKey = asyncHandler(async (req, res) => {
  const { keyName, description, permissions, expiresAt } = req.body;

  // check if keyName already exists
  const existingKey = await ApiKey.findByName(keyName);
  if (existingKey) {
    return res.status(400).json({
      success: false,
      message: 'API Key with this name already exists'
    });
  }

  const apiKey = await ApiKey.create(
    {
      keyName,
      description,
      permissions,
      expiresAt
    },
    req.user.id
  );

  res.status(201).json({
    success: true,
    message: 'API Key created successfully',
    data: apiKey,
    warning: 'Please save this API key securely. It will not be shown again.'
  });
});

const getApiKeys = asyncHandler(async (req, res) => {
  const { page, limit, isActive } = req.query;

  const result = await ApiKey.findAll({ page, limit, isActive });

  // Mask API keys in list
//   result.apiKeys = result.apiKeys.map(key => ({
//     ...key,
//     apiKey: key.apiKey.substring(0, 10) + '...' + key.apiKey.substring(key.apiKey.length - 4)
//   }));

  res.json({
    success: true,
    data: result.apiKeys,
    pagination: result.pagination
  });
});

const getApiKeyById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const apiKey = await ApiKey.findById(id);

  if (!apiKey) {
    return res.status(404).json({
      success: false,
      message: 'API Key not found'
    });
  }

  // Mask API key
//   apiKey.apiKey = apiKey.apiKey.substring(0, 10) + '...' + apiKey.apiKey.substring(apiKey.apiKey.length - 4);

  res.json({
    success: true,
    data: apiKey
  });
});

const deactivateApiKey = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const apiKey = await ApiKey.deactivate(id);

  if (!apiKey) {
    return res.status(404).json({
      success: false,
      message: 'API Key not found'
    });
  }

  res.json({
    success: true,
    message: 'API Key deactivated successfully',
    data: apiKey
  });
});

const deleteApiKey = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const deleted = await ApiKey.delete(id);

  if (!deleted) {
    return res.status(404).json({
      success: false,
      message: 'API Key not found'
    });
  }

  res.json({
    success: true,
    message: 'API Key deleted successfully'
  });
});

const getApiKeyUsageStats = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { days = 7 } = req.query;

  const stats = await ApiKey.getUsageStats(id, days);

  res.json({
    success: true,
    data: {
      period: `Last ${days} days`,
      statistics: stats
    }
  });
});

module.exports = {
  createApiKey,
  getApiKeys,
  getApiKeyById,
  deactivateApiKey,
  deleteApiKey,
  getApiKeyUsageStats
};