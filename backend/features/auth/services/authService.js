const bcrypt = require("bcrypt");
const pool = require("../../../config/database");

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

  if (!response.ok) {
    const err = await response.json();
    throw new Error(`Brevo API error: ${JSON.stringify(err)}`);
  }

  return true;
}

// ============================================================
// SEND OTP
// ============================================================
async function sendOTP(email) {
  try {
    const userCheck = await pool.query(
      "SELECT email, first_name FROM users WHERE LOWER(email) = LOWER($1)",
      [email]
    );

    if (userCheck.rows.length === 0) {
      return { success: false, message: "No account found with this email address" };
    }

    const user = userCheck.rows[0];

    const otpRow = await pool.query(
      `SELECT request_count,
              (last_request_at::date = CURRENT_DATE) AS is_same_day
       FROM otp_requests WHERE email = $1`,
      [email]
    );

    let requestCount = 1;

    if (otpRow.rows.length > 0) {
      const record = otpRow.rows[0];
      requestCount = record.is_same_day ? record.request_count + 1 : 1;

      if (requestCount > 10) {
        return {
          success: false,
          message: "Maximum OTP requests reached. Try again tomorrow or contact administrator.",
        };
      }
    }

    const otp = generateOTP();
    const otpHash = await bcrypt.hash(otp, 10);

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

    await sendBrevoEmail({
      to: email,
      firstName: user.first_name,
      otp,
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