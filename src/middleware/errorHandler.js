const errorHandler = (err, req, res, next) => {
  console.error('Error:', {
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    url: req.url,
    method: req.method,
    timestamp: new Date().toISOString()
  });

  // Default error
  let error = {
    success: false,
    message: 'Internal server error'
  };

  // PostgreSQL errors
  if (err.code) {
    switch (err.code) {
      case '23505': // Unique violation
        const field = extractFieldFromError(err.detail);
        error.message = `${field} already exists`;
        return res.status(400).json(error);
        
      case '23503': // Foreign key violation
        error.message = 'Referenced record does not exist';
        return res.status(400).json(error);
        
      case '23502': // Not null violation
        const nullField = err.column;
        error.message = `${nullField} is required`;
        return res.status(400).json(error);
        
      case '22001': // String data right truncation
        error.message = 'Data too long for field';
        return res.status(400).json(error);
        
      case '08006': // Connection failure
      case '08001': // Unable to connect
        error.message = 'Database connection error';
        return res.status(503).json(error);
        
      default:
        console.error('Unhandled PostgreSQL error:', err.code, err.message);
    }
  }

  // Custom application errors
  if (err.name === 'ValidationError') {
    error.message = 'Validation failed';
    error.errors = err.details;
    return res.status(400).json(error);
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    error.message = 'Invalid token';
    return res.status(401).json(error);
  }

  if (err.name === 'TokenExpiredError') {
    error.message = 'Token expired';
    return res.status(401).json(error);
  }

  // Custom status and message
  if (err.statusCode || err.status) {
    error.message = err.message;
    return res.status(err.statusCode || err.status).json(error);
  }

  // Development error details
  if (process.env.NODE_ENV === 'development') {
    error.error = err.message;
    error.stack = err.stack;
  }

  res.status(500).json(error);
};

const extractFieldFromError = (detail) => {
  if (!detail) return 'Field';
  
  // Extract field name from PostgreSQL error detail
  const match = detail.match(/Key \((.+?)\)=/);
  if (match) {
    const field = match[1];
    // Convert snake_case to camelCase for user-friendly messages
    return field.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
  }
  
  return 'Field';
};

const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

const notFound = (req, res, next) => {
  const error = new Error(`Route ${req.originalUrl} not found`);
  error.statusCode = 404;
  next(error);
};

module.exports = {
  errorHandler,
  asyncHandler,
  notFound
};