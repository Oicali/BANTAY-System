// ================================================================================
// FILE: backend/features/gps/routes/gpsRoutes.js
// ================================================================================

const express = require("express");
const router = express.Router();
const { updateLocation, getActiveOfficers, setOffDuty } = require("../controllers/gpsController");

// Use your existing auth middleware — same one used in blotterRoutes, crimeMapRoutes, etc.
const { authenticate } = require("../../../shared/middleware/tokenMiddleware");

router.post("/location", authenticate, updateLocation);
router.get("/officers", authenticate, getActiveOfficers);  // ← clean, no inline check
router.post("/off-duty", authenticate, setOffDuty);

module.exports = router;