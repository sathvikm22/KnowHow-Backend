const jwt = require('jsonwebtoken');
const crypto = require('crypto');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || JWT_SECRET + '_refresh';

// Ensure JWT_SECRET is strong (minimum 32 characters)
if (JWT_SECRET.length < 32) {
  console.warn('⚠️  WARNING: JWT_SECRET should be at least 32 characters for production security');
}

/**
 * Generate short-lived access token (10 minutes)
 * @param {Object} payload - Token payload (userId, email)
 * @returns {string} JWT access token
 */
function generateAccessToken(payload) {
  // Explicitly set algorithm to prevent alg: none attacks
  return jwt.sign(
    {
      ...payload,
      iat: Math.floor(Date.now() / 1000), // Issued at time
      type: 'access'
    },
    JWT_SECRET,
    {
      expiresIn: '10m', // 10 minutes
      algorithm: 'HS256' // Explicitly set algorithm
    }
  );
}

/**
 * Generate refresh token (7 days) with rotation support
 * @param {string} userId - User ID
 * @returns {string} JWT refresh token
 */
function generateRefreshToken(userId) {
  return jwt.sign(
    {
      userId,
      type: 'refresh',
      iat: Math.floor(Date.now() / 1000),
      jti: crypto.randomBytes(16).toString('hex') // Unique token ID for rotation
    },
    JWT_REFRESH_SECRET,
    {
      expiresIn: '7d',
      algorithm: 'HS256'
    }
  );
}

/**
 * Verify access token with strict validation
 * @param {string} token - JWT token to verify
 * @returns {Object|null} Decoded token payload or null if invalid
 */
function verifyAccessToken(token) {
  try {
    // Explicitly verify with algorithm to prevent alg: none
    const decoded = jwt.verify(token, JWT_SECRET, {
      algorithms: ['HS256'], // Only allow HS256
      maxAge: '10m' // Ensure token is not expired
    });

    // Additional validation: check exp and iat claims
    if (!decoded.exp || !decoded.iat) {
      console.warn('Token missing exp or iat claim');
      return null;
    }

    // Check if token is expired
    const now = Math.floor(Date.now() / 1000);
    if (decoded.exp < now) {
      console.warn('Token expired');
      return null;
    }

    // Ensure token type is access
    if (decoded.type !== 'access') {
      console.warn('Invalid token type');
      return null;
    }

    return decoded;
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      console.warn('Token expired:', error.message);
    } else if (error.name === 'JsonWebTokenError') {
      console.warn('Invalid token:', error.message);
    } else {
      console.error('Token verification error:', error);
    }
    return null;
  }
}

/**
 * Verify refresh token
 * @param {string} token - Refresh token to verify
 * @returns {Object|null} Decoded token payload or null if invalid
 */
function verifyRefreshToken(token) {
  try {
    const decoded = jwt.verify(token, JWT_REFRESH_SECRET, {
      algorithms: ['HS256'],
      maxAge: '7d'
    });

    if (!decoded.exp || !decoded.iat) {
      return null;
    }

    if (decoded.type !== 'refresh') {
      return null;
    }

    return decoded;
  } catch (error) {
    return null;
  }
}

/**
 * Legacy function for backward compatibility (deprecated - use generateAccessToken)
 * @deprecated Use generateAccessToken instead
 */
function generateToken(payload, expiresIn = '2h') {
  console.warn('⚠️  generateToken is deprecated. Use generateAccessToken instead.');
  return jwt.sign(
    {
      ...payload,
      iat: Math.floor(Date.now() / 1000),
      type: 'access'
    },
    JWT_SECRET,
    {
      expiresIn,
      algorithm: 'HS256'
    }
  );
}

/**
 * Legacy function for backward compatibility (deprecated - use verifyAccessToken)
 * @deprecated Use verifyAccessToken instead
 */
function verifyToken(token) {
  console.warn('⚠️  verifyToken is deprecated. Use verifyAccessToken instead.');
  return verifyAccessToken(token);
}

/**
 * Middleware to authenticate requests using HttpOnly cookies
 * Only checks cookies - no Authorization header fallback for security
 */
function authenticateToken(req, res, next) {
  // Only get token from HttpOnly cookie (secure by design)
  const accessToken = req.cookies?.accessToken;

  if (!accessToken) {
    return res.status(401).json({
      success: false,
      message: 'Access denied. No token provided.'
    });
  }

  const decoded = verifyAccessToken(accessToken);
  if (!decoded) {
    return res.status(403).json({
      success: false,
      message: 'Invalid or expired token.'
    });
  }

  req.user = decoded;
  next();
}

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  authenticateToken,
  // Legacy exports for backward compatibility (will be removed)
  generateToken,
  verifyToken
};

