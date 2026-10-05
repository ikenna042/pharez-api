/**
 * Per-disco access rules.
 *
 * SUPERADMIN sees and acts on every disco. Every other role is limited to the
 * discos it's profiled for (user_discos), loaded onto req.user.discoIds by
 * authenticate. A user can be profiled for several discos, or none -- a user
 * with none sees empty lists and is refused every disco-specific action.
 *
 * Conventions every controller follows:
 *   - Acting on a disco by code the caller isn't profiled for -> 403.
 *   - Fetching a single record by id from such a disco -> 404, so the API
 *     never confirms the record exists.
 *   - A list with no discoCode is limited to the caller's discos.
 */

const isUnrestricted = (user) => Boolean(user) && user.role === 'SUPERADMIN';

/** Disco ids the user may see; null means every disco. */
const allowedDiscoIds = (user) => (isUnrestricted(user) ? null : ((user && user.discoIds) || []));

const canAccessDisco = (user, discoId) => {
  if (isUnrestricted(user)) return true;
  if (discoId === null || discoId === undefined) return false;
  return ((user && user.discoIds) || []).includes(Number(discoId));
};

/**
 * The disco filter for a list. With a requested disco: just that one, or
 * { forbidden: true } if the user can't see it. Without: every disco the user
 * can see (null = no filter at all, for SUPERADMIN).
 */
const listScope = (user, requestedDiscoId) => {
  if (requestedDiscoId !== undefined && requestedDiscoId !== null) {
    if (!canAccessDisco(user, requestedDiscoId)) return { forbidden: true };
    return { discoIds: [Number(requestedDiscoId)] };
  }
  return { discoIds: allowedDiscoIds(user) };
};

const forbidden = (res, discoCode) =>
  res.status(403).json({ success: false, message: `You don't have access to ${discoCode}` });

/**
 * For actions on one named disco (create, import, export, assign). Sends the
 * 404/403 itself and returns null when the caller can't proceed.
 */
const resolveAccessibleDisco = async (req, res, discoCode) => {
  // Required here rather than at the top so the pure rules above load (and
  // unit-test) without pulling in the database layer.
  // eslint-disable-next-line global-require
  const Disco = require('../models/Disco');

  const disco = await Disco.findByCode(discoCode);
  if (!disco) {
    res.status(404).json({ success: false, message: `Disco ${discoCode} not found` });
    return null;
  }
  if (!canAccessDisco(req.user, disco.id)) {
    forbidden(res, disco.code);
    return null;
  }
  return disco;
};

/**
 * For lists with an optional discoCode filter. Resolves to { discoIds }
 * (null = every disco), or null once a 404/403 has been sent.
 */
const resolveListScope = async (req, res, discoCode) => {
  if (!discoCode) return { discoIds: allowedDiscoIds(req.user) };

  const disco = await resolveAccessibleDisco(req, res, discoCode);
  return disco ? { discoIds: [disco.id] } : null;
};

/** Codes of the discos the user may see; null means every disco. */
const allowedDiscoCodes = async (user) => {
  if (isUnrestricted(user)) return null;
  // eslint-disable-next-line global-require
  const User = require('../models/User');
  return (await User.getDiscos(user.id)).map((d) => d.code);
};

module.exports = {
  isUnrestricted,
  allowedDiscoCodes,
  allowedDiscoIds,
  canAccessDisco,
  listScope,
  resolveAccessibleDisco,
  resolveListScope
};
