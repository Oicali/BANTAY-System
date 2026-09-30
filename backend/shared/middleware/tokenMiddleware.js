// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  🔐 AUTHENTICATION MIDDLEWARE - Protects routes with token verification   ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

const tokenManager = require('../utils/tokenManager');

// =====================================================
// Middleware to verify JWT token on protected routes
// =====================================================
const authenticate = async (req, res, next) => {
  try {
    // 1. Get Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        code: 'NO_TOKEN',
        message: 'No authentication token provided'
      });
    }

    // 2. Extract token (format: "Bearer <token>")
    const token = authHeader.split(' ')[1];

    // 3. Verify token (checks JWT + database)
    const decoded = await tokenManager.verifyToken(token);

    // 4. Attach user info to request object
    req.user = decoded;
    
    // 5. Continue to next middleware/route
    next();
    
  } catch (error) {
    // Handle JWT-specific errors
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        code: 'INVALID_TOKEN',
        message: 'Invalid token format'
      });
    }

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        code: 'SESSION_EXPIRED',
        message: 'Session expired. Please login again.'
      });
    }

    // Custom errors from verifyToken carry a code
    // (SESSION_INVALID / SESSION_REVOKED / SESSION_EXPIRED)
    return res.status(401).json({
      success: false,
      code: error.code,
      message: error.message || 'Authentication failed'
    });
  }
};

// =====================================================
// EXPORTS
// =====================================================
module.exports = { authenticate };