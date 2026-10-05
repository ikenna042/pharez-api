const User = require('../models/User');
const Disco = require('../models/Disco');
const { asyncHandler } = require('../middleware/errorHandler');
const { isUnrestricted, resolveListScope } = require('../utils/discoAccess');

const userNotFound = (res) => res.status(404).json({ success: false, message: 'User not found' });

/**
 * A scoped caller only sees users who share at least one of its discos (and
 * always itself). Anyone else reads as not found.
 */
const sharesDisco = async (currentUser, targetUserId) => {
  if (isUnrestricted(currentUser) || currentUser.id === targetUserId) return true;
  const theirs = await User.getDiscos(targetUserId);
  return theirs.some((d) => (currentUser.discoIds || []).includes(d.id));
};

/**
 * Turns discoCodes into disco rows. Sends a 404 for an unknown code and
 * returns null.
 */
const loadDiscosByCode = async (res, discoCodes) => {
  const discos = [];
  for (const code of [...new Set(discoCodes)]) {
    const disco = await Disco.findByCode(code);
    if (!disco) {
      res.status(404).json({ success: false, message: `Disco ${code} not found` });
      return null;
    }
    discos.push(disco);
  }
  return discos;
};

const getUsers = asyncHandler(async (req, res) => {
  const { page, limit, role, search, discoCode } = req.query;
  const currentUser = req.user;

  // Define access rules
  let queryOptions = { page, limit, role, search };

  // INSTALLER can't see other users
  if (currentUser.role === 'INSTALLER') {
    return res.status(403).json({
      success: false,
      message: 'Access denied'
    });
  }

  // ADMIN can only see INSTALLER and their own record
  if (currentUser.role === 'ADMIN') {
    if (role && !['INSTALLER', 'ADMIN'].includes(role)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }
    if (!role) {
      queryOptions.role = 'INSTALLER'; // Default to showing installers only
    }
  }

  // SUPERVISOR is scoped to installations/assignments, so it may only browse
  // the installer roster (plus itself), never ADMIN/SUPERADMIN/other SUPERVISORs.
  if (currentUser.role === 'SUPERVISOR') {
    if (role && role !== 'INSTALLER') {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }
    queryOptions.role = 'INSTALLER';
  }

  // Only users profiled for a disco the caller can see.
  const scope = await resolveListScope(req, res, discoCode);
  if (!scope) return;
  queryOptions.discoIds = scope.discoIds;

  const result = await User.findAll(queryOptions);
  await User.attachDiscos(result.users);

  // For ADMIN, filter out other ADMINs and SUPERADMINs (except themselves)
  if (currentUser.role === 'ADMIN') {
    result.users = result.users.filter(user =>
      user.role === 'INSTALLER' || user.id === currentUser.id
    );
  }

  if (currentUser.role === 'SUPERVISOR') {
    result.users = result.users.filter(user =>
      user.role === 'INSTALLER' || user.id === currentUser.id
    );
  }

  res.json({
    success: true,
    data: result.users,
    pagination: result.pagination
  });
});

const getUserById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const currentUser = req.user;
  const requestedUserId = id; // UUID string

  // Access control
  if (currentUser.role === 'INSTALLER' && currentUser.id !== requestedUserId) {
    return res.status(403).json({
      success: false,
      message: 'Access denied'
    });
  }

  const user = await User.findById(requestedUserId);

  if (!user || !(await sharesDisco(currentUser, user.id))) return userNotFound(res);

  // ADMIN can only see INSTALLER users and themselves
  if (currentUser.role === 'ADMIN') {
    if (user.role === 'SUPERADMIN' || (user.role === 'ADMIN' && user.id !== currentUser.id)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }
  }

  // SUPERVISOR may only look up installers (to assign work) or itself.
  if (currentUser.role === 'SUPERVISOR' && user.role !== 'INSTALLER' && user.id !== currentUser.id) {
    return res.status(403).json({
      success: false,
      message: 'Access denied'
    });
  }

  res.json({
    success: true,
    message: 'User retrieved successfully',
    data: await User.attachDiscos(user)
  });
});

const createUser = asyncHandler(async (req, res) => {
  const {
    firstName,
    lastName,
    role,
    nin,
    phone,
    email,
    homeAddress,
    officeAddress,
    discoCodes
  } = req.body;

  const currentUser = req.user;

  if (currentUser.role === 'INSTALLER') {
    return res.status(403).json({
      success: false,
      message: 'Installers cannot create users'
    });
  }

  if (currentUser.role === 'ADMIN') {
    if (role && !['INSTALLER', 'ADMIN'].includes(role)) {
      return res.status(403).json({
        success: false,
        message: 'Admins can only create INSTALLER or ADMIN users'
      });
    }
  }

  // Which discos the new user works in. SUPERADMIN may grant any. An ADMIN's
  // new user defaults to the ADMIN's own discos and may be narrowed to a
  // subset of them, never widened.
  let discoIds = [];
  if (discoCodes && discoCodes.length > 0) {
    const discos = await loadDiscosByCode(res, discoCodes);
    if (!discos) return;
    const outside = discos.find((d) => !isUnrestricted(currentUser) && !currentUser.discoIds.includes(d.id));
    if (outside) {
      return res.status(403).json({ success: false, message: `You don't have access to ${outside.code}` });
    }
    discoIds = discos.map((d) => d.id);
  } else if (!isUnrestricted(currentUser)) {
    discoIds = currentUser.discoIds;
  }

  const [existingPhone, existingEmail, existingNin] = await Promise.all([
    User.findByPhone(phone),
    User.findByEmail(email),
    User.findByNin(nin)
  ]);

  if (existingPhone) {
    return res.status(400).json({
      success: false,
      message: 'User with this phone number already exists'
    });
  }

  if (existingEmail) {
    return res.status(400).json({
      success: false,
      message: 'User with this email already exists'
    });
  }

  if (existingNin) {
    return res.status(400).json({
      success: false,
      message: 'User with this NIN already exists'
    });
  }

  const user = await User.create({
    firstName,
    lastName,
    role: role || 'INSTALLER',
    nin,
    phone,
    email,
    password: process.env.DEFAULT_PASSWORD,
    homeAddress,
    officeAddress
  });

  // A SUPERADMIN account sees every disco regardless, so it isn't profiled.
  if (user.role !== 'SUPERADMIN' && discoIds.length > 0) {
    await User.setDiscos(user.id, discoIds, currentUser.id);
  }

  res.status(201).json({
    success: true,
    message: 'User created successfully',
    data: await User.attachDiscos(user)
  });
});

const updateUser = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const updateData = req.body;
  const currentUser = req.user;
  const targetUserId = id; // UUID string

  const targetUser = await User.findById(targetUserId);
  if (!targetUser || !(await sharesDisco(currentUser, targetUserId))) return userNotFound(res);

  if (currentUser.role === 'INSTALLER' || currentUser.role === 'SUPERVISOR') {
    if (currentUser.id !== targetUserId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }
    delete updateData.role;
  }

  if (currentUser.role === 'ADMIN') {
    if (targetUser.role === 'SUPERADMIN' || 
        (targetUser.role === 'ADMIN' && targetUser.id !== currentUser.id)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }
    
    // Only SUPERADMIN creates supervisors and superadmins, by any route.
    if (updateData.role && !['INSTALLER', 'ADMIN'].includes(updateData.role)) {
      return res.status(403).json({
        success: false,
        message: 'Admins can only set the INSTALLER or ADMIN role'
      });
    }
  }

  if (Object.keys(updateData).length === 0) {
    return res.status(400).json({ success: false, message: 'Nothing to update' });
  }

  if (updateData.email) {
    const existingUser = await User.findByEmail(updateData.email);
    if (existingUser && existingUser.id !== targetUserId) {
      return res.status(400).json({
        success: false,
        message: 'Email already exists'
      });
    }
  }

  const updatedUser = await User.updateById(targetUserId, updateData);

  res.json({
    success: true,
    message: 'User updated successfully',
    data: await User.attachDiscos(updatedUser)
  });
});

const deleteUser = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const currentUser = req.user;
  const targetUserId = id; // UUID string

  if (currentUser.id === targetUserId) {
    return res.status(400).json({
      success: false,
      message: 'Cannot delete your own account'
    });
  }

  const targetUser = await User.findById(targetUserId);
  if (!targetUser || !(await sharesDisco(currentUser, targetUserId))) return userNotFound(res);

  if (currentUser.role === 'INSTALLER') {
    return res.status(403).json({
      success: false,
      message: 'Access denied'
    });
  }

  if (currentUser.role === 'ADMIN') {
    if (targetUser.role !== 'INSTALLER') {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }
  }

  // Soft delete: sets is_active = false. The user's own historical records
  // (installations, meter uploads, assignments) reference them by id via a
  // plain JOIN with no is_active filter, so their name keeps showing up on
  // that old work after this runs -- only login and the default listings stop
  // seeing them. (This previously called User.deleteById, a method that never
  // existed on the model, so this endpoint 500'd on every call.)
  const deleted = await User.softDeleteById(targetUserId);

  if (!deleted) {
    return res.status(404).json({
      success: false,
      message: 'User not found or already deleted'
    });
  }

  res.json({
    success: true,
    message: 'User deleted successfully'
  });
});

// Reverses deleteUser/softDeleteById. Same access rule as delete: an ADMIN
// may only act on INSTALLER accounts, never on another ADMIN or SUPERADMIN.
const restoreUser = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const currentUser = req.user;

  if (currentUser.role === 'INSTALLER') {
    return res.status(403).json({
      success: false,
      message: 'Access denied'
    });
  }

  // includeInactive: true because the whole point is finding a currently
  // deactivated user -- the default findById would never see them.
  const targetUser = await User.findById(id, true);
  if (!targetUser || !(await sharesDisco(currentUser, id))) return userNotFound(res);

  if (currentUser.role === 'ADMIN' && targetUser.role !== 'INSTALLER') {
    return res.status(403).json({
      success: false,
      message: 'Access denied'
    });
  }

  const restored = await User.undoSoftDeleteById(id);

  if (!restored) {
    return res.status(400).json({
      success: false,
      message: 'User is not currently deactivated'
    });
  }

  res.json({
    success: true,
    message: 'User restored successfully',
    data: await User.attachDiscos(await User.findById(id))
  });
});

const searchUsers = asyncHandler(async (req, res) => {
  const q = req.validatedQuery || req.query;
  const currentUser = req.user;

  if (currentUser.role === 'INSTALLER') {
    return res.status(403).json({
      success: false,
      message: 'Access denied'
    });
  }

  const queryOptions = {
    page: q.page,
    limit: q.limit,
    role: q.role,
    search: q.q,
    includeInactive: q.includeInactive
  };

  // Same visibility rule as the ordinary list endpoint: an ADMIN only browses
  // installers (plus themselves), never peers or superadmins.
  if (currentUser.role === 'ADMIN') {
    if (q.role && !['INSTALLER', 'ADMIN'].includes(q.role)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }
    if (!q.role) queryOptions.role = 'INSTALLER';
  }

  // SUPERVISOR is scoped to installations/assignments: installer roster only.
  if (currentUser.role === 'SUPERVISOR') {
    if (q.role && q.role !== 'INSTALLER') {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }
    queryOptions.role = 'INSTALLER';
  }

  const scope = await resolveListScope(req, res, q.discoCode);
  if (!scope) return;
  queryOptions.discoIds = scope.discoIds;

  const result = await User.findAll(queryOptions);
  await User.attachDiscos(result.users);

  if (currentUser.role === 'ADMIN') {
    result.users = result.users.filter(user =>
      user.role === 'INSTALLER' || user.id === currentUser.id
    );
  }

  if (currentUser.role === 'SUPERVISOR') {
    result.users = result.users.filter(user =>
      user.role === 'INSTALLER' || user.id === currentUser.id
    );
  }

  res.json({
    success: true,
    data: result.users,
    pagination: result.pagination
  });
});

/** Replaces a user's disco set. SUPERADMIN only (enforced on the route). */
const setUserDiscos = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const targetUser = await User.findById(id);
  if (!targetUser) return userNotFound(res);

  if (targetUser.role === 'SUPERADMIN') {
    return res.status(400).json({
      success: false,
      message: 'A SUPERADMIN already sees every disco and is not profiled'
    });
  }

  const discos = await loadDiscosByCode(res, req.body.discoCodes);
  if (!discos) return;

  const before = (await User.getDiscos(id)).map((d) => d.code);
  await User.setDiscos(id, discos.map((d) => d.id), req.user.id);
  const after = discos.map((d) => d.code).sort();

  console.warn(
    `[users] ${req.user.id} changed discos for ${id} from [${before.join(', ')}] to [${after.join(', ')}]`
  );

  res.json({
    success: true,
    message: after.length > 0
      ? `${targetUser.firstName} ${targetUser.lastName} now works in ${after.join(', ')}`
      : `${targetUser.firstName} ${targetUser.lastName} no longer has access to any disco`,
    data: await User.attachDiscos(targetUser)
  });
});

module.exports = {
  setUserDiscos,
  getUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  restoreUser,
  searchUsers
};