// ================================================================================
// FILE: backend/modules/auth/authRoutes.js
// ================================================================================

const router = require("express").Router();
const { authenticate } = require("../../../shared/middleware/tokenMiddleware");
const {
  login,
  mobileLogin,
  validateToken, // ← add this
  logout,
  logoutAll,
  sendOTP,
  verifyOTP,
  resendOTP,
  resetPassword,
  changePassword,
} = require("../controllers/authController");

// ============================================================
// PUBLIC ROUTES (no auth required)
// ============================================================
router.post("/login",           login);
router.post("/mobile/login", mobileLogin);
router.post("/otp/send",        sendOTP);
router.post("/otp/verify",      verifyOTP);
router.post("/otp/resend",      resendOTP);
router.post("/password/reset",  resetPassword);

// ============================================================
// PROTECTED ROUTES (auth required)
// ============================================================
router.post("/logout",                    authenticate, logout);
router.post("/logout-all",                authenticate, logoutAll);
router.post("/password/change",           authenticate, changePassword);
router.get("/validate-token",             authenticate, validateToken);

module.exports = router;