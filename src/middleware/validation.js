const Joi = require('joi');

const validationSchemas = {
  createUser: Joi.object({
    firstName: Joi.string().min(2).max(50).required().trim(),
    lastName: Joi.string().min(2).max(50).required().trim(),
    role: Joi.string().valid('SUPERADMIN', 'ADMIN', 'INSTALLER').default('INSTALLER'),
    nin: Joi.string().length(11).pattern(/^\d+$/).required()
      .messages({
        'string.length': 'NIN must be exactly 11 digits',
        'string.pattern.base': 'NIN must contain only numbers'
      }),
    phone: Joi.string().pattern(/^0\d{10}$/).required()
      .messages({
        'string.pattern.base': 'Please provide a valid phone number'
      }),
    email: Joi.string().email().required().lowercase(),
    // password: Joi.string().min(6).max(100).required('Password is required')
    //   .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    //   .messages({
    //     'string.pattern.base': 'Password must contain at least one lowercase letter, one uppercase letter, and one number'
    //   }),
    homeAddress: Joi.string().max(500).optional().trim(),
    officeAddress: Joi.string().max(500).optional().trim()
  }),

  updateUser: Joi.object({
    firstName: Joi.string().min(2).max(50).optional().trim(),
    lastName: Joi.string().min(2).max(50).optional().trim(),
    role: Joi.string().valid('SUPERADMIN', 'ADMIN', 'INSTALLER').optional(),
    email: Joi.string().email().optional().lowercase(),
    homeAddress: Joi.string().max(500).optional().trim(),
    officeAddress: Joi.string().max(500).optional().trim()
  }).min(1),

  login: Joi.object({
    phone: Joi.string().required()
      .messages({
        'string.pattern.base': 'Please provide a valid phone number'
      }),
    password: Joi.string().required()
  }),

  changePassword: Joi.object({
    currentPassword: Joi.string().required(),
    newPassword: Joi.string().min(6).max(100).required()
      .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
      .messages({
        'string.pattern.base': 'New password must contain at least one lowercase letter, one uppercase letter, and one number'
      })
  }),

  getUsersQuery: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    role: Joi.string().valid('SUPERADMIN', 'ADMIN', 'INSTALLER').optional(),
    search: Joi.string().max(100).optional().trim()
  }),

  userId: Joi.object({
    id: Joi.number().integer().min(1).required()
  }),

  verifyOTP: Joi.object({
    otp: Joi.string().length(6).pattern(/^\d+$/).required()
      .messages({
        'string.length': 'OTP must be exactly 6 digits',
        'string.pattern.base': 'OTP must contain only numbers'
      })
  }),

  // JED Validation Schemas
  generateRef: Joi.object({
    accountNumber: Joi.string().required().trim()
      .messages({
        'string.empty': 'Account number is required'
      }),
    custNames: Joi.string().required().trim()
      .messages({
        'string.empty': 'Customer name is required'
      }),
    gsm: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).required()
      .messages({
        'string.pattern.base': 'Please provide a valid phone number',
        'string.empty': 'Phone number is required'
      }),
    email: Joi.string().email().required()
      .messages({
        'string.email': 'Please provide a valid email address',
        'string.empty': 'Email is required'
      }),
    address: Joi.string().required().trim()
      .messages({
        'string.empty': 'Address is required'
      }),
    meterRecommended: Joi.string().valid('Single Phase', 'Three Phase').required()
      .messages({
        'any.only': 'Meter recommended must be either Single Phase or Three Phase',
        'string.empty': 'Meter recommended is required'
      }),
    discoCode: Joi.string().required().trim()
      .messages({
        'string.empty': 'Disco code is required'
      }),
    requestRef: Joi.string().optional().trim(),
    region: Joi.string().optional().trim()
  }),

  confirmPayment: Joi.object({
    accountNumber: Joi.string().required().trim()
      .messages({
        'string.empty': 'Account number is required'
      })
  }),

  completeInstallation: Joi.object({
    sealNo: Joi.string().required().trim()
      .messages({
        'string.empty': 'Seal number is required'
      }),
    meterNo: Joi.string().required().trim()
      .messages({
        'string.empty': 'Meter number is required'
      }),
    accountNumber: Joi.string().required().trim()
      .messages({
        'string.empty': 'Account number is required'
      })
  }),

  getRequestsQuery: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    status: Joi.string().valid('INITIATED', 'PAID', 'COMPLETED').optional()
  }),

  getPaymentsQuery: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    status: Joi.string().valid('PAID', 'COMPLETED').optional(),
    startDate: Joi.date().iso().optional(),
    endDate: Joi.date().iso().optional(),
    rangePreset: Joi.string().valid('today', 'thisMonth', 'thisYear').optional()
  }),

  getListQuery: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    isActive: Joi.boolean().optional()
  }),

  // API Key management
  createApiKey: Joi.object({
    keyName: Joi.string().min(3).max(100).required().trim()
      .messages({ 'string.empty': 'Key name is required', 'string.min': 'Key name must be at least 3 characters' }),
    description: Joi.string().max(500).optional().allow('').trim(),
    // permissions: Joi.array().items(Joi.string().max(100)).optional(),
    // expiresAt: Joi.date().iso().optional()
    //   .messages({ 'date.format': 'expiresAt must be a valid ISO date string' })
  })

  ,

  // Meter type management
  createMeterType: Joi.object({
    name: Joi.string().min(1).max(200).required().trim()
      .messages({ 'string.empty': 'Name is required' }),
    amount: Joi.number().positive().required()
      .messages({ 'number.base': 'Amount must be a number', 'number.positive': 'Amount must be greater than zero' })
  }),

  updateMeterType: Joi.object({
    name: Joi.string().min(1).max(200).optional().trim(),
    amount: Joi.number().positive().optional()
  }).min(1)
};



const validate = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const errors = error.details.map(detail => {
        const field = detail.path.join('.');
        // Remove quotes and field name from Joi's default message
        const message = detail.message.replace(/["']/g, '').replace(`${field} `, '');
        return { field, message };
      });

      return res.status(400).json({
        success: false,
        message: 'Validation failed: ' + errors.map(e => `${e.field} ${e.message}`).join(', '),
      });
    }

    req.body = value;
    next();
  };
};


const validateQuery = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.query, {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));

      return res.status(400).json({
        success: false,
        message: 'Query validation failed: ' + errors.map(e => `${e.field} - ${e.message}`).join(', '),
      });
    }

    req.query = value;
    next();
  };
};

const validateParams = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.params, {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));

      return res.status(400).json({
        success: false,
        message: 'Parameter validation failed: ' + errors.map(e => `${e.field} - ${e.message}`).join(', '),
      });
    }

    req.params = value;
    next();
  };
};

module.exports = {
  schemas: validationSchemas,
  validate,
  validateQuery,
  validateParams
};