const {
  isUnrestricted, allowedDiscoIds, canAccessDisco, listScope
} = require('../src/utils/discoAccess');

const superadmin = { id: 'sa', role: 'SUPERADMIN' };
const abaAdmin = { id: 'a', role: 'ADMIN', discoIds: [1] };
const crossSupervisor = { id: 's', role: 'SUPERVISOR', discoIds: [1, 3] };
const unprofiled = { id: 'u', role: 'INSTALLER', discoIds: [] };

describe('discoAccess', () => {
  it('gives SUPERADMIN every disco', () => {
    expect(isUnrestricted(superadmin)).toBe(true);
    expect(allowedDiscoIds(superadmin)).toBeNull();
    expect(canAccessDisco(superadmin, 3)).toBe(true);
  });

  it('limits a scoped user to its own discos', () => {
    expect(allowedDiscoIds(abaAdmin)).toEqual([1]);
    expect(canAccessDisco(abaAdmin, 1)).toBe(true);
    expect(canAccessDisco(crossSupervisor, 3)).toBe(true);
  });

  it('refuses a disco outside the profile', () => {
    expect(canAccessDisco(abaAdmin, 3)).toBe(false);
    expect(canAccessDisco(abaAdmin, '3')).toBe(false);
    expect(canAccessDisco(abaAdmin, null)).toBe(false);
  });

  it('gives a user with no discos nothing', () => {
    expect(allowedDiscoIds(unprofiled)).toEqual([]);
    expect(canAccessDisco(unprofiled, 1)).toBe(false);
    expect(listScope(unprofiled)).toEqual({ discoIds: [] });
  });

  it('treats a missing discoIds list as no discos', () => {
    expect(allowedDiscoIds({ role: 'ADMIN' })).toEqual([]);
  });

  describe('listScope', () => {
    it('without a disco: every disco the user can see', () => {
      expect(listScope(superadmin)).toEqual({ discoIds: null });
      expect(listScope(crossSupervisor)).toEqual({ discoIds: [1, 3] });
    });

    it('with a disco the user holds: just that one', () => {
      expect(listScope(crossSupervisor, 3)).toEqual({ discoIds: [3] });
      expect(listScope(superadmin, 3)).toEqual({ discoIds: [3] });
    });

    it('with a disco the user lacks: forbidden', () => {
      expect(listScope(abaAdmin, 3)).toEqual({ forbidden: true });
    });
  });
});
