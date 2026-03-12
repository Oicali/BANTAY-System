// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  🎫 TOKEN MANAGER - Handles token creation, verification, and revocation  ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const pool = require("../../config/database");

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-this";
const JWT_EXPIRY = process.env.JWT_EXPIRY || "24h";

// =====================================================
// Convert JWT expiry string to milliseconds
// =====================================================
const getExpiryMs = (expiryString) => {
  const unit = expiryString.slice(-1);
  const value = parseInt(expiryString.slice(0, -1));

  switch (unit) {
    case "h": return value * 60 * 60 * 1000;
    case "d": return value * 24 * 60 * 60 * 1000;
    case "m": return value * 60 * 1000;
    default:  return 24 * 60 * 60 * 1000;
  }
};

// =====================================================
// Hash token for secure database storage
// =====================================================
const hashToken = (token) => {
  return crypto.createHash("sha256").update(token).digest("hex");
};

// =====================================================
// Create JWT token and store in database
// =====================================================
const createToken = async (userData) => {
  try {
    const token = jwt.sign(userData, JWT_SECRET, { expiresIn: JWT_EXPIRY });
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + getExpiryMs(JWT_EXPIRY));

    await pool.query(
      `INSERT INTO tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [userData.user_id, tokenHash, expiresAt]
    );

    return token;
  } catch (error) {
    console.error("❌ Create token error:", error);
    throw error;
  }
};

// =====================================================
// Verify token is valid (JWT + Database check)
// =====================================================
const verifyToken = async (token) => {
  try {
    // 1. Verify JWT signature and expiration
    const decoded = jwt.verify(token, JWT_SECRET);

    // 2. Hash the token
    const tokenHash = hashToken(token);

    // 3. Check token in tokens, join with users using new status column
    const result = await pool.query(
      `SELECT t.*, u.status
       FROM tokens t
       JOIN users u ON t.user_id = u.user_id
       WHERE t.token_hash = $1
         AND t.is_revoked = false
         AND t.expires_at > NOW()`,
      [tokenHash]
    );

    if (result.rows.length === 0) {
      throw new Error("Token not found or expired");
    }

    const tokenData = result.rows[0];

    // 4. Check user account status
    if (tokenData.status === "deactivated") {
      throw new Error("Account is deactivated");
    }

    if (tokenData.status === "locked") {
      throw new Error("Account is locked");
    }

    if (tokenData.status === "unverified") {
      throw new Error("Account is not yet verified");
    }

    return decoded;
  } catch (error) {
    throw error;
  }
};

// =====================================================
// Revoke a single token (logout)
// =====================================================
const revokeToken = async (token) => {
  try {
    const tokenHash = hashToken(token);

    await pool.query(
      `UPDATE tokens
       SET is_revoked = true, revoked_at = NOW()
       WHERE token_hash = $1`,
      [tokenHash]
    );

    return true;
  } catch (error) {
    console.error("❌ Revoke token error:", error);
    throw error;
  }
};

// =====================================================
// Revoke all tokens for a user (logout all devices)
// =====================================================
const revokeAllUserTokens = async (userId) => {
  try {
    await pool.query(
      `UPDATE tokens
       SET is_revoked = true, revoked_at = NOW()
       WHERE user_id = $1 AND is_revoked = false`,
      [userId]
    );

    return true;
  } catch (error) {
    console.error("❌ Revoke all tokens error:", error);
    throw error;
  }
};

// =====================================================
// Clean up expired tokens (run periodically)
// =====================================================
const cleanupExpiredTokens = async () => {
  try {
    const result = await pool.query(
      `DELETE FROM tokens WHERE expires_at < NOW()`
    );

    console.log(`🧹 Cleaned up ${result.rowCount} expired tokens`);
    return result.rowCount;
  } catch (error) {
    console.error("❌ Cleanup tokens error:", error);
    throw error;
  }
};

// =====================================================
// Get all active sessions for a user
// =====================================================
const getUserSessions = async (userId) => {
  try {
    const result = await pool.query(
      `SELECT token_id, created_at, expires_at
       FROM tokens
       WHERE user_id = $1
         AND is_revoked = false
         AND expires_at > NOW()
       ORDER BY created_at DESC`,
      [userId]
    );

    return result.rows;
  } catch (error) {
    console.error("❌ Get user sessions error:", error);
    throw error;
  }
};

// =====================================================
// EXPORTS
// =====================================================
module.exports = {
  createToken,
  verifyToken,
  revokeToken,
  revokeAllUserTokens,
  cleanupExpiredTokens,
  getUserSessions,
  hashToken,
};