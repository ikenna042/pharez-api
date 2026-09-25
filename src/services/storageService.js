const crypto = require('crypto');
const {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const r2 = require('../config/r2');

/**
 * Object storage for user-uploaded files, backed by Cloudflare R2.
 *
 * The bucket is private. Nothing is ever served directly from it; clients get
 * bytes through GET /files/:id, which signs a short-lived URL per request.
 *
 * Storage is optional: the app boots without it, and every method that touches
 * the network refuses with a 503 rather than failing obscurely at call time.
 */
class StorageService {
  static get isConfigured() {
    return r2.isConfigured;
  }

  static assertConfigured() {
    if (!r2.isConfigured) {
      throw Object.assign(new Error('File storage not configured'), { statusCode: 503 });
    }
  }

  /**
   * {entityType}/{entityId}/{uuid}.{ext}
   *
   * Grouping by entity keeps the bucket browsable when debugging. Files
   * uploaded before anything references them are grouped under "unattached"
   * rather than being given a fake entity.
   */
  static buildObjectKey(entityType, entityId, ext) {
    const type = entityType || 'unattached';
    const id = entityId === null || entityId === undefined || entityId === '' ? 'none' : entityId;
    return `${type}/${id}/${crypto.randomUUID()}.${ext}`;
  }

  /**
   * Reaching the bucket failed: bad credentials, wrong endpoint, R2 down.
   *
   * Left unwrapped these arrive with no statusCode and become a bare 500
   * "Internal server error", which says nothing about which of those it was --
   * and the first time anyone configures this, it will be one of them.
   */
  static failed(action, error) {
    return Object.assign(
      new Error(`Storage ${action} failed: ${error.message}`),
      { statusCode: 502, cause: error }
    );
  }

  static async saveFile(key, buffer, contentType) {
    this.assertConfigured();

    try {
      // No ACL: R2 has no per-object ACLs, public access is a bucket-level setting.
      await r2.client.send(new PutObjectCommand({
        Bucket: r2.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType
      }));
    } catch (error) {
      throw this.failed('upload', error);
    }

    return key;
  }

  /** Signed, expiring URL. Unused by the public endpoints; kept for private reads. */
  static async getFileUrl(key, expiresIn = 300) {
    this.assertConfigured();

    try {
      return await getSignedUrl(
        r2.client,
        new GetObjectCommand({ Bucket: r2.bucket, Key: key }),
        { expiresIn }
      );
    } catch (error) {
      throw this.failed('signing', error);
    }
  }

  static async deleteFile(key) {
    this.assertConfigured();

    try {
      await r2.client.send(new DeleteObjectCommand({ Bucket: r2.bucket, Key: key }));
    } catch (error) {
      throw this.failed('delete', error);
    }
  }
}

module.exports = StorageService;
