// ================================================================================
// FILE: backend/features/user/routes/userRoutes.js
// ================================================================================

const router = require("express").Router();
const { authenticate } = require("../../../shared/middleware/tokenMiddleware");
const {
  getAllUsers,
  getFilterOptions,
  getUserById,
  registerUser,
  verifyAccount,
  resendVerificationEmail,
  updateUser,
  deactivateUser,
  lockUser,
  unlockUser,
  restoreUser,
  getAllRoles,
  getRanks
} = require("../controllers/userController");

// Multer setup for file uploads
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, "../../../uploads/profiles");
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, `profile-${uniqueSuffix}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"), false);
    }
  },
});

// =====================================================
// PUBLIC — no authentication required
// =====================================================

// GET  /verify-account?token=<raw_token>
router.get("/verify-account", verifyAccount);

// =====================================================
// PROTECTED — require authentication
// =====================================================

// GET  /users?userType=police&status=active&search=...&role=...&page=1&limit=20
router.get("/users", authenticate, getAllUsers);

// GET  /filter-options  (roles for police)
router.get("/filter-options", authenticate, getFilterOptions);

// GET  /users/:id
router.get("/users/:id", authenticate, getUserById);

// POST /register
router.post("/register", authenticate, upload.single("profilePicture"), registerUser);

// PUT  /users/:id
router.put("/users/:id", authenticate, upload.single("profilePicture"), updateUser);

// PUT  /users/:id/lock
router.put("/users/:id/lock", authenticate, lockUser);

// PUT  /users/:id/unlock
router.put("/users/:id/unlock", authenticate, unlockUser);

// DELETE /users/:id  (deactivate)
router.delete("/users/:id", authenticate, deactivateUser);

// PUT  /users/:id/restore
router.put("/users/:id/restore", authenticate, restoreUser);

// POST /users/:id/resend-verification
router.post("/users/:id/resend-verification", authenticate, resendVerificationEmail);

// GET  /roles
router.get("/roles", authenticate, getAllRoles);

router.get("/ranks", authenticate, getRanks);

module.exports = router;