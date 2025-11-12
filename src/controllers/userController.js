const User = require('../models/User');
const { asyncHandler } = require('../middleware/errorHandler');

const getUsers = asyncHandler(async (req, res) => {
  const { page, limit, role, search } = req.query;
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

  const result = await User.findAll(queryOptions);

  // For ADMIN, filter out other ADMINs and SUPERADMINs (except themselves)
  if (currentUser.role === 'ADMIN') {
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
  
  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found'
    });
  }

  // ADMIN can only see INSTALLER users and themselves
  if (currentUser.role === 'ADMIN') {
    if (user.role === 'SUPERADMIN' || (user.role === 'ADMIN' && user.id !== currentUser.id)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }
  }

  res.json({
    success: true,
    message: 'User retrieved successfully',
    data: user
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
    officeAddress
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

  res.status(201).json({
    success: true,
    message: 'User created successfully',
    data: user
  });
});

const updateUser = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const updateData = req.body;
  const currentUser = req.user;
  const targetUserId = id; // UUID string

  const targetUser = await User.findById(targetUserId);
  if (!targetUser) {
    return res.status(404).json({
      success: false,
      message: 'User not found'
    });
  }

  if (currentUser.role === 'INSTALLER') {
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
    
    if (updateData.role === 'SUPERADMIN') {
      return res.status(403).json({
        success: false,
        message: 'Cannot promote user to SUPERADMIN'
      });
    }
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
    data: updatedUser
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
  if (!targetUser) {
    return res.status(404).json({
      success: false,
      message: 'User not found'
    });
  }

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

  const deleted = await User.deleteById(targetUserId);

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

module.exports = {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser
};