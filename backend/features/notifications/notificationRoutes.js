// backend\features\notifications\notificationRoutes.js
const express = require("express");
const router = express.Router();
const pool = require("../../config/database");
const { authenticate } = require("../../shared/middleware/tokenMiddleware");
const tokenManager = require("../../shared/utils/tokenManager");
const { logAudit, getClientIp } = require("../../shared/utils/auditLogger");


// PATCH /notifications/read-all — mark all read
router.patch("/read-all", authenticate, async (req, res) => {
  try {
    await pool.query(
      `UPDATE notifications SET is_read = TRUE WHERE recipient_user_id = $1`,
      [req.user.user_id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
// GET /notifications — fetch my notifications
router.get("/", authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
         n.id, n.sender_name, n.type, n.title, n.message, 
         n.link_to, n.is_read, n.created_at, n.metadata,
         u.profile_picture AS sender_avatar
       FROM notifications n
       LEFT JOIN users u ON n.sender_user_id = u.user_id
       WHERE n.recipient_user_id = $1
       ORDER BY n.created_at DESC
       LIMIT 50`,
      [req.user.user_id]
    );
    // Count unread across the whole table, not just the 50 fetched rows
    const unreadResult = await pool.query(
      `SELECT COUNT(*)::int AS unread
       FROM notifications
       WHERE recipient_user_id = $1 AND is_read = FALSE`,
      [req.user.user_id]
    );
    res.json({
      success: true,
      data: result.rows,
      unread: unreadResult.rows[0].unread,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /notifications/:id/read — mark one read
router.patch("/:id/read", authenticate, async (req, res) => {
  try {
    // rowCount = 0 means wrong ID, wrong owner, or already read
    const result = await pool.query(
      `UPDATE notifications SET is_read = TRUE
       WHERE id = $1 AND recipient_user_id = $2`,
      [req.params.id, req.user.user_id]
    );
    res.json({ success: true, updated: result.rowCount });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post("/push-token", authenticate, async (req, res) => {
  try {
    const { push_token } = req.body;
    await pool.query(
      `UPDATE users SET push_token = $1 WHERE user_id = $2`,
      [push_token, req.user.user_id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /notifications/push-token — clear on logout
router.delete("/push-token", authenticate, async (req, res) => {
  try {
    await pool.query(
      `UPDATE users SET push_token = NULL WHERE user_id = $1`,
      [req.user.user_id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /notifications/:id/trust-device — trust the device behind a NEW_LOGIN notification for 30 days
router.post("/:id/trust-device", authenticate, async (req, res) => {
  try {
    // IP and user agent come from the stored notification, never from the client
    const notif = await pool.query(
      `SELECT metadata FROM notifications
       WHERE id = $1 AND recipient_user_id = $2 AND type = 'NEW_LOGIN'`,
      [req.params.id, req.user.user_id]
    );

    if (notif.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Notification not found." });
    }

    const meta = notif.rows[0].metadata;
    if (!meta || (!meta.ip_address && !meta.user_agent)) {
      return res.status(400).json({
        success: false,
        message: "This notification has no device details to trust.",
      });
    }

    // Replace any existing trust row for this device, then create a fresh 30-day one
    await pool.query(
      `DELETE FROM trusted_devices
       WHERE user_id = $1
         AND ip_address IS NOT DISTINCT FROM $2
         AND user_agent IS NOT DISTINCT FROM $3`,
      [req.user.user_id, meta.ip_address || null, meta.user_agent || null]
    );
    await pool.query(
      `INSERT INTO trusted_devices (user_id, ip_address, user_agent, trusted_until)
       VALUES ($1, $2, $3, NOW() + INTERVAL '30 days')`,
      [req.user.user_id, meta.ip_address || null, meta.user_agent || null]
    );

    await pool.query(
      `UPDATE notifications SET is_read = TRUE WHERE id = $1 AND recipient_user_id = $2`,
      [req.params.id, req.user.user_id]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("trust-device error:", err);
    res.status(500).json({ success: false, message: "Unable to save your preference." });
  }
});

// POST /notifications/:id/logout-device — log out the device behind a NEW_LOGIN notification
router.post("/:id/logout-device", authenticate, async (req, res) => {
  try {
    // Device details come from the stored notification, never from the client
    const notif = await pool.query(
      `SELECT metadata FROM notifications
       WHERE id = $1 AND recipient_user_id = $2 AND type = 'NEW_LOGIN'`,
      [req.params.id, req.user.user_id]
    );

    if (notif.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Notification not found." });
    }

    const meta = notif.rows[0].metadata;
    if (!meta || (!meta.ip_address && !meta.user_agent)) {
      return res.status(400).json({
        success: false,
        message: "This notification has no device details.",
      });
    }

    const deviceIp = meta.ip_address || null;
    const deviceUa = meta.user_agent || null;

    await tokenManager.revokeSessionsForSameDevice(req.user.user_id, deviceUa, deviceIp);

    // A logged-out device should not stay trusted
    await pool.query(
      `DELETE FROM trusted_devices
       WHERE user_id = $1
         AND ip_address IS NOT DISTINCT FROM $2
         AND user_agent IS NOT DISTINCT FROM $3`,
      [req.user.user_id, deviceIp, deviceUa]
    );

    await pool.query(
      `UPDATE notifications SET is_read = TRUE WHERE id = $1 AND recipient_user_id = $2`,
      [req.params.id, req.user.user_id]
    );

    // True when the device being logged out is the one making this request
    const loggedOutSelf =
      (req.headers["user-agent"] || null) === deviceUa &&
      getClientIp(req) === deviceIp;

    await logAudit({
      userId:      req.user.user_id,
      username:    req.user.username,
      eventName:   "Device Logged Out",
      description: `Logged out ${meta.device_label || "device"} from a new-login notification`,
      action:      "LOGOUT",
      status:      "success",
      source:      "Web Portal",
      ipAddress:   getClientIp(req),
    });

    res.json({ success: true, loggedOutSelf });
  } catch (err) {
    console.error("logout-device error:", err);
    res.status(500).json({ success: false, message: "Unable to log out this device." });
  }
});

module.exports = router;