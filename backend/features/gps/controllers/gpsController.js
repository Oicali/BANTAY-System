// backend/features/gps/controllers/gpsController.js
const pool = require("../../../config/database");
const {
  getBarangayOptimized,
  getBarangayOrCityOptimized,
} = require("../../../shared/utils/geoUtils");

// ============================================================
// POST /gps/location
// Called by mobile every 5 seconds while officer is on duty
// Only Patrol role can update location
// ============================================================
const updateLocation = async (req, res) => {
  try {
    const { role, user_id } = req.user;

    if (role !== "Patrol") {
      return res.status(403).json({
        success: false,
        message: "Only Patrol officers can update location",
      });
    }

    const { latitude, longitude, accuracy, heading, speed } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: "latitude and longitude are required",
      });
    }

    // Resolve barangay; if outside Bacoor, fall back to city name via Nominatim
    const locationName = await getBarangayOrCityOptimized(
      parseFloat(longitude),
      parseFloat(latitude)
    );

    const result = await pool.query(
      `INSERT INTO officer_locations (user_id, latitude, longitude, accuracy, heading, speed, location_name, is_on_duty, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, true, NOW())
       ON CONFLICT (user_id)
       DO UPDATE SET
         latitude      = EXCLUDED.latitude,
         longitude     = EXCLUDED.longitude,
         accuracy      = EXCLUDED.accuracy,
         heading       = EXCLUDED.heading,
         speed         = EXCLUDED.speed,
         location_name = EXCLUDED.location_name,
         is_on_duty    = true,
         updated_at    = NOW()
       RETURNING location_name`,
      [
        user_id,
        latitude,
        longitude,
        accuracy ?? null,
        heading ?? 0,
        speed ?? 0,
        locationName,
      ]
    );

    res.json({
      success: true,
      message: "Location updated",
      barangay: result.rows[0]?.location_name || locationName,
    });
  } catch (err) {
    console.error("GPS updateLocation error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to update location",
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
    const platform = req.query.platform;

    if (
      role !== "Administrator" &&
      role !== "Patrol" &&
      role !== "Technical Administrator"
    ) {
      return res.json({ success: true, data: [] });
    }

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

    if (role === "Patrol") {
      query += ` AND r.role_name = 'Patrol'`;
    }

    if (role === "Patrol" && platform === "mobile") {
      query += ` AND ol.user_id != $${p++}`;
      params.push(user_id);
    }

    query += ` ORDER BY ol.updated_at DESC`;

    const result = await pool.query(query, params);

    // Resolve locations for all officers in parallel.
    // For officers inside Bacoor the sync lookup returns immediately (no HTTP call).
    // For officers outside Bacoor, Nominatim is called (cached after first hit).
    const officersWithLocation = await Promise.all(
      result.rows.map(async (officer) => {
        let currentLocation = officer.location_name;

        if (
          officer.latitude &&
          officer.longitude &&
          officer.seconds_ago <= 30
        ) {
          const resolved = await getBarangayOrCityOptimized(
            parseFloat(officer.longitude),
            parseFloat(officer.latitude)
          );
          if (resolved) {
            currentLocation = resolved;
            // Async DB update if name changed
            if (currentLocation !== officer.location_name) {
              pool
                .query(
                  `UPDATE officer_locations SET location_name = $1 WHERE user_id = $2`,
                  [currentLocation, officer.user_id]
                )
                .catch((err) =>
                  console.error("Failed to update location name:", err)
                );
            }
          }
        }

        return {
          ...officer,
          current_barangay: currentLocation,
          last_login: officer.updated_at,
          last_location_at: officer.updated_at,
          last_location_name: currentLocation,
          resolved_barangay: currentLocation,
        };
      })
    );

    return res.json({ success: true, data: officersWithLocation });
  } catch (err) {
    console.error("GPS getActiveOfficers error:", err);
    res.status(500).json({ success: false, data: [] });
  }
};

// ============================================================
// POST /gps/off-duty
// ============================================================
const setOffDuty = async (req, res) => {
  try {
    const { role, user_id } = req.user;
    if (role !== "Patrol") {
      return res.status(403).json({
        success: false,
        message: "Only Patrol officers can set off-duty",
      });
    }
    await pool.query(
      `UPDATE officer_locations SET is_on_duty = false WHERE user_id = $1`,
      [user_id]
    );
    res.json({ success: true, message: "Off duty set successfully" });
  } catch (err) {
    console.error("GPS setOffDuty error:", err);
    res.status(500).json({ success: false, message: "Failed to set off-duty" });
  }
};

// ============================================================
// GET /gps/barangay  — test endpoint
// ============================================================
const resolveBarangay = async (req, res) => {
  const { lng, lat } = req.query;
  if (!lng || !lat) {
    return res
      .status(400)
      .json({ success: false, message: "lng and lat query parameters are required" });
  }
  const lngNum = parseFloat(lng);
  const latNum = parseFloat(lat);
  if (isNaN(lngNum) || isNaN(latNum)) {
    return res
      .status(400)
      .json({ success: false, message: "lng and lat must be valid numbers" });
  }

  // Use async version so the test endpoint also shows city fallback
  const location = await getBarangayOrCityOptimized(lngNum, latNum);

  res.json({
    success: true,
    data: {
      longitude: lngNum,
      latitude: latNum,
      location: location || "Unknown location",
    },
  });
};

module.exports = {
  updateLocation,
  getActiveOfficers,
  setOffDuty,
  resolveBarangay,
};