const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const routes = require('./routes');
const { errorHandler } = require('./middleware/errorHandler');
const { specs, swaggerUi } = require('./config/swagger');
const { buildPublicSwaggerSpec, buildPostmanCollection, publicSpecs } = require('./config/swaggerPublic');

const app = express();

// Security middleware
app.use(helmet());
app.use(cors());

// Logging
app.use(morgan('combined'));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'PharezAPI is running!',
    data: {
        timestamp: new Date().toISOString(),
        version: process.env.API_VERSION || 'v1',
    }
  });
});

// Swagger Documentation
const swaggerUiOptions = {
  explorer: true,
  customCss: `
    .swagger-ui .topbar { display: none }
    .swagger-ui .info .title { color: #1976d2; }
  `,
  customSiteTitle: 'PharezAPI Documentation',
  // Pass through swaggerOptions to control doc expansion and show security schemes clearly
  swaggerOptions: {
    docExpansion: 'none'
  }
};

// Raw OpenAPI spec
app.get('/api-docs/swagger.json', (req, res) => {
  res.json(specs);
});

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs, swaggerUiOptions));

const partnerSwaggerSpec = buildPublicSwaggerSpec(publicSpecs);
app.get('/api-docs/external.json', (req, res) => {
  res.json(partnerSwaggerSpec);
});

app.get('/api-docs/external-postman.json', (req, res) => {
  res.json(buildPostmanCollection(partnerSwaggerSpec));
});

// API Routes
app.use('/api/v1', routes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

console.log('🔧 App configuration loaded', {errorHandler});
// Global error handler
app.use(errorHandler);

module.exports = app;