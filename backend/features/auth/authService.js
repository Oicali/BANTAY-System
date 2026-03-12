// ================================================================================
// FILE: backend/modules/auth/authService.js
// ================================================================================

const nodemailer = require("nodemailer");
const bcrypt = require("bcrypt");
const pool = require("../../config/database");

// Email transporter
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Generate 6-digit OTP
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ============================================================
// SEND OTP
// ============================================================
async function sendOTP(email) {
  try {
    // Check if user exists
    const userCheck = await pool.query(
      "SELECT email, first_name FROM users WHERE LOWER(email) = LOWER($1)",
      [email]
    );

    if (userCheck.rows.length === 0) {
      return { success: false, message: "No account found with this email address" };
    }

    const user = userCheck.rows[0];

    // Check existing OTP record — PostgreSQL handles date comparison to avoid timezone issues
    const otpRow = await pool.query(
      `SELECT request_count,
              (last_request_at::date = CURRENT_DATE) AS is_same_day
       FROM otp_requests WHERE email = $1`,
      [email]
    );

    let requestCount = 1;

    if (otpRow.rows.length > 0) {
      const record = otpRow.rows[0];

      // Increment if same day, reset to 1 if new day
      requestCount = record.is_same_day ? record.request_count + 1 : 1;

      // Enforce 10 sends per day
      if (requestCount > 10) {
        return {
          success: false,
          message: "Maximum OTP requests reached. Try again tomorrow or contact administrator.",
        };
      }
    }

    // Generate and hash OTP
    const otp = generateOTP();
    const otpHash = await bcrypt.hash(otp, 10);

    // Insert/update OTP record (expires in 2 minutes)
    await pool.query(
      `INSERT INTO otp_requests (email, otp_hash, expires_at, request_count, last_request_at)
       VALUES ($1, $2, NOW() + INTERVAL '2 minutes', $3, CURRENT_TIMESTAMP)
       ON CONFLICT (email)
       DO UPDATE SET
         otp_hash = EXCLUDED.otp_hash,
         expires_at = EXCLUDED.expires_at,
         request_count = EXCLUDED.request_count,
         last_request_at = EXCLUDED.last_request_at`,
      [email, otpHash, requestCount]
    );

    // Send email
    await transporter.sendMail({
      from: `"BANTAY System" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "BANTAY System - New Verification Code",
      html: `
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
            <div class="header">
              <h1>BANTAY SYSTEM</h1>
            </div>
            <div class="content">
              <h2>New Verification Code</h2>
              <p>Hello ${user.first_name || "Officer"},</p>
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
    });

    return { success: true, message: "Verification code sent to your email" };
  } catch (error) {
    console.error("Error sending OTP:", error);
    return { success: false, message: "Failed to send verification code" };
  }
}

// ============================================================
// VERIFY OTP
// ============================================================
async function verifyOTP(email, code) {
  try {
    const otpCheck = await pool.query(
      `SELECT otp_hash,
              (expires_at < NOW()) AS is_expired
       FROM otp_requests
       WHERE email = $1`,
      [email]
    );

    if (otpCheck.rows.length === 0) {
      return { success: false, message: "No OTP found. Please request a new one." };
    }

    const otp = otpCheck.rows[0];

    if (otp.is_expired) {
      await pool.query("DELETE FROM otp_requests WHERE email = $1", [email]);
      return { success: false, message: "OTP expired. Please request a new one." };
    }

    const valid = await bcrypt.compare(code, otp.otp_hash);
    if (!valid) {
      return { success: false, message: "Invalid OTP." };
    }

    // Success — delete OTP record
    await pool.query("DELETE FROM otp_requests WHERE email = $1", [email]);
    return { success: true, message: "OTP verified." };
  } catch (error) {
    console.error("Error verifying OTP:", error);
    return { success: false, message: "Verification failed." };
  }
}

// ============================================================
// RESEND OTP
// ============================================================
async function resendOTP(email) {
  return sendOTP(email);
}

module.exports = { sendOTP, verifyOTP, resendOTP };