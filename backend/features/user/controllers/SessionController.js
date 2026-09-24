const tokenManager = require("../../../shared/utils/tokenManager");
const { hashToken } = require("../../../shared/utils/tokenManager");
const pool = require("../../../config/database");

// GET /users/sessions
const getSessions = async (req, res) => {
  try {
    const userId = req.user.user_id; // set by `authenticate` middleware
    const rawToken = req.headers.authorization?.split(" ")[1];
    const currentTokenHash = rawToken ? hashToken(rawToken) : null;

    const sessions = await tokenManager.getUserSessions(userId, currentTokenHash);

    res.json({ success: true, sessions });
  } catch (error) {
    console.error("❌ getSessions error:", error);
    res.status(500).json({ success: false, message: "Failed to load sessions" });
  }
};

// DELETE /users/sessions/:tokenId
const revokeSession = async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { tokenId } = req.params;

    await tokenManager.revokeTokenById(tokenId, userId);

    res.json({ success: true, message: "Session revoked" });
  } catch (error) {
    console.error("❌ revokeSession error:", error);
    res.status(400).json({ success: false, message: error.message || "Failed to revoke session" });
  }
};

// DELETE /users/sessions/all-except-current
const revokeAllOtherSessions = async (req, res) => {
  try {
    const userId = req.user.user_id;
    const rawToken = req.headers.authorization?.split(" ")[1];
    const currentTokenHash = rawToken ? hashToken(rawToken) : null;

    if (!currentTokenHash) {
      return res.status(400).json({ success: false, message: "No current session token found" });
    }

    await tokenManager.revokeAllExceptCurrent(userId, currentTokenHash);

    res.json({ success: true, message: "All other sessions revoked" });
  } catch (error) {
    console.error("❌ revokeAllOtherSessions error:", error);
    res.status(500).json({ success: false, message: "Failed to revoke sessions" });
  }
};

// GET /users/sessions/:tokenId/history
// Returns this device's info + its login history (matched by IP, since
// audit_logs doesn't store user_agent).
const getDeviceHistory = async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { tokenId } = req.params;

    const sessionResult = await pool.query(
      `SELECT ip_address, user_agent, device_type, location_label, last_active_at
       FROM tokens
       WHERE token_id = $1 AND user_id = $2`,
      [tokenId, userId]
    );

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Device not found" });
    }

    const device = sessionResult.rows[0];

    const historyResult = await pool.query(
      `SELECT description, created_at, ip_address
       FROM audit_logs
       WHERE user_id = $1
         AND action = 'LOGIN'
         AND status = 'success'
         AND ip_address = $2
       ORDER BY created_at DESC
       LIMIT 20`,
      [userId, device.ip_address]
    );

    res.json({ success: true, device, history: historyResult.rows });
  } catch (error) {
    console.error("❌ getDeviceHistory error:", error);
    res.status(500).json({ success: false, message: "Failed to load login history" });
  }
};

module.exports = { getSessions, revokeSession, revokeAllOtherSessions, getDeviceHistory };