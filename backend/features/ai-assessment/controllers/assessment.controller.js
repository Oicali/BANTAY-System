// backend/features/ai-assessment/controllers/assessment.controller.js

const { generateAssessment } = require("../services/assessment.service");

const normalizeRequestBody = (body = {}) => {
  const source =
    body.filters && typeof body.filters === "object" ? body.filters : body;

  return {
    barangays: Array.isArray(source.barangays) ? source.barangays : [],
    crime_types: Array.isArray(source.crime_types)
      ? source.crime_types
      : Array.isArray(source.crimeTypes)
        ? source.crimeTypes
        : [],
    date_from: source.date_from || source.dateFrom || "",
    date_to: source.date_to || source.dateTo || "",
    mode: source.mode || "",
  };
};

const health = async (_req, res) => {
  res.json({
    success: true,
    service: "ai-assessment-node",
  });
};

const generate = async (req, res) => {
  try {
    const payload = normalizeRequestBody(req.body);

    if (!payload.date_from || !payload.date_to) {
      return res.status(400).json({
        success: false,
        message: "date_from and date_to are required",
      });
    }

    const result = await generateAssessment(payload);

    return res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("generate assessment error:", error.response?.data || error.message);

    return res.status(500).json({
      success: false,
      message: error.response?.data?.detail || error.message || "Failed to generate assessment",
    });
  }
};

module.exports = {
  health,
  generate,
};