const express = require("express");
const router = express.Router();
const upload = require("../middleware/uploadMiddleware");
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
  restoreBlotter,
  importBlotters 
} = require("../controllers/blotterController");

router.post("/", authenticate, createBlotter);
router.get("/", authenticate, getAllBlotters);
router.get("/deleted/all", authenticate, getDeletedBlotters);
router.get("/modus/:crime_type", authenticate, getModus);  
router.post("/import", authenticate, upload.single("file"), importBlotters);
router.get("/:id", authenticate, getBlotterById);
router.put("/:id/status", authenticate, updateBlotterStatus);
router.put("/:id", authenticate, updateBlotter);
router.delete("/:id", authenticate, deleteBlotter);
router.put("/:id/restore", authenticate, restoreBlotter);

module.exports = router;