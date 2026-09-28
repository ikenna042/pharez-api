const sharp = require('sharp');

/**
 * Compresses uploaded images down to a byte-size ceiling, to keep R2 storage
 * growth in check.
 *
 * A ceiling, not a target to hit exactly: an image already at or under this
 * size is returned completely untouched, never re-encoded, never losing
 * quality it didn't need to lose.
 */
const TARGET_MAX_BYTES = 300 * 1024;

// Tried in order; the first that lands at or under TARGET_MAX_BYTES wins. Each
// attempt re-encodes the same decoded pixel data (via .clone()), never a
// previous attempt's output, so quality loss never compounds across steps.
const QUALITY_STEPS = [80, 65, 50, 40];

// If no quality step alone reaches the target, shrink dimensions by this
// factor and try the whole quality ladder again, up to this many times. Most
// uploads never reach this path.
const RESIZE_FACTOR = 0.75;
const MAX_RESIZE_PASSES = 3;

class ImageCompressionService {
  static get TARGET_MAX_BYTES() {
    return TARGET_MAX_BYTES;
  }

  /**
   * @param {Buffer} buffer
   * @param {string} mimeType one of image/jpeg, image/png, image/webp
   * @returns {Promise<{ buffer: Buffer, contentType: string }>}
   */
  static async compress(buffer, mimeType) {
    if (buffer.length <= TARGET_MAX_BYTES) {
      return { buffer, contentType: mimeType };
    }

    // .rotate() with no args auto-orients from the EXIF tag and bakes the
    // rotation into the actual pixels. This has to happen before encoding:
    // sharp strips metadata by default, so without this step a photo that
    // relied on its EXIF orientation tag would come out sideways once the tag
    // encoding strips it away.
    const source = sharp(buffer).rotate();
    const metadata = await source.metadata();

    // An opaque PNG has no reliable byte-target dial the way JPEG/WebP quality
    // does, so it's re-encoded as JPEG. A PNG with real transparency keeps its
    // alpha channel instead -- converting it to JPEG would silently flatten it.
    //
    // metadata.hasAlpha only reports whether a 4th channel structurally
    // exists, not whether it's actually used. Screenshot tools (macOS in
    // particular) and many phone cameras always emit a full alpha channel set
    // to fully opaque (every pixel 255) -- treating that as "has real
    // transparency" would leave exactly the large, common PNGs this feature
    // targets stuck on PNG's slower, worse-for-photos compression path. Check
    // whether any pixel is actually non-opaque instead.
    const isOpaque = !metadata.hasAlpha || (await ImageCompressionService.alphaIsFullyOpaque(source));
    const outputMime = mimeType === 'image/png' && isOpaque ? 'image/jpeg' : mimeType;

    let width = metadata.width;
    let height = metadata.height;

    for (let pass = 0; pass <= MAX_RESIZE_PASSES; pass += 1) {
      let resized = source.clone();
      if (pass > 0) {
        width = Math.round(width * RESIZE_FACTOR);
        height = Math.round(height * RESIZE_FACTOR);
        resized = resized.resize({ width, height });
      }

      let best = null;

      for (const quality of QUALITY_STEPS) {
        // eslint-disable-next-line no-await-in-loop
        const encoded = await ImageCompressionService.encode(resized.clone(), outputMime, quality);

        if (!best || encoded.length < best.length) best = encoded;
        if (encoded.length <= TARGET_MAX_BYTES) {
          return { buffer: encoded, contentType: outputMime };
        }
      }

      // Last pass and still over target: return the smallest attempt made
      // rather than failing an otherwise-legitimate upload over an internal
      // target that couldn't quite be hit.
      if (pass === MAX_RESIZE_PASSES) {
        console.warn(
          `Image compression could not reach ${TARGET_MAX_BYTES} bytes after ${MAX_RESIZE_PASSES} `
          + `resize passes; uploading the smallest result achieved (${best.length} bytes).`
        );
        return { buffer: best, contentType: outputMime };
      }
    }

    // Unreachable, but keeps the function's return type honest.
    throw new Error('Image compression loop exited without a result');
  }

  /** True if every pixel's alpha value is 255 -- a channel that exists but is never actually used. */
  static async alphaIsFullyOpaque(source) {
    const stats = await source.clone().stats();
    const alphaChannel = stats.channels[stats.channels.length - 1];
    return alphaChannel.min === 255;
  }

  static encode(pipeline, mime, quality) {
    if (mime === 'image/webp') return pipeline.webp({ quality }).toBuffer();
    if (mime === 'image/png') return pipeline.png({ quality, palette: true, compressionLevel: 9 }).toBuffer();
    return pipeline.jpeg({ quality }).toBuffer();
  }
}

module.exports = ImageCompressionService;
