// ================================================================================
// FILE: backend/modules/auth/authValidator.js
// ================================================================================

// ============================================================
// VALIDATE LOGIN INPUT
// ============================================================
const validateLoginInput = (username, password) => {
  const errors = [];

  if (!username || username.trim() === "") {
    errors.push("Username is required");
  }

  if (!password || password.trim() === "") {
    errors.push("Password is required");
  }

  return errors;
};

// ============================================================
// VALIDATE EMAIL FORMAT
// ============================================================
const validateEmail = (email) => {
  const errors = [];

  if (!email) {
    errors.push("Email is required");
    return errors;
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    errors.push("Invalid email format");
  }

  return errors;
};

// ============================================================
// VALIDATE PASSWORD CHANGE
// ============================================================
const validatePasswordChange = (currentPassword, newPassword) => {
  const errors = [];

  if (!currentPassword) errors.push("Current password is required");
  if (!newPassword) errors.push("New password is required");

  if (newPassword && newPassword.length < 8) {
    errors.push("New password must be at least 8 characters");
  }

  return errors;
};

// ============================================================
// VALIDATE RESET PASSWORD
// ============================================================
const validateResetPassword = (email, newPassword) => {
  const errors = [];

  if (!email) errors.push("Email is required");
  if (!newPassword) errors.push("New password is required");

  if (newPassword && newPassword.length < 8) {
    errors.push("Password must be at least 8 characters");
  }

  return errors;
};

// ============================================================
// VALIDATE OTP CODE
// ============================================================
const validateOTPCode = (code) => {
  const errors = [];

  if (!code) {
    errors.push("Verification code is required");
    return errors;
  }

  if (code.length !== 6) {
    errors.push("Verification code must be 6 digits");
  }

  if (!/^\d{6}$/.test(code)) {
    errors.push("Verification code must contain only numbers");
  }

  return errors;
};

module.exports = {
  validateLoginInput,
  validateEmail,
  validatePasswordChange,
  validateResetPassword,
  validateOTPCode,
};