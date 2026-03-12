// ================================================================================
// FILE: backend/features/user/routes/profileRoutes.js
// ================================================================================
// Added 2 new routes:
//   POST /users/email/force-lock    — called by frontend timer (email OTP)
//   POST /users/password/force-lock — called by frontend timer (password OTP)
// ================================================================================

const router = require('express').Router();
const ProfileController           = require('../controllers/profileController');
const EmailVerificationController = require('../controllers/emailVerificationController');
const { authenticate }            = require('../../../shared/middleware/tokenMiddleware');
const multer = require('multer');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'), false);
  }
});

// ── Profile ───────────────────────────────────────────────────────────────────
router.get('/profile',                      authenticate, ProfileController.getProfile);
router.post('/check-phone',                 authenticate, ProfileController.checkPhoneAvailability);
router.put('/profile/:id',                  authenticate, upload.single('profilePicture'), ProfileController.updateProfile);
router.post('/change-password',             authenticate, ProfileController.changePassword);
router.post('/profile/picture/:userId',     authenticate, upload.single('profilePicture'), ProfileController.uploadProfilePictureForUser);
router.post('/profile/picture',             authenticate, upload.single('profilePicture'), ProfileController.uploadProfilePicture);

// ── Secure Email Change (4-step flow) ─────────────────────────────────────────
router.get('/email/status',               authenticate, EmailVerificationController.getEmailStatus);
router.post('/email/force-lock',          authenticate, EmailVerificationController.forceLock);       // NEW
router.post('/email/verify-password',     authenticate, EmailVerificationController.verifyPassword);
router.post('/email/request-old-otp',     authenticate, EmailVerificationController.requestOldOtp);
router.post('/email/verify-old-otp',      authenticate, EmailVerificationController.verifyOldOtp);
router.post('/email/request-new-otp',     authenticate, EmailVerificationController.requestNewOtp);
router.post('/email/verify-new-otp',      authenticate, EmailVerificationController.verifyNewOtp);

// ── Secure Password Change (3-step: verify current → new password → OTP) ──────
router.get('/password/status',            authenticate, ProfileController.getPasswordStatus);
router.post('/password/verify-current',   authenticate, ProfileController.verifyCurrentPassword);
router.post('/password/request-otp',      authenticate, ProfileController.requestPasswordOtp);
router.post('/password/verify-otp',       authenticate, ProfileController.changePasswordWithOtp);
router.post('/password/force-lock',       authenticate, ProfileController.forcePasswordLock);         // NEW

module.exports = router;