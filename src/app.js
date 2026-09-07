const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const routes = require('./routes');
const { errorHandler } = require('./middleware/errorHandler');
const { specs, swaggerUi } = require('./config/swagger');
const { buildPublicSwaggerSpec, buildPostmanCollection, publicSpecs } = require('./config/swaggerPublic');
const { themeCss, themeToggleJs } = require('./config/swaggerTheme');

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
    message: `MeMetering API is running on port ${process.env.PORT || 3000}! env: ${process.env.NODE_ENV || 'development'}`,
    data: {
        timestamp: new Date().toISOString(),
        version: process.env.API_VERSION || 'v1',
    }
  });
});

// Swagger Documentation
const swaggerUiOptions = {
  explorer: true,
  // Light/dark theming lives in config/swaggerTheme.js; the toggle follows the
  // visitor's system preference until they pick one for themselves.
  //
  // The script is loaded from a route rather than inlined via customJsStr:
  // helmet's default CSP sets script-src 'self', which blocks inline scripts
  // outright. (Inline <style> still works because style-src allows
  // 'unsafe-inline', which is why the CSS below can stay inline.)
  customCss: themeCss,
  customJs: '/api-docs/theme.js',
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

// Theme toggle script for the docs page. Served as a same-origin file so it
// satisfies helmet's script-src 'self'; an inline script would be blocked.
app.get('/api-docs/theme.js', (req, res) => {
  res.type('application/javascript').send(themeToggleJs);
});

// Every specific /api-docs route must be registered BEFORE the swaggerUi.serve
// mount below: that mount matches the whole /api-docs prefix, so anything
// declared after it is unreachable and answers with the Swagger UI HTML instead.
const partnerSwaggerSpec = buildPublicSwaggerSpec(publicSpecs);
app.get('/api-docs/external.json', (req, res) => {
  res.json(partnerSwaggerSpec);
});

app.get('/api-docs/external-postman.json', (req, res) => {
  res.json(buildPostmanCollection(partnerSwaggerSpec));
});

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs, swaggerUiOptions));

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