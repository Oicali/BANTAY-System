// ================================================================================
// FILE: backend/features/auth/services/authService.js
// ================================================================================

const bcrypt = require("bcrypt");
const pool = require("../../../config/database");
const { logAudit } = require("../../../shared/utils/auditLogger");
const { parseDeviceLabel } = require("../../../shared/utils/deviceLabel");
const notificationService = require("../../notifications/notificationService");

const OTP_MAX_ATTEMPTS = 3;
const OTP_LOCKOUT_MS = 15 * 60 * 1000;

// Generate 6-digit OTP
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Send email via Brevo HTTP API (port 443 — no SMTP, Railway safe)
async function sendBrevoEmail({ to, firstName, otp }) {
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": process.env.BREVO_API_KEY,
    },
    body: JSON.stringify({
      sender: { name: "BANTAY System", email: process.env.BREVO_SENDER_EMAIL },
      to: [{ email: to }],
      subject: "BANTAY System - New Verification Code",
      htmlContent: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #1e3a8a 0%, #1e293b 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
            .otp-box { background: white; border: 3px solid #1e3a8a; padding: 20px; text-align: center; margin: 20px 0; border-radius: 8px; }
            .otp-code { font-size: 36px; font-weight: bold; color: #1e3a8a; letter-spacing: 8px; margin: 10px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header"><h1>BANTAY SYSTEM</h1></div>
            <div class="content">
              <h2>New Verification Code</h2>
              <p>Hello ${firstName || "Officer"},</p>
              <p>Here is your new verification code:</p>
              <div class="otp-box">
                <div class="otp-code">${otp}</div>
              </div>
              <p>This code will expire in <strong>2 minutes</strong>.</p>
            </div>
          </div>
        </body>
        </html>
      `,
    }),
  });

  if (response.status === 429) {
    throw new Error("BREVO_RATE_LIMITED");
  }

  if (!response.ok) {
    const err = await response.json();
    throw new Error(`Brevo API error: ${JSON.stringify(err)}`);
  }

  return true;
}

// ============================================================
// SEND OTP
// ============================================================
const OTP_RESEND_MAX = 3;
const RECOVERY_DAILY_MAX = 550;

async function sendOTP(email, ipAddress = null) {
  try {
    const userCheck = await pool.query(
      "SELECT email, first_name FROM users WHERE LOWER(email) = LOWER($1)",
      [email],
    );

    if (userCheck.rows.length === 0) {
      return {
        success: false,
        message: "No account found with this email address",
      };
    }

    const user = userCheck.rows[0];

    const otpRow = await pool.query(
      `SELECT last_request_at,
              locked_until,
              (locked_until IS NOT NULL AND locked_until > NOW()) AS is_locked,
              EXTRACT(EPOCH FROM (NOW() - last_request_at)) AS seconds_since_last,
              last_recovery_completed_at
       FROM otp_requests WHERE email = $1`,
      [email],
    );

    if (otpRow.rows.length > 0) {
      const record = otpRow.rows[0];

      if (record.is_locked) {
        const msLeft = new Date(record.locked_until).getTime() - Date.now();
        const minsLeft = Math.ceil(msLeft / 60000);
        return {
          success: false,
          locked: true,
          minutesLeft: minsLeft,
          message: `Too many incorrect attempts. Please try again in ${minsLeft} minute${minsLeft === 1 ? "" : "s"}.`,
        };
      }

      if (
        record.seconds_since_last !== null &&
        record.seconds_since_last < 60
      ) {
        const remaining = Math.ceil(60 - record.seconds_since_last);
        return {
          success: false,
          message: `Please wait ${remaining} second${remaining !== 1 ? "s" : ""} before requesting a new code.`,
        };
      }

      // ── Daily block: only if a PREVIOUS recovery was actually completed ──
      if (record.last_recovery_completed_at) {
        const blockCheck = await pool.query(
          `SELECT
             (last_recovery_completed_at + INTERVAL '24 hours' > NOW()) AS is_blocked,
             EXTRACT(EPOCH FROM (last_recovery_completed_at + INTERVAL '24 hours' - NOW())) * 1000 AS ms_left
           FROM otp_requests WHERE email = $1`,
          [email]
        );
        const block = blockCheck.rows[0];
        if (block.is_blocked) {
          return {
            success: false,
            blocked: true,
            msLeft: Math.round(block.ms_left),
            message: "You've already successfully recovered your password today. Please try again tomorrow.",
          };
        }
      }
    }

    const otp = generateOTP();
    const otpHash = await bcrypt.hash(otp, 10);

    await pool.query(
      `INSERT INTO otp_requests
         (email, otp_hash, expires_at, request_count, last_request_at,
          attempts, locked_until, resends_left)
       VALUES ($1, $2, NOW() + INTERVAL '2 minutes', 1, CURRENT_TIMESTAMP,
               0, NULL, $3)
       ON CONFLICT (email)
       DO UPDATE SET
         otp_hash        = EXCLUDED.otp_hash,
         expires_at      = EXCLUDED.expires_at,
         last_request_at = EXCLUDED.last_request_at,
         attempts        = 0,
         locked_until    = NULL,
         resends_left    = $3`,
      [email, otpHash, OTP_RESEND_MAX],
    );

    try {
      await sendBrevoEmail({ to: email, firstName: user.first_name, otp });
    } catch (emailError) {
      await pool.query("DELETE FROM otp_requests WHERE email = $1", [email]);
      if (emailError.message === "BREVO_RATE_LIMITED") {
        return {
          success: false,
          message:
            "Email service is temporarily busy. Please wait a moment and try again.",
        };
      }
      console.error("Error sending OTP email:", emailError);
      return {
        success: false,
        message: "Failed to send verification code. Please try again.",
      };
    }

    await logAudit({
      username: email,
      eventName: "OTP Requested",
      description: `Password recovery OTP sent to ${email}`,
      action: "OTP",
      status: "success",
      source: null,
      ipAddress,
    });

    return {
      success: true,
      message: "Verification code sent to your email",
      resendsLeft: OTP_RESEND_MAX,
    };
  } catch (error) {
    console.error("Error sending OTP:", error);
    return { success: false, message: "Failed to send verification code" };
  }
}

// ============================================================
// VERIFY OTP
// ============================================================
async function verifyOTP(email, code, ipAddress = null) {
  try {
    const otpCheck = await pool.query(
      `SELECT otp_hash,
              attempts,
              locked_until,
              (locked_until IS NOT NULL AND locked_until > NOW()) AS is_locked,
              (expires_at < NOW()) AS is_expired
       FROM otp_requests
       WHERE email = $1`,
      [email],
    );

    if (otpCheck.rows.length === 0) {
      await logAudit({
        username: email,
        eventName: "OTP Verification",
        description: `OTP verification attempted but no OTP record found for ${email}`,
        action: "OTP",
        status: "failed",
        source: null,
        ipAddress,
      });

      return {
        success: false,
        message: "No OTP found. Please request a new one.",
      };
    }

    const otp = otpCheck.rows[0];

    // ── Already locked from a previous 3-strike failure ──
    if (otp.is_locked) {
      const msLeft = new Date(otp.locked_until).getTime() - Date.now();
      const minsLeft = Math.ceil(msLeft / 60000);

      await logAudit({
        username: email,
        eventName: "OTP Verification",
        description: `OTP verification blocked — locked for ${minsLeft} more minute(s)`,
        action: "OTP",
        status: "failed",
        source: null,
        ipAddress,
      });

      return {
        success: false,
        locked: true,
        minutesLeft: minsLeft,
        message: `Too many incorrect attempts. Please try again in ${minsLeft} minute${minsLeft === 1 ? "" : "s"}.`,
      };
    }

    if (otp.is_expired) {
      await logAudit({
        username:    email,
        eventName:   "OTP Verification",
        description: `OTP expired for ${email}`,
        action:      "OTP",
        status:      "failed",
        source:      null,
        ipAddress,
      });
    
      return { success: false, message: "OTP expired. Please request a new one." };
    
    }

    const valid = await bcrypt.compare(code, otp.otp_hash);

    if (!valid) {
      const newAttempts = otp.attempts + 1;

      await pool.query(
        "UPDATE otp_requests SET attempts = $2 WHERE email = $1",
        [email, newAttempts],
      );

      const resendCheck = await pool.query(
        "SELECT resends_left FROM otp_requests WHERE email = $1",
        [email],
      );
      const resendsLeft = resendCheck.rows[0]?.resends_left ?? 0;

      if (newAttempts >= OTP_MAX_ATTEMPTS && resendsLeft <= 0) {
        const lockedUntil = new Date(Date.now() + OTP_LOCKOUT_MS);

        await pool.query(
          "UPDATE otp_requests SET locked_until = $2 WHERE email = $1",
          [email, lockedUntil],
        );

        await logAudit({
          username: email,
          eventName: "OTP Verification",
          description: `Wrong code with 0 resends left for ${email} — locked for 15 minutes`,
          action: "OTP",
          status: "failed",
          source: null,
          ipAddress,
        });

        return {
          success: false,
          locked: true,
          minutesLeft: Math.ceil(OTP_LOCKOUT_MS / 60000),
          message:
            "Too many incorrect attempts. This account is locked for 15 minutes.",
        };
      }

      if (newAttempts >= OTP_MAX_ATTEMPTS) {
        await logAudit({
          username: email,
          eventName: "OTP Verification",
          description: `Max wrong attempts on this code for ${email} — forcing resend (${resendsLeft} left)`,
          action: "OTP",
          status: "failed",
          source: null,
          ipAddress,
        });

        return {
          success: false,
          forceResend: true,
          resendsLeft,
          message:
            "You have entered too many incorrect codes. For your security, please request a new one.",
        };
      }

      const attemptsLeft = OTP_MAX_ATTEMPTS - newAttempts;

      await logAudit({
        username: email,
        eventName: "OTP Verification",
        description: `Invalid OTP entered for ${email} — ${attemptsLeft} attempt(s) left`,
        action: "OTP",
        status: "failed",
        source: null,
        ipAddress,
      });

      return {
        success: false,
        message: `Invalid OTP — ${attemptsLeft} attempt${attemptsLeft === 1 ? "" : "s"} remaining`,
        attemptsLeft,
      };
    }
    

    await logAudit({
      username: email,
      eventName: "OTP Verification",
      description: `OTP verified successfully for ${email}`,
      action: "OTP",
      status: "success",
      source: null,
      ipAddress,
    });

    return { success: true, message: "OTP verified." };

  } catch (error) {
    console.error("Error verifying OTP:", error);
    return { success: false, message: "Verification failed." };
  }
}

// ============================================================
// RESEND OTP
// ============================================================
async function resendOTP(email, ipAddress = null) {
  try {
    const userCheck = await pool.query(
      "SELECT email, first_name FROM users WHERE LOWER(email) = LOWER($1)",
      [email],
    );
    if (userCheck.rows.length === 0) {
      return {
        success: false,
        message: "No account found with this email address",
      };
    }
    const user = userCheck.rows[0];

    const otpRow = await pool.query(
      `SELECT resends_left, locked_until,
              (locked_until IS NOT NULL AND locked_until > NOW()) AS is_locked
       FROM otp_requests WHERE email = $1`,
      [email],
    );

    if (otpRow.rows.length === 0) {
      return {
        success: false,
        message: "No active recovery session. Please start over.",
      };
    }

    const record = otpRow.rows[0];

    if (record.is_locked) {
      const msLeft = new Date(record.locked_until).getTime() - Date.now();
      const minsLeft = Math.ceil(msLeft / 60000);
      return {
        success: false,
        locked: true,
        minutesLeft: minsLeft,
        message: `Too many incorrect attempts. Please try again in ${minsLeft} minute${minsLeft === 1 ? "" : "s"}.`,
      };
    }

    if (record.resends_left <= 0) {
      return {
        success: false,
        resendLocked: true,
        resendsLeft: 0,
        message: "No more resends available for this session.",
      };
    }

    const newResendsLeft = record.resends_left - 1;
    const otp = generateOTP();
    const otpHash = await bcrypt.hash(otp, 10);

    await pool.query(
      `UPDATE otp_requests
       SET otp_hash = $2, expires_at = NOW() + INTERVAL '2 minutes',
           last_request_at = CURRENT_TIMESTAMP, attempts = 0,
           resends_left = $3
       WHERE email = $1`,
      [email, otpHash, newResendsLeft],
    );

    try {
      await sendBrevoEmail({ to: email, firstName: user.first_name, otp });
    } catch (emailError) {
      if (emailError.message === "BREVO_RATE_LIMITED") {
        return {
          success: false,
          message:
            "Email service is temporarily busy. Please wait a moment and try again.",
        };
      }
      console.error("Error resending OTP email:", emailError);
      return {
        success: false,
        message: "Failed to resend verification code. Please try again.",
      };
    }

    await logAudit({
      username: email,
      eventName: "OTP Resent",
      description: `OTP resent to ${email} (${newResendsLeft} resends left)`,
      action: "OTP",
      status: "success",
      source: null,
      ipAddress,
    });

    return {
      success: true,
      message: "New verification code sent to your email",
      resendsLeft: newResendsLeft,
    };
  } catch (error) {
    console.error("Error resending OTP:", error);
    return { success: false, message: "Failed to resend verification code" };
  }
}
async function forceLock(email, ipAddress = null) {
  try {
    const otpRow = await pool.query(
      "SELECT resends_left FROM otp_requests WHERE email = $1",
      [email],
    );
    if (otpRow.rows.length === 0) return { success: false };

    if (otpRow.rows[0].resends_left > 0) {
      return { success: true, locked: false };
    }

    const lockedUntil = new Date(Date.now() + OTP_LOCKOUT_MS);
    await pool.query(
      "UPDATE otp_requests SET locked_until = $2 WHERE email = $1",
      [email, lockedUntil],
    );

    await logAudit({
      username: email,
      eventName: "OTP Session Expired",
      description: `OTP expired with 0 resends left for ${email} — locked for 15 minutes`,
      action: "OTP",
      status: "failed",
      source: null,
      ipAddress,
    });

    return { success: true, locked: true, minutesLeft: 15 };
  } catch (error) {
    console.error("Error in forceLock:", error);
    return { success: false };
  }
}
// ============================================================
// NEW-DEVICE LOGIN VERIFICATION
// Separate from the password-recovery OTP above — keyed by
// pending_id (one row per login attempt) instead of by email.
// ============================================================
const DEVICE_OTP_RESEND_MAX = 3;

async function sendBrevoDeviceLoginEmail({ to, firstName, otp }) {
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": process.env.BREVO_API_KEY,
    },
    body: JSON.stringify({
      sender: { name: "BANTAY System", email: process.env.BREVO_SENDER_EMAIL },
      to: [{ email: to }],
      subject: "BANTAY System - Confirm New Device Login",
      htmlContent: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #1e3a8a 0%, #1e293b 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
            .otp-box { background: white; border: 3px solid #1e3a8a; padding: 20px; text-align: center; margin: 20px 0; border-radius: 8px; }
            .otp-code { font-size: 36px; font-weight: bold; color: #1e3a8a; letter-spacing: 8px; margin: 10px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header"><h1>BANTAY SYSTEM</h1></div>
            <div class="content">
              <h2>Confirm This Login</h2>
              <p>Hello ${firstName || "Officer"},</p>
              <p>We noticed a login attempt from a device we don't recognize. Enter this code to confirm it's you:</p>
              <div class="otp-box">
                <div class="otp-code">${otp}</div>
              </div>
              <p>This code will expire in <strong>2 minutes</strong>.</p>
              <p>If this wasn't you, do not share this code and change your password immediately.</p>
            </div>
          </div>
        </body>
        </html>
      `,
    }),
  });

  if (response.status === 429) throw new Error("BREVO_RATE_LIMITED");
  if (!response.ok) {
    const err = await response.json();
    throw new Error(`Brevo API error: ${JSON.stringify(err)}`);
  }
  return true;
}

function maskEmail(email) {
  const [name, domain] = email.split("@");
  if (!domain) return email;
  const visible = name.slice(0, Math.min(2, name.length));
  return `${visible}${"*".repeat(Math.max(name.length - visible.length, 3))}@${domain}`;
}

async function createPendingDeviceLogin({ userId, email, firstName, ipAddress, userAgent, deviceType, rememberMe, deviceId = null, deviceLabel = null }) {
  try {
    const otp = generateOTP();
    const otpHash = await bcrypt.hash(otp, 10);
    const expiresAt = new Date(Date.now() + 2 * 60 * 1000);

    const insert = await pool.query(
      `INSERT INTO pending_device_logins
         (user_id, otp_hash, ip_address, user_agent, device_type, remember_me, expires_at, resends_left, device_id, device_label)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING pending_id`,
      [userId, otpHash, ipAddress, userAgent, deviceType, rememberMe, expiresAt, DEVICE_OTP_RESEND_MAX, deviceId, deviceLabel],
    );

    const pendingId = insert.rows[0].pending_id;

    try {
      await sendBrevoDeviceLoginEmail({ to: email, firstName, otp });
    } catch (emailError) {
      await pool.query("DELETE FROM pending_device_logins WHERE pending_id = $1", [pendingId]);
      if (emailError.message === "BREVO_RATE_LIMITED") {
        return { success: false, message: "Email service is temporarily busy. Please wait a moment and try again." };
      }
      console.error("Error sending device login email:", emailError);
      return { success: false, message: "Failed to send verification code. Please try again." };
    }

    return {
      success: true,
      pendingId,
      maskedEmail: maskEmail(email),
      otpExpiresAt: expiresAt,
      resendsLeft: DEVICE_OTP_RESEND_MAX,
    };
  } catch (error) {
    console.error("Error creating pending device login:", error);
    return { success: false, message: "Failed to start device verification" };
  }
}

async function verifyPendingDeviceLogin(pendingId, code, ipAddress = null) {
  try {
    const result = await pool.query(
      `SELECT * FROM pending_device_logins WHERE pending_id = $1`,
      [pendingId],
    );

    if (result.rows.length === 0) {
      return { success: false, message: "This login request has expired. Please log in again." };
    }

    const p = result.rows[0];

    if (p.locked_until && new Date(p.locked_until) > new Date()) {
      const msLeft = new Date(p.locked_until).getTime() - Date.now();
      const minsLeft = Math.ceil(msLeft / 60000);
      return {
        success: false,
        sessionLocked: true,
        minutesLeft: minsLeft,
        message: `Too many incorrect attempts. Please try again in ${minsLeft} minute${minsLeft === 1 ? "" : "s"}.`,
      };
    }

    if (new Date(p.expires_at) < new Date()) {
      return { success: false, message: "Code expired. Please request a new one." };
    }

    const valid = await bcrypt.compare(code, p.otp_hash);

    if (!valid) {
      const newAttempts = p.attempts + 1;
      await pool.query(
        "UPDATE pending_device_logins SET attempts = $2 WHERE pending_id = $1",
        [pendingId, newAttempts],
      );

      if (newAttempts >= OTP_MAX_ATTEMPTS && p.resends_left <= 0) {
        const lockedUntil = new Date(Date.now() + OTP_LOCKOUT_MS);
        await pool.query(
          "UPDATE pending_device_logins SET locked_until = $2 WHERE pending_id = $1",
          [pendingId, lockedUntil],
        );
        return {
          success: false,
          sessionLocked: true,
          minutesLeft: Math.ceil(OTP_LOCKOUT_MS / 60000),
          message: "Too many incorrect attempts. This login is locked for 15 minutes.",
        };
      }

      if (newAttempts >= OTP_MAX_ATTEMPTS) {
        return {
          success: false,
          forceResend: true,
          resendsLeft: p.resends_left,
          message: "You have entered too many incorrect codes. For your security, please request a new one.",
        };
      }

      const attemptsLeft = OTP_MAX_ATTEMPTS - newAttempts;
      return {
        success: false,
        message: `Invalid code — ${attemptsLeft} attempt${attemptsLeft === 1 ? "" : "s"} remaining`,
        attemptsLeft,
      };
    }

    // Correct code — pull the full user row the same way login() does
    const userResult = await pool.query(
      `SELECT
        u.user_id, u.username, u.email,
        u.first_name, u.last_name, u.user_type,
        u.profile_picture,
        r.role_name,
        bd.barangay_code AS assigned_barangay_code
       FROM users u
       JOIN roles r ON u.role_id = r.role_id
       LEFT JOIN barangay_details bd ON u.user_id = bd.user_id
       WHERE u.user_id = $1`,
      [p.user_id],
    );

    await pool.query("DELETE FROM pending_device_logins WHERE pending_id = $1", [pendingId]);

        return {
      success: true,
      userRow: userResult.rows[0],
      ipAddress: p.ip_address,
      userAgent: p.user_agent,
      deviceType: p.device_type,
      rememberMe: p.remember_me,
      deviceId: p.device_id,
      deviceLabel: p.device_label,
    };
  } catch (error) {
    console.error("Error verifying pending device login:", error);
    return { success: false, message: "Verification failed." };
  }
}

async function resendPendingDeviceLogin(pendingId, ipAddress = null) {
  try {
    const result = await pool.query(
      `SELECT pdl.*, u.email, u.first_name
       FROM pending_device_logins pdl
       JOIN users u ON u.user_id = pdl.user_id
       WHERE pdl.pending_id = $1`,
      [pendingId],
    );

    if (result.rows.length === 0) {
      return { success: false, message: "This login request has expired. Please log in again." };
    }

    const p = result.rows[0];

    if (p.locked_until && new Date(p.locked_until) > new Date()) {
      const msLeft = new Date(p.locked_until).getTime() - Date.now();
      const minsLeft = Math.ceil(msLeft / 60000);
      return {
        success: false,
        locked: true,
        minutesLeft: minsLeft,
        message: `Too many incorrect attempts. Please try again in ${minsLeft} minute${minsLeft === 1 ? "" : "s"}.`,
      };
    }

    if (p.resends_left <= 0) {
      return {
        success: false,
        resendLocked: true,
        resendsLeft: 0,
        message: "No more resends available for this session.",
      };
    }

    const newResendsLeft = p.resends_left - 1;
    const otp = generateOTP();
    const otpHash = await bcrypt.hash(otp, 10);
    const expiresAt = new Date(Date.now() + 2 * 60 * 1000);

    await pool.query(
      `UPDATE pending_device_logins
       SET otp_hash = $2, expires_at = $3, attempts = 0, resends_left = $4
       WHERE pending_id = $1`,
      [pendingId, otpHash, expiresAt, newResendsLeft],
    );

    try {
      await sendBrevoDeviceLoginEmail({ to: p.email, firstName: p.first_name, otp });
    } catch (emailError) {
      if (emailError.message === "BREVO_RATE_LIMITED") {
        return { success: false, message: "Email service is temporarily busy. Please wait a moment and try again." };
      }
      console.error("Error resending device login email:", emailError);
      return { success: false, message: "Failed to resend verification code. Please try again." };
    }

    return {
      success: true,
      message: "New verification code sent to your email",
      otpExpiresAt: expiresAt,
      resendsLeft: newResendsLeft,
    };
  } catch (error) {
    console.error("Error resending pending device login:", error);
    return { success: false, message: "Failed to resend verification code" };
  }
}

// ============================================================
// TRY ANOTHER WAY — approve-from-trusted-device flow
// ============================================================

async function userHasTrustedDevice(userId) {
  try {
    const result = await pool.query(
      `SELECT 1 FROM trusted_devices WHERE user_id = $1 AND trusted_until > NOW() LIMIT 1`,
      [userId],
    );
    return result.rows.length > 0;
  } catch (error) {
    console.error("Error checking trusted devices:", error);
    return false;
  }
}

async function requestDeviceApproval(pendingId) {
  try {
    const result = await pool.query(
      `SELECT * FROM pending_device_logins WHERE pending_id = $1`,
      [pendingId],
    );
    if (result.rows.length === 0) {
      return { success: false, message: "This login request has expired. Please log in again." };
    }

    const p = result.rows[0];
    if (p.approval_status !== "pending") {
      return { success: false, message: "This login request is no longer active." };
    }

    const newExpiry = new Date(Date.now() + 5 * 60 * 1000);
    await pool.query(
      `UPDATE pending_device_logins SET expires_at = GREATEST(expires_at, $2) WHERE pending_id = $1`,
      [pendingId, newExpiry],
    );

    const deviceLabel = p.device_label || parseDeviceLabel(p.user_agent, p.device_type);

    // Routed through notificationService (not a raw INSERT) so this also
    // fires a push via Firebase to a trusted device with a push_token,
    // the same helper web's existing bell-icon notifications use.
    await notificationService.createNotification({
      recipientId: p.user_id,
      type:        "LOGIN_APPROVAL_REQUEST",
      title:       "Approve login from another device",
      message:     `A login attempt on ${deviceLabel} is waiting for your approval.`,
      metadata: {
        pending_id:   pendingId,
        device_label: deviceLabel,
        ip_address:   p.ip_address,
        user_agent:   p.user_agent,
        requested_at: new Date().toISOString(),
      },
    });

    return { success: true, otpExpiresAt: newExpiry };
  } catch (error) {
    console.error("Error requesting device approval:", error);
    return { success: false, message: "Failed to request approval." };
  }
}

async function pollPendingDeviceLogin(pendingId) {
  try {
    const result = await pool.query(
      `SELECT * FROM pending_device_logins WHERE pending_id = $1`,
      [pendingId],
    );

    if (result.rows.length === 0) {
      return { success: false, expired: true, message: "This login request has expired. Please log in again." };
    }

    const p = result.rows[0];

    if (p.approval_status === "denied") {
      await pool.query("DELETE FROM pending_device_logins WHERE pending_id = $1", [pendingId]);
      return { success: false, denied: true, message: "The login request was denied." };
    }

    if (p.approval_status === "pending" && new Date(p.expires_at) < new Date()) {
      await pool.query("DELETE FROM pending_device_logins WHERE pending_id = $1", [pendingId]);
      return { success: false, expired: true, message: "This login request has expired. Please log in again." };
    }

    if (p.approval_status === "pending") {
      return { success: true, status: "pending" };
    }

    const userResult = await pool.query(
      `SELECT
        u.user_id, u.username, u.email,
        u.first_name, u.last_name, u.user_type,
        u.profile_picture,
        r.role_name,
        bd.barangay_code AS assigned_barangay_code
       FROM users u
       JOIN roles r ON u.role_id = r.role_id
       LEFT JOIN barangay_details bd ON u.user_id = bd.user_id
       WHERE u.user_id = $1`,
      [p.user_id],
    );

    await pool.query("DELETE FROM pending_device_logins WHERE pending_id = $1", [pendingId]);

    return {
      success:     true,
      status:      "approved",
      userRow:     userResult.rows[0],
      ipAddress:   p.ip_address,
      userAgent:   p.user_agent,
      deviceType:  p.device_type,
      rememberMe:  p.remember_me,
      trustDevice: p.trust_this_device,
      deviceId:    p.device_id,
    };
  } catch (error) {
    console.error("Error polling pending device login:", error);
    return { success: false, message: "Failed to check login status." };
  }
}

module.exports = {
  sendOTP,
  verifyOTP,
  resendOTP,
  forceLock,
  createPendingDeviceLogin,
  verifyPendingDeviceLogin,
  resendPendingDeviceLogin,
  userHasTrustedDevice,
  requestDeviceApproval,
  pollPendingDeviceLogin,
};
