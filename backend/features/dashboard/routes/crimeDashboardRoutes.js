// backend/features/dashboard/routes/crimeDashboardRoutes.js

const express = require("express");
const router  = express.Router();
const { authenticate } = require("../../../shared/middleware/tokenMiddleware");
const {
  getOverview,
  getSummary, getTrends, getHourly,
  getByDay, getByPlace, getByBarangay, getByModus,
} = require("../controllers/crimeDashboardController");
const { exportDashboard } = require("../controllers/exportDashboardController");
 
router.get("/overview",    authenticate, getOverview);
router.get("/summary",     authenticate, getSummary);
router.get("/trends",      authenticate, getTrends);
router.get("/hourly",      authenticate, getHourly);
router.get("/by-day",      authenticate, getByDay);
router.get("/by-place",    authenticate, getByPlace);
router.get("/by-barangay", authenticate, getByBarangay);
router.get("/by-modus",    authenticate, getByModus);
 
router.post("/export",     authenticate, exportDashboard); // ← NEW
 
module.exports = router;