// backend/features/ai-assessment/services/python.service.js

const axios = require("axios");

const PYTHON_SERVICE_URL =
  process.env.PYTHON_SERVICE_URL || "http://localhost:8000";

const analyzeWithPython = async ({
  barangays = [],
  date_from,
  date_to,
  mode = "current",
  crime_types = [],
}) => {
  if (!date_from || !date_to) {
    throw new Error("date_from and date_to are required");
  }

  const payload = {
    barangays,
    date_from,
    date_to,
    mode,
    crime_types,
  };

  const response = await axios.post(`${PYTHON_SERVICE_URL}/analyze`, payload, {
    timeout: 60000,
    headers: {
      "Content-Type": "application/json",
    },
  });

  return response.data;
};

module.exports = {
  analyzeWithPython,
};