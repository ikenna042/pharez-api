const jwt = require('jsonwebtoken');
const User = require('../models/User');

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    console.log('Authorization Header:', authHeader);

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Access token required'
      });
    }

    const token = authHeader.substring(7);

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Get user from database to ensure they still exist and are active
      const user = await User.findById(decoded.userId);
      
      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'Invalid or expired token'
        });
      }

      // Add user to request object
      req.user = user;
      next();
    } catch (jwtError) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token'
      });
    }
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(500).json({
      success: false,
      message: 'Authentication failed'
    });
  }
};

const authorize = (roles) => {
  console.log('Authorizing roles:', roles);
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    if (!roles.includes(req.user.role)) {
      console.log('User role is not authorized:', req.user.role);
      console.log('Required roles are:', roles);
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions'
      });
    }

    next();
  };
};

const checkOwnership = (req, res, next) => {
  const requestedUserId = req.params.id; // user IDs are UUID strings
  const currentUserId = req.user.id;
  const userRole = req.user.role;

  // SUPERADMIN can access everything
  if (userRole === 'SUPERADMIN') {
    return next();
  }

  // ADMIN can access their own data and INSTALLER data
  if (userRole === 'ADMIN') {
    return next(); // Let the controller handle the specific logic
  }

  // INSTALLER can only access their own data
  if (userRole === 'INSTALLER' && requestedUserId === currentUserId) {
    return next();
  }

  return res.status(403).json({
    success: false,
    message: 'Access denied'
  });
};

const generateToken = (user) => {
  const payload = {
    userId: user.id,
    role: user.role,
    phone: user.phone
  };

  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  });
};

module.exports = {
  authenticate,
  authorize,
  checkOwnership,
  generateToken
};
