
const express = require("express");
const router  = express.Router();
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
  updatePatrollersForDate,
  deletePatrol,
  updateRouteNotes,
  updateRouteTask,
  addRouteTask,
  removeRouteTask,
} = require("../controllers/patrolController");

const { authenticate } = require("../../../shared/middleware/tokenMiddleware");

const { exportPatrolList, exportPatrolDetail } = require("../controllers/ExportPatrolController");

// Stats & listings
router.get("/stats",               authenticate, getPatrolStats);
router.get("/active",              authenticate, getActivePatrollers);
router.get("/available-patrollers",authenticate, getAvailablePatrollers);

// Mobile units
router.get   ("/mobile-units",     authenticate, getMobileUnits);
router.post  ("/mobile-units",     authenticate, createMobileUnit);
router.put   ("/mobile-units/:id", authenticate, updateMobileUnit);
router.delete("/mobile-units/:id", authenticate, deleteMobileUnit);

// Patrols
router.get   ("/patrols",     authenticate, getPatrols);
router.post  ("/patrols",     authenticate, createPatrol);
router.put   ("/patrols/:id", authenticate, updatePatrol);
router.delete("/patrols/:id", authenticate, deletePatrol);

// ── Patrollers per date (new) ──────────────────────────────
// PATCH /patrol/patrols/:id/patrollers/:date
// Replace all patrollers for a specific patrol date
router.patch("/patrols/:id/patrollers/:date", authenticate, updatePatrollersForDate);

// Routes / tasks
router.patch ("/routes/:routeId/notes", authenticate, updateRouteNotes);
router.patch ("/routes/:routeId/task",  authenticate, updateRouteTask);
router.post  ("/routes/add",            authenticate, addRouteTask);
router.delete("/routes/:routeId",       authenticate, removeRouteTask);

//
router.post("/export/list",   authenticate, exportPatrolList);
router.post("/export/detail", authenticate, exportPatrolDetail);

module.exports = router;