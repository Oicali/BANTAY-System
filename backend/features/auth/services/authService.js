// ================================================================================
// FILE: backend/features/auth/services/authService.js
// ================================================================================

const bcrypt = require("bcrypt");
const pool = require("../../../config/database");
const { logAudit } = require("../../../shared/utils/auditLogger");

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
        const dayMs = 24 * 60 * 60 * 1000;
        const msSince =
          Date.now() - new Date(record.last_recovery_completed_at).getTime();
        if (msSince < dayMs) {
          const msLeft = dayMs - msSince;
          return {
            success: false,
            blocked: true,
            msLeft,
            message:
              "You've already successfully recovered your password today. Please try again tomorrow.",
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
      await pool.query("DELETE FROM otp_requests WHERE email = $1", [email]);

      await logAudit({
        username: email,
        eventName: "OTP Verification",
        description: `OTP expired for ${email}`,
        action: "OTP",
        status: "failed",
        source: null,
        ipAddress,
      });

      return {
        success: false,
        message: "OTP expired. Please request a new one.",
      };
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
module.exports = { sendOTP, verifyOTP, resendOTP, forceLock };
