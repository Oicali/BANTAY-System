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
        message: 'Invalid token format' 
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        success: false,
        message: 'Token has expired. Please login again.' 
      });
    }

    // Handle custom errors from verifyToken
    return res.status(401).json({ 
      success: false,
      message: error.message || 'Authentication failed' 
    });
  }
};

// =====================================================
// EXPORTS
// =====================================================
module.exports = { authenticate };