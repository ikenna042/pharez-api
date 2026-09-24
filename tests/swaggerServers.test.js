const {
  buildServers,
  normalizePublicApiUrl,
  DEFAULT_PRODUCTION_URL,
  DEFAULT_DEV_URL
} = require('../src/config/swaggerServers');

const PRODUCTION = 'https://api.memetering.com/api/v1';
const DEV = 'https://pharez-api.onrender.com/api/v1';
const urls = (servers) => servers.map((s) => s.url);

describe('normalizePublicApiUrl', () => {
  it('appends /api/v1 when only the host is given', () => {
    expect(normalizePublicApiUrl('https://api.example.com')).toBe('https://api.example.com/api/v1');
  });

  it('leaves a URL that already ends in /api/v1 alone', () => {
    expect(normalizePublicApiUrl('https://api.example.com/api/v1')).toBe('https://api.example.com/api/v1');
  });

  it('tolerates trailing slashes and surrounding whitespace', () => {
    expect(normalizePublicApiUrl('  https://api.example.com/  ')).toBe('https://api.example.com/api/v1');
    expect(normalizePublicApiUrl('https://api.example.com/api/v1/')).toBe('https://api.example.com/api/v1');
  });

  it('rejects anything that is not an absolute http(s) URL', () => {
    expect(normalizePublicApiUrl('api.example.com')).toBeNull();
    expect(normalizePublicApiUrl('/api/v1')).toBeNull();
    expect(normalizePublicApiUrl('ftp://api.example.com')).toBeNull();
    expect(normalizePublicApiUrl('')).toBeNull();
    expect(normalizePublicApiUrl(undefined)).toBeNull();
  });
});

describe('buildServers', () => {
  it('names the three real deployments', () => {
    expect(DEFAULT_PRODUCTION_URL).toBe('https://api.memetering.com');
    expect(DEFAULT_DEV_URL).toBe('https://pharez-api.onrender.com');
  });

  it('locally, offers all three with LOCAL first so Try-it-out cannot hit a deployed host by accident', () => {
    // Swagger UI executes against servers[0] until the user picks another.
    const servers = buildServers({ NODE_ENV: 'development', PORT: '3000' });

    expect(urls(servers)).toEqual(['http://localhost:3000/api/v1', DEV, PRODUCTION]);
    expect(servers[0].description).toMatch(/local/i);
    expect(servers[1].description).toBe('Dev server');
    expect(servers[2].description).toBe('Production server');
  });

  it('honours PORT for the local entry', () => {
    expect(urls(buildServers({ NODE_ENV: 'development', PORT: '4100' })))
      .toContain('http://localhost:4100/api/v1');
  });

  it('on a production build, drops localhost but keeps dev selectable', () => {
    expect(urls(buildServers({ NODE_ENV: 'production' }))).toEqual([PRODUCTION, DEV]);
  });

  it('puts the dev box first when it identifies itself via PUBLIC_API_URL', () => {
    // The Render dev box also runs NODE_ENV=production, so without this its own
    // docs would default to executing against real production.
    const servers = buildServers({
      NODE_ENV: 'production',
      PUBLIC_API_URL: 'https://pharez-api.onrender.com'
    });

    expect(urls(servers)).toEqual([DEV, PRODUCTION]);
    expect(servers[0].description).toBe('Dev server');
  });

  it('lets PUBLIC_API_URL override the production entry, normalised', () => {
    const servers = buildServers({ NODE_ENV: 'production', PUBLIC_API_URL: 'https://api.new-domain.com/' });

    expect(servers[0]).toEqual({ url: 'https://api.new-domain.com/api/v1', description: 'Production server' });
  });

  it('lets DEV_API_URL override the dev entry', () => {
    expect(urls(buildServers({ NODE_ENV: 'development', DEV_API_URL: 'https://staging.example.com' })))
      .toContain('https://staging.example.com/api/v1');
  });

  it('ignores invalid overrides and keeps the defaults', () => {
    expect(urls(buildServers({ NODE_ENV: 'production', PUBLIC_API_URL: 'not-a-url', DEV_API_URL: 'also-bad' })))
      .toEqual([PRODUCTION, DEV]);
  });

  it('has no duplicate URLs in any configuration', () => {
    const configs = [
      { NODE_ENV: 'development' },
      { NODE_ENV: 'production' },
      // Regression: PUBLIC_API_URL naming the dev host used to overwrite the
      // production entry too, listing the same URL twice and hiding production.
      { NODE_ENV: 'production', PUBLIC_API_URL: 'https://pharez-api.onrender.com' },
      { NODE_ENV: 'development', PUBLIC_API_URL: 'https://pharez-api.onrender.com' }
    ];

    for (const env of configs) {
      const servers = buildServers(env);
      expect(new Set(urls(servers)).size).toBe(servers.length);
      expect(urls(servers)).toContain(PRODUCTION);
    }
  });
});
