const { S3Client } = require('@aws-sdk/client-s3');

// The bucket stays private: nothing is ever served straight from R2. Files reach
// clients through GET /files/:id, which signs a short-lived URL per request, so
// no public base URL is part of this config.
const REQUIRED_VARS = [
  'S3_ENDPOINT',
  'S3_BUCKET',
  'S3_ACCESS_KEY_ID',
  'S3_SECRET_ACCESS_KEY'
];

const missing = REQUIRED_VARS.filter((name) => !process.env[name]);
const isConfigured = missing.length === 0;

let client = null;

if (isConfigured) {
  client = new S3Client({
    region: process.env.S3_REGION || 'auto',
    endpoint: process.env.S3_ENDPOINT,
    // R2 serves buckets as <endpoint>/<bucket>/<key>, not as a virtual host.
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY
    }
  });
} else {
  console.warn(
    `⚠️  Object storage not configured (missing: ${missing.join(', ')}). Upload endpoints will return 503.`
  );
}

module.exports = {
  client,
  bucket: process.env.S3_BUCKET || null,
  isConfigured
};
