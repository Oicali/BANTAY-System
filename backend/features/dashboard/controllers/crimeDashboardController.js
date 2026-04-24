// backend/features/dashboard/controllers/crimeDashboardController.js

const pool = require("../../../config/database");

const INDEX_CRIMES = [
  "MURDER",
  "HOMICIDE",
  "PHYSICAL INJURY",
  "RAPE",
  "ROBBERY",
  "THEFT",
  "CARNAPPING - MC",
  "CARNAPPING - MV",
  "SPECIAL COMPLEX CRIME",
];

const DAYS_OF_WEEK = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

// ─── BARANGAY ALIAS MAP ───────────────────────────────────────────────────────
const BARANGAY_ALIASES = {
  ALIMA: "SINEGUELASAN",
  BANALO: "SINEGUELASAN",
  CAMPOSANTO: "KAINGIN (POB.)",
  "DAANG BUKID": "KAINGIN (POB.)",
  "TABING DAGAT": "KAINGIN (POB.)",
  KAINGIN: "KAINGIN DIGMAN",
  DIGMAN: "KAINGIN DIGMAN",
  PANAPAAN: "P.F. ESPIRITU I (PANAPAAN)",
  "PANAPAAN 2": "P.F. ESPIRITU II",
  "PANAPAAN 4": "P.F. ESPIRITU IV",
  "PANAPAAN 5": "P.F. ESPIRITU V",
  "PANAPAAN 6": "P.F. ESPIRITU VI",
  "MABOLO 1": "MABOLO",
  "MABOLO 2": "MABOLO",
  "MABOLO 3": "MABOLO",
  "ANIBAN 3": "ANIBAN I",
  "ANIBAN 4": "ANIBAN II",
  "ANIBAN 5": "ANIBAN I",
  "MALIKSI 3": "MALIKSI II",
  "MAMBOG 5": "MAMBOG II",
  "NIOG 2": "NIOG",
  "NIOG 3": "NIOG",
  "REAL 2": "REAL",
  "SALINAS 3": "SALINAS II",
  "SALINAS 4": "SALINAS II",
  "TALABA 4": "TALABA III",
  "TALABA 7": "TALABA I",
};

const REVERSE_ALIASES = {};
Object.entries(BARANGAY_ALIASES).forEach(([legacy, current]) => {
  if (!REVERSE_ALIASES[current]) REVERSE_ALIASES[current] = [];
  REVERSE_ALIASES[current].push(legacy);
});

const expandBarangays = (names) => {
  const expanded = new Set(names);
  names.forEach((name) => {
    const aliases = REVERSE_ALIASES[name] || [];
    aliases.forEach((alias) => expanded.add(alias));
  });
  return [...expanded];
};

// ─── SHARED WHERE BUILDER ─────────────────────────────────────────────────────
const buildWhere = (query) => {
  const { date_from, date_to, crime_types, barangays } = query;
  const conditions = [];
  const params = [];
  let p = 1;

  if (date_from) {
    conditions.push(`be.date_time_commission >= $${p++}`);
    params.push(date_from);
  }
  if (date_to) {
    conditions.push(
      `be.date_time_commission < ($${p++}::date + interval '1 day')`,
    );
    params.push(date_to);
  }
  if (crime_types) {
    const types = crime_types
      .split(",")
      .map((t) => t.trim().toUpperCase())
      .filter(Boolean);
    if (types.length > 0) {
      conditions.push(`UPPER(be.incident_type) = ANY($${p++}::text[])`);
      params.push(types);
    }
  }
  if (barangays) {
    const brgyList = barangays
      .split(",")
      .map((b) => b.trim().toUpperCase())
      .filter(Boolean);
    if (brgyList.length > 0) {
      const expanded = expandBarangays(brgyList);
      conditions.push(`UPPER(TRIM(be.place_barangay)) = ANY($${p++}::text[])`);
      params.push(expanded);
    }
  }

  conditions.push(
    `LOWER(TRIM(be.status)) IN ('cleared','cce','solved','cse','under investigation','ui','for investigation','active','ongoing')`,
  );

  const where = "WHERE " + conditions.join(" AND ");
  return { where, params, nextP: p };
};

// ─── INDIVIDUAL QUERY HELPERS ─────────────────────────────────────────────────

const querySummary = async (where, params, nextP) => {
  const result = await pool.query(
    `SELECT
      UPPER(be.incident_type) AS crime,
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE LOWER(be.status) IN ('cleared', 'cce')) AS cleared,
      COUNT(*) FILTER (WHERE LOWER(be.status) IN ('solved', 'cse')) AS solved,
      COUNT(*) FILTER (
        WHERE LOWER(be.status) IN ('under investigation', 'ui', 'for investigation', 'active', 'ongoing')
      ) AS under_investigation
     FROM blotter_analytics_view be
     ${where}
     ${where ? "AND" : "WHERE"} UPPER(be.incident_type) = ANY($${nextP}::text[])
       AND LOWER(TRIM(be.status)) IN ('cleared','cce','solved','cse','under investigation','ui','for investigation','active','ongoing')
     GROUP BY UPPER(be.incident_type)`,
    [...params, INDEX_CRIMES],
  );

  const map = {};
  result.rows.forEach((r) => {
    map[r.crime] = r;
  });

  return INDEX_CRIMES.map((crime) => ({
    crime,
    total: parseInt(map[crime]?.total || 0),
    cleared: parseInt(map[crime]?.cleared || 0),
    solved: parseInt(map[crime]?.solved || 0),
    underInvestigation: parseInt(map[crime]?.under_investigation || 0),
  }));
};

// ─── queryTrends ──────────────────────────────────────────────────────────────
// granularity values: "daily" | "weekly" | "monthly"
//
// ROOT CAUSE FIX (weekly key mismatch):
//   Postgres DATE_TRUNC('week') snaps each record to the Monday (or Sunday)
//   of its week, regardless of what dateFrom is. The old code built the
//   skeleton starting at dateFrom (e.g. a Wednesday) and then tried to merge
//   DB results using exact key matches — which always failed because the DB
//   keys were week-boundary dates (e.g. Monday) while skeleton keys were
//   offset by however many days dateFrom was past the boundary.
//
//   The fix: for weekly granularity, instead of requiring exact key matches,
//   we find the skeleton bucket whose start date is closest to and <= the DB
//   label, then accumulate counts into that bucket. This correctly maps any
//   DB week label to its containing skeleton bucket regardless of dateFrom.
const queryTrends = async (
  where,
  params,
  nextP,
  granularity = "monthly",
  dateFrom,
  dateTo,
) => {
  const dateTrunc =
    granularity === "daily"
      ? "day"
      : granularity === "weekly"
        ? "week"
        : "month";

  const result = await pool.query(
    `SELECT
      TO_CHAR(DATE_TRUNC('${dateTrunc}', be.date_time_commission), 'YYYY-MM-DD') AS label,
      UPPER(be.incident_type) AS crime,
      COUNT(*) AS count
     FROM blotter_analytics_view be
     ${where}
     ${where ? "AND" : "WHERE"} UPPER(be.incident_type) = ANY($${nextP}::text[])
     GROUP BY label, UPPER(be.incident_type)
     ORDER BY label ASC`,
    [...params, INDEX_CRIMES],
  );

  // Build map of DB results
  const dbMap = {};
  result.rows.forEach((r) => {
    const label = r.label;
    if (!dbMap[label]) {
      dbMap[label] = { label, Total: 0 };
      INDEX_CRIMES.forEach((c) => {
        dbMap[label][c] = 0;
      });
    }
    dbMap[label][r.crime] = parseInt(r.count);
    dbMap[label].Total += parseInt(r.count);
  });

  // Without a date range just return raw DB results
  if (!dateFrom || !dateTo) {
    return Object.values(dbMap).sort((a, b) => a.label.localeCompare(b.label));
  }

  // Helper: format a Date as YYYY-MM-DD using LOCAL time (not UTC)
  const toLocalIso = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  // ── Build skeleton cursor — snap to period boundary ────────────────────────
  const cursor = new Date(dateFrom + "T00:00:00");

  if (dateTrunc === "month") {
    cursor.setDate(1);
  }
  // For weekly: do NOT snap the cursor. We start from dateFrom as-is.
  // The merge step below handles the key mismatch by proximity matching.

  // ── Build skeleton end — extend to include the period containing dateTo ────
  const end = new Date(dateTo + "T00:00:00");
  if (dateTrunc === "week") {
    // Extend by 6 days so the week that contains dateTo is always generated
    end.setDate(end.getDate() + 6);
  } else if (dateTrunc === "month") {
    // Extend by 31 days so the month that contains dateTo is always generated
    end.setDate(end.getDate() + 31);
  }

  // ── Walk cursor and build skeleton ─────────────────────────────────────────
  const skeleton = {};
  const skeletonKeys = []; // kept in sorted order for binary-search style lookup

  const cursorClone = new Date(cursor);
  while (cursorClone <= end) {
    const label = toLocalIso(cursorClone);
    skeleton[label] = { label, Total: 0 };
    INDEX_CRIMES.forEach((c) => {
      skeleton[label][c] = 0;
    });
    skeletonKeys.push(label);

    if (dateTrunc === "day") cursorClone.setDate(cursorClone.getDate() + 1);
    else if (dateTrunc === "week") cursorClone.setDate(cursorClone.getDate() + 7);
    else cursorClone.setMonth(cursorClone.getMonth() + 1);
  }

  // ── Merge DB data into skeleton ────────────────────────────────────────────
  if (dateTrunc === "week") {
    // For weekly granularity, DB labels are snapped to week boundaries (Mon/Sun)
    // by Postgres DATE_TRUNC, which may not align with our skeleton keys that
    // start from dateFrom. We map each DB bucket to the skeleton bucket whose
    // key is the largest value that is still <= the DB label (i.e. the skeleton
    // week that "contains" this DB week).
    Object.keys(dbMap).forEach((dbLabel) => {
      let bestKey = null;
      for (const sk of skeletonKeys) {
        if (sk <= dbLabel) bestKey = sk;
        else break;
      }
      if (bestKey !== null) {
        const src = dbMap[dbLabel];
        skeleton[bestKey].Total += src.Total;
        INDEX_CRIMES.forEach((c) => {
          skeleton[bestKey][c] = (skeleton[bestKey][c] || 0) + (src[c] || 0);
        });
      }
    });
  } else {
    // For daily/monthly, Postgres truncation always produces keys that exactly
    // match the skeleton keys, so a direct lookup is safe.
    Object.keys(dbMap).forEach((label) => {
      if (skeleton[label] !== undefined) {
        skeleton[label] = dbMap[label];
      }
    });
  }

  // ── Remove skeleton buckets that are entirely beyond dateTo ───────────────
  // Keep a bucket if its label (period start) is <= dateTo, since it may
  // contain data up to dateTo.
  const trimmed = Object.values(skeleton)
  .filter((row) => {
    // For weekly: keep if the week START is on or before dateTo
    // This naturally includes the partial week containing dateTo
    // because we already extended 'end' by 6 days when building the skeleton
    if (dateTrunc === "week") {
      return row.label >= dateFrom && row.label <= dateTo;
    }
    // For daily and monthly: keep if label is within range
    return row.label <= dateTo;
  })
  .sort((a, b) => a.label.localeCompare(b.label));

  return trimmed;
};

const queryHourly = async (where, params, nextP) => {
  const result = await pool.query(
    `SELECT
      EXTRACT(HOUR FROM be.date_time_commission)::int AS hour,
      COUNT(*) AS count
     FROM blotter_analytics_view be
     ${where}
     ${where ? "AND" : "WHERE"} UPPER(be.incident_type) = ANY($${nextP}::text[])
     GROUP BY hour
     ORDER BY hour ASC`,
    [...params, INDEX_CRIMES],
  );

  const map = {};
  result.rows.forEach((r) => {
    map[r.hour] = parseInt(r.count);
  });

  return Array.from({ length: 24 }, (_, h) => {
    const period = h < 12 ? "AM" : "PM";
    const displayH = h % 12 === 0 ? 12 : h % 12;
    return {
      hour: `${displayH}${period}`,
      count: map[h] || 0,
    };
  });
};

const queryByDay = async (where, params, nextP) => {
  const result = await pool.query(
    `SELECT
      be.day_of_incident AS day,
      COUNT(*) AS count
     FROM blotter_analytics_view be
     ${where}
     ${where ? "AND" : "WHERE"} UPPER(be.incident_type) = ANY($${nextP}::text[])
       AND be.day_of_incident IS NOT NULL
     GROUP BY be.day_of_incident
     ORDER BY count DESC`,
    [...params, INDEX_CRIMES],
  );

  const map = {};
  result.rows.forEach((r) => {
    map[r.day] = parseInt(r.count);
  });

  return DAYS_OF_WEEK.map((day) => ({ day, count: map[day] || 0 }));
};

const queryPlace = async (where, params, nextP) => {
  const result = await pool.query(
    `SELECT
      TRIM(be.type_of_place) AS place,
      COUNT(*) AS count
     FROM blotter_analytics_view be
     ${where}
     ${where ? "AND" : "WHERE"} UPPER(be.incident_type) = ANY($${nextP}::text[])
       AND be.type_of_place IS NOT NULL
       AND TRIM(be.type_of_place) <> ''
     GROUP BY TRIM(be.type_of_place)
     ORDER BY count DESC
     LIMIT 50`,
    [...params, INDEX_CRIMES],
  );

  return result.rows.map((r) => ({
    place: r.place,
    count: parseInt(r.count),
  }));
};

const queryBarangay = async (where, params, nextP) => {
  const result = await pool.query(
    `SELECT
      TRIM(be.place_barangay) AS barangay,
      COUNT(*) AS count
     FROM blotter_analytics_view be
     ${where}
     ${where ? "AND" : "WHERE"} UPPER(be.incident_type) = ANY($${nextP}::text[])
       AND be.place_barangay IS NOT NULL
       AND TRIM(be.place_barangay) <> ''
     GROUP BY TRIM(be.place_barangay)
     ORDER BY count DESC`,
    [...params, INDEX_CRIMES],
  );

  return result.rows.map((r) => ({
    barangay: r.barangay,
    count: parseInt(r.count),
  }));
};

const queryModus = async (where, params, nextP) => {
  const result = await pool.query(
    `SELECT
      UPPER(be.incident_type) AS crime,
      TRIM(be.modus) AS modus,
      COUNT(*) AS count
     FROM blotter_analytics_view be
     ${where}
     ${where ? "AND" : "WHERE"} UPPER(be.incident_type) = ANY($${nextP}::text[])
       AND be.modus IS NOT NULL
       AND TRIM(be.modus) <> ''
     GROUP BY UPPER(be.incident_type), TRIM(be.modus)
     ORDER BY count DESC
     LIMIT 50`,
    [...params, INDEX_CRIMES],
  );

  return result.rows.map((r) => ({
    crime: r.crime,
    modus: r.modus,
    count: parseInt(r.count),
  }));
};

const queryCompleteData = async (where, params, nextP) => {
  const result = await pool.query(
    `SELECT
      TRIM(be.place_barangay)      AS barangay,
      TRIM(be.type_of_place)       AS type_of_place,
      TO_CHAR(be.date_time_commission, 'MM/DD/YYYY') AS date,
      TO_CHAR(be.date_time_commission, 'HH12:MI AM') AS time,
      UPPER(be.incident_type)      AS crime_offense,
      TRIM(be.modus)               AS modus,
      TRIM(be.status)              AS case_status
     FROM blotter_analytics_view be
     ${where}
     ${where ? "AND" : "WHERE"} UPPER(be.incident_type) = ANY($${nextP}::text[])
     ORDER BY
       TRIM(be.place_barangay) ASC,
       UPPER(be.incident_type) ASC,
       CASE
         WHEN LOWER(TRIM(be.status)) NOT IN ('cleared','cce','solved','cse','closed') THEN 0
         WHEN LOWER(TRIM(be.status)) IN ('cleared','cce') THEN 1
         WHEN LOWER(TRIM(be.status)) IN ('solved','cse') THEN 2
         ELSE 3
       END ASC`,
    [...params, INDEX_CRIMES],
  );

  return result.rows.map((r) => ({
    barangay: r.barangay || "",
    typeOfPlace: r.type_of_place || "",
    date: r.date || "",
    time: r.time || "",
    crimeOffense: r.crime_offense || "",
    modus: r.modus || "",
    caseStatus: r.case_status || "",
  }));
};

// ─── /overview — ALL 7 queries in one round trip ──────────────────────────────
const getOverview = async (req, res) => {
  try {
    const { where, params, nextP } = buildWhere(req.query);
    const { granularity = "monthly", date_from, date_to } = req.query;

    const [
      summary,
      trends,
      hourly,
      byDay,
      place,
      barangay,
      modus,
      completeData,
    ] = await Promise.all([
      querySummary(where, params, nextP),
      queryTrends(where, params, nextP, granularity, date_from, date_to),
      queryHourly(where, params, nextP),
      queryByDay(where, params, nextP),
      queryPlace(where, params, nextP),
      queryBarangay(where, params, nextP),
      queryModus(where, params, nextP),
      queryCompleteData(where, params, nextP),
    ]);

    res.json({
      success: true,
      summary,
      trends,
      hourly,
      byDay,
      place,
      barangay,
      modus,
      completeData,
    });
  } catch (err) {
    console.error("getOverview error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── Individual endpoints — kept for backwards compatibility ──────────────────
const getSummary = async (req, res) => {
  try {
    const { where, params, nextP } = buildWhere(req.query);
    const data = await querySummary(where, params, nextP);
    res.json({ success: true, data });
  } catch (err) {
    console.error("getSummary error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

const getTrends = async (req, res) => {
  try {
    const { where, params, nextP } = buildWhere(req.query);
    const { granularity = "monthly", date_from, date_to } = req.query;
    const data = await queryTrends(
      where,
      params,
      nextP,
      granularity,
      date_from,
      date_to,
    );
    res.json({ success: true, data });
  } catch (err) {
    console.error("getTrends error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

const getHourly = async (req, res) => {
  try {
    const { where, params, nextP } = buildWhere(req.query);
    const data = await queryHourly(where, params, nextP);
    res.json({ success: true, data });
  } catch (err) {
    console.error("getHourly error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

const getByDay = async (req, res) => {
  try {
    const { where, params, nextP } = buildWhere(req.query);
    const data = await queryByDay(where, params, nextP);
    res.json({ success: true, data });
  } catch (err) {
    console.error("getByDay error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

const getByPlace = async (req, res) => {
  try {
    const { where, params, nextP } = buildWhere(req.query);
    const data = await queryPlace(where, params, nextP);
    res.json({ success: true, data });
  } catch (err) {
    console.error("getByPlace error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

const getByBarangay = async (req, res) => {
  try {
    const { where, params, nextP } = buildWhere(req.query);
    const data = await queryBarangay(where, params, nextP);
    res.json({ success: true, data });
  } catch (err) {
    console.error("getByBarangay error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

const getByModus = async (req, res) => {
  try {
    const { where, params, nextP } = buildWhere(req.query);
    const data = await queryModus(where, params, nextP);
    res.json({ success: true, data });
  } catch (err) {
    console.error("getByModus error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

const getCompleteData = async (req, res) => {
  try {
    const { where, params, nextP } = buildWhere(req.query);
    const data = await queryCompleteData(where, params, nextP);
    res.json({ success: true, data });
  } catch (err) {
    console.error("getCompleteData error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = {
  getOverview,
  getSummary,
  getTrends,
  getHourly,
  getByDay,
  getByPlace,
  getByBarangay,
  getByModus,
  getCompleteData,
};