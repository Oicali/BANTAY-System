// ================================================================================
// FILE: backend/features/gps/routes/gpsRoutes.js
// ================================================================================

const express = require("express");
const router = express.Router();
const { updateLocation, getActiveOfficers, setOffDuty } = require("../controllers/gpsController");

// Use your existing auth middleware — same one used in blotterRoutes, crimeMapRoutes, etc.
const { authenticate } = require("../../../shared/middleware/tokenMiddleware");

// POST /gps/location     — mobile pushes coords every 5s
router.post("/location", authenticate, updateLocation);

// GET  /gps/officers     — web crime map polls every 5s
// REPLACE WITH:
router.get("/officers", authenticate, (req, res, next) => {
  if (req.user?.role_name === "Barangay Official") {
    return res.json({ success: true, data: [] });
  }
  next();
}, getActiveOfficers);

// POST /gps/off-duty     — called on logout
router.post("/off-duty", authenticate, setOffDuty);

module.exports = router;