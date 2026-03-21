// ================================================================================
// FILE: backend/features/gps/controllers/gpsController.js
// ================================================================================

const pool = require("../../../config/database");

// ============================================================
// POST /gps/location
// Called by mobile every 5 seconds while officer is on duty
// ============================================================
const updateLocation = async (req, res) => {
  try {
    const { latitude, longitude, accuracy, heading, speed } = req.body;
    const user_id = req.user.user_id; // from existing JWT middleware

    if (!latitude || !longitude) {
      return res.status(400).json({ success: false, message: "latitude and longitude are required" });
    }

    await pool.query(
      `INSERT INTO officer_locations (user_id, latitude, longitude, accuracy, heading, speed, is_on_duty, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, true, NOW())
       ON CONFLICT (user_id)
       DO UPDATE SET
         latitude   = EXCLUDED.latitude,
         longitude  = EXCLUDED.longitude,
         accuracy   = EXCLUDED.accuracy,
         heading    = EXCLUDED.heading,
         speed      = EXCLUDED.speed,
         is_on_duty = true,
         updated_at = NOW()`,
      [user_id, latitude, longitude, accuracy ?? null, heading ?? 0, speed ?? 0]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("GPS updateLocation error:", err);
    res.status(500).json({ success: false, message: "Failed to update location" });
  }
};

// ============================================================
// GET /gps/officers
// Called by web crime map every 5 seconds to show officer dots
// Only returns officers who pinged in the last 30 seconds
// ============================================================
const getActiveOfficers = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         ol.user_id,
         u.first_name,
         u.last_name,
         u.username,
         r.role_name,
         ol.latitude,
         ol.longitude,
         ol.heading,
         ol.speed,
         ol.updated_at,
         EXTRACT(EPOCH FROM (NOW() - ol.updated_at))::int AS seconds_ago
       FROM officer_locations ol
       JOIN users u ON u.user_id = ol.user_id
       JOIN roles r ON r.role_id = u.role_id
       WHERE ol.is_on_duty = true
         AND ol.updated_at > NOW() - INTERVAL '30 seconds'
       ORDER BY ol.updated_at DESC`
    );

    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error("GPS getActiveOfficers error:", err);
    res.status(500).json({ success: false, data: [] });
  }
};

// ============================================================
// POST /gps/off-duty
// Called when officer logs out or manually ends patrol
// ============================================================
const setOffDuty = async (req, res) => {
  try {
    await pool.query(
      `UPDATE officer_locations SET is_on_duty = false WHERE user_id = $1`,
      [req.user.user_id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error("GPS setOffDuty error:", err);
    res.status(500).json({ success: false, message: "Failed to set off-duty" });
  }
};

module.exports = { updateLocation, getActiveOfficers, setOffDuty };