const pool = require("../../../config/database");

// GET /crime-map/boundaries
// Returns all 46 barangays with crime count + color code
const getBoundaries = async (req, res) => {
  try {
    const { date_from, date_to, incident_type } = req.query;

    let crimeQuery = `
      SELECT 
        UPPER(TRIM(place_barangay)) as barangay,
        COUNT(*) as crime_count
      FROM blotter_entries
      WHERE lat IS NOT NULL AND is_deleted = false
    `;
    const params = [];
    let p = 1;

    if (date_from) {
      crimeQuery += ` AND date_time_commission >= $${p++}`;
      params.push(date_from);
    }
    if (date_to) {
      crimeQuery += ` AND date_time_commission <= $${p++}`;
      params.push(date_to);
    }
    if (incident_type) {
      crimeQuery += ` AND UPPER(incident_type) = UPPER($${p++})`;
      params.push(incident_type);
    }

    crimeQuery += ` GROUP BY UPPER(TRIM(place_barangay))`;

    const client = await pool.connect();
    let crimeResult, barangayResult;
    try {
      [crimeResult, barangayResult] = await Promise.all([
        client.query(crimeQuery, params),
        client.query(`SELECT name_db, name_kml, centroid_lat, centroid_lng FROM barangay_map_data ORDER BY name_db`),
      ]);
    } finally {
      client.release();
    }

    const crimeMap = {};
    crimeResult.rows.forEach(r => {
      crimeMap[r.barangay] = parseInt(r.crime_count);
    });

    const boundaries = barangayResult.rows.map(b => {
      const count = crimeMap[b.name_db.toUpperCase()] || 0;
      let color = '#9ca3af'; // GREY
      let risk = 'None';

      if (count >= 4) { color = '#ef4444'; risk = 'High'; }
      else if (count >= 2) { color = '#f97316'; risk = 'Medium'; }
      else if (count >= 1) { color = '#22c55e'; risk = 'Low'; }

      return {
        name_db: b.name_db,
        name_kml: b.name_kml,
        centroid_lat: parseFloat(b.centroid_lat),
        centroid_lng: parseFloat(b.centroid_lng),
        crime_count: count,
        color,
        risk
      };
    });

    res.json({ success: true, data: boundaries });
  } catch (error) {
    console.error('getBoundaries error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /crime-map/pins
// Returns all crime pins with coordinates
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
      FROM blotter_entries
      WHERE lat IS NOT NULL 
        AND lng IS NOT NULL
        AND is_deleted = false
    `;
    const params = [];
    let p = 1;

    if (date_from) {
      query += ` AND date_time_commission >= $${p++}`;
      params.push(date_from);
    }
    if (date_to) {
      query += ` AND date_time_commission <= $${p++}`;
      params.push(date_to);
    }
    if (incident_type) {
      query += ` AND UPPER(incident_type) = UPPER($${p++})`;
      params.push(incident_type);
    }
    if (barangay) {
  query += ` AND UPPER(TRIM(place_barangay)) = UPPER($${p++})`;
  params.push(barangay);
}
if (req.query.modus) {
  query += ` AND EXISTS (
    SELECT 1 FROM crime_modus cm
    JOIN crime_modus_reference cmr ON cm.modus_reference_id = cmr.id
    WHERE cm.blotter_id = blotter_entries.blotter_id
    AND UPPER(cmr.modus_name) = UPPER($${p++})
  )`;
  params.push(req.query.modus);
}
if (req.query.hour !== undefined && req.query.hour !== '') {
  query += ` AND EXTRACT(HOUR FROM date_time_commission) = $${p++}`;
  params.push(parseInt(req.query.hour));
}
if (req.query.day) {
  query += ` AND TRIM(TO_CHAR(date_time_commission, 'Day')) = $${p++}`;
  params.push(req.query.day);
}

    // Role-based filtering
const { role_name, user_id } = req.user || {};
    const client = await pool.connect();
    let result;
    try {
      if (role_name === 'Barangay Official') {
        const bdRes = await client.query(
          `SELECT bd.barangay_code FROM barangay_details bd WHERE bd.user_id = $1`,
          [user_id]
        );
        if (bdRes.rows.length > 0) {
          query += ` AND UPPER(TRIM(place_barangay)) = UPPER($${p++})`;
          params.push(bdRes.rows[0].barangay_code);
        }
      }

      if (role_name === 'Patrol') {
        const patrolRes = await client.query(
          `SELECT mu.barangay_area FROM active_patroller ap
           JOIN mobile_unit_patroller mup ON ap.active_patroller_id = mup.active_patroller_id
           JOIN mobile_unit mu ON mup.mobile_unit_id = mu.mobile_unit_id
           WHERE ap.officer_id = $1 AND ap.status = 'Active'`,
          [user_id]
        );
        if (patrolRes.rows.length > 0) {
          const areas = patrolRes.rows.map(r => r.barangay_area.toUpperCase());
          query += ` AND UPPER(TRIM(place_barangay)) = ANY($${p++}::text[])`;
          params.push(areas);
        }
      }

      query += ` ORDER BY date_time_commission DESC`;
      result = await client.query(query, params);
    } finally {
      client.release();
    }

    // Assign color per incident type
    const colorMap = {
      'ROBBERY': '#ef4444',
      'THEFT': '#f97316',
      'PHYSICAL INJURIES': '#eab308',
      'HOMICIDE': '#8b5cf6',
      'MURDER': '#7c3aed',
      'RAPE': '#ec4899',
      'CARNAPPING - MC': '#3b82f6',
      'CARNAPPING - MV': '#0ea5e9',
      'SPECIAL COMPLEX CRIME': '#14b8a6',
    };

    const pins = result.rows.map(r => {
  const dt = r.date_time_commission ? new Date(r.date_time_commission) : null;
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  return {
    ...r,
    lat: parseFloat(r.lat),
    lng: parseFloat(r.lng),
    color: colorMap[r.incident_type?.toUpperCase()] || '#6b7280',
    time: dt ? dt.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }) : null,
    day_of_week: dt ? days[dt.getDay()] : null,
  };
});

    res.json({ success: true, count: pins.length, data: pins });
  } catch (error) {
    console.error('getPins error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /crime-map/statistics
// Returns summary stats for sidebar
const getStatistics = async (req, res) => {
  try {
    const { date_from, date_to, incident_type, barangay } = req.query;
    
    let baseWhere = `WHERE lat IS NOT NULL AND is_deleted = false`;
    const params = [];
    let p = 1;

    if (date_from) { baseWhere += ` AND date_time_commission >= $${p++}`; params.push(date_from); }
    if (date_to) { baseWhere += ` AND date_time_commission <= $${p++}`; params.push(date_to); }
    if (incident_type) { baseWhere += ` AND UPPER(incident_type) = UPPER($${p++})`; params.push(incident_type); }
    if (barangay) { baseWhere += ` AND UPPER(TRIM(place_barangay)) = UPPER($${p++})`; params.push(barangay); }

   const client = await pool.connect();
let totalPins, byIncidentType, hotspots, recentIncidents, totalBlotters;
try {
  [totalPins, byIncidentType, hotspots, recentIncidents, totalBlotters] = await Promise.all([
    client.query(`SELECT COUNT(*) FROM blotter_entries ${baseWhere}`, params),
    client.query(`SELECT incident_type, COUNT(*) as count FROM blotter_entries ${baseWhere} GROUP BY incident_type ORDER BY count DESC`, params),
    client.query(`SELECT UPPER(TRIM(place_barangay)) as barangay, COUNT(*) as count FROM blotter_entries ${baseWhere} GROUP BY UPPER(TRIM(place_barangay)) HAVING COUNT(*) >= 4 ORDER BY count DESC`, params),
    client.query(`SELECT blotter_entry_number, incident_type, place_barangay, date_time_commission FROM blotter_entries ${baseWhere} ORDER BY date_time_commission DESC LIMIT 5`, params),
    client.query(`SELECT COUNT(*) FROM blotter_entries WHERE is_deleted = false`),
  ]);
} finally {
  client.release();
}

    const topBarangay = hotspots.rows[0] || null;

    res.json({
      success: true,
      data: {
        total_pins: parseInt(totalPins.rows[0].count),
        total_blotters: parseInt(totalBlotters.rows[0].count),
        barangays_with_crimes: [...new Set(byIncidentType.rows.map(r => r.incident_type))].length,
        high_risk_count: hotspots.rows.length,
        top_crime: byIncidentType.rows[0]?.incident_type || null,
        top_barangay: topBarangay?.barangay || null,
        by_incident_type: byIncidentType.rows,
        hotspots: hotspots.rows,
        recent_incidents: recentIncidents.rows,
      }
    });
  } catch (error) {
    console.error('getStatistics error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { getBoundaries, getPins, getStatistics };