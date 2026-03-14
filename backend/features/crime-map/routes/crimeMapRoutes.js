const express = require("express");
const router = express.Router();
const { authenticate } = require("../../../shared/middleware/tokenMiddleware");
const { getBoundaries, getPins, getStatistics } = require("../controllers/crimeMapController");

router.get("/boundaries", authenticate, getBoundaries);
router.get("/pins", authenticate, getPins);
router.get("/statistics", authenticate, getStatistics);

module.exports = router;