const express = require('express');
const { validate, validateQuery, validateParams, schemas } = require('../middleware/validation');
const { authenticate } = require('../middleware/auth');
const { uploadFiles, handleUploadErrors } = require('../config/multerAttachments');
const uploadController = require('../controllers/uploadController');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Uploads
 *   description: >
 *     General-purpose file storage, backed by Cloudflare R2. Upload a file, get a
 *     permanent URL back, then hand that URL to whichever flow needs it -- an
 *     installation report, or anything added later. Nothing here is specific to
 *     installations.
 */

/*
 * Route order matters: the literal '/' collection route is registered before
 * '/:id', so it is not swallowed by the id matcher.
 */

/**
 * @swagger
 * /uploads:
 *   post:
 *     summary: Upload one or more files
 *     description: >
 *       Up to 5 files, 5 MB each. The real type is read from the file's own bytes,
 *       so renaming a .txt to .jpg is rejected. Every file is verified before any
 *       is stored, and the metadata rows are written in one transaction, so a bad
 *       file in the batch leaves nothing behind. Returns a permanent public URL
 *       per file -- pass it straight to installationPhotoUrl when reporting an
 *       installation.
 *     tags: [Uploads]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [files]
 *             properties:
 *               files:
 *                 type: array
 *                 items: { type: string, format: binary }
 *               category: { type: string, example: installation_photo }
 *               entityType: { type: string, example: installation }
 *               entityId: { type: string, example: "930" }
 *               latitude: { type: number, example: 5.1066 }
 *               longitude: { type: number, example: 7.3667 }
 *               capturedAt: { type: string, format: date-time }
 *     responses:
 *       201:
 *         description: Files stored
 *       400:
 *         description: No files, a file over 5 MB, more than 5 files, or a disallowed type
 *       503:
 *         description: File storage not configured
 */
router.post(
  '/',
  authenticate,
  uploadFiles.array('files', 5),
  handleUploadErrors,
  validate(schemas.createUpload),
  uploadController.uploadFiles
);

/**
 * @swagger
 * /uploads:
 *   get:
 *     summary: List the files attached to a record
 *     tags: [Uploads]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: entityType
 *         required: true
 *         schema: { type: string, example: installation }
 *       - in: query
 *         name: entityId
 *         required: true
 *         schema: { type: string, example: "930" }
 *       - in: query
 *         name: category
 *         schema: { type: string, example: installation_photo }
 *     responses:
 *       200:
 *         description: Files for that record, newest first
 *       400:
 *         description: entityType and entityId are both required
 */
router.get(
  '/',
  authenticate,
  validateQuery(schemas.listUploadsQuery),
  uploadController.listUploads
);

/**
 * @swagger
 * /uploads/{id}:
 *   get:
 *     summary: Get one file's record
 *     tags: [Uploads]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: File record
 *       404:
 *         description: File not found
 */
router.get(
  '/:id',
  authenticate,
  validateParams(schemas.idParam),
  uploadController.getUpload
);

/**
 * @swagger
 * /uploads/{id}:
 *   delete:
 *     summary: Delete a file
 *     description: >
 *       Removes the stored object and its record. Allowed for the user who
 *       uploaded it, or any SUPERADMIN, ADMIN or SUPERVISOR.
 *     tags: [Uploads]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: File deleted
 *       403:
 *         description: Not your upload
 *       404:
 *         description: File not found
 *       503:
 *         description: File storage not configured
 */
router.delete(
  '/:id',
  authenticate,
  validateParams(schemas.idParam),
  uploadController.deleteUpload
);

module.exports = router;
