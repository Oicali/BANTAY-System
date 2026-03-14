const express = require("express");
const router = express.Router();
const { authenticate } = require("../../../shared/middleware/tokenMiddleware");
const {
  createBlotter,
  getAllBlotters,
  getBlotterById,
  updateBlotterStatus,
  deleteBlotter,
  updateBlotter,
  getModus,
  getDeletedBlotters,
  restoreBlotter
} = require("../controllers/blotterController");

router.post("/", authenticate, createBlotter);
router.get("/", authenticate, getAllBlotters);
router.get("/deleted/all", authenticate, getDeletedBlotters);
router.get("/modus/:crime_type", authenticate, getModus);  // ← BEFORE /:id
router.get("/:id", authenticate, getBlotterById);
router.put("/:id/status", authenticate, updateBlotterStatus);
router.put("/:id", authenticate, updateBlotter);
router.delete("/:id", authenticate, deleteBlotter);
router.put("/:id/restore", authenticate, restoreBlotter);

module.exports = router;