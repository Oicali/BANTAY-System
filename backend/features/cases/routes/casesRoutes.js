const router = require("express").Router();
const { authenticate } = require("../../../shared/middleware/tokenMiddleware");
const { createCase, assignInvestigator, updateStatus, updatePriority, getCases, getCaseById, addNote, getStatistics } = require("../controllers/casesController");
const requireAdmin = (req, res, next) => {
  if (req.user.role !== "Administrator") return res.status(403).json({ success: false, message: "Access denied" });
  next();
};

const requireAdminOrInvestigator = (req, res, next) => {
  if (!["Administrator", "Investigator"].includes(req.user.role)) return res.status(403).json({ success: false, message: "Access denied" });
  next();
};

router.get("/statistics", authenticate, requireAdmin, getStatistics);
router.get("/", authenticate, getCases);
router.get("/:id", authenticate, getCaseById);
router.post("/", authenticate, requireAdmin, createCase);
router.patch("/:id/assign", authenticate, requireAdmin, assignInvestigator);
router.patch("/:id/status", authenticate, requireAdminOrInvestigator, updateStatus);
router.post("/:id/notes", authenticate, requireAdminOrInvestigator, addNote);
router.patch("/:id/priority", authenticate, requireAdmin, updatePriority);

module.exports = router;