// backend/features/gps/controllers/gpsController.js
const pool = require("../../../config/database");
const { getBarangayOptimized } = require("../../../shared/utils/geoUtils");

// ============================================================
// POST /gps/location
// Called by mobile every 5 seconds while officer is on duty
// Only Patrol role can update location
// ============================================================
const updateLocation = async (req, res) => {
  try {
    const { role, user_id } = req.user;
    
    // Only Patrol can update location
    if (role !== "Patrol") {
      return res.status(403).json({
        success: false,
        message: "Only Patrol officers can update location"
      });
    }
    
    const { latitude, longitude, accuracy, heading, speed } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: "latitude and longitude are required",
      });
    }

    // Resolve barangay name from coordinates with caching
    const barangay = getBarangayOptimized(parseFloat(longitude), parseFloat(latitude));
    
    const result = await pool.query(
      `INSERT INTO officer_locations (user_id, latitude, longitude, accuracy, heading, speed, location_name, is_on_duty, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, true, NOW())
       ON CONFLICT (user_id)
       DO UPDATE SET
         latitude   = EXCLUDED.latitude,
         longitude  = EXCLUDED.longitude,
         accuracy   = EXCLUDED.accuracy,
         heading    = EXCLUDED.heading,
         speed      = EXCLUDED.speed,
         location_name = EXCLUDED.location_name,
         is_on_duty = true,
         updated_at = NOW()
       RETURNING location_name`,
      [
        user_id,
        latitude,
        longitude,
        accuracy ?? null,
        heading ?? 0,
        speed ?? 0,
        barangay,
      ],
    );

    res.json({ 
      success: true, 
      message: "Location updated",
      barangay: result.rows[0]?.location_name || barangay
    });
  } catch (err) {
    console.error("GPS updateLocation error:", err);
    res.status(500).json({ 
      success: false, 
      message: "Failed to update location" 
    });
  }
};

// ============================================================
// GET /gps/officers
// Called by web/mobile every 5-10 seconds to show officer dots
// Only returns officers who pinged in the last 30 seconds
// ============================================================
const getActiveOfficers = async (req, res) => {
  try {
    const { role, user_id } = req.user;
    const platform = req.query.platform; // 'mobile' | 'web' | undefined

    // Only Administrator and Patrol can see officers
    if (role !== "Administrator" && role !== "Patrol") {
      return res.json({ success: true, data: [] });
    }

    // Base query — fetch all on-duty officers updated in last 30s
    let query = `
      SELECT 
        ol.user_id, 
        u.first_name, 
        u.last_name,
        TRIM(CONCAT(u.first_name, ' ', COALESCE(u.middle_name, ''), ' ', u.last_name)) AS officer_name,
        u.username, 
        r.role_name, 
        pr.abbreviation, 
        pr.rank_name,
        u.profile_picture,
        UPPER(LEFT(u.first_name, 1) || LEFT(u.last_name, 1)) AS initials,
        ol.latitude, 
        ol.longitude, 
        ol.heading, 
        ol.speed,
        ol.location_name,
        ol.updated_at,
        EXTRACT(EPOCH FROM (NOW() - ol.updated_at))::int AS seconds_ago
      FROM officer_locations ol
      JOIN users u ON u.user_id = ol.user_id
      JOIN roles r ON r.role_id = u.role_id
      LEFT JOIN pnp_ranks pr ON pr.rank_id = u.rank_id
      WHERE ol.is_on_duty = true
        AND ol.updated_at > NOW() - INTERVAL '30 seconds'
    `;

    const params = [];
    let p = 1;

    // Patrol: only see other Patrol officers (not investigators, not admins)
    if (role === "Patrol") {
      query += ` AND r.role_name = 'Patrol'`;
    }

    // Mobile Patrol: exclude self
    if (role === "Patrol" && platform === "mobile") {
      query += ` AND ol.user_id != $${p++}`;
      params.push(user_id);
    }

    query += ` ORDER BY ol.updated_at DESC`;

    const result = await pool.query(query, params);
    
    // Enhance officers with real-time barangay resolution (in case stored location_name is stale)
    const officersWithBarangay = result.rows.map(officer => {
      let currentBarangay = officer.location_name;
      
      // If we have recent coordinates, resolve current barangay for real-time accuracy
      if (officer.latitude && officer.longitude && officer.seconds_ago <= 30) {
        const resolved = getBarangayOptimized(
          parseFloat(officer.longitude),
          parseFloat(officer.latitude)
        );
        if (resolved) {
          currentBarangay = resolved;
          // Optional: Update database if barangay changed (async, don't await)
          if (currentBarangay !== officer.location_name) {
            pool.query(
              `UPDATE officer_locations SET location_name = $1 WHERE user_id = $2`,
              [currentBarangay, officer.user_id]
            ).catch(err => console.error("Failed to update barangay name:", err));
        }
        }
      }
      
      return {
        ...officer,
        current_barangay: currentBarangay,
        last_login: officer.updated_at,
        last_location_at: officer.updated_at,
        last_location_name: currentBarangay,
        resolved_barangay: currentBarangay
      };
    });
    
    return res.json({ success: true, data: officersWithBarangay });
  } catch (err) {
    console.error("GPS getActiveOfficers error:", err);
    res.status(500).json({ success: false, data: [] });
  }
};

// ============================================================
// POST /gps/off-duty
// Called when officer logs out or manually ends patrol
// Only Patrol role can set off-duty
// ============================================================
const setOffDuty = async (req, res) => {
  try {
    const { role, user_id } = req.user;
    
    // Only Patrol can go off-duty
    if (role !== "Patrol") {
      return res.status(403).json({
        success: false,
        message: "Only Patrol officers can set off-duty"
      });
    }
    
    await pool.query(
      `UPDATE officer_locations SET is_on_duty = false WHERE user_id = $1`,
      [user_id],
    );
    res.json({ success: true, message: "Off duty set successfully" });
  } catch (err) {
    console.error("GPS setOffDuty error:", err);
    res.status(500).json({ success: false, message: "Failed to set off-duty" });
  }
};

// ============================================================
// GET /gps/barangay (Optional test endpoint)
// Test endpoint to verify barangay resolution from coordinates
// ============================================================
const resolveBarangay = async (req, res) => {
  const { lng, lat } = req.query;
  
  if (!lng || !lat) {
    return res.status(400).json({ 
      success: false, 
      message: "lng and lat query parameters are required" 
    });
  }
  
  const lngNum = parseFloat(lng);
  const latNum = parseFloat(lat);
  
  if (isNaN(lngNum) || isNaN(latNum)) {
    return res.status(400).json({
      success: false,
      message: "lng and lat must be valid numbers"
    });
  }
  
  const barangay = getBarangayOptimized(lngNum, latNum);
  
  res.json({
    success: true,
    data: {
      longitude: lngNum,
      latitude: latNum,
      barangay: barangay || "Not found (outside Bacoor or no match)",
    }
  });
};

module.exports = { 
  updateLocation, 
  getActiveOfficers, 
  setOffDuty,
  resolveBarangay
};