// backend\features\notifications\notificationService.js
const pool = require("../../config/database");
const admin = require("firebase-admin");

if (!admin.apps.length) {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    console.log('✅ Firebase init from environment variable');
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  } else {
    console.log('⚠️ Firebase init from local file');
    admin.initializeApp({
      credential: admin.credential.cert(
        require("../../firebase-service-account.json")
      ),
    });
  }
}

const sendPushNotification = async (fcmToken, title, message, linkTo = null) => {
  if (!fcmToken) return;
  try {
    const result = await admin.messaging().send({
  token: fcmToken,
  // notification: { title, body: message }, // ← FCM handles display when backgrounded
  data: { title, body: message, linkTo: linkTo || "" },
  
  apns: {
    payload: { aps: { sound: "default", badge: 1 } },
  },
});
    console.log('FCM send result:', result);
  } catch (err) {
    console.error("FCM send error:", err.message);
  }
};

const createNotification = async ({ recipientId, senderId = null, senderName = null, senderAvatar = null, type, title, message, linkTo = null }) => {
  try {
    await pool.query(
      `INSERT INTO notifications 
        (recipient_user_id, sender_user_id, sender_name, sender_avatar, type, title, message, link_to)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [recipientId, senderId, senderName, senderAvatar, type, title, message, linkTo]
    );

    // Send push notification if user has a token
    const userResult = await pool.query(
      `SELECT push_token FROM users WHERE user_id = $1`,
      [recipientId]
    );
    const pushToken = userResult.rows[0]?.push_token;
    if (pushToken) {
      await sendPushNotification(pushToken, title, message, linkTo);
    }
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

const getResponderForReferral = async (blotterId) => {
  try {
    const result = await pool.query(
      `SELECT sender_name, sender_user_id, created_at
       FROM notifications
       WHERE type = 'REFERRAL_RESPONDED' 
         AND link_to = $1
       ORDER BY created_at DESC LIMIT 1`,
      [`/e-blotter?referral=${blotterId}`]
    );
    return result.rows[0] || null;
  } catch {
    return null;
  }
};

// backend\features\notifications\notificationService.js

const getRespondersForReferrals = async (blotterIds) => {
  if (!blotterIds.length) return {};
  try {
    const result = await pool.query(
      `SELECT DISTINCT ON (n.link_to) 
         n.link_to, 
         n.sender_name, 
         n.sender_user_id, 
         n.created_at,
         u.first_name, 
         u.last_name, 
         u.profile_picture,
         pr.abbreviation AS rank_abbreviation
       FROM notifications n
       LEFT JOIN users u ON n.sender_user_id = u.user_id
       LEFT JOIN pnp_ranks pr ON u.rank_id = pr.rank_id
       WHERE n.type = 'REFERRAL_RESPONDED'
         AND n.link_to = ANY($1::text[])
       ORDER BY n.link_to, n.created_at DESC`,
      [blotterIds.map((id) => `/e-blotter?referral=${id}`)]
    );
    
    const map = {};
    for (const row of result.rows) {
      const match = row.link_to.match(/referral=(\d+)$/);
      if (match) {
        map[match[1]] = {
          sender_name: row.sender_name,
          sender_user_id: row.sender_user_id,
          first_name: row.first_name,
          last_name: row.last_name,
          profile_picture: row.profile_picture,
          rank_abbreviation: row.rank_abbreviation,
          created_at: row.created_at
        };
      }
    }
    return map;
  } catch (err) {
    console.error("getRespondersForReferrals error:", err.message);
    return {};
  }
};

module.exports = { 
  createNotification, 
  notifyAllByRole, 
  getResponderForReferral,
  getRespondersForReferrals,
};