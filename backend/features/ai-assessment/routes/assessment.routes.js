// backend/features/ai-assessment/routes/assessment.routes.js

const express = require("express");
const {
  health,
  generate,
} = require("../controllers/assessment.controller");

const router = express.Router();

router.get("/health", health);
router.post("/generate", generate);
router.post("/analyze", generate); // alias if you want a second endpoint name

module.exports = router;