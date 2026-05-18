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
    const unread = result.rows.filter((n) => !n.is_read).length;
    res.json({ success: true, data: result.rows, unread });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /notifications/:id/read — mark one read
router.patch("/:id/read", authenticate, async (req, res) => {
  try {
    await pool.query(
      `UPDATE notifications SET is_read = TRUE
       WHERE id = $1 AND recipient_user_id = $2`,
      [req.params.id, req.user.user_id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});


module.exports = router;