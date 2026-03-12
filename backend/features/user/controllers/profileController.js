// ================================================================================
// FILE: backend/features/user/controllers/profileController.js
// ================================================================================
// FIXES:
// 1. BUG: After a 15-min OTP lock expires, resendCount was still = 3 (PW_MAX_RESENDS).
//    requestPasswordOtp immediately re-locked because resendCount >= PW_MAX_RESENDS.
//    FIX: Added resetExpiredPwLock() — called at the top of every endpoint that
//    checks the lock. When lockedUntil has passed, it clears the lock AND resets
//    resendCount/resendWindowCount/resendWindowStart/attempts so the user gets a
//    clean session after the lockout period ends.
//
// 2. pwPersistentLocks Map — password OTP lock survives logout/re-login.
//    getPwSession() re-hydrates lockedUntil from persistent store on first access.
//
// 3. forcePasswordLock() endpoint — called by frontend timer when OTP expires
//    with 0 resends left. Persists the lock to backend so it survives logout.
//
// 4. setPwLock() helper keeps active session and persistent store in sync.
// ================================================================================

const User = require("../models/User");
const ProfileValidator = require("../validators/profileValidator");
const bcrypt = require("bcrypt");
const tokenManager = require("../../../shared/utils/tokenManager");
const cloudinary = require("../../../config/cloudinary");
const EmailVerificationController = require("./emailVerificationController");
const { sendPasswordOtpEmail, sendPasswordChangedNotification } = require("../services/emailService");
const crypto = require("crypto");
const pool   = require("../../../config/database");

// ── Password-change OTP store ─────────────────────────────────────────────────
const pwOtpStore = new Map();

const PW_OTP_EXPIRY        = 2  * 60 * 1000;
const PW_MAX_OTP_ATTEMPTS  = 3;
const PW_MAX_RESENDS       = 3;
const PW_OTP_LOCKOUT_MS    = 15 * 60 * 1000;
const PW_MAX_CHANGES       = 2;
const PW_WINDOW_MS         = 24 * 60 * 60 * 1000;
const PW_RESEND_WINDOW_MS  = 15 * 60 * 1000;

// ── Current-password attempt tracking ────────────────────────────────────────
const pwCurrentAttemptStore = new Map();
const PW_MAX_CURRENT_ATTEMPTS = 5;
const PW_CURRENT_LOCKOUT_MS   = 15 * 60 * 1000;

// ── Persistent lock store for password OTP ────────────────────────────────────
// Survives pwOtpStore session resets (modal close, logout, re-login).
// Only cleared on successful password change or when resetExpiredPwLock detects expiry.
const pwPersistentLocks = new Map();

function getPwPersistentLocks(userId) {
  const key = String(userId);
  if (!pwPersistentLocks.has(key)) {
    pwPersistentLocks.set(key, { lockedUntil: null });
  }
  return pwPersistentLocks.get(key);
}

// Write lock to both active session AND persistent store atomically.
function setPwLock(userId, value) {
  const key = String(userId);
  getPwPersistentLocks(key).lockedUntil = value;
  if (pwOtpStore.has(key)) {
    pwOtpStore.get(key).lockedUntil = value;
  }
}

// ── KEY FIX: Reset session counters when the lock period has expired ──────────
// Without this, resendCount stays at PW_MAX_RESENDS after the lock expires,
// causing requestPasswordOtp to immediately re-lock the user on their next attempt.
function resetExpiredPwLock(userId, session) {
  if (session.lockedUntil && Date.now() >= session.lockedUntil) {
    session.lockedUntil       = null;
    session.resendCount       = 0;
    session.resendWindowCount = 0;
    session.resendWindowStart = null;
    session.attempts          = 0;
    setPwLock(userId, null);
  }
}

function getPwCurrentAttemptSession(userId) {
  const key = String(userId);
  if (!pwCurrentAttemptStore.has(key)) {
    pwCurrentAttemptStore.set(key, { attempts: 0, lockedUntil: null });
  }
  return pwCurrentAttemptStore.get(key);
}

function getPwSession(userId) {
  const key = String(userId);
  if (!pwOtpStore.has(key)) {
    const persistedLock = getPwPersistentLocks(key).lockedUntil;
    pwOtpStore.set(key, {
      otp: null, hashedPassword: null,
      expiresAt: null, sentAt: null,
      attempts: 0,
      resendCount: 0,
      lockedUntil: persistedLock,
      resendWindowStart: null, resendWindowCount: 0,
      changeCount: 0, windowStart: null,
    });
  }
  return pwOtpStore.get(key);
}

// ── PASSWORD CHANGE COUNT: DB-backed (survives server restarts) ───────────────
// Uses two columns on the users table:
//   pw_change_count   INTEGER  DEFAULT 0
//   pw_window_start   BIGINT   DEFAULT NULL   (epoch ms of first change in window)
//
// SQL to add columns (run once):
//   ALTER TABLE users ADD COLUMN IF NOT EXISTS pw_change_count INTEGER NOT NULL DEFAULT 0;
//   ALTER TABLE users ADD COLUMN IF NOT EXISTS pw_window_start BIGINT DEFAULT NULL;
//
// getDbChangeCount(userId) — returns { changeCount, windowStart } from DB.
// incrementDbChangeCount(userId) — atomically increments, sets windowStart if null.
// resetDbChangeCountIfExpired(userId) — resets if window > 24h old.
async function getDbChangeCount(userId) {
  try {
    const { rows } = await pool.query(
      "SELECT pw_change_count, pw_window_start FROM users WHERE user_id = $1",
      [userId]
    );
    if (!rows[0]) return { changeCount: 0, windowStart: null };
    const windowStart = rows[0].pw_window_start ? Number(rows[0].pw_window_start) : null;
    const changeCount = rows[0].pw_change_count || 0;
    return { changeCount, windowStart };
  } catch { return { changeCount: 0, windowStart: null }; }
}

async function resetDbChangeCountIfExpired(userId) {
  try {
    const { rows } = await pool.query(
      "SELECT pw_window_start, pw_change_count FROM users WHERE user_id = $1",
      [userId]
    );
    if (!rows[0]) return;
    const ws = rows[0].pw_window_start ? Number(rows[0].pw_window_start) : null;
    if (ws && Date.now() - ws >= PW_WINDOW_MS) {
      await pool.query(
        "UPDATE users SET pw_change_count = 0, pw_window_start = NULL WHERE user_id = $1",
        [userId]
      );
    }
  } catch {}
}

async function incrementDbChangeCount(userId) {
  try {
    // Set windowStart only if it's NULL (first change in this window)
    await pool.query(
      `UPDATE users
       SET pw_change_count  = pw_change_count + 1,
           pw_window_start  = COALESCE(pw_window_start, $2::BIGINT)
       WHERE user_id = $1`,
      [userId, Date.now()]
    );
  } catch (e) { console.error("incrementDbChangeCount error:", e); }
}

function resetPwOtp(session) {
  session.otp            = null;
  session.hashedPassword = null;
  session.expiresAt      = null;
  session.sentAt         = null;
  session.attempts       = 0;
}


class ProfileController {

  static async getProfile(req, res) {
    try {
      const userId = req.user.user_id;
      const profile = await User.getProfile(userId);
      if (!profile) {
        return res.status(404).json({ success: false, message: "Profile not found" });
      }
      res.json({ success: true, user: profile });
    } catch (error) {
      console.error("Get profile error:", error);
      res.status(500).json({ success: false, message: "Failed to fetch profile", error: error.message });
    }
  }

  static async checkPhoneAvailability(req, res) {
    try {
      const { phone, excludeCurrent } = req.body;
      const userId = req.user.user_id;
      if (!phone) {
        return res.status(400).json({ success: false, message: "Phone number is required" });
      }
      const excludeUserId = excludeCurrent ? userId : null;
      const isAvailable = await User.checkPhoneAvailability(phone, excludeUserId);
      res.json({ available: isAvailable });
    } catch (error) {
      console.error("Check phone error:", error);
      res.status(500).json({ success: false, message: "Error checking phone availability" });
    }
  }

  static async uploadProfilePicture(req, res) {
    try {
      const userId = req.user.user_id;
      if (!req.file) {
        return res.status(400).json({ success: false, message: "No image file provided" });
      }
      const result = await new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream(
          { public_id: `${userId}`, overwrite: true, folder: "profiles", resource_type: "image" },
          (error, result) => { if (error) reject(error); else resolve(result); }
        ).end(req.file.buffer);
      });
      const profile_picture = result.secure_url;
      await User.updateProfilePicture(userId, profile_picture);
      res.json({ success: true, message: "Profile picture updated successfully", profile_picture });
    } catch (error) {
      console.error("Upload profile picture error:", error);
      res.status(500).json({ success: false, message: "Failed to upload profile picture", error: error.message });
    }
  }

  static async updateProfile(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.user_id;

      if (String(userId) !== String(id)) {
        return res.status(403).json({ success: false, message: "You can only update your own profile" });
      }

      const clean = (v) => (typeof v === "string" ? v.trim() : v) || null;

      const first_name        = clean(req.body.first_name);
      const last_name         = clean(req.body.last_name);
      const middle_name       = clean(req.body.middle_name);
      const suffix            = clean(req.body.suffix);
      const gender            = clean(req.body.gender);
      const phone             = clean(req.body.phone);
      const alternate_phone   = clean(req.body.alternate_phone);
      const region_code       = clean(req.body.region_code);
      const province_code     = clean(req.body.province_code);
      const municipality_code = clean(req.body.municipality_code);
      const barangay_code     = clean(req.body.barangay_code);
      const address_line      = clean(req.body.address_line);

      const sessionVerifiedEmail = EmailVerificationController.getVerifiedEmail(req.user.user_id);
      const email = sessionVerifiedEmail || null;

      if (email) {
        const currentUser = await User.getUserById(userId);
        if (currentUser?.email) {
          EmailVerificationController.setOldEmailForNotification(req.user.user_id, currentUser.email);
        }
      }

      const validation = ProfileValidator.validateProfileUpdate({
        first_name, last_name, middle_name, suffix, gender,
        phone, alternate_phone,
        region_code, province_code, municipality_code, barangay_code, address_line,
      });

      if (!validation.isValid) {
        return res.status(400).json({ success: false, message: "Validation failed", errors: validation.errors });
      }

      if (phone) {
        const phoneAvailable = await User.checkPhoneAvailability(phone, userId);
        if (!phoneAvailable) {
          return res.status(400).json({ success: false, message: "Phone number is already registered to another user" });
        }
      }
      if (alternate_phone) {
        const altPhoneAvailable = await User.checkPhoneAvailability(alternate_phone, userId);
        if (!altPhoneAvailable) {
          return res.status(400).json({ success: false, message: "Alternate phone number is already registered to another user" });
        }
      }

      const updatedUser = await User.updateProfile(userId, {
        first_name, last_name, middle_name, suffix, gender,
        phone, alternate_phone, email,
        region_code, province_code, municipality_code, barangay_code, address_line,
      });

      if (!updatedUser) {
        return res.status(404).json({ success: false, message: "User not found" });
      }

      if (email) {
        await EmailVerificationController.consumeSession(userId);
      }

      const freshProfile = await User.getProfile(userId);
      res.json({ success: true, message: "Profile updated successfully", user: freshProfile });

    } catch (error) {
      console.error("Update profile error:", error);
      if (error.code === "23505") {
        if (error.constraint && error.constraint.includes("phone")) {
          return res.status(400).json({ success: false, message: "Phone number is already registered to another user" });
        }
      }
      res.status(500).json({ success: false, message: "Failed to update profile", error: error.message });
    }
  }

  static async changePassword(req, res) {
    try {
      const userId = req.user.user_id;
      let { currentPassword, newPassword, confirmPassword } = req.body;
      currentPassword = currentPassword?.trim();
      newPassword = newPassword?.trim();
      confirmPassword = confirmPassword?.trim();

      const validation = ProfileValidator.validatePasswordChange({ currentPassword, newPassword, confirmPassword });
      if (!validation.isValid) {
        return res.status(400).json({ success: false, message: "Validation failed", errors: validation.errors });
      }

      const user = await User.getUserById(userId);
      if (!user) return res.status(404).json({ success: false, message: "User not found" });
      if (user.status === "deactivated") return res.status(403).json({ success: false, message: "Account is deactivated" });

      const validPassword = await bcrypt.compare(currentPassword, user.password);
      if (!validPassword) return res.status(401).json({ success: false, message: "Current password is incorrect" });

      const isSamePassword = await bcrypt.compare(newPassword, user.password);
      if (isSamePassword) return res.status(400).json({ success: false, message: "New password cannot be the same as the current password" });

      const hashedPassword = await bcrypt.hash(newPassword, 12);
      await User.updatePassword(userId, hashedPassword);
      await tokenManager.revokeAllUserTokens(userId);

      res.json({ success: true, message: "Password changed successfully. Please login again with your new password." });
    } catch (error) {
      console.error("Change password error:", error);
      res.status(500).json({ success: false, message: "Failed to change password", error: error.message });
    }
  }

  static async uploadProfilePictureForUser(req, res) {
    try {
      const { userId } = req.params;
      if (!req.file) return res.status(400).json({ success: false, message: "No image file provided" });

      const result = await new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream(
          { public_id: `${userId}`, overwrite: true, folder: "profiles", resource_type: "image" },
          (error, result) => { if (error) reject(error); else resolve(result); }
        ).end(req.file.buffer);
      });

      const profile_picture = result.secure_url;
      await User.updateProfilePicture(userId, profile_picture);
      res.json({ success: true, message: "Profile picture updated successfully", profile_picture });
    } catch (error) {
      console.error("Upload profile picture for user error:", error);
      res.status(500).json({ success: false, message: "Failed to upload profile picture", error: error.message });
    }
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // PASSWORD CHANGE WITH OTP
  // ═════════════════════════════════════════════════════════════════════════════

  static async getPasswordStatus(req, res) {
    try {
      const userId = String(req.user.user_id);

      // FIX: Use DB-backed change count so the 24h limit survives server restarts.
      // In-memory session.changeCount resets to 0 on every restart, which let users
      // bypass the 2-changes-per-24h limit after a server re-run.
      await resetDbChangeCountIfExpired(userId);
      const { changeCount, windowStart } = await getDbChangeCount(userId);

      if (windowStart && Date.now() - windowStart < PW_WINDOW_MS) {
        if (changeCount >= PW_MAX_CHANGES) {
          const msLeft    = PW_WINDOW_MS - (Date.now() - windowStart);
          const hoursLeft = Math.ceil(msLeft / 3_600_000);
          return res.json({ blocked: true, hoursLeft, msLeft });
        }
      }

      const session = getPwSession(userId);
      // Reset counters if lock has expired before checking it
      resetExpiredPwLock(userId, session);

      if (session.lockedUntil && Date.now() < session.lockedUntil) {
        const minsLeft = Math.ceil((session.lockedUntil - Date.now()) / 60_000);
        return res.json({ blocked: false, sessionLocked: true, minsLeft });
      }

      const attemptSession = getPwCurrentAttemptSession(userId);
      if (attemptSession.lockedUntil && Date.now() < attemptSession.lockedUntil) {
        const minsLeft = Math.ceil((attemptSession.lockedUntil - Date.now()) / 60_000);
        return res.json({ blocked: false, pwLocked: true, minsLeft });
      }

      res.json({ blocked: false });
    } catch (err) {
      console.error("getPasswordStatus error:", err);
      res.status(500).json({ blocked: false });
    }
  }

  // POST /users/password/force-lock
  static async forcePasswordLock(req, res) {
    try {
      const userId  = String(req.user.user_id);
      const session = getPwSession(userId);

      if (session.resendCount >= PW_MAX_RESENDS) {
        if (!session.lockedUntil || Date.now() >= session.lockedUntil) {
          setPwLock(userId, Date.now() + PW_OTP_LOCKOUT_MS);
        }
      }

      res.json({ success: true });
    } catch (err) {
      console.error("forcePasswordLock error:", err);
      res.status(500).json({ success: false });
    }
  }

  static async verifyCurrentPassword(req, res) {
    try {
      const userId = String(req.user.user_id);
      const currentPassword = (req.body.currentPassword || "").trim();

      if (!currentPassword) {
        return res.status(400).json({ success: false, message: "Current password is required" });
      }

      const session = getPwSession(userId);
      // Reset counters if the OTP lock from a previous attempt has expired
      resetExpiredPwLock(userId, session);

      // FIX: Check DB-backed change count (survives server restarts)
      await resetDbChangeCountIfExpired(userId);
      const { changeCount: dbCount, windowStart: dbWindowStart } = await getDbChangeCount(userId);
      if (dbWindowStart && Date.now() - dbWindowStart < PW_WINDOW_MS) {
        if (dbCount >= PW_MAX_CHANGES) {
          const msLeft    = PW_WINDOW_MS - (Date.now() - dbWindowStart);
          const hoursLeft = Math.ceil(msLeft / 3_600_000);
          return res.status(429).json({
            success: false, blocked: true, rateLimited: true,
            message: `You've already changed your password twice today. You can update it again after 24 hours.`,
            hoursLeft, msLeft,
          });
        }
      }

      const attemptSession = getPwCurrentAttemptSession(userId);

      const user = await User.getUserById(userId);
      if (!user) return res.status(404).json({ success: false, message: "User not found" });
      if (user.status === "deactivated") return res.status(403).json({ success: false, message: "Account is deactivated" });

      const valid = await bcrypt.compare(currentPassword, user.password);
      if (!valid) {
        attemptSession.attempts += 1;
        const attemptsLeft = PW_MAX_CURRENT_ATTEMPTS - attemptSession.attempts;

        if (attemptsLeft <= 0) {
          attemptSession.lockedUntil = Date.now() + PW_CURRENT_LOCKOUT_MS;
          attemptSession.attempts    = 0;
          return res.status(401).json({
            success: false, locked: true,
            message: "Too many incorrect attempts. Your account is locked for 15 minutes.",
            attemptsLeft: 0,
            minutesLeft: 15,
          });
        }

        return res.status(401).json({
          success: false,
          message: `Incorrect password — ${attemptsLeft} attempt${attemptsLeft === 1 ? "" : "s"} remaining`,
          attemptsLeft,
        });
      }

      attemptSession.attempts    = 0;
      attemptSession.lockedUntil = null;
      res.json({ success: true });
    } catch (err) {
      console.error("verifyCurrentPassword error:", err);
      res.status(500).json({ success: false, message: "Server error. Please try again." });
    }
  }

  static async requestPasswordOtp(req, res) {
    try {
      const userId = req.user.user_id;
      let { currentPassword, newPassword, confirmPassword } = req.body;
      currentPassword = currentPassword?.trim();
      newPassword     = newPassword?.trim();
      confirmPassword = confirmPassword?.trim();

      const session = getPwSession(userId);
      // KEY FIX: Reset session counters when the previous lock has expired
      resetExpiredPwLock(userId, session);

      // FIX: Use DB-backed 24h rate limit (survives server restarts)
      await resetDbChangeCountIfExpired(userId);
      const { changeCount: dbCount, windowStart: dbWindowStart } = await getDbChangeCount(userId);
      if (dbWindowStart && Date.now() - dbWindowStart < PW_WINDOW_MS) {
        if (dbCount >= PW_MAX_CHANGES) {
          const msLeft    = PW_WINDOW_MS - (Date.now() - dbWindowStart);
          const hoursLeft = Math.ceil(msLeft / 3_600_000);
          return res.status(429).json({
            success: false, blocked: true, rateLimited: true,
            message: `You've already changed your password twice today. You can update it again after 24 hours.`,
            hoursLeft, msLeft,
          });
        }
      }

      // OTP session lockout (only active locks — expired ones already cleared above)
      if (session.lockedUntil && Date.now() < session.lockedUntil) {
        const minsLeft = Math.ceil((session.lockedUntil - Date.now()) / 60_000);
        return res.status(429).json({
          success: false, sessionLocked: true,
          message: `Too many failed attempts. Try again in ${minsLeft} minute${minsLeft === 1 ? "" : "s"}.`,
          minutesLeft: minsLeft,
        });
      }

      // Lifetime resend limit
      if (session.resendCount >= PW_MAX_RESENDS) {
        const lockUntil = Date.now() + PW_OTP_LOCKOUT_MS;
        setPwLock(userId, lockUntil);
        return res.status(429).json({
          success: false, sessionLocked: true,
          message: `Maximum codes sent. For security, this process is locked for 15 minutes.`,
          minutesLeft: 15,
        });
      }

      // Sliding window rate-limit
      if (session.resendWindowStart && Date.now() - session.resendWindowStart < PW_RESEND_WINDOW_MS) {
        if (session.resendWindowCount >= PW_MAX_RESENDS) {
          const lockUntil = Date.now() + PW_OTP_LOCKOUT_MS;
          setPwLock(userId, lockUntil);
          return res.status(429).json({
            success: false, sessionLocked: true,
            message: `Maximum codes sent. For security, this process is locked for 15 minutes.`,
            minutesLeft: 15,
          });
        }
      } else {
        session.resendWindowStart = Date.now();
        session.resendWindowCount = 0;
      }

      const user = await User.getUserById(userId);
      if (!user) return res.status(404).json({ success: false, message: "User not found" });
      if (user.status === "deactivated") return res.status(403).json({ success: false, message: "Account is deactivated" });

      const validPassword = await bcrypt.compare(currentPassword, user.password);
      if (!validPassword) {
        return res.status(401).json({ success: false, message: "Current password is incorrect. Please go back and re-enter it." });
      }

      const validation = ProfileValidator.validatePasswordChange({ currentPassword, newPassword, confirmPassword });
      if (!validation.isValid) {
        return res.status(400).json({ success: false, message: "Validation failed", errors: validation.errors });
      }

      const isSame = await bcrypt.compare(newPassword, user.password);
      if (isSame) return res.status(400).json({ success: false, message: "New password cannot be the same as current password" });

      const profileRow = await pool.query("SELECT email, first_name FROM users WHERE user_id = $1", [userId]);
      const { email, first_name } = profileRow.rows[0] || {};
      if (!email) return res.status(400).json({ success: false, message: "No email address on file" });

      const otp            = crypto.randomInt(100000, 999999).toString();
      const hashedPassword = await bcrypt.hash(newPassword, 12);

      session.otp               = otp;
      session.hashedPassword    = hashedPassword;
      session.expiresAt         = Date.now() + PW_OTP_EXPIRY;
      session.sentAt            = Date.now();
      session.attempts          = 0;
      session.resendCount      += 1;
      session.resendWindowCount += 1;

      const result = await sendPasswordOtpEmail(email, first_name || "User", otp);
      if (!result.success) {
        session.resendCount      -= 1;
        session.resendWindowCount -= 1;
        return res.status(500).json({ success: false, message: "Failed to send verification code. Please try again." });
      }

      const at     = email.indexOf("@");
      const local  = email.slice(0, at);
      const domain = email.slice(at);
      const masked = local.length <= 2
        ? local[0] + "*" + domain
        : local[0] + "*".repeat(local.length - 3) + local.slice(-2) + domain;

      res.json({
        success: true,
        maskedEmail: masked,
        resendsLeft: PW_MAX_RESENDS - session.resendCount,
        otpExpiresAt: session.expiresAt,
      });
    } catch (error) {
      console.error("requestPasswordOtp error:", error);
      res.status(500).json({ success: false, message: "Server error. Please try again.", detail: error.message });
    }
  }

  static async changePasswordWithOtp(req, res) {
    try {
      const userId    = req.user.user_id;
      const submitted = (req.body.otp || "").trim();
      const session   = getPwSession(userId);

      // Reset counters if lock expired before checking
      resetExpiredPwLock(userId, session);

      if (session.lockedUntil && Date.now() < session.lockedUntil) {
        const minsLeft = Math.ceil((session.lockedUntil - Date.now()) / 60_000);
        return res.status(429).json({
          success: false, locked: true,
          message: `Too many failed attempts. Try again in ${minsLeft} minute${minsLeft === 1 ? "" : "s"}.`,
        });
      }

      if (!session.otp) {
        return res.status(400).json({ success: false, message: "No pending verification. Please start over." });
      }
      if (Date.now() > session.expiresAt) {
        resetPwOtp(session);
        return res.status(400).json({ success: false, message: "Code expired. Please request a new one." });
      }

      session.attempts += 1;

      if (submitted !== session.otp) {
        const left = PW_MAX_OTP_ATTEMPTS - session.attempts;

        if (left <= 0) {
          const resendsExhausted = session.resendCount >= PW_MAX_RESENDS;
          resetPwOtp(session);

          if (resendsExhausted) {
            const lockUntil = Date.now() + PW_OTP_LOCKOUT_MS;
            setPwLock(userId, lockUntil);
            return res.status(429).json({
              success: false, sessionLocked: true, autoClose: true,
              message: "Too many incorrect attempts and no resends remaining. Please try again in 15 minutes.",
              minutesLeft: 15,
            });
          }

          return res.status(400).json({
            success: false, forceResend: true,
            message: "Too many incorrect attempts. Please request a new code.",
            resendsLeft: PW_MAX_RESENDS - session.resendCount,
          });
        }

        return res.status(400).json({
          success: false,
          message: `Incorrect code — ${left} attempt${left === 1 ? "" : "s"} remaining`,
          attemptsLeft: left,
        });
      }

      // OTP correct — apply the password change
      const hashedPassword = session.hashedPassword;
      resetPwOtp(session);

      // FIX: Persist change count to DB so the 24h limit survives server restarts
      await incrementDbChangeCount(userId);

      session.resendCount       = 0;
      session.resendWindowCount = 0;
      session.resendWindowStart = null;

      // Clear persistent lock on successful change
      setPwLock(userId, null);

      const attemptSession = getPwCurrentAttemptSession(userId);
      attemptSession.attempts    = 0;
      attemptSession.lockedUntil = null;

      await User.updatePassword(userId, hashedPassword);
      await User.updatePasswordChangedAt(userId);
      await tokenManager.revokeAllUserTokens(userId);

      const profileRow = await pool.query("SELECT email, first_name FROM users WHERE user_id = $1", [userId]);
      const { email, first_name } = profileRow.rows[0] || {};
      if (email) sendPasswordChangedNotification(email, first_name || "User");

      const { changeCount: newCount } = await getDbChangeCount(userId);
      res.json({
        success: true,
        message: "Password changed successfully! Please login with your new password.",
        changesLeft: Math.max(0, PW_MAX_CHANGES - newCount),
      });
    } catch (error) {
      console.error("changePasswordWithOtp error:", error);
      res.status(500).json({ success: false, message: "Server error. Please try again.", detail: error.message });
    }
  }
}

module.exports = ProfileController;