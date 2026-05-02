const pool = require("../../../config/database");

const fetch = (...args) =>
  import("node-fetch").then(({ default: f }) => f(...args));

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://localhost:8000";

function getIncidenceThresholds(dateFrom, dateTo) {
  const days =
    Math.round((new Date(dateTo) - new Date(dateFrom)) / 86400000) + 1;
  if (days <= 29) return { lowMax: 1, medMax: 2 }; // ≤29 days: Low=1, Medium=2, High=3+
  if (days <= 91) return { lowMax: 1, medMax: 3 }; // 30–91 days: Low=1, Medium=2–3, High=4+
  if (days <= 364) return { lowMax: 2, medMax: 5 }; // 92–364 days: Low=1–2, Medium=3–5, High=6+
  return { lowMax: 3, medMax: 8 }; // 365+ days: Low=1–3, Medium=4–8, High=9+
}

function getIncidenceColor(crimeCount, dateFrom, dateTo) {
  const { lowMax, medMax } = getIncidenceThresholds(dateFrom, dateTo);

  if (crimeCount === 0) return { color: "#adb5bd", risk: "None" };
  if (crimeCount <= lowMax) return { color: "#eab308", risk: "Low Incidence" };
  if (crimeCount <= medMax)
    return { color: "#f97316", risk: "Moderate Incidence" };
  return { color: "#b91c1c", risk: "High Incidence" };
}

function getIncidenceMinCount(dateFrom, dateTo) {
  const { lowMax } = getIncidenceThresholds(dateFrom, dateTo);
  return lowMax + 1;
}

function getHighIncidenceMinCount(dateFrom, dateTo) {
  const { medMax } = getIncidenceThresholds(dateFrom, dateTo);
  return medMax + 1;
}

const getBoundaries = async (req, res) => {
  try {
    const { date_from, date_to, incident_type } = req.query;

    let crimeQuery = `
      SELECT 
        UPPER(TRIM(place_barangay)) as barangay,
        COUNT(*) as crime_count
      FROM blotter_analytics_view
      WHERE lat IS NOT NULL
        AND LOWER(TRIM(status)) IN ('cleared','cce','solved','cse','under investigation','ui','for investigation','active','ongoing')
    `;
    const params = [];
    let p = 1;

    if (date_from) {
      crimeQuery += ` AND date_time_commission >= $${p++}`;
      params.push(date_from);
    }
    if (date_to) {
      crimeQuery += ` AND date_time_commission < ($${p++}::date + interval '1 day')`;
      params.push(date_to);
    }
    const rawTypes = req.query.incident_type;
    const incidentTypes = rawTypes
      ? (Array.isArray(rawTypes) ? rawTypes : rawTypes.split(","))
          .map((t) => t.trim().toUpperCase())
          .filter(Boolean)
      : [];

    if (incidentTypes.length) {
      crimeQuery += ` AND UPPER(TRIM(incident_type)) = ANY($${p++}::text[])`;
      params.push(incidentTypes);
    }

    crimeQuery += ` GROUP BY UPPER(TRIM(place_barangay))`;

    const client = await pool.connect();
    let crimeResult, barangayResult;
    try {
      [crimeResult, barangayResult] = await Promise.all([
        client.query(crimeQuery, params),
        client.query(
          `SELECT name_db, name_kml, centroid_lat, centroid_lng FROM barangay_map_data ORDER BY name_db`,
        ),
      ]);
    } finally {
      client.release();
    }

    const crimeMap = {};
    crimeResult.rows.forEach((r) => {
      crimeMap[r.barangay] = parseInt(r.crime_count, 10);
    });

    const boundaries = barangayResult.rows.map((b) => {
      const count = crimeMap[b.name_db.toUpperCase()] || 0;
      const { color, risk } = getIncidenceColor(
        count,
        date_from || "2000-01-01",
        date_to || new Date().toISOString().slice(0, 10),
      );

      return {
        name_db: b.name_db,
        name_kml: b.name_kml,
        centroid_lat: parseFloat(b.centroid_lat),
        centroid_lng: parseFloat(b.centroid_lng),
        crime_count: count,
        color,
        risk,
      };
    });

    res.json({ success: true, data: boundaries });
  } catch (error) {
    console.error("getBoundaries error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

const getPins = async (req, res) => {
  try {
    const { date_from, date_to, incident_type, barangay } = req.query;

    let query = `
      SELECT 
        blotter_id,
        blotter_entry_number,
        incident_type,
        place_barangay,
        place_street,
        type_of_place,
        modus,
        status,
        date_time_commission,
        lat,
        lng
      FROM blotter_analytics_view
      WHERE lat IS NOT NULL 
        AND lng IS NOT NULL
        AND LOWER(TRIM(status)) IN ('cleared','cce','solved','cse','under investigation','ui','for investigation','active','ongoing')
    `;
    const params = [];
    let p = 1;

    if (date_from) {
      query += ` AND date_time_commission >= $${p++}`;
      params.push(date_from);
    }
    if (date_to) {
      query += ` AND date_time_commission < ($${p++}::date + interval '1 day')`;
      params.push(date_to);
    }
    if (incident_type) {
      const types = (
        Array.isArray(incident_type) ? incident_type : incident_type.split(",")
      )
        .map((t) => t.trim().toUpperCase())
        .filter(Boolean);
      if (types.length > 0) {
        query += ` AND UPPER(TRIM(incident_type)) = ANY($${p++}::text[])`;
        params.push(types);
      }
    }
    if (barangay) {
      query += ` AND UPPER(TRIM(place_barangay)) = UPPER($${p++})`;
      params.push(barangay);
    }
    if (req.query.modus) {
      query += ` AND EXISTS (
        SELECT 1 FROM crime_modus cm
        JOIN crime_modus_reference cmr ON cm.modus_reference_id = cmr.id
        WHERE cm.blotter_id = blotter_analytics_view.blotter_id
        AND UPPER(cmr.modus_name) = UPPER($${p++})
      )`;
      params.push(req.query.modus);
    }
    if (req.query.hour !== undefined && req.query.hour !== "") {
      query += ` AND EXTRACT(HOUR FROM date_time_commission) = $${p++}`;
      params.push(parseInt(req.query.hour, 10));
    }
    if (req.query.day) {
      query += ` AND TRIM(TO_CHAR(date_time_commission, 'Day')) = $${p++}`;
      params.push(req.query.day);
    }

    const { role_name, user_id } = req.user || {};
    const client = await pool.connect();
    let result;
    try {
      if (role_name === "Barangay Official") {
        const bdRes = await client.query(
          `SELECT bd.barangay_code FROM barangay_details bd WHERE bd.user_id = $1`,
          [user_id],
        );
        if (bdRes.rows.length > 0) {
          query += ` AND UPPER(TRIM(place_barangay)) = UPPER($${p++})`;
          params.push(bdRes.rows[0].barangay_code);
        }
      }

      if (role_name === "Patrol") {
        const patrolRes = await client.query(
          `SELECT mu.barangay_area FROM active_patroller ap
           JOIN mobile_unit_patroller mup ON ap.active_patroller_id = mup.active_patroller_id
           JOIN mobile_unit mu ON mup.mobile_unit_id = mu.mobile_unit_id
           WHERE ap.officer_id = $1 AND ap.status = 'Active'`,
          [user_id],
        );
        if (patrolRes.rows.length > 0) {
          const areas = patrolRes.rows.map((r) =>
            r.barangay_area.toUpperCase(),
          );
          query += ` AND UPPER(TRIM(place_barangay)) = ANY($${p++}::text[])`;
          params.push(areas);
        }
      }

      query += ` ORDER BY date_time_commission DESC`;
      result = await client.query(query, params);
    } finally {
      client.release();
    }

    const colorMap = {
      ROBBERY: "#ef4444",
      THEFT: "#f97316",
      "PHYSICAL INJURIES": "#eab308",
      "PHYSICAL INJURY": "#eab308",
      HOMICIDE: "#8b5cf6",
      MURDER: "#7c3aed",
      RAPE: "#ec4899",
      "CARNAPPING - MC": "#3b82f6",
      "CARNAPPING - MV": "#0ea5e9",
      "SPECIAL COMPLEX CRIME": "#14b8a6",
    };

    const pins = result.rows.map((r) => {
      const dt = r.date_time_commission
        ? new Date(r.date_time_commission)
        : null;
      const days = [
        "Sunday",
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
      ];
      return {
        ...r,
        lat: parseFloat(r.lat),
        lng: parseFloat(r.lng),
        color: colorMap[r.incident_type?.toUpperCase()] || "#6b7280",
        time: dt
          ? dt.toLocaleTimeString("en-PH", {
              hour: "2-digit",
              minute: "2-digit",
            })
          : null,
        day_of_week: dt ? days[dt.getDay()] : null,
      };
    });

    res.json({ success: true, count: pins.length, data: pins });
  } catch (error) {
    console.error("getPins error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

const getStatistics = async (req, res) => {
  try {
    const { date_from, date_to, incident_type, barangay } = req.query;

    let baseWhere = `WHERE lat IS NOT NULL AND LOWER(TRIM(status)) IN ('cleared','cce','solved','cse','under investigation','ui','for investigation','active','ongoing')`;
    const params = [];
    let p = 1;

    if (date_from) {
      baseWhere += ` AND date_time_commission >= $${p++}`;
      params.push(date_from);
    }
    if (date_to) {
      baseWhere += ` AND date_time_commission < ($${p++}::date + interval '1 day')`;
      params.push(date_to);
    }
    if (incident_type) {
      const types = (
        Array.isArray(incident_type) ? incident_type : incident_type.split(",")
      )
        .map((t) => t.trim().toUpperCase())
        .filter(Boolean);
      if (types.length > 0) {
        baseWhere += ` AND UPPER(TRIM(incident_type)) = ANY($${p++}::text[])`;
        params.push(types);
      }
    }
    if (barangay) {
      baseWhere += ` AND UPPER(TRIM(place_barangay)) = UPPER($${p++})`;
      params.push(barangay);
    }

    const incidenceMin = getIncidenceMinCount(
      date_from || "2000-01-01",
      date_to || new Date().toISOString().slice(0, 10),
    );
    const highIncidenceMin = getHighIncidenceMinCount(
      date_from || "2000-01-01",
      date_to || new Date().toISOString().slice(0, 10),
    );

    const client = await pool.connect();
    let totalPins,
      byIncidentType,
      incidenceBarangays,
      highIncidenceBarangays,
      recentIncidents,
      totalBlotters;
    try {
      [
        totalPins,
        byIncidentType,
        incidenceBarangays,
        highIncidenceBarangays,
        recentIncidents,
        totalBlotters,
      ] = await Promise.all([
        client.query(
          `SELECT COUNT(*) FROM blotter_analytics_view ${baseWhere}`,
          params,
        ),
        client.query(
          `SELECT incident_type, COUNT(*) as count FROM blotter_analytics_view ${baseWhere} GROUP BY incident_type ORDER BY count DESC`,
          params,
        ),
        client.query(
          `SELECT UPPER(TRIM(place_barangay)) as barangay, COUNT(*) as count
           FROM blotter_analytics_view ${baseWhere}
           GROUP BY UPPER(TRIM(place_barangay))
           HAVING COUNT(*) >= 1
           ORDER BY count DESC, barangay ASC`,
          params,
        ),
        client.query(
          `SELECT UPPER(TRIM(place_barangay)) as barangay, COUNT(*) as count
           FROM blotter_analytics_view ${baseWhere}
           GROUP BY UPPER(TRIM(place_barangay))
           HAVING COUNT(*) >= $${params.length + 1}::int
           ORDER BY count DESC, barangay ASC`,
          [...params, highIncidenceMin],
        ),
        client.query(
          `SELECT blotter_entry_number, incident_type, place_barangay, date_time_commission FROM blotter_analytics_view ${baseWhere} ORDER BY date_time_commission DESC LIMIT 5`,
          params,
        ),
        client.query(
          `SELECT COUNT(*) FROM blotter_analytics_view WHERE LOWER(TRIM(status)) IN ('cleared','cce','solved','cse','under investigation','ui','for investigation','active','ongoing')`,
        ),
      ]);
    } finally {
      client.release();
    }

    const incidenceWithLevel = incidenceBarangays.rows.map((row) => {
      const count = parseInt(row.count, 10);
      const { risk } = getIncidenceColor(
        count,
        date_from || "2000-01-01",
        date_to || new Date().toISOString().slice(0, 10),
      );
      return {
        barangay: row.barangay,
        count,
        risk,
      };
    });

    res.json({
      success: true,
      data: {
        total_pins: parseInt(totalPins.rows[0].count, 10),
        total_blotters: parseInt(totalBlotters.rows[0].count, 10),
        barangays_with_crimes: incidenceWithLevel.length,
        incidence_count: incidenceWithLevel.length,
        high_incidence_count: highIncidenceBarangays.rows.length,
        top_crime: byIncidentType.rows[0]?.incident_type || null,
        top_barangay: incidenceWithLevel[0]?.barangay || null,
        by_incident_type: byIncidentType.rows,
        incidence_barangays: incidenceWithLevel,
        recent_incidents: recentIncidents.rows,
      },
    });
  } catch (error) {
    console.error("getStatistics error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

const getHeatmap = async (req, res) => {
  try {
    const { date_from, date_to, incident_type, barangay } = req.query;

    let baseWhere = `
      WHERE lat IS NOT NULL
        AND lng IS NOT NULL
        AND LOWER(TRIM(status)) IN ('cleared','cce','solved','cse','under investigation','ui','for investigation','active','ongoing')
    `;
    const params = [];
    let p = 1;

    if (date_from) {
      baseWhere += ` AND date_time_commission >= $${p++}`;
      params.push(date_from);
    }
    if (date_to) {
      baseWhere += ` AND date_time_commission < ($${p++}::date + interval '1 day')`;
      params.push(date_to);
    }
    if (incident_type) {
      const types = (
        Array.isArray(incident_type) ? incident_type : incident_type.split(",")
      )
        .map((t) => t.trim().toUpperCase())
        .filter(Boolean);
      if (types.length > 0) {
        baseWhere += ` AND UPPER(TRIM(incident_type)) = ANY($${p++}::text[])`;
        params.push(types);
      }
    }
    if (barangay) {
      baseWhere += ` AND UPPER(TRIM(place_barangay)) = UPPER($${p++})`;
      params.push(barangay);
    }

    const pointsSQL = `
      SELECT
        blotter_id,
        UPPER(TRIM(incident_type)) AS incident_type,
        UPPER(TRIM(place_barangay)) AS place_barangay,
        date_time_commission,
        lat::float,
        lng::float
      FROM blotter_analytics_view
      ${baseWhere}
      ORDER BY date_time_commission DESC
    `;

    const client = await pool.connect();
    let pointsResult;
    try {
      const { role_name, user_id } = req.user || {};

      if (role_name === "Barangay Official") {
        const bdRes = await client.query(
          `SELECT barangay_code FROM barangay_details WHERE user_id = $1`,
          [user_id],
        );
        if (bdRes.rows.length > 0) {
          const brgyWhere = ` AND UPPER(TRIM(place_barangay)) = UPPER($${p})`;
          params.push(bdRes.rows[0].barangay_code);
          pointsResult = await client.query(
            pointsSQL.replace(baseWhere, baseWhere + brgyWhere),
            params,
          );
        } else {
          pointsResult = await client.query(pointsSQL, params);
        }
      } else if (role_name === "Patrol") {
        const patrolRes = await client.query(
          `SELECT mu.barangay_area
           FROM active_patroller ap
           JOIN mobile_unit_patroller mup ON ap.active_patroller_id = mup.active_patroller_id
           JOIN mobile_unit mu ON mup.mobile_unit_id = mu.mobile_unit_id
           WHERE ap.officer_id = $1 AND ap.status = 'Active'`,
          [user_id],
        );
        if (patrolRes.rows.length > 0) {
          const areas = patrolRes.rows.map((r) =>
            r.barangay_area.toUpperCase(),
          );
          const patrolWhere = ` AND UPPER(TRIM(place_barangay)) = ANY($${p}::text[])`;
          params.push(areas);
          pointsResult = await client.query(
            pointsSQL.replace(baseWhere, baseWhere + patrolWhere),
            params,
          );
        } else {
          pointsResult = await client.query(pointsSQL, params);
        }
      } else {
        pointsResult = await client.query(pointsSQL, params);
      }
    } finally {
      client.release();
    }

    const aiPayload = {
      date_from: date_from || "2000-01-01",
      date_to: date_to || new Date().toISOString().slice(0, 10),
      crime_types: incident_type ? [incident_type] : [],
      barangays: barangay ? [barangay] : [],
    };

    let dbscanClusters = [];
    try {
      const aiRes = await fetch(`${AI_SERVICE_URL}/clusters`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(aiPayload),
        signal: AbortSignal.timeout(8000),
      });
      const aiData = await aiRes.json();
      dbscanClusters = aiData.clusters || [];
    } catch (aiErr) {
      console.warn(
        "DBSCAN service unavailable, skipping clusters:",
        aiErr.message,
      );
    }

    const pointFeatures = pointsResult.rows.map((r) => ({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [r.lng, r.lat],
      },
      properties: {
        weight: 1.0,
        incident_type: r.incident_type,
        barangay: r.place_barangay,
        date: r.date_time_commission,
      },
    }));

    const maxCount = dbscanClusters.length
      ? Math.max(...dbscanClusters.map((c) => c.count))
      : 1;

    const clusterFeatures = dbscanClusters.map((c, i) => ({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [c.centroid_lng, c.centroid_lat],
      },
      properties: {
        cluster: true,
        count: c.count,
        dominant_crime: c.dominant_crime,
        dominant_barangay: c.dominant_barangay ?? "Unknown",
        intensity: Math.min(1, c.count / maxCount),
        rank: i + 1,
        crime_types: c.crime_types,
        dominant_modus: c.dominant_modus,
        radius_m: c.radius_m ?? 100,
      },
    }));

    return res.json({
      success: true,
      total_points: pointFeatures.length,
      total_clusters: clusterFeatures.length,
      points: {
        type: "FeatureCollection",
        features: pointFeatures,
      },
      clusters: {
        type: "FeatureCollection",
        features: clusterFeatures,
      },
    });
  } catch (error) {
    console.error("getHeatmap error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { getBoundaries, getPins, getStatistics, getHeatmap };
