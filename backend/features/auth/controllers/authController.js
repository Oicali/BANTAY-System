// ================================================================================
// FILE: backend/modules/auth/authController.js
// ================================================================================

const pool = require("../../../config/database");
const bcrypt = require("bcrypt");
const tokenManager = require("../../../shared/utils/tokenManager");
const authService = require("../services/authService");
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
    const { username, password } = req.body;

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
      return res.status(401).json({
        success: false,
        message: "Account does not exist",
      });
    }

    const user = result.rows[0];
    const now = new Date();

    // ── STATUS CHECKS ──────────────────────────────────────────

    if (user.status === "deactivated") {
      return res.status(403).json({
        success: false,
        message: "Account has been deactivated",
      });
    }

    if (user.status === "unverified") {
      return res.status(403).json({
        success: false,
        message: "Account is not yet verified",
      });
    }

    // Timed lock — check lockout_until
    if (user.status === "locked" && user.lockout_until) {
      if (now < new Date(user.lockout_until)) {
        const diffMs = new Date(user.lockout_until) - now;
        const minutes = Math.floor(diffMs / 60000);
        const seconds = Math.floor((diffMs % 60000) / 1000);

        return res.status(403).json({
          success: false,
          message: `Account locked. Try again in ${minutes}m ${seconds}s`,
          lockout_until: user.lockout_until,
          remaining_minutes: minutes,
          remaining_seconds: seconds,
        });
      }

      // Timed lock expired — restore to verified
      await pool.query(
        `UPDATE users
         SET status = 'verified', lockout_until = NULL, failed_login_attempts = 0
         WHERE user_id = $1`,
        [user.user_id],
      );
      user.status = "verified";
    }

    // Permanent lock (lockout_until IS NULL but status = 'locked')
    if (user.status === "locked" && !user.lockout_until) {
      return res.status(403).json({
        success: false,
        message:
          "Account is permanently locked. Please contact an administrator.",
      });
    }

    // ── PASSWORD VERIFICATION ──────────────────────────────────

    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      let attempts = user.failed_login_attempts + 1;
      let lockMinutes = 0;

      if (attempts >= 8) lockMinutes = null;
      else if (attempts === 5) lockMinutes = 15;
      else if (attempts === 3) lockMinutes = 5;

      if (attempts >= 8) {
        await pool.query(
          `UPDATE users
           SET failed_login_attempts = $1, status = 'locked', lockout_until = NULL
           WHERE user_id = $2`,
          [attempts, user.user_id],
        );

        return res.status(403).json({
          success: false,
          message:
            "Account permanently locked due to too many failed attempts. Contact an administrator.",
          attempts,
        });
      }

      if (lockMinutes > 0) {
        const lockUntil = new Date(Date.now() + lockMinutes * 60000);

        await pool.query(
          `UPDATE users
           SET failed_login_attempts = $1, status = 'locked', lockout_until = $2
           WHERE user_id = $3`,
          [attempts, lockUntil, user.user_id],
        );

        return res.status(403).json({
          success: false,
          message: `Account locked for ${lockMinutes} minutes`,
          lockout_until: lockUntil,
          attempts,
        });
      }

      await pool.query(
        `UPDATE users SET failed_login_attempts = $1 WHERE user_id = $2`,
        [attempts, user.user_id],
      );

      const attemptsLeft = attempts < 5 ? 5 - attempts : null;

      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
        ...(attemptsLeft !== null && { attempts_left: attemptsLeft }),
      });
    }

    // ── SUCCESS — reset security counters ─────────────────────

    await pool.query(
      `UPDATE users
       SET failed_login_attempts = 0,
           status = 'verified',
           lockout_until = NULL,
           last_login = NOW()
       WHERE user_id = $1`,
      [user.user_id],
    );

    // Web token — 24h (default)
    const token = await tokenManager.createToken({
      user_id: user.user_id,
      username: user.username,
      email: user.email,
      role: user.role_name,
      user_type: user.user_type,
    });

    return res.status(200).json({
      success: true,
      token,
      user: {
        user_id: user.user_id,
        username: user.username,
        role: user.role_name,
        user_type: user.user_type,
        first_name: user.first_name,
        last_name: user.last_name,
        profile_picture: user.profile_picture || null,
        assigned_barangay_code: user.assigned_barangay_code || null,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ success: false, message: "Login failed" });
  }
};

// ============================================================
// LOGOUT
// ============================================================
const logout = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
      return res
        .status(400)
        .json({ success: false, message: "No token provided" });
    }

    await tokenManager.revokeToken(token);
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
    await tokenManager.revokeAllUserTokens(req.user.user_id);
    res
      .status(200)
      .json({ success: true, message: "Logged out from all devices" });
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

    const errors = validateEmail(email);
    if (errors.length > 0) {
      return res.status(400).json({ success: false, errors });
    }

    const userCheck = await pool.query(
      "SELECT user_id, email, status FROM users WHERE LOWER(email) = LOWER($1)",
      [email],
    );

    if (userCheck.rows.length === 0) {
      return res
        .status(200)
        .json({ success: false, message: "Email not found" });
    }

    const user = userCheck.rows[0];

    if (user.status === "deactivated") {
      return res
        .status(403)
        .json({ success: false, message: "Account is deactivated" });
    }

    if (user.status === "unverified") {
      return res
        .status(403)
        .json({ success: false, message: "Account is not yet verified" });
    }

    const result = await authService.sendOTP(email);
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

    const emailErrors = validateEmail(email);
    if (emailErrors.length > 0) {
      return res.status(400).json({ success: false, errors: emailErrors });
    }

    const codeErrors = validateOTPCode(code);
    if (codeErrors.length > 0) {
      return res.status(400).json({ success: false, errors: codeErrors });
    }

    const result = await authService.verifyOTP(email, code);
    res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    console.error("Verify OTP error:", error);
    res
      .status(500)
      .json({ success: false, message: "OTP verification failed" });
  }
};

// ============================================================
// RESEND OTP
// ============================================================
const resendOTP = async (req, res) => {
  try {
    const { email } = req.body;

    const errors = validateEmail(email);
    if (errors.length > 0) {
      return res.status(400).json({ success: false, errors });
    }

    const result = await authService.resendOTP(email);
    res.status(result.success ? 200 : 429).json(result);
  } catch (error) {
    console.error("Resend OTP error:", error);
    res.status(500).json({ success: false, message: "Failed to resend OTP" });
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

    const errors = validateResetPassword(email, newPassword);
    if (errors.length > 0) {
      return res.status(400).json({ success: false, errors });
    }

    await client.query("BEGIN");

    const userResult = await client.query(
      "SELECT user_id, password, status FROM users WHERE LOWER(email) = LOWER($1)",
      [email],
    );

    if (userResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const user = userResult.rows[0];

    if (user.status === "deactivated") {
      await client.query("ROLLBACK");
      return res
        .status(403)
        .json({ success: false, message: "Account is deactivated" });
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
      "DELETE FROM otp_requests WHERE LOWER(email) = LOWER($1)",
      [email],
    );

    await client.query("COMMIT");

    res
      .status(200)
      .json({ success: true, message: "Password reset successfully" });
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
    newPassword = newPassword?.trim();

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
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const valid = await bcrypt.compare(
      currentPassword,
      result.rows[0].password,
    );
    if (!valid) {
      await client.query("ROLLBACK");
      return res
        .status(401)
        .json({ success: false, message: "Current password is incorrect" });
    }

    const isSamePassword = await bcrypt.compare(
      newPassword,
      result.rows[0].password,
    );
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

    await client.query("COMMIT");

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
  const ALLOWED_ROLES = ['Administrator', 'Patrol'];
  const MOBILE_TOKEN_EXPIRY = '30d'; // remember me — only expires on logout

  try {
    const { username, password } = req.body;

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
      return res.status(401).json({ success: false, message: 'Account does not exist' });
    }

    const user = result.rows[0];
    const now = new Date();

    // ── MOBILE ROLE GUARD ──────────────────────────────────────
    if (!ALLOWED_ROLES.includes(user.role_name)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. This app is restricted to Admin and Patrol officers only.',
      });
    }

    // ── STATUS CHECKS ──────────────────────────────────────────
    if (user.status === "deactivated") {
      return res.status(403).json({ success: false, message: "Account has been deactivated" });
    }

    if (user.status === "unverified") {
      return res.status(403).json({ success: false, message: "Account is not yet verified" });
    }

    if (user.status === "locked" && user.lockout_until) {
      if (now < new Date(user.lockout_until)) {
        const diffMs = new Date(user.lockout_until) - now;
        const minutes = Math.floor(diffMs / 60000);
        const seconds = Math.floor((diffMs % 60000) / 1000);
        return res.status(403).json({
          success: false,
          message: `Account locked. Try again in ${minutes}m ${seconds}s`,
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
      return res.status(403).json({
        success: false,
        message: "Account is permanently locked. Please contact an administrator.",
      });
    }

    // ── PASSWORD VERIFICATION ──────────────────────────────────
    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      let attempts = user.failed_login_attempts + 1;
      let lockMinutes = 0;

      if (attempts >= 8) lockMinutes = null;
      else if (attempts === 5) lockMinutes = 15;
      else if (attempts === 3) lockMinutes = 5;

      if (attempts >= 8) {
        await pool.query(
          `UPDATE users SET failed_login_attempts = $1, status = 'locked', lockout_until = NULL WHERE user_id = $2`,
          [attempts, user.user_id],
        );
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
        return res.status(403).json({
          success: false,
          message: `Account locked for ${lockMinutes} minutes`,
          lockout_until: lockUntil,
        });
      }

      await pool.query(
        `UPDATE users SET failed_login_attempts = $1 WHERE user_id = $2`,
        [attempts, user.user_id],
      );

      const attemptsLeft = attempts < 5 ? 5 - attempts : null;
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
        ...(attemptsLeft !== null && { attempts_left: attemptsLeft }),
      });
    }

    // ── SUCCESS — reset security counters ─────────────────────
    await pool.query(
      `UPDATE users
       SET failed_login_attempts = 0,
           status = 'verified',
           lockout_until = NULL,
           last_login = NOW()
       WHERE user_id = $1`,
      [user.user_id],
    );

    // Mobile token — 30d (remember me until logout)
    const token = await tokenManager.createToken({
      user_id: user.user_id,
      username: user.username,
      email: user.email,
      role: user.role_name,
      user_type: user.user_type,
    }, { expiresIn: MOBILE_TOKEN_EXPIRY }); // 👈 30d instead of 24h

    return res.status(200).json({
      success: true,
      token,
      user: {
        user_id: user.user_id,
        username: user.username,
        role: user.role_name,
        user_type: user.user_type,
        first_name: user.first_name,
        last_name: user.last_name,
        profile_picture: user.profile_picture || null,
        assigned_barangay_code: user.assigned_barangay_code || null,
      },
    });
  } catch (error) {
    console.error('Mobile login error:', error);
    res.status(500).json({ success: false, message: 'Login failed' });
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
module.exports = {
  login,
  mobileLogin,
  validateToken,
  logout,
  logoutAll,
  sendOTP,
  verifyOTP,
  resendOTP,
  resetPassword,
  changePassword,
};