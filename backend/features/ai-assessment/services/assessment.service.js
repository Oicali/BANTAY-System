// backend/features/ai-assessment/services/assessment.service.js

const axios = require("axios");
const { analyzeWithPython } = require("./python.service");
const { buildAssessmentPrompt } = require("../prompts/prompt.assessment");

const AI_PROVIDER = (process.env.AI_PROVIDER || "mock").toLowerCase();
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.1:8b";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-1.5-flash";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

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
  } catch (_) {
    // continue
  }

  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return null;
  }

  const candidate = text.slice(firstBrace, lastBrace + 1);

  try {
    return JSON.parse(candidate);
  } catch (_) {
    return null;
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
  const arima = analysis.arima || {};

  const sortedCrimes = perCrime.sort((a, b) => (b.total || 0) - (a.total || 0));
  const topCrime = sortedCrimes[0] || null;
  const secondCrime = sortedCrimes[1] || null;

  const selectedCrimeText =
    filters.crime_types && filters.crime_types.length
      ? filters.crime_types.map(prettifyCrime).join(", ")
      : "All index crimes";

  const selectedBarangayText =
    filters.barangays && filters.barangays.length
      ? filters.barangays.map(prettifyBarangay).join(", ")
      : "All barangays";

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

  const highlights = [];

  if (topCrime) {
    highlights.push(
      `${prettifyCrime(topCrime.crime)} leads the selected range with ${topCrime.total} incident${topCrime.total === 1 ? "" : "s"}.`,
    );
  }

  if (secondCrime) {
    highlights.push(
      `${prettifyCrime(secondCrime.crime)} is the next highest offense category with ${secondCrime.total} recorded incident${secondCrime.total === 1 ? "" : "s"}.`,
    );
  }

  if (
    temporalOverall.peak_hour !== null &&
    temporalOverall.peak_hour !== undefined
  ) {
    highlights.push(
      `Peak reporting concentration is around ${String(temporalOverall.peak_hour).padStart(2, "0")}:00.`,
    );
  }

  if (temporalOverall.peak_day) {
    highlights.push(
      `The highest daily concentration falls on ${temporalOverall.peak_day}.`,
    );
  }

  if (clusterList.length > 0) {
    const topCluster = [...clusterList].sort(
      (a, b) => (b.count || 0) - (a.count || 0),
    )[0];
    highlights.push(
      `${clusterList.length} geographic cluster${clusterList.length === 1 ? "" : "s"} were detected, with the largest containing ${topCluster.count} incident${topCluster.count === 1 ? "" : "s"}.`,
    );
  } else {
    highlights.push(
      "No clear geographic hotspot cluster was detected from the available coordinates.",
    );
  }

  if (
    arima.predicted_total_next_week !== null &&
    arima.predicted_total_next_week !== undefined
  ) {
    highlights.push(
      `The short-term forecast projects about ${arima.predicted_total_next_week} total incident${arima.predicted_total_next_week === 1 ? "" : "s"} for the next weekly period.`,
    );
  }

  const recommendations = [];

  if (topCrime) {
    recommendations.push(
      `Prioritize patrol attention and preventive action around ${prettifyCrime(topCrime.crime)} patterns, especially in the locations linked to recent incidents.`,
    );
  }

  if (temporalOverall.peak_day || temporalOverall.peak_hour !== undefined) {
    const dayText = temporalOverall.peak_day || "peak days";
    const hourText =
      temporalOverall.peak_hour !== null &&
      temporalOverall.peak_hour !== undefined
        ? `${String(temporalOverall.peak_hour).padStart(2, "0")}:00`
        : "peak hours";
    recommendations.push(
      `Align visibility patrols and response readiness around ${dayText} and approximately ${hourText}, where concentration is highest.`,
    );
  }

  if (clusterList.length > 0) {
    recommendations.push(
      "Review cluster locations for repeat addresses, nearby business zones, road corridors, or residential pockets that may benefit from focused presence or intervention.",
    );
  }

  if ((overall.under_investigation || 0) > 0) {
    recommendations.push(
      "Reassess under-investigation cases for common modus, linked suspects, repeat victims, and recurring places of commission.",
    );
  } else {
    recommendations.push(
      "Maintain case documentation quality and follow-up review so high solution performance is sustained over the next reporting cycle.",
    );
  }

  if (arima.vs_average === "above") {
    recommendations.push(
      "Prepare for potentially above-average incident activity in the next weekly cycle and review staffing or deployment flexibility.",
    );
  }

  const perCrimeBase = sortedCrimes.map((crime) => {
    const crimeLinreg =
      (analysis.linreg?.per_crime || []).find((l) => l.crime === crime.crime) ||
      {};
    const crimeCluster = clusterList.find(
      (c) => c.dominant_crime === crime.crime,
    );

    const peakHour =
      crime.peak_hour !== undefined && crime.peak_hour !== null
        ? String(crime.peak_hour).padStart(2, "0") + ":00"
        : "peak hours";

    const peakDay = crime.peak_day || "peak days";

    return {
      crime_type: crime.crime,
      general_assessment: `${prettifyCrime(crime.crime)}: ${crime.total} incident(s), CCE ${pctText(crime.cce_percent)}%, CSE ${pctText(crime.cse_percent)}%. Trend is ${crimeLinreg.trend || "stable"}.`,
      operations: `Deploy patrol on ${peakDay} around ${peakHour}${crimeCluster ? ` near cluster at (${crimeCluster.centroid_lat?.toFixed(4)}, ${crimeCluster.centroid_lng?.toFixed(4)})` : ""}.`,
      intelligence: `${crime.is_ecp ? "FLAG AS EMERGING CRIME PROBLEM. " : ""}Monitor ${crime.top_3_modus?.[0]?.modus || "dominant modus"} pattern. Develop informants near incident concentration areas.`,
      investigations: `${crime.under_investigation || 0} open case(s). Prioritize follow-up on ${crime.top_3_modus?.[0]?.modus || "dominant modus"} incidents.`,
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

const callOllama = async (prompt) => {
  const response = await axios.post(
    `${OLLAMA_BASE_URL}/api/generate`,
    {
      model: OLLAMA_MODEL,
      prompt,
      stream: false,
      options: {
        temperature: 0.2,
      },
    },
    {
      timeout: 120000,
      headers: {
        "Content-Type": "application/json",
      },
    },
  );

  return response.data?.response || "";
};

const callGemini = async (prompt) => {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is missing");
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

  const response = await axios.post(
    url,
    {
      contents: [
        {
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: 0.2,
      },
    },
    {
      timeout: 120000,
      headers: {
        "Content-Type": "application/json",
      },
    },
  );

  return (
    response.data?.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || "")
      .join("") || ""
  );
};

const maybeEnhanceWithAI = async (analysis, baseAssessment) => {
  const provider = AI_PROVIDER;

  if (provider !== "ollama" && provider !== "gemini") {
    return {
      providerUsed: "mock",
      modelUsed: null,
      assessment: baseAssessment,
      aiRawText: null,
    };
  }

  try {
    const prompt = buildAssessmentPrompt({
      analysis,
      baseAssessment,
    });

    const rawText =
      provider === "ollama"
        ? await callOllama(prompt)
        : await callGemini(prompt);

    const parsed = parseJsonFromText(rawText);

    if (!parsed) {
      return {
        providerUsed: provider,
        modelUsed: provider === "ollama" ? OLLAMA_MODEL : GEMINI_MODEL,
        assessment: {
          ...baseAssessment,
          aiNarrative: rawText || null,
        },
        aiRawText: rawText || null,
      };
    }

    return {
      providerUsed: provider,
      modelUsed: provider === "ollama" ? OLLAMA_MODEL : GEMINI_MODEL,
      assessment: {
        ...baseAssessment,
        title: baseAssessment.title, 
        general_assessment:
          parsed.general_assessment || baseAssessment.general_assessment,
        per_crime:
          Array.isArray(parsed.per_crime) && parsed.per_crime.length
            ? parsed.per_crime
            : baseAssessment.per_crime,
      },
      aiRawText: rawText || null,
    };
  } catch (error) {
    return {
      providerUsed: "mock",
      modelUsed: null,
      assessment: baseAssessment,
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

  const baseAssessment = buildBaseAssessment(analysis);
  const aiResult = await maybeEnhanceWithAI(analysis, baseAssessment);

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
