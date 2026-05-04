// backend/features/gps/routes/gpsRoutes.js
const express = require("express");
const router = express.Router();
const { 
  updateLocation, 
  getActiveOfficers, 
  setOffDuty,
  resolveBarangay 
} = require("../controllers/gpsController");

// Use your existing auth middleware
const { authenticate } = require("../../../shared/middleware/tokenMiddleware");

// Existing routes
router.post("/location", authenticate, updateLocation);
router.get("/officers", authenticate, getActiveOfficers);
router.post("/off-duty", authenticate, setOffDuty);

// Optional test endpoint - can be removed later if not needed
router.get("/barangay", authenticate, resolveBarangay);

module.exports = router;