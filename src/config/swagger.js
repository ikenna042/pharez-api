const swaggerJSDoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'PharezAPI',
      version: '1.0.0',
      // description: `
      //   Complete API for user management and authentication system.

      //   ## Authentication
      //   - To use JWT: obtain a token via the login endpoint and include it in the Authorization header:
      //     \`Authorization: Bearer <your_jwt_token>\`
      //   - To use API keys for external endpoints: click the "Authorize" button in the API docs and provide the API key in the "X-API-Key" input. The key will be sent in the X-API-Key header for requests.

      //   ## User Roles
      //   - **SUPERADMIN**: Full system access
      //   - **ADMIN**: Administrative access
      //   - **INSTALLER**: Limited access for field operations
      // `,
      description: `
        Complete API for JED meter installation and payment integration.

        ## Authentication
        - To use API keys for external endpoints: click the "Authorize" button in the API docs and provide the API key in the "X-API-Key" input. The key will be sent in the X-API-Key header for requests.
        SAMPLE TEST KEY: X-API-Key: pk_a2ef2f6d06e936e873e7763905245ceda17b372afa4a73f179581a1769d9ca2d

        - To use JWT: obtain a token via the login endpoint and include it in the Authorization header:
          \`Authorization: Bearer <your_jwt_token>\`
      `,
      contact: {
        name: 'API Support',
        email: 'support@pharezapi.com'
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT'
      }
    },
    servers: [
      {
        url: process.env.NODE_ENV === 'production' 
          ? 'https://pharez-api.onrender.com/api/v1' 
          : `http://localhost:${process.env.PORT || 3000}/api/v1`,
        description: process.env.NODE_ENV === 'production' ? 'Production server' : 'Development server'
      }, // https://pharez-api.onrender.com/api/v1/users
      {
        url: 'http://localhost:3000/api/v1',
        description: 'Local development server'
      },
      {
        url: 'https://pharez-api.onrender.com/api/v1',
        description: 'Production server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter JWT token obtained from login'
        }
        ,
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
          description: 'Provide your API key in the X-API-Key header'
        }
      },
      schemas: {
        User: {
          type: 'object',
          properties: {
            id: {
              type: 'integer',
              description: 'User ID',
              example: 1
            },
            firstName: {
              type: 'string',
              description: 'User first name',
              example: 'John'
            },
            lastName: {
              type: 'string',
              description: 'User last name',
              example: 'Doe'
            },
            role: {
              type: 'string',
              enum: ['SUPERADMIN', 'ADMIN', 'INSTALLER'],
              description: 'User role',
              example: 'ADMIN'
            },
            nin: {
              type: 'string',
              description: 'National Identification Number',
              example: '12345678901'
            },
            phone: {
              type: 'string',
              description: 'Phone number (used for login)',
              example: '08012345678'
            },
            email: {
              type: 'string',
              format: 'email',
              description: 'User email address',
              example: 'john.doe@example.com'
            },
            homeAddress: {
              type: 'string',
              description: 'Home address',
              example: '123 Main Street, Lagos, Nigeria'
            },
            officeAddress: {
              type: 'string',
              description: 'Office address',
              example: '456 Business District, Abuja, Nigeria'
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              description: 'User creation timestamp'
            },
            updatedAt: {
              type: 'string',
              format: 'date-time',
              description: 'Last update timestamp'
            }
          }
        },
        UserCreate: {
          type: 'object',
          required: ['firstName', 'lastName', 'phone', 'email', 'password', 'nin'],
          properties: {
            firstName: {
              type: 'string',
              minLength: 2,
              example: 'John'
            },
            lastName: {
              type: 'string',
              minLength: 2,
              example: 'Doe'
            },
            role: {
              type: 'string',
              enum: ['SUPERADMIN', 'ADMIN', 'INSTALLER'],
              default: 'INSTALLER',
              example: 'ADMIN'
            },
            nin: {
              type: 'string',
              minLength: 11,
              maxLength: 11,
              example: '12345678901'
            },
            phone: {
              type: 'string',
              pattern: '^0\\d{10}$',
              example: '08012345678'
            },
            email: {
              type: 'string',
              format: 'email',
              example: 'john.doe@example.com'
            },
            password: {
              type: 'string',
              minLength: 6,
              example: 'SecurePassword123!'
            },
            homeAddress: {
              type: 'string',
              example: '123 Main Street, Lagos, Nigeria'
            },
            officeAddress: {
              type: 'string',
              example: '456 Business District, Abuja, Nigeria'
            }
          }
        },
        UserUpdate: {
          type: 'object',
          properties: {
            firstName: {
              type: 'string',
              minLength: 2,
              example: 'John'
            },
            lastName: {
              type: 'string',
              minLength: 2,
              example: 'Doe'
            },
            role: {
              type: 'string',
              enum: ['SUPERADMIN', 'ADMIN', 'INSTALLER'],
              example: 'ADMIN'
            },
            email: {
              type: 'string',
              format: 'email',
              example: 'john.doe@example.com'
            },
            homeAddress: {
              type: 'string',
              example: '123 Main Street, Lagos, Nigeria'
            },
            officeAddress: {
              type: 'string',
              example: '456 Business District, Abuja, Nigeria'
            }
          }
        },
        ChangePassword: {
          type: 'object',
          required: ['currentPassword', 'newPassword'],
          properties: {
            currentPassword: {
              type: 'string',
              description: 'Current password',
              example: 'CurrentPassword123!'
            },
            newPassword: {
              type: 'string',
              minLength: 6,
              pattern: '^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)',
              description: 'New password (must contain lowercase, uppercase, and number)',
              example: 'NewPassword123!'
            }
          }
        },
        LoginRequest: {
          type: 'object',
          required: ['phone', 'password'],
          properties: {
            phone: {
              type: 'string',
              description: 'Phone number',
              example: '08012345678'
            },
            password: {
              type: 'string',
              description: 'User password',
              example: 'SecurePassword123!'
            }
          }
        },
        LoginResponse: {
          allOf: [
            { $ref: '#/components/schemas/Success' },
            {
              type: 'object',
              properties: {
                data: {
                  type: 'object',
                  properties: {
                    user: {
                      $ref: '#/components/schemas/User'
                    },
                    token: {
                      type: 'string',
                      description: 'JWT authentication token'
                    }
                  }
                }
              }
            }
          ]
        },
        Success: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: true
            },
            message: {
              type: 'string',
              description: 'Success message',
              example: 'Operation completed successfully'
            },
            data: {
              type: 'object',
              description: 'Response data'
            }
          }
        },
        Error: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: false
            },
            message: {
              type: 'string',
              description: 'Error message',
              example: 'An error occurred'
            },
            error: {
              type: 'string',
              description: 'Error details'
            }
          }
        },
        ValidationError: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: false
            },
            message: {
              type: 'string',
              example: 'Validation failed'
            },
            errors: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  field: {
                    type: 'string',
                    description: 'Field name that failed validation'
                  },
                  message: {
                    type: 'string',
                    description: 'Validation error message'
                  }
                }
              }
            }
          }
        }
      }
    }
  },
  apis: [
    './src/routes/*.js',
    './src/controllers/*.js'
  ]
};

const specs = swaggerJSDoc(options);

module.exports = {
  specs,
  swaggerUi
};