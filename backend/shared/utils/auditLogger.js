// ================================================================================
// FILE: backend/shared/utils/auditLogger.js
// ================================================================================

const pool = require("../../config/database");

/**
 * Insert one audit log row. Fire-and-forget — never throws.
 *
 * @param {object} params
 * @param {string|null} params.userId       - UUID of the user (null if unknown)
 * @param {string|null} params.username     - username string (null if unknown)
 * @param {string}      params.eventName    - e.g. "User Login", "OTP Requested"
 * @param {string}      params.description  - human-readable sentence
 * @param {string}      params.action       - LOGIN | LOGOUT | UPDATE | OTP
 * @param {string}      params.status       - "success" | "failed"
 * @param {string|null} params.source       - "Web Portal" | "Mobile App" | null
 * @param {string|null} params.ipAddress    - IP address string
 */
const logAudit = async ({
  userId      = null,
  username    = null,
  eventName,
  description,
  action,
  status      = "success",
  source      = null,
  ipAddress   = null,
}) => {
  try {
    await pool.query(
      `INSERT INTO audit_logs
         (user_id, username, event_name, description, action, status, source, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [userId, username, eventName, description, action, status, source, ipAddress]
    );
  } catch (err) {
    // Never crash the main request because of a logging failure
    console.error("⚠️ Audit log failed:", err.message);
  }
};

/**
 * Extract the real client IP from a request object.
 * Works on Railway (x-forwarded-for) and local dev.
 */
const getClientIp = (req) => {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.ip || null;
};

module.exports = { logAudit, getClientIp };