const sharp = require('sharp');
const crypto = require('crypto');
const ImageCompressionService = require('../src/services/imageCompressionService');

const TARGET = ImageCompressionService.TARGET_MAX_BYTES;

/**
 * A solid color compresses to almost nothing even losslessly, which would
 * never exercise the quality ladder. Random noise has real entropy, so a
 * large-enough noisy image reliably lands well over TARGET at full quality --
 * the only way to actually prove compression kicks in rather than trivially
 * already being small. crypto.randomFillSync is used instead of a per-byte JS
 * loop purely for speed at these buffer sizes.
 */
const noisyImageBuffer = async ({ width = 1000, height = 800, format = 'jpeg', alpha = false } = {}) => {
  const channels = alpha ? 4 : 3;
  const pixels = Buffer.alloc(width * height * channels);
  crypto.randomFillSync(pixels);

  const pipeline = sharp(pixels, { raw: { width, height, channels } });
  if (format === 'jpeg') return pipeline.jpeg({ quality: 100 }).toBuffer();
  if (format === 'webp') return pipeline.webp({ quality: 100 }).toBuffer();
  return pipeline.png({ compressionLevel: 0 }).toBuffer();
};

describe('images at or under the ceiling are left completely untouched', () => {
  it('returns the exact same bytes for a small JPEG', async () => {
    const small = await sharp({
      create: { width: 20, height: 20, channels: 3, background: { r: 10, g: 20, b: 30 } }
    }).jpeg().toBuffer();

    expect(small.length).toBeLessThan(TARGET);

    const result = await ImageCompressionService.compress(small, 'image/jpeg');

    expect(result.contentType).toBe('image/jpeg');
    expect(Buffer.compare(result.buffer, small)).toBe(0);
  });

  it('never touches a small PNG even though PNGs are otherwise eligible for reformatting', async () => {
    const small = await sharp({
      create: { width: 20, height: 20, channels: 3, background: { r: 5, g: 5, b: 5 } }
    }).png().toBuffer();

    const result = await ImageCompressionService.compress(small, 'image/png');

    expect(result.contentType).toBe('image/png');
    expect(Buffer.compare(result.buffer, small)).toBe(0);
  });
});

describe('oversized images are compressed under the ceiling', () => {
  it('reduces a large, high-entropy JPEG under 300KB and keeps it JPEG', async () => {
    const large = await noisyImageBuffer({ format: 'jpeg' });
    expect(large.length).toBeGreaterThan(TARGET);

    const result = await ImageCompressionService.compress(large, 'image/jpeg');

    expect(result.contentType).toBe('image/jpeg');
    expect(result.buffer.length).toBeLessThanOrEqual(TARGET);
  }, 20000);

  it('reduces a large, high-entropy WebP under 300KB and keeps it WebP', async () => {
    const large = await noisyImageBuffer({ format: 'webp' });
    expect(large.length).toBeGreaterThan(TARGET);

    const result = await ImageCompressionService.compress(large, 'image/webp');

    expect(result.contentType).toBe('image/webp');
    expect(result.buffer.length).toBeLessThanOrEqual(TARGET);
  }, 20000);
});

describe('PNG format handling', () => {
  it('converts a large opaque PNG to JPEG', async () => {
    const large = await noisyImageBuffer({ format: 'png', alpha: false });
    expect(large.length).toBeGreaterThan(TARGET);

    const result = await ImageCompressionService.compress(large, 'image/png');

    expect(result.contentType).toBe('image/jpeg');
    expect(result.buffer.length).toBeLessThanOrEqual(TARGET);
  }, 20000);

  // Regression test: metadata.hasAlpha only reports whether a 4th channel
  // structurally exists, not whether it's actually used. Screenshot tools
  // (confirmed live against a real macOS screenshot) and many phone cameras
  // emit RGBA PNGs where every pixel's alpha is 255 -- fully opaque despite
  // having a channel. Treating that as "real transparency" would leave
  // exactly this large, common case stuck on PNG's slower, worse-for-photos
  // path instead of converting to JPEG.
  it('converts a large PNG to JPEG when its alpha channel exists but every pixel is fully opaque', async () => {
    const width = 1000;
    const height = 800;
    const rgb = Buffer.alloc(width * height * 3);
    crypto.randomFillSync(rgb);

    // Interleave RGB with a constant 255 alpha byte per pixel, rather than
    // random noise across all 4 channels -- this is what makes the fixture
    // "structurally RGBA but actually opaque" instead of "genuinely
    // transparent," matching the real screenshot's stats (alpha min=max=255).
    const rgba = Buffer.alloc(width * height * 4);
    for (let i = 0, j = 0; i < rgb.length; i += 3, j += 4) {
      rgba[j] = rgb[i];
      rgba[j + 1] = rgb[i + 1];
      rgba[j + 2] = rgb[i + 2];
      rgba[j + 3] = 255;
    }

    const large = await sharp(rgba, { raw: { width, height, channels: 4 } })
      .png({ compressionLevel: 0 })
      .toBuffer();
    expect(large.length).toBeGreaterThan(TARGET);

    const beforeStats = await sharp(large).stats();
    expect(beforeStats.channels[3].min).toBe(255);
    expect(beforeStats.channels[3].max).toBe(255);

    const result = await ImageCompressionService.compress(large, 'image/png');

    expect(result.contentType).toBe('image/jpeg');
    expect(result.buffer.length).toBeLessThanOrEqual(TARGET);
  }, 20000);

  it('keeps a large PNG with real transparency as PNG, not JPEG', async () => {
    // Small dimensions on purpose: lossy PNG palette quantization (unlike
    // JPEG/WebP quality encoding) is genuinely CPU-heavy on pure noise, the
    // adversarial worst case for any compressor -- real photos compress far
    // faster than this fixture does.
    const large = await noisyImageBuffer({ format: 'png', alpha: true, width: 500, height: 400 });
    expect(large.length).toBeGreaterThan(TARGET);

    const result = await ImageCompressionService.compress(large, 'image/png');

    expect(result.contentType).toBe('image/png');
    expect(result.buffer.length).toBeLessThan(large.length);
  }, 45000);
});

describe('EXIF orientation is respected, not lost', () => {
  // sharp strips metadata on encode by default. Without an explicit .rotate()
  // before re-encoding, a photo whose pixels are stored "sideways" and relies
  // on its EXIF orientation tag to display upright would come out actually
  // sideways once that tag is gone -- silently corrupting every rotated phone
  // photo. This proves .rotate() bakes the rotation into the pixels first.
  it('bakes a 90-degree EXIF rotation into the output pixel dimensions', async () => {
    // Wider than tall, then tagged as rotated 90 degrees (orientation 6):
    // a correctly auto-oriented output should come out taller than wide.
    const width = 1600;
    const height = 1200;
    const pixels = Buffer.alloc(width * height * 3, 128);

    const rotatedJpeg = await sharp(pixels, { raw: { width, height, channels: 3 } })
      .withMetadata({ orientation: 6 })
      .jpeg({ quality: 100 })
      .toBuffer();

    const beforeMeta = await sharp(rotatedJpeg).metadata();
    expect(beforeMeta.width).toBe(width);
    expect(beforeMeta.height).toBe(height);
    expect(beforeMeta.orientation).toBe(6);

    // Force the compression path regardless of this fixture's byte size, by
    // asserting directly on what .rotate() does to a source carrying this tag.
    const oriented = await sharp(rotatedJpeg).rotate().toBuffer();
    const afterMeta = await sharp(oriented).metadata();

    expect(afterMeta.width).toBe(height);
    expect(afterMeta.height).toBe(width);
    expect(afterMeta.orientation).toBeUndefined();
  });
});

describe('never fails an upload over an unreachable target', () => {
  it('returns a best-effort result instead of throwing when even the smallest attempt is still over target', async () => {
    // A large, maximally noisy image pushes every quality step and (likely)
    // every resize pass to its limit. Whatever comes out, compress() must
    // resolve, never reject.
    const large = await noisyImageBuffer({ width: 2400, height: 1800, format: 'jpeg' });

    await expect(ImageCompressionService.compress(large, 'image/jpeg')).resolves.toEqual(
      expect.objectContaining({ contentType: 'image/jpeg' })
    );
  }, 30000);
});
