const StorageService = require('../src/services/storageService');
const {
  allowedTypesForCategory,
  handleUploadErrors,
  EXTENSION_BY_MIME
} = require('../src/config/multerAttachments');
const multer = require('multer');

describe('object keys', () => {
  const UUID_DOT_EXT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]+$/;

  it('lays out keys as entityType/entityId/uuid.ext', () => {
    const key = StorageService.buildObjectKey('installation', 930, 'jpg');
    const [type, id, file] = key.split('/');

    expect(type).toBe('installation');
    expect(id).toBe('930');
    expect(file).toMatch(UUID_DOT_EXT);
    expect(file.endsWith('.jpg')).toBe(true);
  });

  // The key is the only thing protecting a file in a public bucket, so two
  // uploads of the same file to the same record must never collide.
  it('never repeats a key', () => {
    const keys = new Set();
    for (let i = 0; i < 500; i += 1) {
      keys.add(StorageService.buildObjectKey('installation', 930, 'jpg'));
    }
    expect(keys.size).toBe(500);
  });

  it('groups files that reference nothing under unattached/none', () => {
    expect(StorageService.buildObjectKey(null, null, 'pdf')).toMatch(/^unattached\/none\//);
    expect(StorageService.buildObjectKey('', '', 'pdf')).toMatch(/^unattached\/none\//);
    expect(StorageService.buildObjectKey(undefined, undefined, 'pdf')).toMatch(/^unattached\/none\//);
  });

  // entity_id is VARCHAR precisely so a UUID-keyed record works as well as a
  // SERIAL-keyed one.
  it('keeps a UUID entity id intact, not just a numeric one', () => {
    const uuid = '3904aad1-2f27-42d1-9c33-fe87502ea594';
    const key = StorageService.buildObjectKey('user', uuid, 'png');

    expect(key.startsWith(`user/${uuid}/`)).toBe(true);
    expect(key.split('/')).toHaveLength(3);
  });
});

describe('the URL handed to clients', () => {
  const { resolveApiBaseUrl } = require('../src/config/swaggerServers');

  // The link must point at this API, never at the bucket: the bucket is private
  // and only /files/:token can sign a URL for it.
  it('uses PUBLIC_API_URL when the deployment declares one', () => {
    expect(resolveApiBaseUrl({ PUBLIC_API_URL: 'https://api.memetering.com' }))
      .toBe('https://api.memetering.com/api/v1');
  });

  it('accepts a declared URL that already carries the prefix', () => {
    expect(resolveApiBaseUrl({ PUBLIC_API_URL: 'https://api.memetering.com/api/v1' }))
      .toBe('https://api.memetering.com/api/v1');
  });

  it('falls back to localhost off-production so dev links resolve', () => {
    expect(resolveApiBaseUrl({ PORT: '4000' })).toBe('http://localhost:4000/api/v1');
  });

  it('falls back to the production host when NODE_ENV says production', () => {
    expect(resolveApiBaseUrl({ NODE_ENV: 'production' })).toBe('https://api.memetering.com/api/v1');
  });

  it('ignores an unparseable PUBLIC_API_URL rather than emitting a broken link', () => {
    expect(resolveApiBaseUrl({ PUBLIC_API_URL: 'not-a-url', PORT: '3000' }))
      .toBe('http://localhost:3000/api/v1');
  });
});

describe('per-category type rules', () => {
  it('allows only real images for a photo category', () => {
    const allowed = allowedTypesForCategory('installation_photo');

    expect(allowed).toEqual(expect.arrayContaining(['image/jpeg', 'image/png', 'image/webp']));
    expect(allowed).not.toContain('application/pdf');
  });

  it('allows PDFs everywhere else', () => {
    expect(allowedTypesForCategory('general')).toContain('application/pdf');
    expect(allowedTypesForCategory(undefined)).toContain('application/pdf');
  });

  it('maps every allowed type to a file extension', () => {
    const everyAllowed = new Set([
      ...allowedTypesForCategory('installation_photo'),
      ...allowedTypesForCategory('general')
    ]);

    everyAllowed.forEach((mime) => expect(EXTENSION_BY_MIME[mime]).toBeTruthy());
  });
});

describe('multer errors become 400s', () => {
  // Without this middleware a MulterError reaches the global handler carrying no
  // statusCode and surfaces as an opaque 500.
  const run = (err) => {
    const res = {
      statusCode: null,
      body: null,
      status(code) { this.statusCode = code; return this; },
      json(payload) { this.body = payload; return this; }
    };
    let passedOn = null;
    handleUploadErrors(err, {}, res, (e) => { passedOn = e; });
    return { res, passedOn };
  };

  it('explains an oversized file', () => {
    const { res } = run(new multer.MulterError('LIMIT_FILE_SIZE'));
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ success: false, message: 'Each file must be 5 MB or smaller' });
  });

  it('explains too many files', () => {
    const { res } = run(new multer.MulterError('LIMIT_FILE_COUNT'));
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/at most 5/);
  });

  it('explains the wrong field name', () => {
    const { res } = run(new multer.MulterError('LIMIT_UNEXPECTED_FILE'));
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/"files"/);
  });

  it('passes non-multer errors through untouched', () => {
    const original = new Error('something else entirely');
    const { res, passedOn } = run(original);

    expect(res.statusCode).toBeNull();
    expect(passedOn).toBe(original);
  });
});

describe('FileAttachment.format builds the public URL from the token, not the id', () => {
  const FileAttachment = require('../src/models/FileAttachment');

  // The SERIAL id is sequential and would let anyone walk /files/1, /files/2,
  // ... on the unauthenticated route. A regression back to row.id here would
  // silently reopen that hole without any endpoint test catching it, since the
  // URL would still 200 -- just for the wrong reasons.
  it('never lets the sequential id leak into the URL', () => {
    const formatted = FileAttachment.format({
      id: 1,
      public_token: '3904aad1-2f27-42d1-9c33-fe87502ea594',
      entity_type: null, entity_id: null, category: 'general',
      storage_key: 'x/y/z.png', content_type: 'image/png', size_bytes: 1,
      original_name: null, latitude: null, longitude: null,
      captured_at: null, uploaded_by: null, created_at: new Date()
    });

    expect(formatted.url.endsWith('/files/3904aad1-2f27-42d1-9c33-fe87502ea594')).toBe(true);
    expect(formatted.url).not.toMatch(/\/files\/1$/);
  });
});
