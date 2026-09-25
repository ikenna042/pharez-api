const multer = require('multer');

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_FILES = 5;

const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const DOCUMENT_MIME_TYPES = ['application/pdf'];

const EXTENSION_BY_MIME = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf'
};

// Categories that must be an actual picture; everything else may also be a PDF.
const PHOTO_CATEGORIES = ['installation_photo'];

const allowedTypesForCategory = (category) =>
  (PHOTO_CATEGORIES.includes(category)
    ? IMAGE_MIME_TYPES
    : [...IMAGE_MIME_TYPES, ...DOCUMENT_MIME_TYPES]);

/**
 * Accepts the union of every type any category allows, rather than the types
 * this particular category allows.
 *
 * Multipart field order is not guaranteed, so req.body.category may still be
 * unparsed when fileFilter runs. This is only a cheap early reject on the
 * client-declared mimetype; the controller re-checks the real type against the
 * category once the whole request has been parsed.
 */
const fileFilter = (req, file, cb) => {
  if (EXTENSION_BY_MIME[file.mimetype]) {
    return cb(null, true);
  }

  return cb(Object.assign(
    new Error(`Unsupported file type "${file.mimetype}". Allowed: JPEG, PNG, WebP, PDF`),
    { statusCode: 400 }
  ), false);
};

const uploadFiles = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILES }
});

const MULTER_MESSAGES = {
  LIMIT_FILE_SIZE: 'Each file must be 5 MB or smaller',
  LIMIT_FILE_COUNT: `Too many files. Upload at most ${MAX_FILES} at a time`,
  LIMIT_UNEXPECTED_FILE: 'Unexpected file field. Send the files as "files"'
};

/**
 * Turns multer's rejections into 400s.
 *
 * Mounted per-route rather than globally: without it a MulterError reaches the
 * global handler carrying no statusCode and becomes an opaque 500 (and its
 * `code` is first mistaken for a PostgreSQL error code).
 */
const handleUploadErrors = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({
      success: false,
      message: MULTER_MESSAGES[err.code] || `Upload failed: ${err.message}`
    });
  }

  return next(err);
};

module.exports = {
  uploadFiles,
  handleUploadErrors,
  allowedTypesForCategory,
  IMAGE_MIME_TYPES,
  DOCUMENT_MIME_TYPES,
  EXTENSION_BY_MIME,
  MAX_FILE_SIZE,
  MAX_FILES
};
