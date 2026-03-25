// ================================================================================
// FILE: backend/features/user/services/emailService.js
// CHANGE: Replaced Nodemailer/Gmail with Brevo HTTP API (matches auth folder)
// ================================================================================

const pool = require("../../../config/database");

// ============================================================
// BREVO HTTP EMAIL HELPER
// Replaces nodemailer transporter — no SMTP, Railway-safe
// ============================================================
async function sendBrevoEmail({ to, subject, html }) {
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": process.env.BREVO_API_KEY,
    },
    body: JSON.stringify({
      sender: { name: "BANTAY System", email: process.env.BREVO_SENDER_EMAIL },
      to: [{ email: to }],
      subject,
      htmlContent: html,
    }),
  });

  if (response.status === 429) throw new Error("BREVO_RATE_LIMITED");
  if (!response.ok) {
    const err = await response.json();
    throw new Error(`Brevo API error: ${JSON.stringify(err)}`);
  }
  return true;
}

// ============================================================
// GENERATE USERNAME
// ============================================================
async function generateUsername(firstName, middleName, lastName, userType, client) {
  const yy = String(new Date().getFullYear()).slice(-2);
  const li = lastName.charAt(0).toUpperCase();
  const fi = firstName.charAt(0).toUpperCase();
  const mi = middleName ? middleName.charAt(0).toUpperCase() : "";
  const initials = `${li}${fi}${mi}`;
  const db = client || pool;
  const result = await db.query(
    `SELECT COUNT(*) AS cnt FROM users WHERE username ~ $1`,
    [`^[A-Z]{2,3}${yy}[0-9]+_${userType}$`],
  );
  const nextNumber = parseInt(result.rows[0].cnt, 10) + 1;
  const seq = nextNumber < 1000
    ? String(nextNumber).padStart(3, "0")
    : String(nextNumber);
  return `${initials}${yy}${seq}_${userType}`;
}

// ============================================================
// GENERATE PASSWORD
// ============================================================
function generatePassword() {
  const uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const lowercase = "abcdefghijklmnopqrstuvwxyz";
  const numbers = "0123456789";
  const special = "!@#$%^&*";
  let password = "";
  password += uppercase.charAt(Math.floor(Math.random() * uppercase.length));
  password += lowercase.charAt(Math.floor(Math.random() * lowercase.length));
  password += numbers.charAt(Math.floor(Math.random() * numbers.length));
  password += special.charAt(Math.floor(Math.random() * special.length));
  const allChars = uppercase + lowercase + numbers + special;
  for (let i = 4; i < 12; i++) {
    password += allChars.charAt(Math.floor(Math.random() * allChars.length));
  }
  return password.split("").sort(() => Math.random() - 0.5).join("");
}

// ============================================================
// SEND VERIFICATION EMAIL
// ============================================================
async function sendVerificationEmail(email, firstName, lastName, verificationUrl) {
  try {
    await sendBrevoEmail({
      to: email,
      subject: "BANTAY System – Verify Your Account",
      html: `
        <!DOCTYPE html><html><head><style>
          body{font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px}
          .header{background:linear-gradient(135deg,#1e3a5f 0%,#0a1628 100%);color:white;padding:30px;text-align:center;border-radius:10px 10px 0 0}
          .header h1{margin:0;font-size:28px}
          .content{background:#f8f9fa;padding:30px;border-radius:0 0 10px 10px}
          .verify-button{display:inline-block;background:#1e3a5f;color:white!important;padding:14px 36px;text-decoration:none;border-radius:6px;font-weight:600;font-size:16px;margin:24px 0}
          .info-box{background:#d1ecf1;border-left:4px solid #17a2b8;padding:15px;margin:20px 0;border-radius:4px}
          .warning-box{background:#fff3cd;border-left:4px solid #ffc107;padding:15px;margin:20px 0;border-radius:4px}
          .footer{text-align:center;color:#6c757d;font-size:12px;margin-top:30px;padding-top:20px;border-top:1px solid #dee2e6}
          .url-fallback{word-break:break-all;font-family:'Courier New',monospace;font-size:12px;color:#555;background:#eee;padding:8px;border-radius:4px}
        </style></head><body>
          <div class="header"><h1>🛡️ BANTAY System</h1><p style="margin:10px 0 0 0;opacity:.9">Crime Monitoring and Management System</p></div>
          <div class="content">
            <h2 style="color:#0a1628">Hello, ${firstName} ${lastName}!</h2>
            <p>Your account has been created on the <strong>BANTAY System</strong>. Before you can log in and receive your credentials, you must first verify that this email address belongs to you.</p>
            <div style="text-align:center"><a href="${verificationUrl}" class="verify-button">✅ Verify My Account</a></div>
            <div class="info-box"><strong>ℹ️ What happens after verification?</strong><p style="margin:10px 0 0 0">Once you click the button above, your account will be activated and you will receive a separate email containing your login credentials (username &amp; password).</p></div>
            <div class="warning-box"><strong>⚠️ Important:</strong><ul style="margin:10px 0 0 0;padding-left:20px"><li>This verification link expires in <strong>24 hours</strong>.</li><li>If you did not expect this email, please ignore it or contact your administrator.</li><li>Do not share this link with anyone.</li></ul></div>
            <p style="color:#6c757d;font-size:13px">If the button above does not work, copy and paste the link below into your browser:</p>
            <div class="url-fallback">${verificationUrl}</div>
          </div>
          <div class="footer"><p><strong>BANTAY Crime Monitoring System</strong><br>This is an automated message, please do not reply to this email.</p><p style="margin-top:10px">© ${new Date().getFullYear()} BANTAY System. All rights reserved.</p></div>
        </body></html>
      `,
    });
    return { success: true, message: "Verification email sent successfully" };
  } catch (error) {
    console.error("Send verification email error:", error);
    return { success: false, message: "Failed to send verification email", error: error.message };
  }
}

// ============================================================
// SEND WELCOME EMAIL (credentials after account verification)
// ============================================================
async function sendWelcomeEmail(email, firstName, lastName, username, password, userType, role) {
  try {
    const userTypeLabel = userType === "police" ? "PNP" : "Barangay";
    await sendBrevoEmail({
      to: email,
      subject: "BANTAY System – Your Account is Now Active",
      html: `
        <!DOCTYPE html><html><head><style>
          body{font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px}
          .header{background:linear-gradient(135deg,#1e3a5f 0%,#0a1628 100%);color:white;padding:30px;text-align:center;border-radius:10px 10px 0 0}
          .header h1{margin:0;font-size:28px}
          .content{background:#f8f9fa;padding:30px;border-radius:0 0 10px 10px}
          .credentials-box{background:white;border:2px solid #1e3a5f;border-radius:8px;padding:20px;margin:20px 0}
          .credential-item{display:flex;justify-content:space-between;padding:12px 0;border-bottom:1px solid #dee2e6}
          .credential-item:last-child{border-bottom:none}
          .credential-label{font-weight:600;color:#495057}
          .credential-value{font-family:'Courier New',monospace;background:#f8f9fa;padding:4px 12px;border-radius:4px;color:#c1272d;font-weight:600}
          .success-box{background:#d4edda;border-left:4px solid #28a745;padding:15px;margin:20px 0;border-radius:4px}
          .warning-box{background:#fff3cd;border-left:4px solid #ffc107;padding:15px;margin:20px 0;border-radius:4px}
          .info-box{background:#d1ecf1;border-left:4px solid #17a2b8;padding:15px;margin:20px 0;border-radius:4px}
          .footer{text-align:center;color:#6c757d;font-size:12px;margin-top:30px;padding-top:20px;border-top:1px solid #dee2e6}
        </style></head><body>
          <div class="header"><h1>🛡️ Welcome to BANTAY System</h1><p style="margin:10px 0 0 0;opacity:.9">Crime Monitoring and Management System</p></div>
          <div class="content">
            <h2 style="color:#0a1628">Hello, ${firstName} ${lastName}!</h2>
            <div class="success-box"><strong>✅ Your account has been verified and is now active!</strong><p style="margin:8px 0 0 0">You can now log in to the BANTAY System using the credentials below.</p></div>
            <div class="credentials-box">
              <h3 style="margin-top:0;color:#1e3a5f">Your Login Credentials</h3>
              <div class="credential-item"><span class="credential-label">Username:</span><span class="credential-value">${username}</span></div>
              <div class="credential-item"><span class="credential-label">Password:</span><span class="credential-value">${password}</span></div>
              <div class="credential-item"><span class="credential-label">Role:</span><span class="credential-value">${role}</span></div>
              <div class="credential-item"><span class="credential-label">User Type:</span><span class="credential-value">${userTypeLabel}</span></div>
            </div>
            <div class="warning-box"><strong>⚠️ Important Security Notice:</strong><ul style="margin:10px 0 0 0;padding-left:20px"><li>Please change your password immediately after your first login</li><li>Do not share your credentials with anyone</li><li>Keep this email in a secure location or delete it after changing your password</li></ul></div>
            <div class="info-box"><strong>📋 Password Requirements when changing:</strong><ul style="margin:10px 0 0 0;padding-left:20px"><li>At least 8 characters long</li><li>Contains uppercase and lowercase letters</li><li>Contains at least one number</li><li>Contains at least one special character (!@#$%^&*)</li></ul></div>
            <p style="margin-top:30px;color:#6c757d;font-size:14px">If you did not expect this email or believe you received it by mistake, please contact your system administrator immediately.</p>
          </div>
          <div class="footer"><p><strong>BANTAY Crime Monitoring System</strong><br>This is an automated message, please do not reply to this email.</p><p style="margin-top:10px">© ${new Date().getFullYear()} BANTAY System. All rights reserved.</p></div>
        </body></html>
      `,
    });
    return { success: true, message: "Welcome email sent successfully" };
  } catch (error) {
    console.error("Send welcome email error:", error);
    return { success: false, message: "Failed to send welcome email", error: error.message };
  }
}

// ============================================================
// SEND OTP EMAIL (email change — current or new address)
// ============================================================
async function sendOtpEmail(newEmail, otp, type = "new") {
  const isCurrentEmail = type === "current";
  const subject = isCurrentEmail
    ? "BANTAY System – Verify Your Current Email"
    : "BANTAY System – Verify Your New Email Address";
  const heading = isCurrentEmail
    ? "Confirm Your Current Email"
    : "Verify Your New Email Address";
  const bodyText = isCurrentEmail
    ? "Someone requested an email address change on your account. Enter this code to confirm you own your current email:"
    : "You are changing your email address on the <strong>BANTAY System</strong>. Enter this code to verify your new email:";
  try {
    await sendBrevoEmail({
      to: newEmail,
      subject,
      html: `
        <!DOCTYPE html><html><head><style>
          body{font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px}
          .header{background:linear-gradient(135deg,#1e3a5f 0%,#0a1628 100%);color:white;padding:30px;text-align:center;border-radius:10px 10px 0 0}
          .header h1{margin:0;font-size:28px}
          .content{background:#f8f9fa;padding:30px;border-radius:0 0 10px 10px}
          .otp-box{background:#fff;border:2px dashed #1e3a5f;border-radius:10px;padding:24px;text-align:center;margin:24px 0}
          .otp-code{font-size:44px;font-weight:700;letter-spacing:14px;color:#0a285c;font-family:'Courier New',monospace}
          .warning-box{background:#fff3cd;border-left:4px solid #ffc107;padding:15px;margin:20px 0;border-radius:4px}
          .footer{text-align:center;color:#6c757d;font-size:12px;margin-top:30px;padding-top:20px;border-top:1px solid #dee2e6}
        </style></head><body>
          <div class="header">
            <h1>🛡️ BANTAY System</h1>
            <p style="margin:10px 0 0;opacity:.9">Email Verification</p>
          </div>
          <div class="content">
            <h2 style="color:#0a1628">${heading}</h2>
            <p>${bodyText}</p>
            <div class="otp-box">
              <div class="otp-code">${otp}</div>
              <p style="margin:12px 0 0;color:#6c757d;font-size:13px">This code expires in <strong>2 minutes</strong></p>
            </div>
            <div class="warning-box">
              <strong>⚠️ Important:</strong>
              <ul style="margin:10px 0 0;padding-left:20px">
                <li>Never share this code with anyone</li>
                <li>BANTAY System staff will never ask for this code</li>
                <li>If you did not request this change, please secure your account immediately</li>
              </ul>
            </div>
          </div>
          <div class="footer">
            <p><strong>BANTAY Crime Monitoring System</strong><br>This is an automated message, please do not reply.</p>
            <p style="margin-top:10px">© ${new Date().getFullYear()} BANTAY System. All rights reserved.</p>
          </div>
        </body></html>
      `,
    });
    return { success: true };
  } catch (error) {
    console.error("Send OTP email error:", error);
    return { success: false, message: "Failed to send verification email", error: error.message };
  }
}

// ============================================================
// SEND PASSWORD OTP EMAIL
// ============================================================
async function sendPasswordOtpEmail(email, firstName, otp) {
  try {
    await sendBrevoEmail({
      to: email,
      subject: "BANTAY System – Password Change Verification Code",
      html: `
        <!DOCTYPE html><html><head><style>
          body{font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px}
          .header{background:linear-gradient(135deg,#1e3a5f 0%,#0a1628 100%);color:white;padding:30px;text-align:center;border-radius:10px 10px 0 0}
          .content{background:#f8f9fa;padding:30px;border-radius:0 0 10px 10px}
          .otp-box{background:#fff;border:2px dashed #1e3a5f;border-radius:10px;padding:24px;text-align:center;margin:24px 0}
          .otp-code{font-size:44px;font-weight:700;letter-spacing:14px;color:#0a285c;font-family:'Courier New',monospace}
          .warning-box{background:#fff3cd;border-left:4px solid #ffc107;padding:15px;margin:20px 0;border-radius:4px}
          .footer{text-align:center;color:#6c757d;font-size:12px;margin-top:30px;padding-top:20px;border-top:1px solid #dee2e6}
        </style></head><body>
          <div class="header"><h1>🛡️ BANTAY System</h1><p style="margin:10px 0 0;opacity:.9">Password Change Verification</p></div>
          <div class="content">
            <h2 style="color:#0a1628">Hello, ${firstName}!</h2>
            <p>You requested to change your password. Enter this code to complete the process:</p>
            <div class="otp-box">
              <div class="otp-code">${otp}</div>
              <p style="margin:12px 0 0;color:#6c757d;font-size:13px">Expires in <strong>2 minutes</strong></p>
            </div>
            <div class="warning-box">
              <strong>⚠️ Important:</strong>
              <ul style="margin:10px 0 0;padding-left:20px">
                <li>Never share this code with anyone</li>
                <li>If you did not request a password change, secure your account immediately</li>
                <li>BANTAY staff will never ask for this code</li>
              </ul>
            </div>
          </div>
          <div class="footer"><p><strong>BANTAY Crime Monitoring System</strong><br>This is an automated message.</p><p>© ${new Date().getFullYear()} BANTAY System.</p></div>
        </body></html>
      `,
    });
    return { success: true };
  } catch (error) {
    console.error("Send password OTP error:", error);
    return { success: false, message: "Failed to send OTP email", error: error.message };
  }
}

// ============================================================
// SEND PASSWORD CHANGED NOTIFICATION
// ============================================================
async function sendPasswordChangedNotification(email, firstName) {
  try {
    const now = new Date().toLocaleString("en-PH", {
      timeZone: "Asia/Manila", dateStyle: "long", timeStyle: "short"
    });
    await sendBrevoEmail({
      to: email,
      subject: "BANTAY System – Your Password Was Changed",
      html: `
        <!DOCTYPE html><html><head><style>
          body{font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px}
          .header{background:linear-gradient(135deg,#1e3a5f 0%,#0a1628 100%);color:white;padding:30px;text-align:center;border-radius:10px 10px 0 0}
          .content{background:#f8f9fa;padding:30px;border-radius:0 0 10px 10px}
          .success-box{background:#d4edda;border-left:4px solid #28a745;padding:15px;margin:20px 0;border-radius:4px}
          .danger-box{background:#f8d7da;border-left:4px solid #dc3545;padding:15px;margin:20px 0;border-radius:4px}
          .footer{text-align:center;color:#6c757d;font-size:12px;margin-top:30px;padding-top:20px;border-top:1px solid #dee2e6}
        </style></head><body>
          <div class="header"><h1>🛡️ BANTAY System</h1><p style="margin:10px 0 0;opacity:.9">Security Notification</p></div>
          <div class="content">
            <h2 style="color:#0a1628">Hello, ${firstName}!</h2>
            <div class="success-box"><strong>✅ Your password was successfully changed</strong><p style="margin:8px 0 0">Changed on: <strong>${now} (Philippine Time)</strong></p></div>
            <div class="danger-box">
              <strong>🚨 Wasn't you?</strong>
              <p style="margin:8px 0 0">If you did not make this change, your account may be compromised. Contact your system administrator immediately and do not log in.</p>
            </div>
          </div>
          <div class="footer"><p><strong>BANTAY Crime Monitoring System</strong><br>This is an automated security notification.</p><p>© ${new Date().getFullYear()} BANTAY System.</p></div>
        </body></html>
      `,
    });
    return { success: true };
  } catch (error) {
    console.error("Send password changed notification error:", error);
    return { success: false };
  }
}

// ============================================================
// SEND EMAIL CHANGED NOTIFICATION (to both old and new email)
// ============================================================
async function sendEmailChangedNotification(oldEmail, newEmail) {
  try {
    await sendBrevoEmail({
      to: oldEmail,
      subject: "BANTAY System – Your Account Email Has Been Changed",
      html: `
        <!DOCTYPE html><html><head><style>
          body{font-family:'Segoe UI',sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px}
          .header{background:linear-gradient(135deg,#1e3a5f 0%,#0a1628 100%);color:white;padding:30px;text-align:center;border-radius:10px 10px 0 0}
          .content{background:#f8f9fa;padding:30px;border-radius:0 0 10px 10px}
          .alert-box{background:#fef2f2;border-left:4px solid #dc3545;padding:15px;margin:20px 0;border-radius:4px}
          .footer{text-align:center;color:#6c757d;font-size:12px;margin-top:30px;padding-top:20px;border-top:1px solid #dee2e6}
        </style></head><body>
          <div class="header"><h1>🛡️ BANTAY System</h1><p style="margin:10px 0 0;opacity:.9">Security Alert</p></div>
          <div class="content">
            <h2 style="color:#0a1628">Your Account Email Has Been Changed</h2>
            <p>Your account email address has been successfully changed.</p>
            <div class="alert-box">
              <strong>⚠️ If this was not you, please contact support immediately.</strong><br>
              Your account may have been compromised.
            </div>
            <p>This change was made on <strong>${new Date().toLocaleString()}</strong>.</p>
          </div>
          <div class="footer"><p><strong>BANTAY Crime Monitoring System</strong><br>This is an automated message, please do not reply.</p></div>
        </body></html>
      `,
    });

    await sendBrevoEmail({
      to: newEmail,
      subject: "BANTAY System – Your Email Has Been Successfully Updated",
      html: `
        <!DOCTYPE html><html><head><style>
          body{font-family:'Segoe UI',sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px}
          .header{background:linear-gradient(135deg,#1e3a5f 0%,#0a1628 100%);color:white;padding:30px;text-align:center;border-radius:10px 10px 0 0}
          .content{background:#f8f9fa;padding:30px;border-radius:0 0 10px 10px}
          .success-box{background:#d4edda;border-left:4px solid #28a745;padding:15px;margin:20px 0;border-radius:4px}
          .footer{text-align:center;color:#6c757d;font-size:12px;margin-top:30px;padding-top:20px;border-top:1px solid #dee2e6}
        </style></head><body>
          <div class="header"><h1>🛡️ BANTAY System</h1><p style="margin:10px 0 0;opacity:.9">Email Updated</p></div>
          <div class="content">
            <h2 style="color:#0a1628">Your Email Has Been Successfully Updated</h2>
            <p>Your BANTAY System account email has been updated to this address.</p>
            <div class="success-box">
              <strong>✓ This is now your login email.</strong><br>
              Please use this email address to log in from now on.
            </div>
          </div>
          <div class="footer"><p><strong>BANTAY Crime Monitoring System</strong><br>This is an automated message, please do not reply.</p></div>
        </body></html>
      `,
    });

    return { success: true };
  } catch (error) {
    console.error("sendEmailChangedNotification error:", error);
    return { success: false };
  }
}

module.exports = {
  generateUsername,
  generatePassword,
  sendVerificationEmail,
  sendWelcomeEmail,
  sendOtpEmail,
  sendPasswordOtpEmail,
  sendPasswordChangedNotification,
  sendEmailChangedNotification,
};