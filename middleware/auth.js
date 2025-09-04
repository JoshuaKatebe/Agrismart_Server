const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Verify JWT token
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access token is required'
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get user from token
    const user = await User.findById(decoded.id).select('-password');
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found'
      });
    }

    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Account is deactivated'
      });
    }

    // Add user to request object
    req.user = user;
    next();

  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token has expired'
      });
    }
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    }

    console.error('Auth middleware error:', error);
    return res.status(500).json({
      success: false,
      message: 'Authentication error'
    });
  }
};

// Check if user has specific role
const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions'
      });
    }

    next();
  };
};

// Check if user owns or manages the greenhouse
const requireGreenhouseAccess = async (req, res, next) => {
  try {
    const Greenhouse = require('../models/Greenhouse');
    const greenhouseId = req.params.greenhouseId || req.body.greenhouseId;

    if (!greenhouseId) {
      return res.status(400).json({
        success: false,
        message: 'Greenhouse ID is required'
      });
    }

    const greenhouse = await Greenhouse.findById(greenhouseId);
    if (!greenhouse) {
      return res.status(404).json({
        success: false,
        message: 'Greenhouse not found'
      });
    }

    // Check if user has access (owner or manager)
    if (!greenhouse.hasUserAccess(req.user._id)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied to this greenhouse'
      });
    }

    req.greenhouse = greenhouse;
    next();

  } catch (error) {
    console.error('Greenhouse access middleware error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error checking greenhouse access'
    });
  }
};

// Verify ESP32/Arduino device API key
const authenticateDevice = (req, res, next) => {
  try {
    const apiKey = req.headers['x-api-key'] || req.body.apiKey || req.query.apiKey;

    if (!apiKey) {
      return res.status(401).json({
        success: false,
        message: 'API key is required'
      });
    }

    if (apiKey !== process.env.ESP32_API_KEY) {
      return res.status(401).json({
        success: false,
        message: 'Invalid API key'
      });
    }

    next();

  } catch (error) {
    console.error('Device auth middleware error:', error);
    return res.status(500).json({
      success: false,
      message: 'Device authentication error'
    });
  }
};

// Optional authentication (for public endpoints that can benefit from user context)
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select('-password');
      if (user && user.isActive) {
        req.user = user;
      }
    }

    next();

  } catch (error) {
    // Silently fail for optional auth
    next();
  }
};

module.exports = {
  authenticateToken,
  requireRole,
  requireGreenhouseAccess,
  authenticateDevice,
  optionalAuth
};
