const CRIME_LABELS = {
  MURDER: "Murder",
  HOMICIDE: "Homicide",
  "PHYSICAL INJURY": "Physical Injury",
  RAPE: "Rape",
  ROBBERY: "Robbery",
  THEFT: "Theft",
  "CARNAPPING - MC": "Carnapping - MC",
  "CARNAPPING - MV": "Carnapping - MV",
  "SPECIAL COMPLEX CRIME": "Special Complex Crime",
};

const formatCrimeLabel = (crime) => CRIME_LABELS[crime] || crime;

const formatBarangay = (name = "") =>
  name
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());

const formatDate = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

export const generateMockAssessment = (filters, dashData) => {
  const summary = dashData?.summary || [];
  const barangay = dashData?.barangay || [];
  const place = dashData?.place || [];
  const trends = dashData?.trends || [];

  const totals = summary.reduce(
    (acc, row) => {
      acc.total += row.total || 0;
      acc.cleared += row.cleared || 0;
      acc.solved += row.solved || 0;
      acc.underInvestigation += row.underInvestigation || 0;
      return acc;
    },
    { total: 0, cleared: 0, solved: 0, underInvestigation: 0 }
  );

  const topCrimeRow = [...summary].sort((a, b) => (b.total || 0) - (a.total || 0))[0];
  const topBarangayRow = [...barangay].sort((a, b) => (b.count || 0) - (a.count || 0))[0];
  const topPlaceRow = [...place].sort((a, b) => (b.count || 0) - (a.count || 0))[0];

  const selectedCrimeText =
    filters.crimeTypes?.length > 0
      ? filters.crimeTypes.map(formatCrimeLabel).join(", ")
      : "All index crimes";

  const selectedBarangayText =
    filters.barangays?.length > 0
      ? filters.barangays.map(formatBarangay).join(", ")
      : "All barangays";

  const dateRangeText = `${formatDate(filters.dateFrom)} to ${formatDate(filters.dateTo)}`;

  const cce = totals.total ? ((totals.cleared / totals.total) * 100).toFixed(1) : "0.0";
  const cse = totals.total ? ((totals.solved / totals.total) * 100).toFixed(1) : "0.0";

  const trendDirection = trends.length >= 2
    ? (trends[trends.length - 1]?.Total || 0) >= (trends[0]?.Total || 0)
      ? "an upward"
      : "a downward"
    : "a stable";

  return {
    title: "Mock AI Crime Assessment",
    generatedAt: new Date().toLocaleString(),
    scope: {
      dateRange: dateRangeText,
      crimes: selectedCrimeText,
      barangays: selectedBarangayText,
    },
    overview: `For the selected dashboard view covering ${dateRangeText}, the system recorded ${totals.total} total incidents with ${totals.cleared} cleared, ${totals.solved} solved, and ${totals.underInvestigation} under investigation cases.`,
    highlights: [
      topCrimeRow
        ? `${formatCrimeLabel(topCrimeRow.crime)} is the leading incident category with ${topCrimeRow.total} recorded cases.`
        : "No leading crime category is available for this view.",
      topBarangayRow
        ? `${formatBarangay(topBarangayRow.barangay)} has the highest incident count with ${topBarangayRow.count} cases.`
        : "No barangay concentration was detected for this view.",
      topPlaceRow
        ? `${topPlaceRow.place} appears as the most common place of commission with ${topPlaceRow.count} incidents.`
        : "No dominant place of commission was detected for this view.",
      `The selected range shows ${trendDirection} overall movement in recorded incidents.`,
    ],
    recommendations: [
      "Increase patrol visibility in the highest-volume barangay and nearby adjacent areas.",
      "Prioritize response planning around the leading incident type for the selected view.",
      "Review under-investigation cases for repeat locations, repeat victims, or repeat modus patterns.",
      "Use this generated view as a basis for a formal AI summary once the FastAPI endpoint is connected.",
    ],
    stats: {
      total: totals.total,
      cce,
      cse,
      ui: totals.underInvestigation,
    },
  };
};