const pool = require("../config/database");
const {
  notifyPatrolsForReferral,
  notifyAllByRole,
  getResponderForReferral,
} = require("../features/notifications/notificationService");

const PATROL_REMINDER_MINUTES = 15;
const ADMIN_REMINDER_MINUTES = 30;

const scheduleReferralReminders = (blotterId, blotterEntryNumber, barangay, patrolDelay = null, adminDelay = null) => {
  const patrolMs = patrolDelay ?? PATROL_REMINDER_MINUTES * 60 * 1000;
  const adminMs  = adminDelay  ?? ADMIN_REMINDER_MINUTES  * 60 * 1000;

  // ── 1st reminder: patrols ──
  setTimeout(async () => {
    try {
      const responder = await getResponderForReferral(blotterId);
      if (responder) return;

      const alreadySent = await pool.query(
        `SELECT 1 FROM notifications
         WHERE type = 'REFERRAL_AUTO_REMINDER' AND link_to = $1 LIMIT 1`,
        [`/e-blotter?referral=${blotterId}`]
      );
      if (alreadySent.rows.length > 0) return;

      await notifyPatrolsForReferral(barangay, {
        senderId: null,
        senderName: "B.A.N.T.A.Y System",
        type: "REFERRAL_AUTO_REMINDER",
        title: "Unresponded Referral",
        message: `Referral #${blotterEntryNumber} in Brgy. ${barangay} has had no response for 15 minutes.`,
        linkTo: `/e-blotter?referral=${blotterId}`,
      });
      console.log(`[ReminderJob] 15-min patrol reminder sent for ${blotterEntryNumber}`);
    } catch (err) {
      console.error("[ReminderJob] Patrol reminder error:", err.message);
    }
  }, patrolMs);

  // ── 2nd reminder: admins ──
  setTimeout(async () => {
    try {
      const responder = await getResponderForReferral(blotterId);
      if (responder) return;

      const alreadySent = await pool.query(
        `SELECT 1 FROM notifications
         WHERE type = 'REFERRAL_ADMIN_ESCALATION' AND link_to = $1 LIMIT 1`,
        [`/e-blotter?referral=${blotterId}`]
      );
      if (alreadySent.rows.length > 0) return;

      await notifyAllByRole(
        ["Administrator", "Technical Administrator"],
        {
          senderId: null,
          senderName: "B.A.N.T.A.Y System",
          type: "REFERRAL_ADMIN_ESCALATION",
          title: "Referral Needs Attention",
          message: `Referral #${blotterEntryNumber} in Brgy. ${barangay} still has no responder after 30 minutes. Please remind a patrol officer.`,
          linkTo: `/e-blotter?referral=${blotterId}`,
        },
        null
      );
      console.log(`[ReminderJob] 30-min admin escalation sent for ${blotterEntryNumber}`);
    } catch (err) {
      console.error("[ReminderJob] Admin escalation error:", err.message);
    }
  }, adminMs);

  console.log(`[ReminderJob] Reminders scheduled for referral ${blotterEntryNumber}`);
};

// Runs on server startup to recover referrals submitted during downtime
const recoverPendingReferrals = async () => {
  try {
    const now = new Date();
    const result = await pool.query(
      `SELECT blotter_id, blotter_entry_number, place_barangay, created_at
       FROM blotter_entries
       WHERE referred_by_barangay = true
         AND status = 'Pending'
         AND is_deleted = false
         AND created_at >= NOW() - INTERVAL '${ADMIN_REMINDER_MINUTES} minutes'`
    );

    for (const blotter of result.rows) {
      const ageMs      = now - new Date(blotter.created_at);
      const patrolDelay = (PATROL_REMINDER_MINUTES * 60 * 1000) - ageMs;
      const adminDelay  = (ADMIN_REMINDER_MINUTES  * 60 * 1000) - ageMs;

      scheduleReferralReminders(
        blotter.blotter_id,
        blotter.blotter_entry_number,
        blotter.place_barangay,
        patrolDelay > 0 ? patrolDelay : 0,
        adminDelay  > 0 ? adminDelay  : 0
      );
      console.log(`[ReminderJob] Recovered referral ${blotter.blotter_entry_number}`);
    }

    console.log(`[ReminderJob] Recovery complete — ${result.rows.length} referral(s) recovered`);
  } catch (err) {
    console.error("[ReminderJob] Recovery error:", err.message);
  }
};

module.exports = { scheduleReferralReminders, recoverPendingReferrals };