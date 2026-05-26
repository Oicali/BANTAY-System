// backend\features\blotter\routes\blotterRoutes.js
const express = require("express");
const router = express.Router();
const upload = require("../middleware/uploadMiddleware");
const { authenticate } = require("../../../shared/middleware/tokenMiddleware");
const { exportBlotter } = require("../controllers/exportBlotterController");

const {
  createBlotter,
  getAllBlotters,
  getBlotterById,
  updateBlotterStatus,
  deleteBlotter,
  updateBlotter,
  getModus,
  getDeletedBlotters,
  restoreBlotter,
  importBlotters,
  acceptReferral, createBrgyReport, getBrgyReports, getReferredCount, detectCrimeType, respondToReferral, getPatrolUsers, remindPatrols,
} = require("../controllers/blotterController");
const {
  uploadAttachment,
  getAttachments,
  deleteAttachment,
} = require("../controllers/attachmentController");

const attachmentUpload = require("../middleware/attachmentUpload");

router.post("/", authenticate, createBlotter);
router.get("/", authenticate, getAllBlotters);
router.get("/deleted/all", authenticate, getDeletedBlotters);
router.get("/referred/count", authenticate, getReferredCount);
router.get("/modus/:crime_type", authenticate, getModus);
router.post("/import", authenticate, upload.single("file"), importBlotters);
router.post("/export", authenticate, exportBlotter);
router.post("/brgy-report", authenticate, createBrgyReport);
router.get("/brgy-reports/mine", authenticate, getBrgyReports);
router.post("/detect-crime-type", authenticate, detectCrimeType);

// ✅ Static routes BEFORE /:id
router.get("/patrols", authenticate, getPatrolUsers);

// ── all /:id routes together ──
router.patch("/:id/respond", authenticate, respondToReferral);
router.patch("/:id/accept", authenticate, acceptReferral);
router.get("/:id", authenticate, getBlotterById);
router.put("/:id/status", authenticate, updateBlotterStatus);
router.put("/:id", authenticate, updateBlotter);
router.delete("/:id", authenticate, deleteBlotter);
router.put("/:id/restore", authenticate, restoreBlotter);
router.get("/:id/attachments", authenticate, getAttachments);

router.post(
  "/:id/attachments",
  authenticate,
  (req, res, next) => {
    attachmentUpload.single("file")(req, res, (err) => {
      if (err) {
        // Multer errors (file too large, wrong type, etc.)
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({
            success: false,
            message: "File too large. Photos must be under 5MB and videos under 50MB.",
          });
        }
        return res.status(400).json({
          success: false,
          message: err.message || "File upload failed.",
        });
      }
      next();
    });
  },
  uploadAttachment
);

router.delete(
  "/:id/attachments/:attachmentId",
  authenticate,
  deleteAttachment
);
// ✅ This one is fine where it is since /:id/remind won't conflict
router.post("/:id/remind", authenticate, remindPatrols);

module.exports = router;