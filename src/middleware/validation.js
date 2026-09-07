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

  // users.id is a UUID (see migrations/001-users-id-to-uuid.js). Anything else
  // must be rejected here: letting it through reaches Postgres as
  // "invalid input syntax for type uuid" and surfaces as a 500 rather than a 400.
  userId: Joi.object({
    id: Joi.string().guid({ version: ['uuidv4'] }).required()
      .messages({ 'string.guid': 'id must be a valid user id' })
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
    status: Joi.string().valid('INITIATED', 'PAID', 'CONFIRMED', 'COMPLETED').optional()
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
  }).min(1),

  /* ---------------------------------------------------------------------
   * Multi-disco installation flow
   * ------------------------------------------------------------------- */

  // Generic SERIAL primary key param. (schemas.userId is a separate, older
  // schema used by the user routes and is deliberately left alone.)
  idParam: Joi.object({
    id: Joi.number().integer().min(1).required()
      .messages({ 'number.base': 'id must be a number' })
  }),

  discoCodeParam: Joi.object({
    discoCode: Joi.string().max(50).required().uppercase().trim()
  }),

  discoCodeOnlyParam: Joi.object({
    code: Joi.string().max(50).required().uppercase().trim()
  }),

  createDisco: Joi.object({
    code: Joi.string().max(50).required().uppercase().trim()
      .pattern(/^[A-Z0-9_]+$/)
      .messages({ 'string.pattern.base': 'code may only contain letters, numbers and underscores' }),
    name: Joi.string().min(2).max(200).required().trim(),
    integrationMode: Joi.string().valid('OFFLINE', 'API').default('OFFLINE'),
    contactEmail: Joi.string().email().max(255).optional().allow(null, ''),
    importMapping: Joi.object().optional().default({}),
    exportTemplate: Joi.object().optional().default({})
  }),

  updateDisco: Joi.object({
    name: Joi.string().min(2).max(200).optional().trim(),
    integrationMode: Joi.string().valid('OFFLINE', 'API').optional(),
    contactEmail: Joi.string().email().max(255).optional().allow(null, ''),
    isActive: Joi.boolean().optional()
  }).min(1),

  getDiscosQuery: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    isActive: Joi.boolean().optional()
  }),

  // An import mapping is a set of named import types, each declaring which
  // spreadsheet headers feed which field and how to normalize the value.
  discoImportMapping: Joi.object()
    .pattern(
      Joi.string().max(60),
      Joi.object({
        sheetIndex: Joi.number().integer().min(0).default(0),
        headerRow: Joi.number().integer().min(1).default(1),
        keyField: Joi.string().max(60).required(),
        captureExtras: Joi.boolean().default(false),
        fields: Joi.object()
          .pattern(
            Joi.string().max(60),
            Joi.object({
              headers: Joi.array().items(Joi.string().max(120)).min(1).required(),
              required: Joi.boolean().default(false),
              transform: Joi.string()
                .valid('trim', 'upper', 'text', 'number', 'ngPhone', 'phase', 'date')
                .default('trim'),
              keepRaw: Joi.boolean().default(false),
              padStart: Joi.number().integer().min(1).max(64).optional()
            })
          )
          .min(1)
          .required()
      })
    )
    .min(1),

  assignMeters: Joi.object({
    discoCode: Joi.string().max(50).required().uppercase().trim(),
    installerId: Joi.string().guid({ version: ['uuidv4'] }).required()
      .messages({ 'string.guid': 'installerId must be a valid user id' }),
    meterNumbers: Joi.array().items(Joi.string().max(100).trim()).min(1).max(1000).required()
      .messages({ 'array.min': 'Provide at least one meter number' }),
    note: Joi.string().max(500).optional().allow('', null),
    dispatchRef: Joi.string().max(60).optional().allow('', null)
  }),

  returnMeters: Joi.object({
    meterNumbers: Joi.array().items(Joi.string().max(100).trim()).min(1).max(1000).required()
  }),

  assignInstallations: Joi.object({
    discoCode: Joi.string().max(50).required().uppercase().trim(),
    installerId: Joi.string().guid({ version: ['uuidv4'] }).required()
      .messages({ 'string.guid': 'installerId must be a valid user id' }),
    ids: Joi.array().items(Joi.number().integer().min(1)).min(1).max(1000).optional(),
    accountNumbers: Joi.array().items(Joi.string().max(50).trim()).min(1).max(1000).optional(),
    note: Joi.string().max(500).optional().allow('', null),
    dispatchRef: Joi.string().max(60).optional().allow('', null)
  }).xor('ids', 'accountNumbers')
    .messages({ 'object.xor': 'Provide either ids or accountNumbers, not both' }),

  unassignInstallations: Joi.object({
    discoCode: Joi.string().max(50).required().uppercase().trim(),
    ids: Joi.array().items(Joi.number().integer().min(1)).min(1).max(1000).optional(),
    accountNumbers: Joi.array().items(Joi.string().max(50).trim()).min(1).max(1000).optional()
  }).xor('ids', 'accountNumbers'),

  createInstallationRequest: Joi.object({
    discoCode: Joi.string().max(50).required().uppercase().trim(),
    accountNumber: Joi.string().max(50).required().trim(),
    customerName: Joi.string().max(255).required().trim(),
    customerPhone: Joi.string().max(20).optional().allow('', null),
    customerEmail: Joi.string().email().max(255).optional().allow('', null),
    customerAddress: Joi.string().optional().allow('', null),
    feederName: Joi.string().max(150).optional().allow('', null),
    transformerName: Joi.string().max(150).optional().allow('', null),
    transformerCode: Joi.string().max(100).optional().allow('', null),
    region: Joi.string().max(100).optional().allow('', null),
    area: Joi.string().max(100).optional().allow('', null),
    meterType: Joi.string().valid('SINGLE PHASE', 'THREE PHASE').optional().allow(null),
    installationPosition: Joi.string().max(50).optional().allow('', null),
    meterVendor: Joi.string().max(150).optional().allow('', null)
  }),

  getInstallationsQuery: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    discoCode: Joi.string().max(50).optional().uppercase().trim(),
    status: Joi.string().valid('PENDING', 'ASSIGNED', 'IN_PROGRESS', 'INSTALLED', 'EXPORTED', 'FAILED', 'CANCELLED').optional(),
    installerId: Joi.string().guid({ version: ['uuidv4'] }).optional(),
    assignmentBatchId: Joi.number().integer().min(1).optional(),
    importBatchId: Joi.number().integer().min(1).optional(),
    search: Joi.string().max(100).optional().trim(),
    from: Joi.date().iso().optional(),
    to: Joi.date().iso().optional()
  }),

  installationStatsQuery: Joi.object({
    discoCode: Joi.string().max(50).optional().uppercase().trim()
  }),

  getMyJobsQuery: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    status: Joi.string().valid('ASSIGNED', 'IN_PROGRESS', 'INSTALLED', 'FAILED', 'EXPORTED').optional(),
    search: Joi.string().max(100).optional().trim()
  }),

  getMyMetersQuery: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(50),
    phaseType: Joi.string().valid('SINGLE PHASE', 'THREE PHASE').optional()
  }),

  reportInstallation: Joi.object({
    meterNumber: Joi.string().max(100).required().trim()
      .messages({ 'string.empty': 'meterNumber is required' }),
    sealNumber: Joi.string().max(100).optional().allow('', null).trim(),
    installationDate: Joi.date().iso().optional().allow(null),
    latitude: Joi.number().min(-90).max(90).optional().allow(null),
    longitude: Joi.number().min(-180).max(180).optional().allow(null),
    // Photos are hosted externally; we store and export the URL.
    installationPhotoUrl: Joi.string().uri().max(2000).optional().allow('', null),
    discoSupervisor: Joi.string().max(150).optional().allow('', null).trim(),
    notes: Joi.string().max(1000).optional().allow('', null).trim()
  }),

  reportInstallationFailure: Joi.object({
    reason: Joi.string().min(3).max(1000).required().trim()
      .messages({ 'string.empty': 'A reason is required' })
  }),

  cancelInstallation: Joi.object({
    reason: Joi.string().max(1000).optional().allow('', null).trim()
  }),

  exportInstallationsQuery: Joi.object({
    from: Joi.date().iso().optional(),
    to: Joi.date().iso().optional(),
    includeExported: Joi.boolean().default(false),
    markExported: Joi.boolean().default(false)
  }),

  getExportBatchesQuery: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    discoCode: Joi.string().max(50).optional().uppercase().trim()
  }),

  markExportSent: Joi.object({
    exportBatchId: Joi.number().integer().min(1).required()
  }),

  getAssignmentBatchesQuery: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    assignmentType: Joi.string().valid('METER', 'INSTALLATION').optional(),
    installerId: Joi.string().guid({ version: ['uuidv4'] }).optional(),
    discoCode: Joi.string().max(50).optional().uppercase().trim(),
    status: Joi.string().valid('ACTIVE', 'PARTIALLY_RETURNED', 'CLOSED', 'CANCELLED').optional()
  }),

  getImportBatchesQuery: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    discoCode: Joi.string().max(50).optional().uppercase().trim(),
    importType: Joi.string().valid('PENDING_INSTALLATIONS', 'METER_INVENTORY').optional(),
    status: Joi.string().valid('PROCESSING', 'COMPLETED', 'FAILED').optional()
  }),

  discoExportTemplate: Joi.object()
    .pattern(
      Joi.string().max(60),
      Joi.object({
        sheetName: Joi.string().max(60).default('Sheet1'),
        fileNamePrefix: Joi.string().max(80).default('export'),
        columns: Joi.array()
          .items(
            Joi.object({
              header: Joi.string().max(150).required(),
              source: Joi.string().max(60).required(),
              format: Joi.string().valid('text', 'number', 'date', 'datetime').optional(),
              width: Joi.number().integer().min(4).max(120).optional()
            })
          )
          .min(1)
          .required()
      })
    )
    .min(1)
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

    // Express 5 exposes req.query as a getter with no setter, so the assignment
    // below is a silent no-op and Joi's coercion/defaults never reach the handler.
    // Existing controllers work around this by re-defaulting by hand; new ones
    // should read req.validatedQuery instead. Kept additive so nothing changes
    // for the routes already relying on the old behaviour.
    req.query = value;
    req.validatedQuery = value;
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