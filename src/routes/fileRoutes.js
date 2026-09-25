const express = require('express');
const { validateParams, schemas } = require('../middleware/validation');
const uploadController = require('../controllers/uploadController');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Files
 *   description: >
 *     Public delivery for uploaded files. The bucket itself is private -- every
 *     request here mints a short-lived signed URL and redirects to it, so the
 *     link can be pasted anywhere a plain URL works and still stops resolving
 *     the moment the record is deleted.
 */

/**
 * @swagger
 * /files/{token}:
 *   get:
 *     summary: Fetch an uploaded file (public, no authentication)
 *     description: >
 *       Responds 302 to a signed URL valid for 10 minutes, cached for 5. This is
 *       the URL returned as `url` by the upload and list endpoints; deliberately
 *       unauthenticated, because the things that open it -- a spreadsheet cell, an
 *       img tag, a browser -- cannot send a bearer token.
 *
 *       Keyed by an unguessable UUID, not the file's numeric id: this route has
 *       no authentication, so the token is the only thing standing in for one.
 *       An integer here would let anyone walk /files/1, /files/2, ... and read
 *       every upload in the system.
 *     tags: [Files]
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       302:
 *         description: Redirect to a signed URL for the file
 *         headers:
 *           Location:
 *             schema: { type: string }
 *           Cache-Control:
 *             schema: { type: string, example: "public, max-age=300" }
 *       404:
 *         description: File not found, or its record has been deleted
 *       503:
 *         description: File storage not configured
 */
router.get(
  '/:token',
  validateParams(schemas.fileTokenParam),
  uploadController.serveFile
);

module.exports = router;
