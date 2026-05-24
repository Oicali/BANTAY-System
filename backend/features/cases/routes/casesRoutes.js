// backend\features\cases\routes\casesRoutes.js
const router = require("express").Router();
const { authenticate } = require("../../../shared/middleware/tokenMiddleware");
const { createCase, assignInvestigator, updateStatus, updatePriority, getCases, getCaseById, addNote, editNote, deleteNote, restoreNote, getStatistics } = require("../controllers/casesController");
const requireAdmin = (req, res, next) => {
  if (!["Administrator", "Technical Administrator"].includes(req.user.role))
    return res.status(403).json({ success: false, message: "Access denied" });
  next();
};

const requireAdminOrInvestigator = (req, res, next) => {
  if (!["Administrator", "Technical Administrator", "Investigator"].includes(req.user.role))
    return res.status(403).json({ success: false, message: "Access denied" });
  next();
};

router.get("/statistics", authenticate, requireAdmin, getStatistics);
router.patch("/notes/:noteId/restore", authenticate, requireAdmin, restoreNote);
router.patch("/notes/:noteId", authenticate, requireAdminOrInvestigator, editNote);
router.delete("/notes/:noteId", authenticate, requireAdminOrInvestigator, deleteNote);
router.get("/", authenticate, getCases);
router.get("/:id", authenticate, getCaseById);
router.post("/", authenticate, requireAdmin, createCase);
router.patch("/:id/assign", authenticate, requireAdmin, assignInvestigator);
router.patch("/:id/status", authenticate, requireAdminOrInvestigator, updateStatus);
router.post("/:id/notes", authenticate, requireAdminOrInvestigator, addNote);
router.patch("/:id/priority", authenticate, requireAdminOrInvestigator, updatePriority);
module.exports = router;