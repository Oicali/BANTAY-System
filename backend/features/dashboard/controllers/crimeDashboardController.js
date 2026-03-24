const pool = require("../../../config/database");

const INDEX_CRIMES = [
  "MURDER", "HOMICIDE", "PHYSICAL INJURY", "RAPE",
  "ROBBERY", "THEFT", "CARNAPPING - MC", "CARNAPPING - MV", "SPECIAL COMPLEX CRIME",
];

const DAYS_OF_WEEK = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// ─── BARANGAY ALIAS MAP ───────────────────────────────────────────────────────
// Pre-2023 barangay names that still appear in old blotter records.
// Maps legacy name → current official name (same as LEGACY_BARANGAY_OPTIONS
// in barangayOptions.js on the frontend).
// When a user filters by a current name, we also include all legacy aliases
// that resolve to that same current name so no old records are missed.
const BARANGAY_ALIASES = {
  "ALIMA":          "SINEGUELASAN",
  "BANALO":         "SINEGUELASAN",
  "CAMPOSANTO":     "KAINGIN (POB.)",
  "DAANG BUKID":    "KAINGIN (POB.)",
  "TABING DAGAT":   "KAINGIN (POB.)",
  "KAINGIN":        "KAINGIN DIGMAN",
  "DIGMAN":         "KAINGIN DIGMAN",
  "PANAPAAN":       "P.F. ESPIRITU I (PANAPAAN)",
  "PANAPAAN 2":     "P.F. ESPIRITU II",
  "PANAPAAN 4":     "P.F. ESPIRITU IV",
  "PANAPAAN 5":     "P.F. ESPIRITU V",
  "PANAPAAN 6":     "P.F. ESPIRITU VI",
  "MABOLO 1":       "MABOLO",
  "MABOLO 2":       "MABOLO",
  "MABOLO 3":       "MABOLO",
  "ANIBAN 3":       "ANIBAN I",
  "ANIBAN 4":       "ANIBAN II",
  "ANIBAN 5":       "ANIBAN I",
  "MALIKSI 3":      "MALIKSI II",
  "MAMBOG 5":       "MAMBOG II",
  "NIOG 2":         "NIOG",
  "NIOG 3":         "NIOG",
  "REAL 2":         "REAL",
  "SALINAS 3":      "SALINAS II",
  "SALINAS 4":      "SALINAS II",
  "TALABA 4":       "TALABA III",
  "TALABA 7":       "TALABA I",
};

// Build a reverse map: current name → [all legacy aliases that resolve to it]
const REVERSE_ALIASES = {};
Object.entries(BARANGAY_ALIASES).forEach(([legacy, current]) => {
  if (!REVERSE_ALIASES[current]) REVERSE_ALIASES[current] = [];
  REVERSE_ALIASES[current].push(legacy);
});

// Expand a list of current barangay names to include all legacy aliases
// so old records stored under pre-2023 names are included in query results.
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
  const conditions = ["be.is_deleted = false"];
  const params = [];
  let p = 1;

  if (date_from) {
    conditions.push(`be.date_time_commission >= $${p++}`);
    params.push(date_from);
  }
  if (date_to) {
    conditions.push(`be.date_time_commission < ($${p++}::date + interval '1 day')`);
    params.push(date_to);
  }
  if (crime_types) {
    const types = crime_types.split(",").map((t) => t.trim().toUpperCase()).filter(Boolean);
    if (types.length > 0) {
      conditions.push(`UPPER(be.incident_type) = ANY($${p++}::text[])`);
      params.push(types);
    }
  }
  if (barangays) {
    const brgyList = barangays.split(",").map((b) => b.trim().toUpperCase()).filter(Boolean);
    if (brgyList.length > 0) {
      // Expand to include legacy aliases so old records are not missed
      const expanded = expandBarangays(brgyList);
      conditions.push(`UPPER(TRIM(be.place_barangay)) = ANY($${p++}::text[])`);
      params.push(expanded);
    }
  }

  return { where: "WHERE " + conditions.join(" AND "), params, nextP: p };
};

// ─── INDIVIDUAL QUERY HELPERS ─────────────────────────────────────────────────
// Each returns a plain shaped array — no res.json(), no try/catch.
// Errors bubble up to getOverview's single catch block.

const querySummary = async (where, params, nextP) => {
  const result = await pool.query(
    `SELECT
      UPPER(be.incident_type) AS crime,
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE LOWER(be.status) IN ('cleared', 'cce')) AS cleared,
      COUNT(*) FILTER (WHERE LOWER(be.status) IN ('solved', 'cse')) AS solved,
      COUNT(*) FILTER (
        WHERE LOWER(be.status) NOT IN ('cleared','cce','solved','cse','closed')
      ) AS under_investigation
     FROM blotter_entries be
     ${where}
       AND UPPER(be.incident_type) = ANY($${nextP}::text[])
     GROUP BY UPPER(be.incident_type)`,
    [...params, INDEX_CRIMES],
  );

  const map = {};
  result.rows.forEach((r) => { map[r.crime] = r; });

  return INDEX_CRIMES.map((crime) => ({
    crime,
    total:              parseInt(map[crime]?.total              || 0),
    cleared:            parseInt(map[crime]?.cleared            || 0),
    solved:             parseInt(map[crime]?.solved             || 0),
    underInvestigation: parseInt(map[crime]?.under_investigation || 0),
  }));
};

// queryTrends fills every period in the requested date range with zeros
// so the chart always shows the full range even when there is no crime data.
// Uses local date arithmetic (no UTC shift) to match Postgres DATE_TRUNC output.
// granularity values: "daily" | "bidaily" | "weekly" | "monthly"
// "bidaily" = every 2 days (used for 30d preset → 15 points)
const queryTrends = async (where, params, nextP, granularity = "monthly", dateFrom, dateTo) => {
  // bidaily uses daily DATE_TRUNC then we thin the skeleton to every 2nd day
  const dateTrunc =
    granularity === "daily"   ? "day"
    : granularity === "bidaily" ? "day"
    : granularity === "weekly"  ? "week"
    : "month";

  const result = await pool.query(
    `SELECT
      TO_CHAR(DATE_TRUNC('${dateTrunc}', be.date_time_commission), 'YYYY-MM-DD') AS label,
      UPPER(be.incident_type) AS crime,
      COUNT(*) AS count
     FROM blotter_entries be
     ${where}
       AND UPPER(be.incident_type) = ANY($${nextP}::text[])
     GROUP BY label, UPPER(be.incident_type)
     ORDER BY label ASC`,
    [...params, INDEX_CRIMES],
  );

  // Build map of what DB returned — label is already YYYY-MM-DD string from Postgres
  const dbMap = {};
  result.rows.forEach((r) => {
    const label = r.label;
    if (!dbMap[label]) {
      dbMap[label] = { label, Total: 0 };
      INDEX_CRIMES.forEach((c) => { dbMap[label][c] = 0; });
    }
    dbMap[label][r.crime] = parseInt(r.count);
    dbMap[label].Total   += parseInt(r.count);
  });

  // Without a date range just return raw DB results
  if (!dateFrom || !dateTo) {
    return Object.values(dbMap).sort((a, b) => a.label.localeCompare(b.label));
  }

  // Helper: format a Date as YYYY-MM-DD using LOCAL time (not UTC)
  // This prevents the UTC-offset shift that causes mismatched labels
  const toLocalIso = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  // Build skeleton: snap cursor to period boundary then walk to end
  // The snap must produce the SAME label that DATE_TRUNC produces in Postgres:
  //   monthly → 1st of month  e.g. 2025-03-01
  //   weekly  → Monday of week e.g. 2025-03-17
  //   daily   → exact day      e.g. 2025-03-19
  const cursor = new Date(dateFrom + "T00:00:00");

  if (dateTrunc === "month") {
    cursor.setDate(1);                         // snap to 1st of month
  } else if (dateTrunc === "week") {
    const dow = cursor.getDay();               // 0=Sun, 1=Mon ... 6=Sat
    const diff = dow === 0 ? -6 : 1 - dow;    // roll back to Monday (Postgres default)
    cursor.setDate(cursor.getDate() + diff);
  }
  // daily: no snap needed — cursor is already the exact day

  const end = new Date(dateTo + "T00:00:00");

  const skeleton = {};
  while (cursor <= end) {
    const label = toLocalIso(cursor);
    skeleton[label] = { label, Total: 0 };
    INDEX_CRIMES.forEach((c) => { skeleton[label][c] = 0; });

    if (granularity === "bidaily") cursor.setDate(cursor.getDate() + 2);
    else if (dateTrunc === "day")  cursor.setDate(cursor.getDate() + 1);
    else if (dateTrunc === "week") cursor.setDate(cursor.getDate() + 7);
    else                           cursor.setMonth(cursor.getMonth() + 1);
  }

  // For bidaily: also aggregate DB data into the 2-day buckets
  // Each skeleton key represents a 2-day window starting on that date
  if (granularity === "bidaily") {
    const skeletonKeys = Object.keys(skeleton).sort();
    skeletonKeys.forEach((key, i) => {
      const nextKey = skeletonKeys[i + 1];
      // Find all dbMap keys that fall in [key, nextKey)
      Object.keys(dbMap).forEach((dbLabel) => {
        if (dbLabel >= key && (!nextKey || dbLabel < nextKey)) {
          // Merge this day's data into the bucket
          INDEX_CRIMES.forEach((c) => {
            skeleton[key][c] += dbMap[dbLabel][c] || 0;
            skeleton[key].Total += dbMap[dbLabel][c] || 0;
          });
          // Recalculate Total correctly
        }
      });
      // Recalculate Total from individual crimes
      skeleton[key].Total = INDEX_CRIMES.reduce((s, c) => s + (skeleton[key][c] || 0), 0);
    });
    return Object.values(skeleton).sort((a, b) => a.label.localeCompare(b.label));
  }

  // Merge DB data into skeleton for daily/weekly/monthly
  Object.keys(dbMap).forEach((label) => {
    if (skeleton[label] !== undefined) skeleton[label] = dbMap[label];
  });

  return Object.values(skeleton).sort((a, b) => a.label.localeCompare(b.label));
};

const queryHourly = async (where, params, nextP) => {
  const result = await pool.query(
    `SELECT
      EXTRACT(HOUR FROM be.date_time_commission)::int AS hour,
      COUNT(*) AS count
     FROM blotter_entries be
     ${where}
       AND UPPER(be.incident_type) = ANY($${nextP}::text[])
     GROUP BY hour
     ORDER BY hour ASC`,
    [...params, INDEX_CRIMES],
  );

  // Fill all 24 hours so the chart always has a complete x-axis
  const map = {};
  result.rows.forEach((r) => { map[r.hour] = parseInt(r.count); });

  return Array.from({ length: 24 }, (_, h) => ({
    hour:  `${String(h).padStart(2, "0")}:00`,
    count: map[h] || 0,
  }));
};

const queryByDay = async (where, params, nextP) => {
  const result = await pool.query(
    `SELECT
      be.day_of_incident AS day,
      COUNT(*) AS count
     FROM blotter_entries be
     ${where}
       AND UPPER(be.incident_type) = ANY($${nextP}::text[])
       AND be.day_of_incident IS NOT NULL
     GROUP BY be.day_of_incident
     ORDER BY count DESC`,
    [...params, INDEX_CRIMES],
  );

  // Map results into the fixed 7-day order so the chart always shows all days
  const map = {};
  result.rows.forEach((r) => { map[r.day] = parseInt(r.count); });

  return DAYS_OF_WEEK.map((day) => ({ day, count: map[day] || 0 }));
};

const queryPlace = async (where, params, nextP) => {
  const result = await pool.query(
    `SELECT
      TRIM(be.type_of_place) AS place,
      COUNT(*) AS count
     FROM blotter_entries be
     ${where}
       AND UPPER(be.incident_type) = ANY($${nextP}::text[])
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
     FROM blotter_entries be
     ${where}
       AND UPPER(be.incident_type) = ANY($${nextP}::text[])
       AND be.place_barangay IS NOT NULL
       AND TRIM(be.place_barangay) <> ''
     GROUP BY TRIM(be.place_barangay)
     ORDER BY count DESC`,
    [...params, INDEX_CRIMES],
  );

  return result.rows.map((r) => ({
    barangay: r.barangay,
    count:    parseInt(r.count),
  }));
};

const queryModus = async (where, params, nextP) => {
  const result = await pool.query(
    `SELECT
      UPPER(be.incident_type) AS crime,
      TRIM(be.modus) AS modus,
      COUNT(*) AS count
     FROM blotter_entries be
     ${where}
       AND UPPER(be.incident_type) = ANY($${nextP}::text[])
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

// ─── /overview — ALL 7 queries in one round trip ──────────────────────────────
// All 7 queries fire simultaneously via Promise.all — total wait = slowest query.
// One JSON body → one setState → one render → all panels always in sync.
const getOverview = async (req, res) => {
  try {
    const { where, params, nextP } = buildWhere(req.query);
    const { granularity = "monthly", date_from, date_to, preset } = req.query;
    // Use bidaily granularity for 30d preset so we get 15 points instead of 30
    const effectiveGranularity = preset === "30d" ? "bidaily" : granularity;

    const [summary, trends, hourly, byDay, place, barangay, modus] =
      await Promise.all([
        querySummary(where, params, nextP),
        queryTrends(where, params, nextP, effectiveGranularity, date_from, date_to),
        queryHourly(where, params, nextP),
        queryByDay(where, params, nextP),
        queryPlace(where, params, nextP),
        queryBarangay(where, params, nextP),
        queryModus(where, params, nextP),
      ]);

    res.json({ success: true, summary, trends, hourly, byDay, place, barangay, modus });

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
    const { granularity = "monthly", date_from, date_to, preset } = req.query;
    // Use bidaily if preset is 30d regardless of granularity param
    const effectiveGranularity = preset === "30d" ? "bidaily" : granularity;
    const data = await queryTrends(where, params, nextP, effectiveGranularity, date_from, date_to);
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

module.exports = {
  getOverview,
  getSummary, getTrends, getHourly,
  getByDay, getByPlace, getByBarangay, getByModus,
};