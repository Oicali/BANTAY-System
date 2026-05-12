const router = require("express").Router();
const { authenticate } = require("../../../shared/middleware/tokenMiddleware");
const multer = require("multer");
const { getResidents, importResidents, deleteResident } = require("../controllers/residentController");

const upload = multer({ storage: multer.memoryStorage() });

router.get("/", authenticate, getResidents);
router.post("/import", authenticate, upload.single("file"), importResidents);
router.delete("/:id", authenticate, deleteResident);

module.exports = router;