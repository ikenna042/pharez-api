const InstallationRequest = require('../src/models/InstallationRequest');

const { ALLOWED_FROM } = InstallationRequest;

describe('installation_request state machine', () => {
  it('only reaches INSTALLED from ASSIGNED or IN_PROGRESS', () => {
    expect(ALLOWED_FROM.INSTALLED).toEqual(['ASSIGNED', 'IN_PROGRESS']);
  });

  it('never lets a PENDING request jump straight to INSTALLED', () => {
    expect(ALLOWED_FROM.INSTALLED).not.toContain('PENDING');
  });

  it('lets a FAILED job be reassigned but a finished one not', () => {
    expect(ALLOWED_FROM.ASSIGNED).toContain('FAILED');
    expect(ALLOWED_FROM.ASSIGNED).toContain('PENDING');
    expect(ALLOWED_FROM.ASSIGNED).not.toContain('INSTALLED');
    expect(ALLOWED_FROM.ASSIGNED).not.toContain('EXPORTED');
  });

  it('only exports work that was actually installed', () => {
    expect(ALLOWED_FROM.EXPORTED).toEqual(['INSTALLED']);
  });

  it('cannot cancel work that is already done or in flight', () => {
    expect(ALLOWED_FROM.CANCELLED).toEqual(['PENDING', 'ASSIGNED']);
    expect(ALLOWED_FROM.CANCELLED).not.toContain('INSTALLED');
    expect(ALLOWED_FROM.CANCELLED).not.toContain('IN_PROGRESS');
  });

  it('cannot start anything that is not assigned', () => {
    expect(ALLOWED_FROM.IN_PROGRESS).toEqual(['ASSIGNED']);
  });

  it('only fails work the installer is actually holding', () => {
    expect(ALLOWED_FROM.FAILED).toEqual(['ASSIGNED', 'IN_PROGRESS']);
  });

  it('declares no transition into a terminal state from itself', () => {
    for (const [to, froms] of Object.entries(ALLOWED_FROM)) {
      expect(froms).not.toContain(to);
    }
  });
});
