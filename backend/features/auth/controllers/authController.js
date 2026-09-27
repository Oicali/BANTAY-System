// ================================================================================
// FILE: backend/features/auth/controllers/authController.js
// ================================================================================

const pool         = require("../../../config/database");
const bcrypt       = require("bcrypt");
const tokenManager = require("../../../shared/utils/tokenManager");
const authService  = require("../services/authService");
const { logAudit, getClientIp } = require("../../../shared/utils/auditLogger");
const { parseDeviceLabel } = require("../../../shared/utils/deviceLabel");

const {
  validateLoginInput,
  validateEmail,
  validatePasswordChange,
  validateResetPassword,
  validateOTPCode,
} = require("../validators/authValidator");

// ============================================================
// LOGIN (web — 24h token)
// ============================================================
const login = async (req, res) => {
  try {
   const { username, password, rememberMe } = req.body;
    const ip = getClientIp(req);

    const errors = validateLoginInput(username, password);
    if (errors.length > 0) {
      return res.status(400).json({ success: false, errors });
    }

    const result = await pool.query(
      `SELECT
        u.user_id, u.username, u.password, u.email,
        u.first_name, u.last_name, u.user_type,
        u.profile_picture,
        u.status, u.lockout_until,
        u.failed_login_attempts, u.last_login,
        r.role_name,
        bd.barangay_code AS assigned_barangay_code
       FROM users u
       JOIN roles r ON u.role_id = r.role_id
       LEFT JOIN barangay_details bd ON u.user_id = bd.user_id
       WHERE u.username = $1`,
      [username.trim()],
    );

    if (result.rows.length === 0) {
      await logAudit({
        username:    username.trim(),
        eventName:   "Login Failed",
        description: "Account does not exist",
        action:      "LOGIN",
        status:      "failed",
        source:      "Web Portal",
        ipAddress:   ip,
      });
      return res.status(401).json({ success: false, message: "Account does not exist" });
    }

    const user = result.rows[0];
    const now  = new Date();

    // ── STATUS CHECKS ──────────────────────────────────────────

    if (user.status === "deactivated") {
      await logAudit({
        userId:      user.user_id,
        username:    user.username,
        eventName:   "Login Blocked",
        description: "Account is deactivated",
        action:      "LOGIN",
        status:      "failed",
        source:      "Web Portal",
        ipAddress:   ip,
      });
      return res.status(403).json({ success: false, message: "Account has been deactivated" });
    }

    if (user.status === "unverified") {
      await logAudit({
        userId:      user.user_id,
        username:    user.username,
        eventName:   "Login Blocked",
        description: "Account is not yet verified",
        action:      "LOGIN",
        status:      "failed",
        source:      "Web Portal",
        ipAddress:   ip,
      });
      return res.status(403).json({ success: false, message: "Account is not yet verified" });
    }

    if (user.status === "locked" && user.lockout_until) {
      if (now < new Date(user.lockout_until)) {
        const diffMs  = new Date(user.lockout_until) - now;
        const minutes = Math.floor(diffMs / 60000);
        const seconds = Math.floor((diffMs % 60000) / 1000);

        await logAudit({
          userId:      user.user_id,
          username:    user.username,
          eventName:   "Login Blocked",
          description: `Account is temporarily locked (${minutes}m ${seconds}s remaining)`,
          action:      "LOGIN",
          status:      "failed",
          source:      "Web Portal",
          ipAddress:   ip,
        });

        return res.status(403).json({
          success:           false,
          message:           `Account locked. Try again in ${minutes}m ${seconds}s`,
          lockout_until:     user.lockout_until,
          remaining_minutes: minutes,
          remaining_seconds: seconds,
        });
      }

      await pool.query(
        `UPDATE users SET status = 'verified', lockout_until = NULL, failed_login_attempts = 0 WHERE user_id = $1`,
        [user.user_id],
      );
      user.status = "verified";
    }

    if (user.status === "locked" && !user.lockout_until) {
      await logAudit({
        userId:      user.user_id,
        username:    user.username,
        eventName:   "Login Blocked",
        description: "Account is permanently locked",
        action:      "LOGIN",
        status:      "failed",
        source:      "Web Portal",
        ipAddress:   ip,
      });
      return res.status(403).json({
        success: false,
        message: "Account is permanently locked. Please contact an administrator.",
      });
    }

    // ── PASSWORD VERIFICATION ──────────────────────────────────

    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      let attempts    = user.failed_login_attempts + 1;
      let lockMinutes = 0;

      if (attempts >= 8)       lockMinutes = null;
      else if (attempts === 5) lockMinutes = 15;
      else if (attempts === 3) lockMinutes = 5;

      if (attempts >= 8) {
        await pool.query(
          `UPDATE users SET failed_login_attempts = $1, status = 'locked', lockout_until = NULL WHERE user_id = $2`,
          [attempts, user.user_id],
        );
        await logAudit({
          userId:      user.user_id,
          username:    user.username,
          eventName:   "Login Failed",
          description: `Account permanently locked after ${attempts} failed attempts`,
          action:      "LOGIN",
          status:      "failed",
          source:      "Web Portal",
          ipAddress:   ip,
        });
        return res.status(403).json({
          success: false,
          message: "Account permanently locked due to too many failed attempts. Contact an administrator.",
          attempts,
        });
      }

      if (lockMinutes > 0) {
        const lockUntil = new Date(Date.now() + lockMinutes * 60000);
        await pool.query(
          `UPDATE users SET failed_login_attempts = $1, status = 'locked', lockout_until = $2 WHERE user_id = $3`,
          [attempts, lockUntil, user.user_id],
        );
        await logAudit({
          userId:      user.user_id,
          username:    user.username,
          eventName:   "Login Failed",
          description: `Account locked for ${lockMinutes} minutes after ${attempts} failed attempts`,
          action:      "LOGIN",
          status:      "failed",
          source:      "Web Portal",
          ipAddress:   ip,
        });
        return res.status(403).json({
          success:       false,
          message:       `Account locked for ${lockMinutes} minutes`,
          lockout_until: lockUntil,
          attempts,
        });
      }

      await pool.query(
        `UPDATE users SET failed_login_attempts = $1 WHERE user_id = $2`,
        [attempts, user.user_id],
      );
      await logAudit({
        userId:      user.user_id,
        username:    user.username,
        eventName:   "Login Failed",
        description: `Incorrect password (attempt ${attempts})`,
        action:      "LOGIN",
        status:      "failed",
        source:      "Web Portal",
        ipAddress:   ip,
      });

      const attemptsLeft = attempts < 5 ? 5 - attempts : null;
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
        ...(attemptsLeft !== null && { attempts_left: attemptsLeft }),
      });
    }

    // ── SUCCESS ────────────────────────────────────────────────
    // Capture this BEFORE the UPDATE below overwrites last_login — a NULL
    // here means the account has never logged in anywhere, ever.
    const isFirstEverLogin = user.last_login === null;

    await pool.query(
      `UPDATE users
       SET failed_login_attempts = 0, status = 'verified', lockout_until = NULL, last_login = NOW()
       WHERE user_id = $1`,
      [user.user_id],
    );

    const userAgent  = req.headers["user-agent"] || null;
    const deviceType = /mobile/i.test(userAgent || "") ? "mobile" : "desktop";

    // Collapse any previous session from this same browser/device
    // so re-logging in doesn't stack duplicate stale sessions.
    await tokenManager.revokeSessionsForSameDevice(user.user_id, userAgent, ip);

    // ── New-device detection (IP + User-Agent) ──────────────────
    // A brand-new account has no baseline device to compare against yet,
    // so its very first login always skips the check and becomes the
    // trusted baseline instead of triggering a verification email.
    let isNewDevice = false;
    if (!isFirstEverLogin) {
      const trustedCheck = await pool.query(
        `SELECT 1 FROM trusted_devices
         WHERE user_id = $1
           AND ip_address IS NOT DISTINCT FROM $2
           AND user_agent IS NOT DISTINCT FROM $3
           AND trusted_until > NOW()
         LIMIT 1`,
        [user.user_id, ip, userAgent],
      );
      isNewDevice = trustedCheck.rows.length === 0;
    }

    // ── Unrecognized device on an existing account → hold the login,
    // require an emailed code before a token is ever issued ──────────
    if (isNewDevice) {
      const pending = await authService.createPendingDeviceLogin({
        userId:     user.user_id,
        email:      user.email,
        firstName:  user.first_name,
        ipAddress:  ip,
        userAgent,
        deviceType,
        rememberMe: rememberMe === true,
      });

      if (!pending.success) {
        return res.status(500).json({
          success: false,
          message: pending.message || "Failed to start device verification",
        });
      }

      await logAudit({
        userId:      user.user_id,
        username:    user.username,
        eventName:   "Device Verification Required",
        description: "Login held pending new-device email verification",
        action:      "LOGIN",
        status:      "pending",
        source:      "Web Portal",
        ipAddress:   ip,
        userAgent,
      });

      const canUseTrustedDevice = await authService.userHasTrustedDevice(user.user_id);

      return res.status(200).json({
        success:                    false,
        requiresDeviceVerification: true,
        pendingId:                  pending.pendingId,
        maskedEmail:                pending.maskedEmail,
        otpExpiresAt:               pending.otpExpiresAt,
        resendsLeft:                pending.resendsLeft,
        canUseTrustedDevice,
      });
    }

    // First-ever login on this account → this device becomes the trusted baseline
    if (isFirstEverLogin) {
      await pool.query(
        `INSERT INTO trusted_devices (user_id, ip_address, user_agent, trusted_until)
         VALUES ($1, $2, $3, NOW() + INTERVAL '30 days')
         ON CONFLICT DO NOTHING`,
        [user.user_id, ip, userAgent],
      );
    }

    const token = await tokenManager.createToken(
  {
    user_id:   user.user_id,
    username:  user.username,
    email:     user.email,
    role:      user.role_name,
    user_type: user.user_type,
  },
  {
    expiresIn: rememberMe === true ? "7d" : undefined,
    userAgent,
    deviceType,
    ipAddress: ip,
  }
);

    await logAudit({
      userId:      user.user_id,
      username:    user.username,
      eventName:   "User Login",
      description: "Account successfully logged in via web portal",
      action:      "LOGIN",
      status:      "success",
      source:      "Web Portal",
      ipAddress:   ip,
      userAgent,
    });

    return res.status(200).json({
      success: true,
      token,
      user: {
        user_id:                user.user_id,
        username:               user.username,
        role:                   user.role_name,
        user_type:              user.user_type,
        first_name:             user.first_name,
        last_name:              user.last_name,
        profile_picture:        user.profile_picture || null,
        assigned_barangay_code: user.assigned_barangay_code || null,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ success: false, message: "Login failed" });
  }
};

// ============================================================
// VERIFY NEW-DEVICE LOGIN (email code gate before token issuance)
// ============================================================
// Shared by verifyDeviceLogin (never trusts) and the approve-poll endpoint
// (trusts only if the approver checked the box). trustDevice controls that.
async function issueDeviceLoginToken({ userRow, ipAddress, userAgent, deviceType, rememberMe, trustDevice, deviceId = null, deviceLabel: precomputedLabel = null }) {
  if (trustDevice) {
    if (deviceId) {
      // Mobile: trust the app install, not ip/ua — cellular IPs churn.
      await pool.query(
        `INSERT INTO trusted_devices (user_id, ip_address, user_agent, trusted_until, device_id)
         VALUES ($1, $2, $3, NOW() + INTERVAL '30 days', $4)`,
        [userRow.user_id, ipAddress, userAgent, deviceId],
      );
    } else {
      await pool.query(
        `INSERT INTO trusted_devices (user_id, ip_address, user_agent, trusted_until)
         VALUES ($1, $2, $3, NOW() + INTERVAL '30 days')
         ON CONFLICT DO NOTHING`,
        [userRow.user_id, ipAddress, userAgent],
      );
    }
  }

  const token = await tokenManager.createToken(
    {
      user_id:   userRow.user_id,
      username:  userRow.username,
      email:     userRow.email,
      role:      userRow.role_name,
      user_type: userRow.user_type,
    },
    {
      expiresIn: deviceType === "mobile" ? "30d" : (rememberMe ? "7d" : undefined),
      userAgent,
      deviceType,
      ipAddress,
      clientAppLabel: precomputedLabel,
    },
  );

  const deviceLabel = precomputedLabel || parseDeviceLabel(userAgent, deviceType);
  await pool.query(
    `INSERT INTO notifications
       (recipient_user_id, sender_user_id, sender_name, type, title, message, link_to, is_read, metadata)
     VALUES ($1, NULL, NULL, 'NEW_LOGIN', $2, $3, $4, FALSE, $5::jsonb)`,
    [
      userRow.user_id,
      "New login detected",
      `A new login to your account was detected on ${deviceLabel}.`,
      "/profile?openChangePassword=1",
      JSON.stringify({
        device_label: deviceLabel,
        ip_address:   ipAddress,
        user_agent:   userAgent,
        login_at:     new Date().toISOString(),
      }),
    ],
  );

  return token;
}

const verifyDeviceLogin = async (req, res) => {
  try {
    const { pendingId, code } = req.body;
    const ip = getClientIp(req);

    if (!pendingId || !code) {
      return res.status(400).json({ success: false, message: "Missing verification details" });
    }

    const result = await authService.verifyPendingDeviceLogin(pendingId, code, ip);

    if (!result.success) {
      const status = result.locked || result.sessionLocked ? 429 : 400;
      return res.status(status).json(result);
    }

    const { userRow, ipAddress, userAgent, deviceType, rememberMe, deviceId, deviceLabel } = result;

    const token = await issueDeviceLoginToken({
      userRow, ipAddress, userAgent, deviceType, rememberMe, deviceId, deviceLabel,
      trustDevice: false, // manual code-entry never auto-trusts
    });

    await logAudit({
      userId:      userRow.user_id,
      username:    userRow.username,
      eventName:   "User Login",
      description: "New device verified and login completed via web portal",
      action:      "LOGIN",
      status:      "success",
      source:      "Web Portal",
      ipAddress,
      userAgent,
    });

    return res.status(200).json({
      success: true,
      token,
      user: {
        user_id:                userRow.user_id,
        username:               userRow.username,
        role:                   userRow.role_name,
        user_type:              userRow.user_type,
        first_name:             userRow.first_name,
        last_name:              userRow.last_name,
        profile_picture:        userRow.profile_picture || null,
        assigned_barangay_code: userRow.assigned_barangay_code || null,
      },
    });
  } catch (error) {
    console.error("Verify device login error:", error);
    res.status(500).json({ success: false, message: "Verification failed" });
  }
};

// ============================================================
// RESEND NEW-DEVICE LOGIN OTP
// ============================================================
const resendDeviceLogin = async (req, res) => {
  try {
    const { pendingId } = req.body;
    const ip = getClientIp(req);

    if (!pendingId) {
      return res.status(400).json({ success: false, message: "Missing pending login id" });
    }

    const result = await authService.resendPendingDeviceLogin(pendingId, ip);
    const status = result.success ? 200 : (result.locked ? 429 : 400);
    res.status(status).json(result);
  } catch (error) {
    console.error("Resend device login error:", error);
    res.status(500).json({ success: false, message: "Failed to resend code" });
  }
};

// ============================================================
// REQUEST APPROVAL FROM ANOTHER (TRUSTED) DEVICE
// ============================================================
const requestDeviceApproval = async (req, res) => {
  try {
    const { pendingId } = req.body;
    if (!pendingId) {
      return res.status(400).json({ success: false, message: "Missing pending login id" });
    }
    const requestingDeviceId = req.headers["x-device-id"] || null;
    const result = await authService.requestDeviceApproval(pendingId, requestingDeviceId);
    res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    console.error("Request device approval error:", error);
    res.status(500).json({ success: false, message: "Failed to request approval" });
  }
};

// ============================================================
// POLL — waiting device checks whether it's been approved/denied
// ============================================================
const pollDeviceLogin = async (req, res) => {
  try {
    const { pendingId } = req.query;
    if (!pendingId) {
      return res.status(400).json({ success: false, message: "Missing pending login id" });
    }

    const result = await authService.pollPendingDeviceLogin(pendingId);

    if (!result.success || result.status !== "approved") {
      return res.status(200).json(result);
    }

    const { userRow, ipAddress, userAgent, deviceType, rememberMe, trustDevice, deviceId, deviceLabel } = result;

    const token = await issueDeviceLoginToken({
      userRow, ipAddress, userAgent, deviceType, rememberMe, trustDevice, deviceId, deviceLabel,
    });

    await logAudit({
      userId:      userRow.user_id,
      username:    userRow.username,
      eventName:   "User Login",
      description: "Login approved from another device via web portal",
      action:      "LOGIN",
      status:      "success",
      source:      "Web Portal",
      ipAddress,
      userAgent,
    });

    return res.status(200).json({
      success: true,
      status:  "approved",
      token,
      user: {
        user_id:                userRow.user_id,
        username:               userRow.username,
        role:                   userRow.role_name,
        user_type:              userRow.user_type,
        first_name:             userRow.first_name,
        last_name:              userRow.last_name,
        profile_picture:        userRow.profile_picture || null,
        assigned_barangay_code: userRow.assigned_barangay_code || null,
      },
    });
  } catch (error) {
    console.error("Poll device login error:", error);
    res.status(500).json({ success: false, message: "Failed to check login status" });
  }
};

// ============================================================
// LOGOUT
// ============================================================
const logout = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    const ip    = getClientIp(req);

    if (!token) {
      return res.status(400).json({ success: false, message: "No token provided" });
    }

    await tokenManager.revokeToken(token);

    await logAudit({
      userId:      req.user.user_id,
      username:    req.user.username,
      eventName:   "User Logout",
      description: `User logged out`,
      action:      "LOGOUT",
      status:      "success",
      source:      "Web Portal",
      ipAddress:   ip,
    });

    res.status(200).json({ success: true, message: "Logged out successfully" });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({ success: false, message: "Logout failed" });
  }
};

// ============================================================
// LOGOUT ALL DEVICES
// ============================================================
const logoutAll = async (req, res) => {
  try {
    const ip = getClientIp(req);

    await tokenManager.revokeAllUserTokens(req.user.user_id);

    await logAudit({
      userId:      req.user.user_id,
      username:    req.user.username,
      eventName:   "Logout All Devices",
      description: `User revoked all active sessions`,
      action:      "LOGOUT",
      status:      "success",
      source:      "Web Portal",
      ipAddress:   ip,
    });

    res.status(200).json({ success: true, message: "Logged out from all devices" });
  } catch (error) {
    console.error("Logout all error:", error);
    res.status(500).json({ success: false, message: "Logout all failed" });
  }
};

// ============================================================
// SEND OTP
// ============================================================
const sendOTP = async (req, res) => {
  try {
    const { email } = req.body;
    const ip        = getClientIp(req);

    const errors = validateEmail(email);
    if (errors.length > 0) {
      return res.status(400).json({ success: false, errors });
    }

    const userCheck = await pool.query(
      "SELECT user_id, email, status FROM users WHERE LOWER(email) = LOWER($1)",
      [email],
    );

    if (userCheck.rows.length === 0) {
      return res.status(200).json({ success: false, message: "Email not found" });
    }

    const user = userCheck.rows[0];

    if (user.status === "deactivated") {
      return res.status(403).json({ success: false, message: "Account is deactivated" });
    }

    if (user.status === "unverified") {
      return res.status(403).json({ success: false, message: "Account is not yet verified" });
    }

    // Pass IP through to the service so it can be logged
    const result = await authService.sendOTP(email, ip);
    res.status(result.success ? 200 : 429).json(result);
  } catch (error) {
    console.error("Send OTP error:", error);
    res.status(500).json({ success: false, message: "Failed to send OTP" });
  }
};

// ============================================================
// VERIFY OTP
// ============================================================
const verifyOTP = async (req, res) => {
  try {
    const { email, code } = req.body;
    const ip              = getClientIp(req);

    const emailErrors = validateEmail(email);
    if (emailErrors.length > 0) {
      return res.status(400).json({ success: false, errors: emailErrors });
    }

    const codeErrors = validateOTPCode(code);
    if (codeErrors.length > 0) {
      return res.status(400).json({ success: false, errors: codeErrors });
    }

    const result = await authService.verifyOTP(email, code, ip);
    const status = result.success ? 200 : (result.locked ? 429 : 400);
    res.status(status).json(result);
  } catch (error) {
    console.error("Verify OTP error:", error);
    res.status(500).json({ success: false, message: "OTP verification failed" });
  }
};
// ============================================================
// RESEND OTP
// ============================================================
const resendOTP = async (req, res) => {
  try {
    const { email } = req.body;
    const ip        = getClientIp(req);

    const errors = validateEmail(email);
    if (errors.length > 0) {
      return res.status(400).json({ success: false, errors });
    }

    const result = await authService.resendOTP(email, ip);
    res.status(result.success ? 200 : 429).json(result);
  } catch (error) {
    console.error("Resend OTP error:", error);
    res.status(500).json({ success: false, message: "Failed to resend OTP" });
  }
};
const forceLockOTP = async (req, res) => {
  try {
    const { email } = req.body;
    const ip = getClientIp(req);

    const errors = validateEmail(email);
    if (errors.length > 0) {
      return res.status(400).json({ success: false, errors });
    }

    const result = await authService.forceLock(email, ip);
    res.status(200).json(result);
  } catch (error) {
    console.error("Force lock error:", error);
    res.status(500).json({ success: false, message: "Failed to lock session" });
  }
};
// ============================================================
// RESET PASSWORD
// ============================================================
const resetPassword = async (req, res) => {
  const client = await pool.connect();

  try {
    let { email, newPassword } = req.body;
    newPassword = newPassword?.trim();
    const ip = getClientIp(req);

    const errors = validateResetPassword(email, newPassword);
    if (errors.length > 0) {
      return res.status(400).json({ success: false, errors });
    }

    await client.query("BEGIN");

    const userResult = await client.query(
      "SELECT user_id, username, password, status FROM users WHERE LOWER(email) = LOWER($1)",
      [email],
    );

    if (userResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const user = userResult.rows[0];

    if (user.status === "deactivated") {
      await client.query("ROLLBACK");
      return res.status(403).json({ success: false, message: "Account is deactivated" });
    }

    const isSamePassword = await bcrypt.compare(newPassword, user.password);
    if (isSamePassword) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: "New password cannot be the same as the old password",
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);

    await client.query(
      `UPDATE users
       SET password = $1,
           failed_login_attempts = 0,
           status = CASE WHEN status = 'locked' THEN 'verified' ELSE status END,
           lockout_until = NULL,
           updated_at = NOW()
       WHERE user_id = $2`,
      [hashedPassword, user.user_id],
    );

    await client.query(
      `UPDATE otp_requests
       SET locked_until = NULL,
           attempts = 0,
           resends_left = 3,
           last_recovery_completed_at = NOW()
       WHERE LOWER(email) = LOWER($1)`,
      [email],
    );

    await client.query("COMMIT");

    await logAudit({
      userId:      user.user_id,
      username:    user.username,
      eventName:   "Password Reset",
      description: `Password reset via OTP for ${email}`,
      action:      "UPDATE",
      status:      "success",
      source:      "Web Portal",
      ipAddress:   ip,
    });

    res.status(200).json({ success: true, message: "Password reset successfully" });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Reset password error:", error);
    res.status(500).json({ success: false, message: "Password reset failed" });
  } finally {
    client.release();
  }
};

// ============================================================
// CHANGE PASSWORD
// ============================================================
const changePassword = async (req, res) => {
  const client = await pool.connect();

  try {
    let { currentPassword, newPassword } = req.body;
    currentPassword = currentPassword?.trim();
    newPassword     = newPassword?.trim();
    const ip        = getClientIp(req);

    const errors = validatePasswordChange(currentPassword, newPassword);
    if (errors.length > 0) {
      return res.status(400).json({ success: false, errors });
    }

    await client.query("BEGIN");

    const result = await client.query(
      "SELECT password FROM users WHERE user_id = $1",
      [req.user.user_id],
    );

    if (result.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const valid = await bcrypt.compare(currentPassword, result.rows[0].password);
    if (!valid) {
      await client.query("ROLLBACK");

      await logAudit({
        userId:      req.user.user_id,
        username:    req.user.username,
        eventName:   "Password Change Failed",
        description: "Incorrect current password",
        action:      "UPDATE",
        status:      "failed",
        source:      "Web Portal",
        ipAddress:   ip,
      });

      return res.status(401).json({ success: false, message: "Current password is incorrect" });
    }

    const isSamePassword = await bcrypt.compare(newPassword, result.rows[0].password);
    if (isSamePassword) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: "New password cannot be the same as the current password",
      });
    }

    const hashed = await bcrypt.hash(newPassword, 12);

    await client.query(
      "UPDATE users SET password = $1, updated_at = NOW() WHERE user_id = $2",
      [hashed, req.user.user_id],
    );

    await tokenManager.revokeAllUserTokens(req.user.user_id);
    await client.query(
      "DELETE FROM trusted_devices WHERE user_id = $1",
      [req.user.user_id],
    );

    await client.query("COMMIT");

    await logAudit({
      userId:      req.user.user_id,
      username:    req.user.username,
      eventName:   "Password Changed",
      description: "All account sessions revoked",
      action:      "UPDATE",
      status:      "success",
      source:      "Web Portal",
      ipAddress:   ip,
    });

    res.status(200).json({
      success: true,
      message: "Password changed successfully. Please log in again.",
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Change password error:", error);
    res.status(500).json({ success: false, message: "Password change failed" });
  } finally {
    client.release();
  }
};

// ============================================================
// MOBILE LOGIN (Admin + Patrol only — 30d token)
// ============================================================
const mobileLogin = async (req, res) => {
  const ALLOWED_ROLES    = ["Administrator", "Patrol", "Technical Administrator"];
  const MOBILE_TOKEN_EXPIRY = "30d";

  try {
    const { username, password } = req.body;
    const ip = getClientIp(req);

    const errors = validateLoginInput(username, password);
    if (errors.length > 0) {
      return res.status(400).json({ success: false, errors });
    }

    const result = await pool.query(
      `SELECT
        u.user_id, u.username, u.password, u.email,
        u.first_name, u.last_name, u.user_type,
        u.profile_picture,
        u.status, u.lockout_until,
        u.failed_login_attempts, u.last_login,
        r.role_name,
        bd.barangay_code AS assigned_barangay_code
       FROM users u
       JOIN roles r ON u.role_id = r.role_id
       LEFT JOIN barangay_details bd ON u.user_id = bd.user_id
       WHERE u.username = $1`,
      [username.trim()],
    );

    if (result.rows.length === 0) {
      await logAudit({
        username:    username.trim(),
        eventName:   "Login Failed",
        description: "Account does not exist",
        action:      "LOGIN",
        status:      "failed",
        source:      "Mobile App",
        ipAddress:   ip,
      });
      return res.status(401).json({ success: false, message: "Account does not exist" });
    }

    const user = result.rows[0];
    const now  = new Date();

    // ── MOBILE ROLE GUARD ──────────────────────────────────────
    if (!ALLOWED_ROLES.includes(user.role_name)) {
      await logAudit({
        userId:      user.user_id,
        username:    user.username,
        eventName:   "Login Blocked",
        description: `Role '${user.role_name}' is not permitted on the mobile app`,
        action:      "LOGIN",
        status:      "failed",
        source:      "Mobile App",
        ipAddress:   ip,
      });
      return res.status(403).json({
        success: false,
        message: "Access denied. This app is restricted to Admin and Patrol officers only.",
      });
    }

    // ── STATUS CHECKS ──────────────────────────────────────────

    if (user.status === "deactivated") {
      await logAudit({
        userId:      user.user_id,
        username:    user.username,
        eventName:   "Login Blocked",
        description: "Account is deactivated",
        action:      "LOGIN",
        status:      "failed",
        source:      "Mobile App",
        ipAddress:   ip,
      });
      return res.status(403).json({ success: false, message: "Account has been deactivated" });
    }

    if (user.status === "unverified") {
      await logAudit({
        userId:      user.user_id,
        username:    user.username,
        eventName:   "Login Blocked",
        description: "Account is not yet verified",
        action:      "LOGIN",
        status:      "failed",
        source:      "Mobile App",
        ipAddress:   ip,
      });
      return res.status(403).json({ success: false, message: "Account is not yet verified" });
    }

    if (user.status === "locked" && user.lockout_until) {
      if (now < new Date(user.lockout_until)) {
        const diffMs  = new Date(user.lockout_until) - now;
        const minutes = Math.floor(diffMs / 60000);
        const seconds = Math.floor((diffMs % 60000) / 1000);

        await logAudit({
          userId:      user.user_id,
          username:    user.username,
          eventName:   "Login Blocked",
          description: `Account is temporarily locked (${minutes}m ${seconds}s remaining)`,
          action:      "LOGIN",
          status:      "failed",
          source:      "Mobile App",
          ipAddress:   ip,
        });

        return res.status(403).json({
          success:       false,
          message:       `Account locked. Try again in ${minutes}m ${seconds}s`,
          lockout_until: user.lockout_until,
        });
      }

      await pool.query(
        `UPDATE users SET status = 'verified', lockout_until = NULL, failed_login_attempts = 0 WHERE user_id = $1`,
        [user.user_id],
      );
      user.status = "verified";
    }

    if (user.status === "locked" && !user.lockout_until) {
      await logAudit({
        userId:      user.user_id,
        username:    user.username,
        eventName:   "Login Blocked",
        description: "Account is permanently locked",
        action:      "LOGIN",
        status:      "failed",
        source:      "Mobile App",
        ipAddress:   ip,
      });
      return res.status(403).json({
        success: false,
        message: "Account is permanently locked. Please contact an administrator.",
      });
    }

    // ── PASSWORD VERIFICATION ──────────────────────────────────

    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      let attempts    = user.failed_login_attempts + 1;
      let lockMinutes = 0;

      if (attempts >= 8)       lockMinutes = null;
      else if (attempts === 5) lockMinutes = 15;
      else if (attempts === 3) lockMinutes = 5;

      if (attempts >= 8) {
        await pool.query(
          `UPDATE users SET failed_login_attempts = $1, status = 'locked', lockout_until = NULL WHERE user_id = $2`,
          [attempts, user.user_id],
        );
        await logAudit({
          userId:      user.user_id,
          username:    user.username,
          eventName:   "Login Failed",
          description: `Account permanently locked after ${attempts} failed attempts`,
          action:      "LOGIN",
          status:      "failed",
          source:      "Mobile App",
          ipAddress:   ip,
        });
        return res.status(403).json({
          success: false,
          message: "Account permanently locked due to too many failed attempts. Contact an administrator.",
        });
      }

      if (lockMinutes > 0) {
        const lockUntil = new Date(Date.now() + lockMinutes * 60000);
        await pool.query(
          `UPDATE users SET failed_login_attempts = $1, status = 'locked', lockout_until = $2 WHERE user_id = $3`,
          [attempts, lockUntil, user.user_id],
        );
        await logAudit({
          userId:      user.user_id,
          username:    user.username,
          eventName:   "Login Failed",
          description: `Account locked for ${lockMinutes} minutes after ${attempts} failed attempts`,
          action:      "LOGIN",
          status:      "failed",
          source:      "Mobile App",
          ipAddress:   ip,
        });
        return res.status(403).json({
          success:       false,
          message:       `Account locked for ${lockMinutes} minutes`,
          lockout_until: lockUntil,
        });
      }

      await pool.query(
        `UPDATE users SET failed_login_attempts = $1 WHERE user_id = $2`,
        [attempts, user.user_id],
      );
      await logAudit({
        userId:      user.user_id,
        username:    user.username,
        eventName:   "Login Failed",
        description: `Incorrect password (attempt ${attempts})`,
        action:      "LOGIN",
        status:      "failed",
        source:      "Mobile App",
        ipAddress:   ip,
      });

      const attemptsLeft = attempts < 5 ? 5 - attempts : null;
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
        ...(attemptsLeft !== null && { attempts_left: attemptsLeft }),
      });
    }

    // ── SUCCESS ────────────────────────────────────────────────
    // Same pattern as web login(): captured BEFORE the UPDATE below
    // overwrites last_login. NULL means this account has never logged
    // in anywhere (web or mobile) — its first login skips verification
    // and becomes the trusted baseline instead.
    const isFirstEverLogin = user.last_login === null;

    await pool.query(
      `UPDATE users
       SET failed_login_attempts = 0,
           status = 'verified',
           lockout_until = NULL,
           last_login = NOW()
       WHERE user_id = $1`,
      [user.user_id],
    );

    const userAgent = req.headers["user-agent"] || null;
    const deviceId  = req.headers["x-device-id"] || null;

    // Collapse any previous session from this same device before issuing a new one
    await tokenManager.revokeSessionsForSameDevice(user.user_id, userAgent, ip);

    // A native app identifies itself via X-Client-App/X-Client-Platform.
    // Computed once so the token row, any notification, and the
    // pending-device-login record (if this is a new device) all agree.
    const clientApp = req.headers["x-client-app"]
      ? { name: req.headers["x-client-app"], platform: req.headers["x-client-platform"] }
      : null;
    const deviceLabel = parseDeviceLabel(userAgent, "mobile", clientApp);

    // ── New-device detection — keyed on the per-install device ID, NOT
    // ip+ua. Cellular IPs churn constantly, so ip+ua trust would barely
    // ever hold on mobile. Falls back to ip+ua only if X-Device-Id is
    // somehow missing (older app build).
    let isNewDevice = false;
    if (!isFirstEverLogin) {
      const trustedCheck = deviceId
        ? await pool.query(
            `SELECT 1 FROM trusted_devices
             WHERE user_id = $1 AND device_id = $2 AND trusted_until > NOW()
             LIMIT 1`,
            [user.user_id, deviceId],
          )
        : await pool.query(
            `SELECT 1 FROM trusted_devices
             WHERE user_id = $1
               AND ip_address IS NOT DISTINCT FROM $2
               AND user_agent IS NOT DISTINCT FROM $3
               AND trusted_until > NOW()
             LIMIT 1`,
            [user.user_id, ip, userAgent],
          );
      isNewDevice = trustedCheck.rows.length === 0;
    }

    // ── Unrecognized device → hold the login, require the emailed code
    // (or approval from another trusted device) before a token is issued.
    if (isNewDevice) {
      const pending = await authService.createPendingDeviceLogin({
        userId:     user.user_id,
        email:      user.email,
        firstName:  user.first_name,
        ipAddress:  ip,
        userAgent,
        deviceType: "mobile",
        rememberMe: false,
        deviceId,
        deviceLabel,
      });

      if (!pending.success) {
        return res.status(500).json({
          success: false,
          message: pending.message || "Failed to start device verification",
        });
      }

      await logAudit({
        userId:      user.user_id,
        username:    user.username,
        eventName:   "Device Verification Required",
        description: "Mobile login held pending new-device email verification",
        action:      "LOGIN",
        status:      "pending",
        source:      "Mobile App",
        ipAddress:   ip,
        userAgent,
      });

      const canUseTrustedDevice = await authService.userHasTrustedDevice(user.user_id);

      return res.status(200).json({
        success:                    false,
        requiresDeviceVerification: true,
        pendingId:                  pending.pendingId,
        maskedEmail:                pending.maskedEmail,
        otpExpiresAt:               pending.otpExpiresAt,
        resendsLeft:                pending.resendsLeft,
        canUseTrustedDevice,
      });
    }

    // First-ever login (web or mobile) → this device becomes the
    // trusted baseline, keyed on device_id for mobile.
    if (isFirstEverLogin) {
      if (deviceId) {
        await pool.query(
          `INSERT INTO trusted_devices (user_id, ip_address, user_agent, trusted_until, device_id)
           VALUES ($1, $2, $3, NOW() + INTERVAL '30 days', $4)`,
          [user.user_id, ip, userAgent, deviceId],
        );
      } else {
        await pool.query(
          `INSERT INTO trusted_devices (user_id, ip_address, user_agent, trusted_until)
           VALUES ($1, $2, $3, NOW() + INTERVAL '30 days')
           ON CONFLICT DO NOTHING`,
          [user.user_id, ip, userAgent],
        );
      }
    }

    const token = await tokenManager.createToken(
      {
        user_id:   user.user_id,
        username:  user.username,
        email:     user.email,
        role:      user.role_name,
        user_type: user.user_type,
      },
      {
        expiresIn:  MOBILE_TOKEN_EXPIRY,
        userAgent,
        deviceType: "mobile",
        ipAddress:  ip,
        clientAppLabel: clientApp ? deviceLabel : null,
      },
    );

    await logAudit({
      userId:      user.user_id,
      username:    user.username,
      eventName:   "User Login",
      description: "Account successfully logged in via Mobile App",
      action:      "LOGIN",
      status:      "success",
      source:      "Mobile App",
      ipAddress:   ip,
      userAgent,
    });

    return res.status(200).json({
      success: true,
      token,
      user: {
        user_id:                user.user_id,
        username:               user.username,
        role:                   user.role_name,
        user_type:              user.user_type,
        first_name:             user.first_name,
        last_name:              user.last_name,
        profile_picture:        user.profile_picture || null,
        assigned_barangay_code: user.assigned_barangay_code || null,
      },
    });
  } catch (error) {
    console.error("Mobile login error:", error);
    res.status(500).json({ success: false, message: "Login failed" });
  }
};

// ============================================================
// VALIDATE TOKEN (used by mobile splash screen)
// ============================================================
const validateToken = async (req, res) => {
  // If this function is reached, the authenticate middleware
  // already confirmed the token is valid
  res.status(200).json({ success: true, user: req.user });
};

// ============================================================
// EXPORTS
// ============================================================
// ============================================================
// TRUST CURRENT DEVICE (post-verify "don't ask again" confirm)
// ============================================================
const trustCurrentDevice = async (req, res) => {
  try {
    const ip = getClientIp(req);
    const userAgent = req.headers["user-agent"] || null;

    await pool.query(
      `INSERT INTO trusted_devices (user_id, ip_address, user_agent, trusted_until)
       VALUES ($1, $2, $3, NOW() + INTERVAL '30 days')
       ON CONFLICT DO NOTHING`,
      [req.user.user_id, ip, userAgent],
    );

    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Trust current device error:", error);
    res.status(500).json({ success: false, message: "Failed to save preference" });
  }
};

module.exports = {
  login,
  mobileLogin,
  validateToken,
  logout,
  logoutAll,
  sendOTP,
  verifyOTP,
  resendOTP,
  forceLockOTP,
  resetPassword,
  changePassword,
  verifyDeviceLogin,
  resendDeviceLogin,
  requestDeviceApproval,
  pollDeviceLogin,
  trustCurrentDevice,
};