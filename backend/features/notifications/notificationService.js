const pool = require("../../config/database");

const createNotification = async ({
  recipientId,
  senderId = null,
  senderName = null,
  senderAvatar = null,
  type,
  title,
  message,
  linkTo = null,
}) => {
  try {
    await pool.query(
      `INSERT INTO notifications 
        (recipient_user_id, sender_user_id, sender_name, sender_avatar, type, title, message, link_to)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [recipientId, senderId, senderName, senderAvatar, type, title, message, linkTo]
    );
  } catch (err) {
    console.error("createNotification error:", err.message);
  }
};

const notifyAllByRole = async (roles, payload, excludeUserId = null) => {
  try {
    const result = await pool.query(
      `SELECT u.user_id FROM users u
       JOIN roles r ON u.role_id = r.role_id
       WHERE r.role_name = ANY($1) AND u.status = 'verified'`,
      [roles]
    );
    await Promise.all(
      result.rows
        .filter((row) => !excludeUserId || row.user_id !== excludeUserId)
        .map((row) => createNotification({ ...payload, recipientId: row.user_id }))
    );
  } catch (err) {
    console.error("notifyAllByRole error:", err.message);
  }
};

module.exports = { createNotification, notifyAllByRole };