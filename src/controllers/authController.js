const User = require('../models/User');
const { generateToken } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

const register = asyncHandler(async (req, res) => {
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

  const existingUser = await User.findByPhone(phone);
  if (existingUser) {
    return res.status(400).json({
      success: false,
      message: 'User with this phone number already exists'
    });
  }

  const existingEmail = await User.findByEmail(email);
  if (existingEmail) {
    return res.status(400).json({
      success: false,
      message: 'User with this email already exists'
    });
  }

  const existingNin = await User.findByNin(nin);
  if (existingNin) {
    return res.status(400).json({
      success: false,
      message: 'User with this NIN already exists'
    });
  }

  const user = await User.create({
    firstName,
    lastName,
    role,
    nin,
    phone,
    email,
    password: process.env.DEFAULT_PASSWORD,
    homeAddress,
    officeAddress
  });

  const token = generateToken(user);

  res.status(201).json({
    success: true,
    message: 'User registered successfully',
    data: {
      user,
      token
    }
  });
});

const login = asyncHandler(async (req, res) => {
  const { phone, password } = req.body;

  // Find user by phone
  const user = await User.findByPhone(phone);
  if (!user) {
    return res.status(401).json({
      success: false,
      message: 'Invalid phone number or password'
    });
  }

  // Validate password
  const isValidPassword = await User.validatePassword(password, user.passwordHash);
  if (!isValidPassword) {
    return res.status(401).json({
      success: false,
      message: 'Invalid phone number or password'
    });
  }

  // Remove password hash from user object
  delete user.passwordHash;

  // Generate token
  const token = generateToken(user);

  res.json({
    success: true,
    message: 'Login successful',
    data: {
      user,
      token
    }
  });
});

const getProfile = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    message: 'User profile retrieved successfully',
    data: req.user
  });
});

const updateProfile = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const updateData = req.body;

  if (updateData.email) {
    const existingUser = await User.findByEmail(updateData.email);
    if (existingUser && existingUser.id !== userId) {
      return res.status(400).json({
        success: false,
        message: 'Email already exists'
      });
    }
  }

  const updatedUser = await User.updateById(userId, updateData);
  
  if (!updatedUser) {
    return res.status(404).json({
      success: false,
      message: 'User not found'
    });
  }

  res.json({
    success: true,
    message: 'Profile updated successfully',
    data: updatedUser
  });
});

const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const userId = req.user.id;

  const user = await User.findByPhone(req.user.phone);
  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found'
    });
  }

  const isValidPassword = await User.validatePassword(currentPassword, user.passwordHash);
  if (!isValidPassword) {
    return res.status(400).json({
      success: false,
      message: 'Current password is incorrect'
    });
  }

  await User.updatePassword(userId, newPassword);

  res.json({
    success: true,
    message: 'Password changed successfully'
  });
});

module.exports = {
  register,
  login,
  getProfile,
  updateProfile,
  changePassword
};