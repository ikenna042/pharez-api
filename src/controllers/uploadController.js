const pool = require('../config/database');
const FileAttachment = require('../models/FileAttachment');
const StorageService = require('../services/storageService');
const { allowedTypesForCategory, EXTENSION_BY_MIME } = require('../config/multerAttachments');
const { asyncHandler } = require('../middleware/errorHandler');

const ADMIN_ROLES = ['SUPERADMIN', 'ADMIN', 'SUPERVISOR'];

/**
 * Identify a file from its bytes, not from what the client claimed.
 *
 * A .txt renamed to .jpg arrives with mimetype image/jpeg and sails through
 * multer's filter; only the magic bytes catch it. file-type is pure ESM, so it
 * is imported dynamically from this CommonJS module.
 */
const detectType = async (buffer, category, index) => {
  const { fileTypeFromBuffer } = await import('file-type');
  const detected = await fileTypeFromBuffer(buffer);
  const allowed = allowedTypesForCategory(category);

  if (!detected || !allowed.includes(detected.mime)) {
    throw Object.assign(new Error(
      `File ${index + 1} is not an accepted ${category} file `
      + `(detected: ${detected ? detected.mime : 'unrecognised'}; allowed: ${allowed.join(', ')})`
    ), { statusCode: 400 });
  }

  return detected;
};

const uploadFiles = asyncHandler(async (req, res) => {
  StorageService.assertConfigured();

  const files = req.files || [];
  if (files.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'No files uploaded. Send them as "files".'
    });
  }

  const { category, entityType, entityId, latitude, longitude, capturedAt } = req.body;

  // Every file is verified before anything is written, so a bad file in the
  // batch cannot leave earlier ones already stored.
  const prepared = [];
  for (const [index, file] of files.entries()) {
    const detected = await detectType(file.buffer, category, index);
    prepared.push({
      file,
      contentType: detected.mime,
      key: StorageService.buildObjectKey(entityType, entityId, EXTENSION_BY_MIME[detected.mime] || detected.ext)
    });
  }

  const uploadedKeys = [];
  try {
    for (const item of prepared) {
      await StorageService.saveFile(item.key, item.file.buffer, item.contentType);
      uploadedKeys.push(item.key);
    }

    // Rows land together: a partially recorded batch would leave objects in R2
    // that nothing knows about.
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const saved = [];
      for (const item of prepared) {
        saved.push(await FileAttachment.create({
          entityType,
          entityId,
          category,
          storageKey: item.key,
          contentType: item.contentType,
          sizeBytes: item.file.size,
          originalName: item.file.originalname,
          latitude,
          longitude,
          capturedAt,
          uploadedBy: req.user ? req.user.id : null
        }, client));
      }

      await client.query('COMMIT');

      return res.status(201).json({
        success: true,
        message: `Uploaded ${saved.length} file(s)`,
        data: saved
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    // Best effort: without this a failed batch leaves orphaned objects behind.
    await Promise.all(
      uploadedKeys.map((key) => StorageService.deleteFile(key).catch(() => {}))
    );
    throw error;
  }
});

const listUploads = asyncHandler(async (req, res) => {
  const q = req.validatedQuery || req.query;

  if (!q.entityType || !q.entityId) {
    return res.status(400).json({
      success: false,
      message: 'entityType and entityId are both required'
    });
  }

  const attachments = await FileAttachment.findByEntity(q.entityType, q.entityId, {
    category: q.category
  });

  res.json({ success: true, data: attachments });
});

const getUpload = asyncHandler(async (req, res) => {
  const attachment = await FileAttachment.findById(req.params.id);

  if (!attachment) {
    return res.status(404).json({ success: false, message: 'File not found' });
  }

  res.json({ success: true, data: attachment });
});

const SIGNED_URL_TTL_SECONDS = 600;
const REDIRECT_CACHE_SECONDS = 300;

/**
 * Public, unauthenticated: this is the URL handed out in `url`, and it has to
 * work anywhere a plain link does -- a disco opening a spreadsheet, an <img>
 * tag, a browser address bar -- none of which can send a bearer token.
 *
 * The bucket stays private. Each request mints a fresh signed URL and 302s to
 * it, so the link itself never expires; deleting the row is what kills it.
 *
 * The redirect is cached for less time than the signed URL lives, so a cached
 * redirect can never outlast the URL it points at.
 */
const serveFile = asyncHandler(async (req, res) => {
  StorageService.assertConfigured();

  const attachment = await FileAttachment.findByToken(req.params.token);

  if (!attachment) {
    return res.status(404).json({ success: false, message: 'File not found' });
  }

  const signedUrl = await StorageService.getFileUrl(attachment.storageKey, SIGNED_URL_TTL_SECONDS);

  res.set('Cache-Control', `public, max-age=${REDIRECT_CACHE_SECONDS}`);
  return res.redirect(302, signedUrl);
});

const deleteUpload = asyncHandler(async (req, res) => {
  StorageService.assertConfigured();

  const attachment = await FileAttachment.findById(req.params.id);

  if (!attachment) {
    return res.status(404).json({ success: false, message: 'File not found' });
  }

  const isOwner = String(attachment.uploadedBy) === String(req.user.id);
  if (!isOwner && !ADMIN_ROLES.includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: 'You can only delete files you uploaded'
    });
  }

  // Object first: a deleted row pointing at a live object is an orphan nothing
  // will ever clean up, whereas a live row pointing at a deleted object is
  // visible and fixable.
  await StorageService.deleteFile(attachment.storageKey);
  await FileAttachment.deleteById(attachment.id);

  res.json({ success: true, message: 'File deleted' });
});

module.exports = {
  uploadFiles,
  listUploads,
  getUpload,
  serveFile,
  deleteUpload
};
