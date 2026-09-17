const tokenManager = require("../../../shared/utils/tokenManager");
const { hashToken } = require("../../../shared/utils/tokenManager");

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

module.exports = { getSessions, revokeSession, revokeAllOtherSessions };