const router = require("express").Router();
const { authenticate } = require("../../../shared/middleware/tokenMiddleware");
const multer = require("multer");
const { getResidents, importResidents, deleteResident, getResidentById, updateResident, getRemovedResidents, restoreResident } = require("../controllers/residentController");



const upload = multer({ storage: multer.memoryStorage() });

router.get("/", authenticate, getResidents);
router.post("/import", authenticate, upload.single("file"), importResidents);
router.get("/removed", authenticate, getRemovedResidents);
router.put("/:id/restore", authenticate, restoreResident);
router.delete("/:id", authenticate, deleteResident);
router.get("/:id", authenticate, getResidentById);
router.put("/:id", authenticate, upload.single("profile_picture"), updateResident);
module.exports = router;