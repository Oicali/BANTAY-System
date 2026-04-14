// backend/features/ai-assessment/services/assessment.service.js

const axios = require("axios");
const pool = require("../../../config/database");
const { analyzeWithPython } = require("./python.service");
const {
  buildGeneralAssessmentPrompt,
  buildPerCrimePrompt,
} = require("../prompts/prompt.assessment");

const AI_PROVIDER = (process.env.AI_PROVIDER || "mock").toLowerCase();
const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
const GROQ_MODEL =
  process.env.GROQ_MODEL || "meta-llama/llama-4-scout-17b-16e-instruct";

const inferMode = (dateTo) => {
  if (!dateTo) return "current";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(dateTo);
  end.setHours(0, 0, 0, 0);
  return end < today ? "retrospective" : "current";
};

const formatDate = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const pctText = (value) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "0.0";
  }
  return Number(value).toFixed(1);
};

const prettifyCrime = (crime) => {
  const map = {
    THEFT: "Theft",
    MURDER: "Murder",
    RAPE: "Rape",
    ROBBERY: "Robbery",
    HOMICIDE: "Homicide",
    "PHYSICAL INJURY": "Physical Injury",
    "SPECIAL COMPLEX CRIME": "Special Complex Crime",
    "CARNAPPING - MC": "Carnapping - MC",
    "CARNAPPING - MV": "Carnapping - MV",
  };
  return map[crime] || crime;
};

const prettifyBarangay = (name = "") =>
  String(name)
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());

const parseJsonFromText = (text) => {
  if (!text || typeof text !== "string") return null;

  try {
    return JSON.parse(text);
  } catch (_) {}

  let cleaned = text
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .replace(/`/g, "")
    .trim();

  // Fix unescaped newlines inside JSON string values
  cleaned = cleaned.replace(
    /"((?:[^"\\]|\\.)*)"/g,
    (match) => match.replace(/\n/g, "\\n").replace(/\r/g, "\\r")
  );

  try {
    return JSON.parse(cleaned);
  } catch (_) {}

  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) return null;

  let candidate = cleaned.slice(firstBrace, lastBrace + 1);

  try {
    return JSON.parse(candidate);
  } catch (_) {}

  candidate = candidate.replace(/,\s*([}\]])/g, "$1").replace(/\t/g, "\\t");

  try {
    return JSON.parse(candidate);
  } catch (_) {
    return null;
  }
};

// ─── FLATTEN NESTED OBJECT FIELDS ────────────────────────────────────────────
const flattenCrimeFields = (parsed) => {
  if (!parsed || typeof parsed !== "object") return parsed;

  const FIELDS = [
    "operations",
    "intelligence",
    "investigations",
    "police_community_relations",
    "crime_assessment", // ← renamed from general_assessment
    "overall_assessment", // ← overall
  ];

  FIELDS.forEach((field) => {
    const val = parsed[field];
    if (val && typeof val === "object") {
      parsed[field] = Object.entries(val)
        .map(
          ([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`,
        )
        .join("\n\n");
    }
  });

  return parsed;
};

const fetchModusDescriptions = async (crimeTypes = []) => {
  try {
    let query = `
      SELECT crime_type, modus_name, description
      FROM crime_modus_reference
      WHERE is_active = true
    `;
    const params = [];
    if (crimeTypes.length > 0) {
      query += ` AND UPPER(crime_type) = ANY($1::text[])`;
      params.push(crimeTypes.map((c) => c.toUpperCase()));
    }
    query += ` ORDER BY crime_type, modus_name`;
    const result = await pool.query(query, params);

    const map = {};
    result.rows.forEach((r) => {
      if (!map[r.crime_type]) map[r.crime_type] = [];
      map[r.crime_type].push({
        name: r.modus_name,
        description: r.description || "",
      });
    });
    return map;
  } catch (err) {
    console.warn("[AI] Could not fetch modus descriptions:", err.message);
    return {};
  }
};

// ─── BUILD BASE ASSESSMENT ────────────────────────────────────────────────────
const buildBaseAssessment = (analysis) => {
  const filters = analysis.filters || {};
  const overall = analysis.stats?.overall || {};
  const perCrime = Array.isArray(analysis.stats?.per_crime)
    ? [...analysis.stats.per_crime]
    : [];
  const temporalOverall = analysis.temporal?.overall || {};
  const clusterList = Array.isArray(analysis.clusters?.clusters)
    ? analysis.clusters.clusters
    : [];
  const overallForecast = analysis.overall_forecast || null;

  const sortedCrimes = perCrime.sort((a, b) => (b.total || 0) - (a.total || 0));
  const topCrime = sortedCrimes[0] || null;

  const selectedCrimeText =
    filters.crime_types && filters.crime_types.length
      ? filters.crime_types.map(prettifyCrime).join(", ")
      : "All index crimes";

  const selectedBarangayText =
    filters.barangays && filters.barangays.length
      ? filters.barangays.map(prettifyBarangay).join(", ")
      : "All barangays";

  // ── Overall assessment draft ──────────────────────────────────────────────
  const overviewParts = [
    `From ${formatDate(filters.date_from)} to ${formatDate(filters.date_to)}, a total of ${overall.total || 0} incidents were recorded.`,
    `Overall CCE is ${pctText(overall.cce_percent)}% and CSE is ${pctText(overall.cse_percent)}%.`,
  ];

  if (topCrime) {
    overviewParts.push(
      `${prettifyCrime(topCrime.crime)} is the highest-volume offense with ${topCrime.total} incident(s).`,
    );
  }

  if (temporalOverall.peak_day && temporalOverall.peak_month) {
    overviewParts.push(
      `Peak activity is on ${temporalOverall.peak_day}s, with ${temporalOverall.peak_month} showing the highest monthly concentration.`,
    );
  }

  // ── Overall forecast in base draft ────────────────────────────────────────
  if (overallForecast && overallForecast.forecast_state !== "insufficient") {
    const stateNote =
      overallForecast.forecast_state === "limited" ? " (limited data)" : "";
    overviewParts.push(
      `Combined forecast for next week: ${overallForecast.predicted_next_week} incident(s) at ${overallForecast.confidence}% confidence${stateNote}. Overall trend: ${overallForecast.trend}.`,
    );
  }

  // ── Top hotspot barangay ──────────────────────────────────────────────────
  if (clusterList.length > 0) {
    const topCluster = [...clusterList].sort(
      (a, b) => (b.count || 0) - (a.count || 0),
    )[0];
    overviewParts.push(
      `${clusterList.length} geographic hotspot cluster(s) detected; ${topCluster.dominant_barangay} requires immediate attention with ${topCluster.count} incident(s) concentrated in that area.`,
    );
  }

  // ── Per-crime base drafts ─────────────────────────────────────────────────
  const perCrimeBase = sortedCrimes.map((crime) => {
    const crimeCluster = clusterList.find(
      (c) => c.dominant_crime === crime.crime,
    );

    const hotspotBarangay = crimeCluster
      ? crimeCluster.dominant_barangay
      : filters.barangays?.length
        ? filters.barangays[0]
        : "the filtered area";

    const peakHour =
      crime.peak_hour !== undefined && crime.peak_hour !== null
        ? (() => {
            const h = crime.peak_hour;
            const start = h % 12 || 12;
            const suffix = h < 12 ? "AM" : "PM";
            return `${start}:00 ${suffix}`;
          })()
        : "peak hours";

    const peakDay = crime.peak_day || "peak days";
    const peakMonth = crime.peak_month || "peak month";

    // ── Forecast text based on forecast_state ─────────────────────────────
    let forecastText;
    const forecastState = crime.forecast_state || "insufficient";

    if (forecastState === "full") {
      forecastText = ` Forecast: ${crime.predicted_next_week} incident(s) next week (${crime.confidence}% confidence).`;
    } else if (forecastState === "limited") {
      forecastText = ` Forecast: ${crime.predicted_next_week} incident(s) next week (${crime.confidence}% confidence — limited data).`;
    } else {
      forecastText = " Insufficient data for forecast.";
    }

    const trendLabel =
      {
        increasing: "increasing",
        decreasing: "decreasing",
        stable: "stable",
        insufficient_data: "insufficient data",
      }[crime.trend] ?? "stable";

    // ── Crime assessment — strategic implication ──────────────────────────
    const crimeAssessment =
      `${prettifyCrime(crime.crime)}: ${crime.total} incident(s), CCE ${pctText(crime.cce_percent)}%, CSE ${pctText(crime.cse_percent)}%. ` +
      `Trend is ${trendLabel}.${forecastText} ` +
      `${crime.is_ecp ? "Warrants ECP declaration. " : ""}` +
      `Concentration in ${hotspotBarangay} during ${peakDay}s around ${peakHour} in ${peakMonth} indicates a patrol gap requiring targeted deployment.`;

    return {
      crime_type: crime.crime,
      crime_assessment: crimeAssessment, // ← renamed
      operations: `Deploy patrol on ${peakDay}s around ${peakHour} at ${crime.top_place_type || "affected areas"} in ${hotspotBarangay}.`,
      intelligence:
        `${crime.is_ecp ? "FLAG AS ECP. " : ""}` +
        `Monitor ${crime.top_3_modus?.[0]?.modus || "dominant modus"} pattern near ${hotspotBarangay}.`,
      investigations:
        crime.under_investigation > 0
          ? `${crime.under_investigation} open case(s) in ${hotspotBarangay}. Prioritize follow-up on ${crime.top_3_modus?.[0]?.modus || "dominant modus"} incidents.`
          : `All cases cleared or solved. No open cases requiring follow-up.`,
      police_community_relations: `Conduct awareness activities before ${peakHour} targeting ${crime.top_place_type || "affected areas"} in ${hotspotBarangay}.`,
    };
  });

  return {
    title: `AI Crime Assessment — ${formatDate(filters.date_from)} to ${formatDate(filters.date_to)}`,
    generatedAt: new Date().toISOString(),
    scope: {
      dateRange: `${formatDate(filters.date_from)} to ${formatDate(filters.date_to)}`,
      crimes: selectedCrimeText,
      barangays: selectedBarangayText,
    },
    overall_assessment: overviewParts.join(" "), // ← renamed
    per_crime: perCrimeBase,
    stats: {
      total: overall.total || 0,
      cce: pctText(overall.cce_percent),
      cse: pctText(overall.cse_percent),
      ui: overall.under_investigation || 0,
    },
  };
};

// ─── GROQ CALL ────────────────────────────────────────────────────────────────
const callGroq = async (prompt) => {
  if (!GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY is missing");
  }

  const response = await axios.post(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      model: GROQ_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
    },
    {
      timeout: 120000,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
    },
  );

  return response.data?.choices?.[0]?.message?.content || "";
};

const callAI = async (prompt) => callGroq(prompt);

// ─── AI ENHANCEMENT ───────────────────────────────────────────────────────────
const maybeEnhanceWithAI = async (analysis, baseAssessment, modusMap = {}) => {
  if (!GROQ_API_KEY) {
    return {
      providerUsed: "mock",
      modelUsed: null,
      assessment: baseAssessment,
      aiRawText: null,
    };
  }

  try {
    // ── Step 1: Overall assessment ────────────────────────────────────────
    console.time("[AI] overall_assessment");
    const generalPrompt = buildGeneralAssessmentPrompt({
      analysis,
      baseAssessment,
    });
    const generalRawText = await callAI(generalPrompt);
    console.timeEnd("[AI] overall_assessment");

    const generalParsed = parseJsonFromText(generalRawText);
    // Support both field names during transition
    const overallAssessment =
      generalParsed?.overall_assessment ||
      generalParsed?.general_assessment ||
      baseAssessment.overall_assessment;

    // ── Step 2: One prompt per crime type ─────────────────────────────────
    const perCrimeResults = [];
    const perCrimeBase = baseAssessment.per_crime || [];

    for (const crimeBase of perCrimeBase) {
      console.time(`[AI] ${crimeBase.crime_type}`);
      try {
        const crimePrompt = buildPerCrimePrompt({
          analysis,
          crimeType: crimeBase.crime_type,
          crimeBase,
          modusMap,
        });
        const crimeRawText = await callAI(crimePrompt);
        const crimeParsed = parseJsonFromText(crimeRawText);

        if (crimeParsed && crimeParsed.crime_type) {
          // Normalize field name — AI may return either key
          if (crimeParsed.general_assessment && !crimeParsed.crime_assessment) {
            crimeParsed.crime_assessment = crimeParsed.general_assessment;
            delete crimeParsed.general_assessment;
          }
          perCrimeResults.push(flattenCrimeFields(crimeParsed));
        } else {
          console.warn(
            `[AI] Could not parse JSON for ${crimeBase.crime_type}, using base draft`,
          );
          console.warn(
            `[AI] Raw output (first 500 chars):`,
            crimeRawText?.slice(0, 500),
          );
          perCrimeResults.push(crimeBase);
        }
      } catch (crimeErr) {
        console.error(
          `[AI] Failed for ${crimeBase.crime_type}:`,
          crimeErr.message,
        );
        perCrimeResults.push(crimeBase);
      }
      console.timeEnd(`[AI] ${crimeBase.crime_type}`);
    }

    return {
      providerUsed: AI_PROVIDER,
      modelUsed: GROQ_MODEL,
      assessment: {
        ...(baseAssessment || {}),
        title: baseAssessment?.title || "AI Crime Assessment",
        overall_assessment: overallAssessment,
        per_crime: perCrimeResults,
      },
      aiRawText: null,
    };
  } catch (error) {
    console.error("[AI] Enhancement failed:", error.message);
    return {
      providerUsed: "mock",
      modelUsed: null,
      assessment: baseAssessment || {},
      aiRawText: null,
      aiWarning: error.message,
    };
  }
};

// ─── MAIN ENTRY ───────────────────────────────────────────────────────────────
const generateAssessment = async ({
  barangays = [],
  date_from,
  date_to,
  mode,
  crime_types = [],
}) => {
  const resolvedMode = mode || inferMode(date_to);

  const analysis = await analyzeWithPython({
    barangays,
    date_from,
    date_to,
    mode: resolvedMode,
    crime_types,
  });

  const modusMap = await fetchModusDescriptions(crime_types);
  const baseAssessment = buildBaseAssessment(analysis);
  const aiResult = await maybeEnhanceWithAI(analysis, baseAssessment, modusMap);

  console.log("AI_PROVIDER:", AI_PROVIDER);
  console.log("providerUsed:", aiResult.providerUsed);
  console.log("aiWarning:", aiResult.aiWarning);

  return {
    analysis,
    assessment: aiResult.assessment,
    providerUsed: aiResult.providerUsed,
    modelUsed: aiResult.modelUsed,
    aiRawText: aiResult.aiRawText || null,
    aiWarning: aiResult.aiWarning || null,
  };
};

module.exports = {
  generateAssessment,
};
