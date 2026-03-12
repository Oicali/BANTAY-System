// ================================================================================
// FILE: backend/features/user/controllers/emailVerificationController.js
// ================================================================================
// FIXES:
// 1. Added persistentLocks Map — OTP session locks survive clearSession()/logout/re-login.
//    getSession() re-hydrates lock values from persistentLocks on first access after
//    a session reset, so getEmailStatus() correctly returns sessionLocked even after
//    the user logs out and logs back in.
//
// 2. setLock() helper — writes lock to both the active session AND persistentLocks
//    atomically. Called everywhere a lock is set so it is always durable.
//
// 3. Added resetExpiredLock() — mirrors profileController's resetExpiredPwLock().
//    When an oldOtp or newOtp lock has expired, resets the resend counters so the
//    user gets a clean attempt window after the 15-min lockout ends.
//
// 4. Added forceLock() endpoint (POST /users/email/force-lock) — called by the
//    frontend timer when OTP expires with 0 resends left. Persists the lock to
//    backend so it survives logout (localStorage alone is not enough).
//
// 5. clearSession() now calls sessions.delete() so getSession() cleanly re-hydrates
//    from persistentLocks on next call, instead of sessions.set() with a blank object.
//
// 6. 60s resend cooldown bypassed when OTP attempts are exhausted (existing fix kept).
// ================================================================================
const crypto = require("crypto");
const bcrypt = require("bcrypt");
const pool   = require("../../../config/database");
const { sendOtpEmail, sendEmailChangedNotification } = require("../services/emailService");
const User   = require("../models/User");

// ── Constants ──────────────────────────────────────────────────────────────────
const OTP_EXPIRY_MS     = 2  * 60 * 1000;
const EMAIL_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const RESEND_WAIT_MS    = 60 * 1000;
const PW_MAX_ATTEMPTS   = 5;
const OTP_MAX_ATTEMPTS  = 3;
const MAX_RESENDS       = 3;
const PW_LOCKOUT_MS     = 15 * 60 * 1000;
const RESEND_WINDOW_MS  = 15 * 60 * 1000;
const SESSION_LOCK_MS   = 15 * 60 * 1000;

// ── In-memory session store ────────────────────────────────────────────────────
const sessions = new Map();

// ── Persistent lock store ─────────────────────────────────────────────────────
// Never deleted — survives clearSession(), logout, and re-login.
// Cleared only on successful email change or when resetExpiredLock detects expiry.
const persistentLocks = new Map();

function getPersistentLocks(userId) {
  const key = String(userId);
  if (!persistentLocks.has(key)) {
    persistentLocks.set(key, {
      oldOtpLockedUntil: null,
      newOtpLockedUntil: null,
      pwLockedUntil:     null,
    });
  }
  return persistentLocks.get(key);
}

// Write a lock to both the active session AND the persistent store atomically.
function setLock(userId, lockKey, value) {
  const key = String(userId);
  getPersistentLocks(key)[lockKey] = value;
  if (sessions.has(key)) {
    sessions.get(key)[lockKey] = value;
  }
}

// ── KEY FIX: Reset resend counters when a lock has expired ───────────────────
// Without this, oldOtpResends/newOtpResends stays at MAX_RESENDS after the lock
// expires, causing requestOldOtp/requestNewOtp to immediately re-lock.
function resetExpiredLock(userId, session, lockKey, resendsKey, windowStartKey, windowCountKey, attemptsKey) {
  if (session[lockKey] && Date.now() >= session[lockKey]) {
    session[lockKey]       = null;
    session[resendsKey]    = 0;
    session[windowStartKey] = null;
    if (windowCountKey) session[windowCountKey] = 0;
    if (attemptsKey)    session[attemptsKey]    = 0;
    setLock(userId, lockKey, null);
  }
}

function getSession(userId) {
  const key = String(userId);
  if (!sessions.has(key)) {
    const locks = getPersistentLocks(key);
    sessions.set(key, {
      pwAttempts: 0, pwLockedUntil: locks.pwLockedUntil, passwordVerified: false,
      oldOtp: null, oldOtpExpires: null, oldOtpAttempts: 0,
      oldOtpSentAt: null, oldOtpResends: 0, oldResendWindowStart: null,
      oldOtpLockedUntil: locks.oldOtpLockedUntil,
      oldEmailVerified: false,
      newEmail: null,
      newOtp: null, newOtpExpires: null, newOtpAttempts: 0,
      newOtpSentAt: null, newOtpResends: 0, newResendWindowStart: null,
      newOtpLockedUntil: locks.newOtpLockedUntil,
      verifiedEmail: null,
      changedAt: null,
    });
  }
  return sessions.get(key);
}

function clearSession(userId) {
  const key  = String(userId);
  const prev = sessions.get(key);
  const now  = Date.now();

  // Persist any still-active locks before wiping the session
  const locks = getPersistentLocks(key);
  if (prev?.oldOtpLockedUntil && prev.oldOtpLockedUntil > now) locks.oldOtpLockedUntil = prev.oldOtpLockedUntil;
  if (prev?.newOtpLockedUntil && prev.newOtpLockedUntil > now) locks.newOtpLockedUntil = prev.newOtpLockedUntil;
  if (prev?.pwLockedUntil     && prev.pwLockedUntil     > now) locks.pwLockedUntil     = prev.pwLockedUntil;

  // Delete entirely — next getSession() re-hydrates from persistentLocks
  sessions.delete(key);
}

function maskEmail(email) {
  if (!email) return "";
  const at = email.indexOf("@");
  if (at < 0) return email;
  const local  = email.slice(0, at);
  const domain = email.slice(at);
  if (local.length <= 2) return local[0] + "*" + domain;
  if (local.length <= 4) return local[0] + "*".repeat(local.length - 1) + domain;
  return local[0] + "*".repeat(local.length - 3) + local.slice(-2) + domain;
}

class EmailVerificationController {

  // ============================================================
  // STATUS CHECK — called when modal opens
  // GET /users/email/status
  // ============================================================
  static async getEmailStatus(req, res) {
    try {
      const userId = String(req.user.user_id);

      // Check 24h DB cooldown
      const user = await User.getUserById(userId);
      if (user?.email_changed_at) {
        const since = Date.now() - new Date(user.email_changed_at).getTime();
        if (since < EMAIL_COOLDOWN_MS) {
          const msLeft    = EMAIL_COOLDOWN_MS - since;
          const hoursLeft = Math.ceil(msLeft / 3_600_000);
          return res.json({ blocked: true, hoursLeft, msLeft });
        }
      }

      const session = getSession(userId);

      // Reset expired locks before checking them
      resetExpiredLock(userId, session, "oldOtpLockedUntil", "oldOtpResends", "oldResendWindowStart", null, "oldOtpAttempts");
      resetExpiredLock(userId, session, "newOtpLockedUntil", "newOtpResends", "newResendWindowStart", null, "newOtpAttempts");

      // Password lockout
      if (session.pwLockedUntil && Date.now() < session.pwLockedUntil) {
        const minsLeft = Math.ceil((session.pwLockedUntil - Date.now()) / 60_000);
        return res.json({ pwLocked: true, minsLeft });
      }

      // Full session lock
      const oldLock = session.oldOtpLockedUntil;
      const newLock = session.newOtpLockedUntil;
      const activeLock = (oldLock && Date.now() < oldLock) ? oldLock
                       : (newLock && Date.now() < newLock) ? newLock : null;
      if (activeLock) {
        const minsLeft = Math.ceil((activeLock - Date.now()) / 60_000);
        return res.json({ sessionLocked: true, minsLeft });
      }

      res.json({ blocked: false });
    } catch (err) {
      console.error("getEmailStatus error:", err);
      res.status(500).json({ blocked: false });
    }
  }

  // ============================================================
  // FORCE LOCK — called by frontend timer when OTP expires with 0 resends
  // POST /users/email/force-lock
  // Body: { which: "old" | "new" }
  // ============================================================
  static async forceLock(req, res) {
    try {
      const userId  = String(req.user.user_id);
      const which   = req.body.which;
      const session = getSession(userId);

      if (which === "old") {
        if (session.oldOtpResends >= MAX_RESENDS) {
          if (!session.oldOtpLockedUntil || Date.now() >= session.oldOtpLockedUntil) {
            setLock(userId, "oldOtpLockedUntil", Date.now() + SESSION_LOCK_MS);
          }
        }
      } else if (which === "new") {
        if (session.newOtpResends >= MAX_RESENDS) {
          if (!session.newOtpLockedUntil || Date.now() >= session.newOtpLockedUntil) {
            setLock(userId, "newOtpLockedUntil", Date.now() + SESSION_LOCK_MS);
          }
        }
      }

      res.json({ success: true });
    } catch (err) {
      console.error("forceLock error:", err);
      res.status(500).json({ success: false });
    }
  }

  // ============================================================
  // STEP 1 — Verify current password
  // POST /users/email/verify-password
  // ============================================================
  static async verifyPassword(req, res) {
    try {
      const userId   = String(req.user.user_id);
      const password = (req.body.password || "").trim();
      if (!password) return res.status(400).json({ success: false, message: "Password is required" });

      const session = getSession(userId);

      // Reset expired OTP locks before checking password lock
      resetExpiredLock(userId, session, "oldOtpLockedUntil", "oldOtpResends", "oldResendWindowStart", null, "oldOtpAttempts");
      resetExpiredLock(userId, session, "newOtpLockedUntil", "newOtpResends", "newResendWindowStart", null, "newOtpAttempts");

      // Password lockout
      if (session.pwLockedUntil && Date.now() < session.pwLockedUntil) {
        const minsLeft = Math.ceil((session.pwLockedUntil - Date.now()) / 60_000);
        return res.status(429).json({
          success: false, locked: true,
          message: `Too many incorrect attempts. Try again in ${minsLeft} minute${minsLeft === 1 ? "" : "s"}.`,
          minutesLeft: minsLeft,
        });
      }

      // 24h cooldown from DB
      const user = await User.getUserById(userId);
      if (!user) return res.status(404).json({ success: false, message: "User not found" });

      if (user.email_changed_at) {
        const since = Date.now() - new Date(user.email_changed_at).getTime();
        if (since < EMAIL_COOLDOWN_MS) {
          const hoursLeft = Math.ceil((EMAIL_COOLDOWN_MS - since) / 3_600_000);
          return res.status(429).json({
            success: false, cooldown: true,
            message: `You can only change your email once every 24 hours. Try again in ${hoursLeft} hour${hoursLeft === 1 ? "" : "s"}.`,
            hoursLeft,
          });
        }
      }

      const match = await bcrypt.compare(password, user.password);
      if (!match) {
        session.pwAttempts += 1;
        const attemptsLeft = PW_MAX_ATTEMPTS - session.pwAttempts;
        if (attemptsLeft <= 0) {
          const lockUntil = Date.now() + PW_LOCKOUT_MS;
          session.pwLockedUntil = lockUntil;
          session.pwAttempts    = 0;
          setLock(userId, "pwLockedUntil", lockUntil);
          return res.status(429).json({
            success: false, locked: true,
            message: "Too many incorrect attempts. Try again in 15 minutes.",
            minutesLeft: 15,
          });
        }
        return res.status(401).json({
          success: false,
          message: `Incorrect password — ${attemptsLeft} attempt${attemptsLeft === 1 ? "" : "s"} remaining`,
          attemptsLeft,
        });
      }

      session.pwAttempts    = 0;
      session.pwLockedUntil = null;
      setLock(userId, "pwLockedUntil", null);
      clearSession(userId);
      getSession(userId).passwordVerified = true;
      res.json({ success: true });
    } catch (err) {
      console.error("verifyPassword error:", err);
      res.status(500).json({ success: false, message: "Server error. Please try again." });
    }
  }

  // ============================================================
  // STEP 2 — Send OTP to current email
  // POST /users/email/request-old-otp
  // ============================================================
  static async requestOldOtp(req, res) {
    try {
      const userId  = String(req.user.user_id);
      const session = getSession(userId);

      if (!session.passwordVerified)
        return res.status(403).json({ success: false, message: "Please verify your password first" });

      // Reset expired lock before checking — gives clean attempt after 15 mins
      resetExpiredLock(userId, session, "oldOtpLockedUntil", "oldOtpResends", "oldResendWindowStart", null, "oldOtpAttempts");

      // Full session lock
      if (session.oldOtpLockedUntil && Date.now() < session.oldOtpLockedUntil) {
        const minsLeft = Math.ceil((session.oldOtpLockedUntil - Date.now()) / 60_000);
        return res.status(429).json({
          success: false, sessionLocked: true,
          message: `For security reasons, this process has been temporarily locked. Try again in ${minsLeft} minute${minsLeft === 1 ? "" : "s"}.`,
          minutesLeft: minsLeft,
        });
      }

      // Resend window: max MAX_RESENDS sends per RESEND_WINDOW_MS
      if (session.oldResendWindowStart && Date.now() - session.oldResendWindowStart < RESEND_WINDOW_MS) {
        if (session.oldOtpResends >= MAX_RESENDS) {
          const lockUntil = Date.now() + SESSION_LOCK_MS;
          setLock(userId, "oldOtpLockedUntil", lockUntil);
          return res.status(429).json({
            success: false, sessionLocked: true,
            message: `Maximum codes sent. For security, this process is locked for 15 minutes.`,
            minutesLeft: 15,
          });
        }
      } else {
        session.oldResendWindowStart = Date.now();
        session.oldOtpResends        = 0;
      }

      // 60s cooldown — bypassed when OTP attempts are exhausted
      const attemptsExhausted = session.oldOtpAttempts >= OTP_MAX_ATTEMPTS;
      if (!attemptsExhausted &&
          session.oldOtpSentAt &&
          Date.now() - session.oldOtpSentAt < RESEND_WAIT_MS) {
        const wait = Math.ceil((RESEND_WAIT_MS - (Date.now() - session.oldOtpSentAt)) / 1000);
        return res.status(429).json({
          success: false, resendLocked: true,
          message: `Please wait ${wait}s before resending`,
          waitSeconds: wait,
        });
      }

      const row = await pool.query("SELECT email FROM users WHERE user_id = $1", [req.user.user_id]);
      const currentEmail = row.rows[0]?.email;
      if (!currentEmail) return res.status(400).json({ success: false, message: "No email address on file" });

      const otp = crypto.randomInt(100000, 999999).toString();
      session.oldOtp           = otp;
      session.oldOtpExpires    = Date.now() + OTP_EXPIRY_MS;
      session.oldOtpSentAt     = Date.now();
      session.oldOtpAttempts   = 0;
      session.oldOtpResends   += 1;
      session.oldEmailVerified = false;

      const result = await sendOtpEmail(currentEmail, otp, "current");
      if (!result.success) {
        session.oldOtpResends -= 1;
        return res.status(500).json({ success: false, message: "Failed to send code. Please try again." });
      }

      res.json({
        success: true,
        maskedEmail: maskEmail(currentEmail),
        resendsLeft: MAX_RESENDS - session.oldOtpResends,
        otpExpiresAt: session.oldOtpExpires,
      });
    } catch (err) {
      console.error("requestOldOtp error:", err);
      res.status(500).json({ success: false, message: "Server error. Please try again." });
    }
  }

  // ============================================================
  // STEP 3 — Verify OTP from current email
  // POST /users/email/verify-old-otp
  // ============================================================
  static async verifyOldOtp(req, res) {
    try {
      const userId    = String(req.user.user_id);
      const session   = getSession(userId);
      const submitted = (req.body.otp || "").trim();

      if (!session.passwordVerified)
        return res.status(403).json({ success: false, message: "Please verify your password first" });

      // Reset expired lock before checking
      resetExpiredLock(userId, session, "oldOtpLockedUntil", "oldOtpResends", "oldResendWindowStart", null, "oldOtpAttempts");

      // Full session lock
      if (session.oldOtpLockedUntil && Date.now() < session.oldOtpLockedUntil) {
        const minsLeft = Math.ceil((session.oldOtpLockedUntil - Date.now()) / 60_000);
        return res.status(429).json({
          success: false, sessionLocked: true,
          message: `For security reasons, this process has been temporarily locked. Try again in ${minsLeft} minute${minsLeft === 1 ? "" : "s"}.`,
          minutesLeft: minsLeft,
        });
      }

      if (!session.oldOtp)
        return res.status(400).json({ success: false, expired: true, message: "No code pending — request a new one" });

      if (Date.now() > session.oldOtpExpires) {
        session.oldOtp = null;
        return res.status(400).json({ success: false, expired: true, message: "Code expired — request a new one" });
      }

      session.oldOtpAttempts += 1;

      if (submitted !== session.oldOtp) {
        const attemptsLeft = OTP_MAX_ATTEMPTS - session.oldOtpAttempts;

        if (attemptsLeft <= 0) {
          const resendsExhausted = session.oldOtpResends >= MAX_RESENDS;
          if (resendsExhausted) {
            const lockUntil = Date.now() + SESSION_LOCK_MS;
            setLock(userId, "oldOtpLockedUntil", lockUntil);
            return res.status(429).json({
              success: false, sessionLocked: true,
              message: "For security reasons, this process has been temporarily locked. Please try again after 15 minutes.",
              minutesLeft: 15,
            });
          }
          return res.status(429).json({
            success: false, attemptLocked: true,
            message: "Too many incorrect attempts. Please request a new code.",
            attemptsLeft: 0,
          });
        }

        return res.status(400).json({
          success: false,
          message: `Incorrect code — ${attemptsLeft} attempt${attemptsLeft === 1 ? "" : "s"} remaining`,
          attemptsLeft,
        });
      }

      session.oldOtp = null;
      session.oldEmailVerified = true;
      res.json({ success: true });
    } catch (err) {
      console.error("verifyOldOtp error:", err);
      res.status(500).json({ success: false, message: "Server error. Please try again." });
    }
  }

  // ============================================================
  // STEP 4 — Send OTP to new email
  // POST /users/email/request-new-otp
  // ============================================================
  static async requestNewOtp(req, res) {
    try {
      const userId   = String(req.user.user_id);
      const session  = getSession(userId);
      const newEmail = (req.body.newEmail || "").trim().toLowerCase();

      if (!session.passwordVerified || !session.oldEmailVerified)
        return res.status(403).json({ success: false, message: "Please complete the previous steps first" });

      if (!newEmail)
        return res.status(400).json({ success: false, message: "New email is required" });

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail))
        return res.status(400).json({ success: false, message: "Invalid email format" });

      // Reset expired lock before checking — gives clean attempt after 15 mins
      resetExpiredLock(userId, session, "newOtpLockedUntil", "newOtpResends", "newResendWindowStart", null, "newOtpAttempts");

      // Full session lock
      if (session.newOtpLockedUntil && Date.now() < session.newOtpLockedUntil) {
        const minsLeft = Math.ceil((session.newOtpLockedUntil - Date.now()) / 60_000);
        return res.status(429).json({
          success: false, sessionLocked: true,
          message: `For security reasons, this process has been temporarily locked. Try again in ${minsLeft} minute${minsLeft === 1 ? "" : "s"}.`,
          minutesLeft: minsLeft,
        });
      }

      // Reset counters when email address changes
      if (newEmail !== session.newEmail) {
        session.newOtpResends        = 0;
        session.newResendWindowStart = null;
        session.newOtpAttempts       = 0;
        session.newOtpLockedUntil    = null;
      }

      // Resend window
      if (session.newResendWindowStart && Date.now() - session.newResendWindowStart < RESEND_WINDOW_MS) {
        if (session.newOtpResends >= MAX_RESENDS) {
          const lockUntil = Date.now() + SESSION_LOCK_MS;
          setLock(userId, "newOtpLockedUntil", lockUntil);
          return res.status(429).json({
            success: false, sessionLocked: true,
            message: "Maximum codes sent. For security, this process is locked for 15 minutes.",
            minutesLeft: 15,
          });
        }
      } else {
        session.newResendWindowStart = Date.now();
        session.newOtpResends        = 0;
      }

      // Must differ from current
      const row = await pool.query("SELECT email FROM users WHERE user_id = $1", [req.user.user_id]);
      if (row.rows[0]?.email?.toLowerCase() === newEmail)
        return res.status(400).json({ success: false, message: "New email must be different from your current email" });

      // Must not be taken
      const taken = await pool.query(
        "SELECT user_id FROM users WHERE LOWER(email) = $1 AND user_id != $2",
        [newEmail, req.user.user_id]
      );
      if (taken.rows.length > 0)
        return res.status(409).json({ success: false, message: "This email is already registered to another account" });

      // 60s cooldown — bypassed when OTP attempts are exhausted
      const attemptsExhausted = session.newOtpAttempts >= OTP_MAX_ATTEMPTS;
      if (!attemptsExhausted &&
          session.newOtpSentAt &&
          newEmail === session.newEmail &&
          Date.now() - session.newOtpSentAt < RESEND_WAIT_MS) {
        const wait = Math.ceil((RESEND_WAIT_MS - (Date.now() - session.newOtpSentAt)) / 1000);
        return res.status(429).json({
          success: false, resendLocked: true,
          message: `Please wait ${wait}s before resending`,
          waitSeconds: wait,
        });
      }

      const otp = crypto.randomInt(100000, 999999).toString();
      session.newEmail       = newEmail;
      session.newOtp         = otp;
      session.newOtpExpires  = Date.now() + OTP_EXPIRY_MS;
      session.newOtpSentAt   = Date.now();
      session.newOtpAttempts = 0;
      session.newOtpResends += 1;
      session.verifiedEmail  = null;

      const result = await sendOtpEmail(newEmail, otp, "new");
      if (!result.success) {
        session.newOtpResends -= 1;
        return res.status(500).json({ success: false, message: "Failed to send code. Please try again." });
      }

      res.json({
        success: true,
        maskedEmail: maskEmail(newEmail),
        resendsLeft: MAX_RESENDS - session.newOtpResends,
        otpExpiresAt: session.newOtpExpires,
      });
    } catch (err) {
      console.error("requestNewOtp error:", err);
      res.status(500).json({ success: false, message: "Server error. Please try again." });
    }
  }

  // ============================================================
  // STEP 5 — Verify OTP from new email
  // POST /users/email/verify-new-otp
  // ============================================================
  static async verifyNewOtp(req, res) {
    try {
      const userId    = String(req.user.user_id);
      const session   = getSession(userId);
      const submitted = (req.body.otp || "").trim();

      if (!session.passwordVerified || !session.oldEmailVerified)
        return res.status(403).json({ success: false, message: "Please complete the previous steps first" });

      // Reset expired lock before checking
      resetExpiredLock(userId, session, "newOtpLockedUntil", "newOtpResends", "newResendWindowStart", null, "newOtpAttempts");

      // Full session lock
      if (session.newOtpLockedUntil && Date.now() < session.newOtpLockedUntil) {
        const minsLeft = Math.ceil((session.newOtpLockedUntil - Date.now()) / 60_000);
        return res.status(429).json({
          success: false, sessionLocked: true,
          message: `For security reasons, this process has been temporarily locked. Try again in ${minsLeft} minute${minsLeft === 1 ? "" : "s"}.`,
          minutesLeft: minsLeft,
        });
      }

      if (!session.newOtp)
        return res.status(400).json({ success: false, expired: true, message: "No code pending — request a new one" });

      if (Date.now() > session.newOtpExpires) {
        session.newOtp = null;
        return res.status(400).json({ success: false, expired: true, message: "Code expired — request a new one" });
      }

      session.newOtpAttempts += 1;

      if (submitted !== session.newOtp) {
        const attemptsLeft = OTP_MAX_ATTEMPTS - session.newOtpAttempts;

        if (attemptsLeft <= 0) {
          const resendsExhausted = session.newOtpResends >= MAX_RESENDS;
          if (resendsExhausted) {
            const lockUntil = Date.now() + SESSION_LOCK_MS;
            setLock(userId, "newOtpLockedUntil", lockUntil);
            return res.status(429).json({
              success: false, sessionLocked: true,
              message: "For security reasons, this process has been temporarily locked. Please try again after 15 minutes.",
              minutesLeft: 15,
            });
          }
          return res.status(429).json({
            success: false, attemptLocked: true,
            message: "Too many incorrect attempts. Please request a new code.",
            attemptsLeft: 0,
          });
        }

        return res.status(400).json({
          success: false,
          message: `Incorrect code — ${attemptsLeft} attempt${attemptsLeft === 1 ? "" : "s"} remaining`,
          attemptsLeft,
        });
      }

      const verifiedEmail   = session.newEmail;
      session.newOtp        = null;
      session.verifiedEmail = verifiedEmail;
      res.json({ success: true, verifiedEmail });
    } catch (err) {
      console.error("verifyNewOtp error:", err);
      res.status(500).json({ success: false, message: "Server error. Please try again." });
    }
  }

  // ── Called by profileController after successful email save ───────────────
  static async consumeSession(userId) {
    const session  = sessions.get(String(userId));
    const oldEmail = session?._oldEmailForNotification || null;
    const newEmail = session?.verifiedEmail || null;

    // Clear persistent locks on successful email change
    const locks = getPersistentLocks(String(userId));
    locks.oldOtpLockedUntil = null;
    locks.newOtpLockedUntil = null;
    locks.pwLockedUntil     = null;

    clearSession(String(userId));
    await User.updateEmailChangedAt(userId);

    if (oldEmail && newEmail) {
      sendEmailChangedNotification(oldEmail, newEmail).catch(() => {});
    }
  }

  static getVerifiedEmail(userId) {
    return sessions.get(String(userId))?.verifiedEmail || null;
  }

  static setOldEmailForNotification(userId, email) {
    const session = getSession(String(userId));
    session._oldEmailForNotification = email;
  }
}

module.exports = EmailVerificationController;