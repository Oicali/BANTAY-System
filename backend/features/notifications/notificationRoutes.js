// backend\features\notifications\notificationRoutes.js
const express = require("express");
const router = express.Router();
const pool = require("../../config/database");
const { authenticate } = require("../../shared/middleware/tokenMiddleware");


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
         n.link_to, n.is_read, n.created_at,
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

module.exports = router;