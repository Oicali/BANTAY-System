// ================================================================================
// FILE: backend/features/audit/routes/auditRoutes.js
// ================================================================================

const router  = require("express").Router();
const { authenticate } = require("../../../shared/middleware/tokenMiddleware");
const { getAuditLogs } = require("../controllers/auditController");

router.get("/", authenticate, getAuditLogs);

module.exports = router;