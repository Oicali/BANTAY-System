// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  🎫 TOKEN MANAGER - Handles token creation, verification, and revocation  ║
// ╚═══════════════════════════════════════════════════════════════════════════╝
 
//backend\shared\utils\tokenManager.js
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
// options.expiresIn → override expiry (e.g. '30d' for mobile)
// =====================================================
const createToken = async (userData, options = {}) => {
  try {
    const expiresIn = options.expiresIn || JWT_EXPIRY; // default: 24h (web)
    const token = jwt.sign(userData, JWT_SECRET, { expiresIn });
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + getExpiryMs(expiresIn));

    // NEW: device/session metadata — pass these in from the login controller
    const userAgent     = options.userAgent || null;
    const ipAddress     = options.ipAddress || null;
    const deviceType    = options.deviceType || null;
    const locationLabel = options.locationLabel || null;
 
    await pool.query(
      `INSERT INTO tokens
         (user_id, token_hash, expires_at, user_agent, ip_address, device_type, location_label, last_active_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [userData.user_id, tokenHash, expiresAt, userAgent, ipAddress, deviceType, locationLabel]
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

    // NEW: fire-and-forget last-active update, doesn't block the request
    pool.query(
      `UPDATE tokens SET last_active_at = NOW() WHERE token_hash = $1`,
      [tokenHash]
    ).catch((err) => console.error("⚠️ last_active_at update failed:", err.message));
 
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
const getUserSessions = async (userId, currentTokenHash = null) => {
  try {
    const result = await pool.query(
      `SELECT token_id, created_at, expires_at, last_active_at,
              user_agent, device_type, ip_address, location_label,
              token_hash
       FROM tokens
       WHERE user_id = $1
         AND is_revoked = false
         AND expires_at > NOW()
       ORDER BY last_active_at DESC`,
      [userId]
    );

    // Tag which row is the requester's current device, then drop the hash
    // (never send token_hash to the frontend)
    return result.rows.map(({ token_hash, ...row }) => ({
      ...row,
      is_current: currentTokenHash ? token_hash === currentTokenHash : false,
    }));
  } catch (error) {
    console.error("❌ Get user sessions error:", error);
    throw error;
  }
};

// =====================================================
// Revoke a single session by token_id (for "log out this device"
// from the sessions list, where you don't have the raw token)
// =====================================================
const revokeTokenById = async (tokenId, requestingUserId) => {
  try {
    const result = await pool.query(
      `UPDATE tokens
       SET is_revoked = true, revoked_at = NOW()
       WHERE token_id = $1 AND user_id = $2
       RETURNING token_id`,
      [tokenId, requestingUserId]
    );

    if (result.rows.length === 0) {
      throw new Error("Session not found or does not belong to this user");
    }

    return true;
  } catch (error) {
    console.error("❌ Revoke token by id error:", error);
    throw error;
  }
};

// =====================================================
// Revoke prior sessions from the SAME device (matched by
// user_agent + ip_address) before issuing a new token.
// Called at login so re-logging in from the same browser
// collapses into one session instead of stacking duplicates.
// =====================================================
const revokeSessionsForSameDevice = async (userId, userAgent, ipAddress) => {
  try {
    if (!userAgent || !ipAddress) return; // nothing reliable to match on — skip
    await pool.query(
      `UPDATE tokens
       SET is_revoked = true, revoked_at = NOW()
       WHERE user_id = $1
         AND is_revoked = false
         AND user_agent = $2
         AND ip_address = $3`,
      [userId, userAgent, ipAddress]
    );
  } catch (error) {
    console.error("❌ Revoke sessions for same device error:", error);
    // Non-fatal — never block a login because this cleanup failed
  }
};

// =====================================================
// Revoke all sessions except the current one
// =====================================================
const revokeAllExceptCurrent = async (userId, currentTokenHash) => {
  try {
    await pool.query(
      `UPDATE tokens
       SET is_revoked = true, revoked_at = NOW()
       WHERE user_id = $1
         AND token_hash != $2
         AND is_revoked = false`,
      [userId, currentTokenHash]
    );

    return true;
  } catch (error) {
    console.error("❌ Revoke all except current error:", error);
    throw error;
  }
};

// =====================================================
// Revoke all sessions except the current one, SKIPPING
// any device that is currently trusted. Used when the
// requesting session is itself untrusted — it may clear
// out other untrusted sessions but must not touch trusted
// ones. Returns the count of sessions actually revoked.
// =====================================================
const revokeAllExceptCurrentAndTrusted = async (userId, currentTokenHash) => {
  try {
    const result = await pool.query(
      `UPDATE tokens
       SET is_revoked = true, revoked_at = NOW()
       WHERE user_id = $1
         AND token_hash != $2
         AND is_revoked = false
         AND NOT EXISTS (
           SELECT 1 FROM trusted_devices td
           WHERE td.user_id = tokens.user_id
             AND td.ip_address IS NOT DISTINCT FROM tokens.ip_address
             AND td.user_agent IS NOT DISTINCT FROM tokens.user_agent
             AND td.trusted_until > NOW()
         )
       RETURNING token_id`,
      [userId, currentTokenHash]
    );

    return result.rowCount;
  } catch (error) {
    console.error("❌ Revoke all except current and trusted error:", error);
    throw error;
  }
};
 
// =====================================================
// Get the set of "ip|userAgent" keys currently trusted
// for a user (trust not expired). Used to tag each
// session in the list without an N+1 query per device.
// =====================================================
const getTrustedDeviceKeys = async (userId) => {
  try {
    const result = await pool.query(
      `SELECT ip_address, user_agent
       FROM trusted_devices
       WHERE user_id = $1 AND trusted_until > NOW()`,
      [userId]
    );
    return new Set(
      result.rows.map((r) => `${r.ip_address || ""}|${r.user_agent || ""}`)
    );
  } catch (error) {
    console.error("❌ Get trusted device keys error:", error);
    return new Set();
  }
};

// =====================================================
// Remove a device's trust (used by "Remove from trusted
// device" in the login-activity detail modal). Matched by
// the session's own ip_address/user_agent, looked up by
// token_id so the frontend never sends raw IP/UA itself.
// =====================================================
const removeTrustedDeviceByTokenId = async (tokenId, userId) => {
  try {
    const tokenResult = await pool.query(
      `SELECT ip_address, user_agent FROM tokens
       WHERE token_id = $1 AND user_id = $2`,
      [tokenId, userId]
    );

    if (tokenResult.rows.length === 0) {
      throw new Error("Session not found or does not belong to this user");
    }

    const { ip_address, user_agent } = tokenResult.rows[0];

    const result = await pool.query(
      `DELETE FROM trusted_devices
       WHERE user_id = $1
         AND ip_address IS NOT DISTINCT FROM $2
         AND user_agent IS NOT DISTINCT FROM $3`,
      [userId, ip_address, user_agent]
    );

    return result.rowCount > 0;
  } catch (error) {
    console.error("❌ Remove trusted device error:", error);
    throw error;
  }
};

// =====================================================
// Trust a device by its token_id (used by "Trust This
// Device" in Login Activity, for the CURRENT device only).
// Mirrors the notification-based trust flow, but looked up
// by token_id instead of a stored notification's metadata.
// =====================================================
const trustDeviceByTokenId = async (tokenId, userId) => {
  try {
    const tokenResult = await pool.query(
      `SELECT ip_address, user_agent FROM tokens
       WHERE token_id = $1 AND user_id = $2`,
      [tokenId, userId]
    );

    if (tokenResult.rows.length === 0) {
      throw new Error("Session not found or does not belong to this user");
    }

    const { ip_address, user_agent } = tokenResult.rows[0];

    await pool.query(
      `DELETE FROM trusted_devices
       WHERE user_id = $1
         AND ip_address IS NOT DISTINCT FROM $2
         AND user_agent IS NOT DISTINCT FROM $3`,
      [userId, ip_address, user_agent]
    );
    await pool.query(
      `INSERT INTO trusted_devices (user_id, ip_address, user_agent, trusted_until)
       VALUES ($1, $2, $3, NOW() + INTERVAL '30 days')`,
      [userId, ip_address, user_agent]
    );

    return true;
  } catch (error) {
    console.error("❌ Trust device by token id error:", error);
    throw error;
  }
};

// =====================================================
// Check whether the CURRENT session (identified by its
// token_hash) is itself a trusted device. Used to gate
// actions that target other trusted devices — an
// untrusted session must not be able to log out or
// remove trust from a trusted one.
// =====================================================
const isCurrentDeviceTrusted = async (tokenHash, userId) => {
  try {
    const tokenResult = await pool.query(
      `SELECT ip_address, user_agent FROM tokens WHERE token_hash = $1 AND user_id = $2`,
      [tokenHash, userId]
    );
    if (tokenResult.rows.length === 0) return false;

    const { ip_address, user_agent } = tokenResult.rows[0];
    const trustedCheck = await pool.query(
      `SELECT 1 FROM trusted_devices
       WHERE user_id = $1
         AND ip_address IS NOT DISTINCT FROM $2
         AND user_agent IS NOT DISTINCT FROM $3
         AND trusted_until > NOW()
       LIMIT 1`,
      [userId, ip_address, user_agent]
    );
    return trustedCheck.rows.length > 0;
  } catch (error) {
    console.error("❌ isCurrentDeviceTrusted error:", error);
    return false;
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
  revokeTokenById,
  revokeAllExceptCurrent,
  revokeSessionsForSameDevice,
  getTrustedDeviceKeys,
  removeTrustedDeviceByTokenId,
  trustDeviceByTokenId,
  isCurrentDeviceTrusted,
  revokeAllExceptCurrentAndTrusted,
  hashToken,
};