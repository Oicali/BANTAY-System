// ================================================================================
// FILE: backend/features/auth/routes/authRoutes.js
// ================================================================================

const router = require("express").Router();
const { authenticate } = require("../../../shared/middleware/tokenMiddleware");
const {
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
} = require("../controllers/authController");

// ============================================================
// PUBLIC ROUTES (no auth required)
// ============================================================
router.post("/login", login);
router.post("/mobile/login", mobileLogin);
router.post("/otp/send", sendOTP);
router.post("/otp/verify", verifyOTP);
router.post("/otp/resend", resendOTP);
router.post("/otp/force-lock", forceLockOTP);
router.post("/password/reset", resetPassword);
router.post("/device/verify", verifyDeviceLogin);
router.post("/device/resend", resendDeviceLogin);
router.post("/device/request-approval", requestDeviceApproval);
router.get("/device/poll", pollDeviceLogin);

// ============================================================
// PROTECTED ROUTES (auth required)
// ============================================================
router.post("/logout", authenticate, logout);
router.post("/logout-all", authenticate, logoutAll);
router.post("/password/change", authenticate, changePassword);
router.get("/validate-token", authenticate, validateToken);
router.post("/device/trust-current", authenticate, trustCurrentDevice);
router.get(
  "/session-check",
  (req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  },
  authenticate,
  (req, res) => {
    res.set("Cache-Control", "no-store");
    res.json({ success: true });
  },
);

module.exports = router;