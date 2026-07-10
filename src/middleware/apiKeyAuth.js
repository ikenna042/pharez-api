const ApiKey = require('../models/ApiKey');

const apiKeyAuth = async (req, res, next) => {
  const startTime = Date.now();
  
  try {
    // Get API key from header
    const apiKey = req.header('X-API-Key') || req.header('Authorization')?.replace('Bearer ', '');

    if (!apiKey) {
      
      console.log('API Key missing in request headers');

      return res.status(401).json({
        success: false,
        message: 'API Key required. Please provide X-API-Key header'
      });
    }

    // Validate API key
    const validKey = await ApiKey.findByKey(apiKey);

    if (!validKey) {
      
      console.log('Invalid API Key provided:', apiKey);

      // Log failed attempt
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired API Key'
      });
    }

    // Check permissions if specified
    const requiredPermission = req.requiredPermission;
    if (requiredPermission && validKey.permissions.length > 0) {
      if (!validKey.permissions.includes(requiredPermission) && !validKey.permissions.includes('*')) {
        
        console.log('API Key does not have required permissions:', { requiredPermission });

        return res.status(403).json({
          success: false,
          message: 'API Key does not have required permissions'
        });
      }
    }

    // Attach API key info to request
    req.apiKey = validKey;

    // Update last used
    await ApiKey.updateLastUsed(apiKey);

    
    console.log('API Key authenticated for key:', validKey.keyName);

    // Log usage on response
    res.on('finish', async () => {
      const responseTime = Date.now() - startTime;
      
      try {
        await ApiKey.logUsage(validKey.id, {
          endpoint: req.originalUrl,
          method: req.method,
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
          statusCode: res.statusCode,
          responseTime,
          requestBody: req.body && Object.keys(req.body).length > 0 ? req.body : null,
          responseBody: res.statusCode >= 400 && res.locals.responseBody ? res.locals.responseBody : null,
          error: res.statusCode >= 400 ? res.statusMessage : null
        });
      } catch (error) {
        console.error('Failed to log API key usage:', error);
      }
    });

    next();
  } catch (error) {
    
    console.error('API Key authentication error:', error);

    return res.status(500).json({
      success: false,
      message: 'Authentication error'
    });
  }
};

// Middleware to require specific permission
const requirePermission = (permission) => {
  return (req, res, next) => {
    req.requiredPermission = permission;
    next();
  };
};

module.exports = {
  apiKeyAuth,
  requirePermission
};