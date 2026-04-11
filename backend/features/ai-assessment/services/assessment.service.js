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

  // Direct parse first
  try {
    return JSON.parse(text);
  } catch (_) {}

  // Strip markdown code fences
  let cleaned = text
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch (_) {}

  // Extract outermost {...} block
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return null;
  }

  let candidate = cleaned.slice(firstBrace, lastBrace + 1);

  try {
    return JSON.parse(candidate);
  } catch (_) {}

  // Last resort: fix common LLM JSON issues
  candidate = candidate
    .replace(/,\s*([}\]])/g, "$1") // trailing commas
    .replace(/\t/g, "\\t"); // literal tabs in strings

  try {
    return JSON.parse(candidate);
  } catch (_) {
    return null;
  }
};

// ─── FLATTEN NESTED OBJECT FIELDS ────────────────────────────────────────────
// The LLM sometimes returns structured objects (e.g. Five-Part Plan as
// { Situation: "...", Mission: "...", ... }) instead of a flat string.
// This converts any nested object fields to a readable flat string.
const flattenCrimeFields = (parsed) => {
  if (!parsed || typeof parsed !== "object") return parsed;

  const FIELDS = [
    "operations",
    "intelligence",
    "investigations",
    "police_community_relations",
    "general_assessment",
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

  // ── General assessment draft ──────────────────────────────────────────────
  const overviewParts = [
    `From ${formatDate(filters.date_from)} to ${formatDate(filters.date_to)}, a total of ${overall.total || 0} incidents were recorded for the selected dashboard view.`,
    `Case clearance efficiency is ${pctText(overall.cce_percent)}% and case solution efficiency is ${pctText(overall.cse_percent)}%.`,
  ];

  if (topCrime) {
    overviewParts.push(
      `${prettifyCrime(topCrime.crime)} is the highest-volume offense with ${topCrime.total} incident${topCrime.total === 1 ? "" : "s"}.`,
    );
  }

  if (temporalOverall.peak_day && temporalOverall.peak_month) {
    overviewParts.push(
      `The most active period appears around ${temporalOverall.peak_day}s, with ${temporalOverall.peak_month} showing the highest monthly concentration in the selected range.`,
    );
  }

  if (clusterList.length > 0) {
    const topCluster = [...clusterList].sort(
      (a, b) => (b.count || 0) - (a.count || 0),
    )[0];
    overviewParts.push(
      `${clusterList.length} geographic hotspot cluster${clusterList.length === 1 ? "" : "s"} detected; largest in ${topCluster.dominant_barangay} with ${topCluster.count} incident${topCluster.count === 1 ? "" : "s"}.`,
    );
  }

  // ── Per-crime base drafts ─────────────────────────────────────────────────
  const perCrimeBase = sortedCrimes.map((crime) => {
    const crimeLinreg =
      (analysis.croston?.per_crime || []).find(
        (l) => l.crime === crime.crime,
      ) || {};
    const crimeCluster = clusterList.find(
      (c) => c.dominant_crime === crime.crime,
    );

    const peakHour =
      crime.peak_hour !== undefined && crime.peak_hour !== null
        ? String(crime.peak_hour).padStart(2, "0") + ":00"
        : "peak hours";

    const peakDay = crime.peak_day || "peak days";

    const forecastText =
      crimeLinreg.predicted_next_week !== null &&
      crimeLinreg.predicted_next_week !== undefined
        ? ` Forecast: ${crimeLinreg.predicted_next_week} incident${crimeLinreg.predicted_next_week === 1 ? "" : "s"} next week (${crimeLinreg.confidence ?? 0}% confidence, Croston method).`
        : " Insufficient data for reliable forecast.";

    const clusterText = crimeCluster
      ? ` in ${crimeCluster.dominant_barangay}`
      : "";

    const trendLabel =
      {
        increasing: "increasing",
        decreasing: "decreasing",
        stable: "stable",
        insufficient_data: "insufficient data",
      }[crimeLinreg.trend] ?? "stable";

    return {
      crime_type: crime.crime,
      general_assessment: `${prettifyCrime(crime.crime)}: ${crime.total} incident(s), CCE ${pctText(crime.cce_percent)}%, CSE ${pctText(crime.cse_percent)}%. Trend is ${trendLabel}.${forecastText}`,
      operations: `Deploy patrol on ${peakDay} around ${peakHour}${clusterText}.`,
      intelligence: `${crime.is_ecp ? "FLAG AS EMERGING CRIME PROBLEM. " : ""}Monitor ${crime.top_3_modus?.[0]?.modus || "dominant modus"} pattern. Develop informants near incident concentration areas.`,
      investigations:
        crime.under_investigation > 0
          ? `${crime.under_investigation} open case(s). Prioritize follow-up on ${crime.top_3_modus?.[0]?.modus || "dominant modus"} incidents.`
          : `All cases cleared or solved. No open cases requiring follow-up.`,
      police_community_relations: `Conduct awareness activities before ${peakHour} targeting ${crime.top_place_type || "affected areas"}.`,
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
    general_assessment: overviewParts.join(" "),
    per_crime: perCrimeBase,
    stats: {
      total: overall.total || 0,
      cce: pctText(overall.cce_percent),
      cse: pctText(overall.cse_percent),
      ui: overall.under_investigation || 0,
    },
  };
};

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

const callAI = async (prompt) => {
  return callGroq(prompt);
};

// ── Iterative per-crime AI generation ────────────────────────────────────────
// Each crime type gets its own focused prompt → no context overflow → all crimes appear
const maybeEnhanceWithAI = async (analysis, baseAssessment, modusMap = {}) => {
  const provider = AI_PROVIDER;

  if (!GROQ_API_KEY) {
    return {
      providerUsed: "mock",
      modelUsed: null,
      assessment: baseAssessment,
      aiRawText: null,
    };
  }

  try {
    // ── Step 1: General assessment ────────────────────────────────────────
    console.time("[AI] general_assessment");
    const generalPrompt = buildGeneralAssessmentPrompt({
      analysis,
      baseAssessment,
    });
    const generalRawText = await callAI(generalPrompt);
    console.timeEnd("[AI] general_assessment");

    const generalParsed = parseJsonFromText(generalRawText);
    const generalAssessment =
      generalParsed?.general_assessment || baseAssessment.general_assessment;

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
      providerUsed: provider,
      modelUsed: GROQ_MODEL,
      assessment: {
        ...(baseAssessment || {}),
        title: baseAssessment?.title || "AI Crime Assessment",
        general_assessment: generalAssessment,
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
