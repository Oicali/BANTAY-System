const express = require("express");
const router = express.Router();
const { authenticate } = require("../../../shared/middleware/tokenMiddleware");
const {
  getPatrolStats,
  getActivePatrollers,
  getAvailablePatrollers,
  getMobileUnits,
  createMobileUnit,
  updateMobileUnit,
  deleteMobileUnit,
  getPatrols,
  createPatrol,
  updatePatrol,
  deletePatrol,
  updateRouteNotes,
  updateRouteTime,
} = require("../controllers/patrolController");

router.get("/stats",                authenticate, getPatrolStats);
router.get("/active",               authenticate, getActivePatrollers);
router.get("/available-patrollers", authenticate, getAvailablePatrollers);
router.get("/mobile-units",         authenticate, getMobileUnits);
router.post("/mobile-units",        authenticate, createMobileUnit);
router.put("/mobile-units/:id",     authenticate, updateMobileUnit);
router.delete("/mobile-units/:id", authenticate, deleteMobileUnit);
router.get("/patrols",        authenticate, getPatrols);
router.post("/patrols",       authenticate, createPatrol);
router.put("/patrols/:id",    authenticate, updatePatrol);
router.delete("/patrols/:id", authenticate, deletePatrol);
router.patch("/routes/:routeId/notes", authenticate, updateRouteNotes);
router.patch("/routes/:routeId/time", authenticate, updateRouteTime);

module.exports = router;