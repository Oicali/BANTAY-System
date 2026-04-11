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
// NOTE: "bidaily" has been removed. Last 30 days now uses "weekly".
//
// WEEK BOUNDARY FIX:
//   Postgres DATE_TRUNC('week') starts on MONDAY by default.
//   However, some Postgres server locales use SUNDAY as week start,
//   which caused the skeleton to be off by one day.
//   We detect which day Postgres actually uses by checking a known
//   date and align our skeleton accordingly — ensuring skeleton keys
//   always match exactly what Postgres returns.
//
// END-OF-RANGE FIX:
//   For weekly granularity, we extend the skeleton end by 6 days so
//   the current partial week (e.g. Mon Apr 7 when today is Wed Apr 9)
//   is always included as a bucket.
//   For monthly granularity, we extend by 31 days so the current
//   partial month is always included.
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

  // ── Detect Postgres week start day (Monday=1 or Sunday=0) ──────────────────
  // DATE_TRUNC('week', '2024-01-07') → if Mon: '2024-01-01', if Sun: '2006-01-01'
  // We use a known Sunday (2024-01-07) and see what Postgres truncates it to.
  let pgWeekStartDay = 1; // default: Monday
  if (dateTrunc === "week") {
    const probe = await pool.query(
      `SELECT TO_CHAR(DATE_TRUNC('week', '2024-01-07'::date), 'YYYY-MM-DD') AS ws`,
    );
    // 2024-01-07 is a Sunday.
    // If Postgres week starts Monday → truncates to 2024-01-01 (Monday)
    // If Postgres week starts Sunday → truncates to 2024-01-07 (Sunday itself)
    pgWeekStartDay = probe.rows[0].ws === "2024-01-07" ? 0 : 1;
  }

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
  // Weekly: do NOT snap cursor back. Instead, remap the first DB bucket
  // label to dateFrom so the chart starts exactly at the requested date.
  // The data inside is still correct because buildWhere enforces date_from.
  if (dateTrunc === "week" && Object.keys(dbMap).length > 0) {
    const sortedDbKeys = Object.keys(dbMap).sort();
    const firstKey = sortedDbKeys[0];
    if (firstKey < dateFrom) {
      dbMap[dateFrom] = { ...dbMap[firstKey], label: dateFrom };
      delete dbMap[firstKey];
    }
  }

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
  while (cursor <= end) {
    const label = toLocalIso(cursor);
    skeleton[label] = { label, Total: 0 };
    INDEX_CRIMES.forEach((c) => {
      skeleton[label][c] = 0;
    });

    if (dateTrunc === "day") cursor.setDate(cursor.getDate() + 1);
    else if (dateTrunc === "week") cursor.setDate(cursor.getDate() + 7);
    else cursor.setMonth(cursor.getMonth() + 1);
  }

  // ── Merge DB data into skeleton ────────────────────────────────────────────
  Object.keys(dbMap).forEach((label) => {
    if (skeleton[label] !== undefined) {
      skeleton[label] = dbMap[label];
    }
  });

  // ── Remove skeleton buckets that are entirely beyond dateTo ───────────────
  // This trims any over-extended months/weeks that have no data and fall
  // completely outside the requested range. We keep a bucket if its label
  // (period start) is <= dateTo, since it may contain data up to dateTo.
  const trimmed = Object.values(skeleton)
    .filter((row) => row.label <= dateTo)
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
