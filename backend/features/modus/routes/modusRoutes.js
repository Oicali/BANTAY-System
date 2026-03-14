const express = require("express");
const router = express.Router();
const { authenticate } = require("../../../shared/middleware/tokenMiddleware");
const { getAllModus, getModusById, createModus, updateModus, deleteModus } = require("../controllers/modusController");

router.get("/", authenticate, getAllModus);
router.get("/:id", authenticate, getModusById);
router.post("/", authenticate, createModus);
router.patch("/:id", authenticate, updateModus);
router.delete("/:id", authenticate, deleteModus);

module.exports = router;