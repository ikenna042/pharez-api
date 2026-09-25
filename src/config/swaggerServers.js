/**
 * The "Servers" dropdown in Swagger UI, and the base URL for the partner
 * Postman collection (which takes servers[0]).
 *
 * Three deployments exist:
 *
 *   Local        http://localhost:<PORT>
 *   Dev          https://pharez-api.onrender.com     (override: DEV_API_URL)
 *   Production   https://api.memetering.com          (override: PUBLIC_API_URL)
 *
 * Both overrides accept a bare host or the full /api/v1 form, and an
 * unparseable value falls back to the default rather than publishing a broken
 * entry.
 */

const API_PREFIX = '/api/v1';
const DEFAULT_PRODUCTION_URL = 'https://api.memetering.com';
const DEFAULT_DEV_URL = 'https://pharez-api.onrender.com';

const isAbsoluteHttpUrl = (url) => /^https?:\/\//i.test(String(url || ''));

/**
 * Accepts "https://api.example.com", "https://api.example.com/" or
 * "https://api.example.com/api/v1" and returns the last form. Returns null for
 * anything that is not an absolute http(s) URL.
 */
const normalizePublicApiUrl = (raw) => {
  if (!raw || !isAbsoluteHttpUrl(String(raw).trim())) return null;

  const trimmed = String(raw).trim().replace(/\/+$/, '');
  return trimmed.endsWith(API_PREFIX) ? trimmed : `${trimmed}${API_PREFIX}`;
};

const buildServers = (env = process.env) => {
  const isProduction = env.NODE_ENV === 'production';
  const port = env.PORT || 3000;

  const devUrl = normalizePublicApiUrl(env.DEV_API_URL) || `${DEFAULT_DEV_URL}${API_PREFIX}`;

  // PUBLIC_API_URL means "this deployment's own public URL". On the dev box it
  // therefore names the dev host, and must NOT be mistaken for a new production
  // domain -- doing so listed the same URL twice and hid production entirely.
  const selfUrl = normalizePublicApiUrl(env.PUBLIC_API_URL);
  const selfIsDev = selfUrl !== null && selfUrl === devUrl;

  const production = {
    url: (!selfIsDev && selfUrl) || `${DEFAULT_PRODUCTION_URL}${API_PREFIX}`,
    description: 'Production server'
  };

  const dev = { url: devUrl, description: 'Dev server' };

  const local = {
    url: `http://localhost:${port}${API_PREFIX}`,
    description: 'Local development server'
  };

  // ORDER MATTERS: Swagger UI's Try-it-out targets servers[0] until the user
  // picks another, so the first entry must be whichever host is serving these
  // docs. Off a production build that means local first, or a stray Execute
  // writes to live data.
  if (!isProduction) return [local, dev, production];

  // The dev box on Render almost certainly runs NODE_ENV=production too, so
  // "production" alone cannot decide this. Set PUBLIC_API_URL on the dev box to
  // make its own docs point at itself rather than defaulting to production.
  return selfIsDev ? [dev, production] : [production, dev];
};

/**
 * This deployment's own API base, ending in /api/v1.
 *
 * Used to build absolute links the API hands out to clients -- currently the
 * /files/:id URL stored against an uploaded attachment. Shares PUBLIC_API_URL
 * with the Swagger server list so a deployment declares its public address
 * exactly once; falls back to localhost off-production so a dev box returns
 * links that actually resolve.
 */
const resolveApiBaseUrl = (env = process.env) => {
  const configured = normalizePublicApiUrl(env.PUBLIC_API_URL);
  if (configured) return configured;

  if (env.NODE_ENV === 'production') return `${DEFAULT_PRODUCTION_URL}${API_PREFIX}`;

  return `http://localhost:${env.PORT || 3000}${API_PREFIX}`;
};

module.exports = {
  API_PREFIX,
  DEFAULT_PRODUCTION_URL,
  DEFAULT_DEV_URL,
  buildServers,
  normalizePublicApiUrl,
  resolveApiBaseUrl
};
