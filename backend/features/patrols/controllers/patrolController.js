const pool = require("../../../config/database");

// ─────────────────────────────────────────────
// GET /patrol/stats
// ─────────────────────────────────────────────
const getPatrolStats = async (req, res) => {
  try {
    const activePatrols = await pool.query(`
      SELECT COUNT(*) AS active_patrols_today
      FROM patrol_assignment
      WHERE start_date <= CURRENT_DATE AND end_date >= CURRENT_DATE
    `);

    const mobileUnits = await pool.query(`
      SELECT COUNT(*) AS mobile_units FROM mobile_unit
    `);

    const totalOfficers = await pool.query(`
      SELECT COUNT(*) AS total_officers
      FROM active_patroller
      WHERE status = 'Active'
    `);

    const unassigned = await pool.query(`
      SELECT COUNT(*) AS unassigned_patrollers
      FROM active_patroller ap
      WHERE ap.status = 'Active'
      AND ap.active_patroller_id NOT IN (
        SELECT pap.active_patroller_id
        FROM patrol_assignment_patroller pap
      )
    `);

    res.json({
      success: true,
      data: {
        active_patrols_today:  activePatrols.rows[0].active_patrols_today,
        mobile_units:          mobileUnits.rows[0].mobile_units,
        total_officers:        totalOfficers.rows[0].total_officers,
        unassigned_patrollers: unassigned.rows[0].unassigned_patrollers,
      },
    });
  } catch (error) {
    console.error("Patrol stats error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ─────────────────────────────────────────────
// GET /patrol/active
// ─────────────────────────────────────────────
const getActivePatrollers = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT DISTINCT ON (ap.active_patroller_id)
        ap.active_patroller_id,
        ap.officer_id,
        ap.status,
        u.last_login,
        TRIM(CONCAT(u.first_name, ' ', u.middle_name, ' ', u.last_name)) AS officer_name,
        mu.mobile_unit_name AS mobile_unit_assigned
      FROM active_patroller ap
      JOIN users u ON ap.officer_id = u.user_id
      LEFT JOIN patrol_assignment_patroller pap
        ON ap.active_patroller_id = pap.active_patroller_id
      LEFT JOIN patrol_assignment pa
        ON pap.patrol_id = pa.patrol_id
      LEFT JOIN mobile_unit mu
        ON pa.mobile_unit_id = mu.mobile_unit_id
      ORDER BY ap.active_patroller_id, pa.start_date DESC NULLS LAST
    `);

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error("Patroller fetch error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ─────────────────────────────────────────────
// GET /patrol/available-patrollers
// ─────────────────────────────────────────────
const getAvailablePatrollers = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        ap.active_patroller_id,
        ap.officer_id,
        TRIM(CONCAT(u.first_name, ' ', u.middle_name, ' ', u.last_name)) AS officer_name
      FROM active_patroller ap
      JOIN users u ON ap.officer_id = u.user_id
      WHERE ap.status = 'Active'
      AND ap.active_patroller_id NOT IN (
        SELECT pap.active_patroller_id
        FROM patrol_assignment_patroller pap
      )
      ORDER BY officer_name ASC
    `);

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error("Available patrollers error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ─────────────────────────────────────────────
// GET /patrol/mobile-units
// ─────────────────────────────────────────────
const getMobileUnits = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        mobile_unit_id,
        mobile_unit_name,
        vehicle_type,
        plate_number,
        created_at
      FROM mobile_unit
      ORDER BY created_at DESC
    `);

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error("Mobile units fetch error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ─────────────────────────────────────────────
// POST /patrol/mobile-units
// ─────────────────────────────────────────────
const createMobileUnit = async (req, res) => {
  const { mobile_unit_name, vehicle_type, plate_number } = req.body;
  const created_by = req.user?.user_id || null;

  if (!mobile_unit_name || !vehicle_type || !plate_number) {
    return res.status(400).json({
      success: false,
      message: "Mobile unit name, vehicle type, and plate number are required.",
    });
  }

  try {
    await pool.query(
      `INSERT INTO mobile_unit (mobile_unit_name, vehicle_type, plate_number, created_by)
       VALUES ($1, $2, $3, $4)`,
      [mobile_unit_name, vehicle_type, plate_number, created_by]
    );

    res.json({ success: true, message: "Mobile unit created successfully." });
  } catch (error) {
    console.error("Create mobile unit error:", error);
    if (error.code === "23505") {
      const field = error.constraint?.includes("plate") ? "Plate number" : "Mobile unit name";
      return res.status(400).json({ success: false, message: `${field} already exists.` });
    }
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ─────────────────────────────────────────────
// PUT /patrol/mobile-units/:id
// ─────────────────────────────────────────────
const updateMobileUnit = async (req, res) => {
  const { id } = req.params;
  const { mobile_unit_name, vehicle_type, plate_number } = req.body;

  if (!mobile_unit_name || !vehicle_type || !plate_number) {
    return res.status(400).json({
      success: false,
      message: "Mobile unit name, vehicle type, and plate number are required.",
    });
  }

  try {
    const result = await pool.query(
      `UPDATE mobile_unit
       SET mobile_unit_name = $1,
           vehicle_type     = $2,
           plate_number     = $3,
           updated_at       = CURRENT_TIMESTAMP
       WHERE mobile_unit_id = $4`,
      [mobile_unit_name, vehicle_type, plate_number, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: "Mobile unit not found." });
    }

    res.json({ success: true, message: "Mobile unit updated successfully." });
  } catch (error) {
    console.error("Update mobile unit error:", error);
    if (error.code === "23505") {
      const field = error.constraint?.includes("plate") ? "Plate number" : "Mobile unit name";
      return res.status(400).json({ success: false, message: `${field} already exists.` });
    }
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ─────────────────────────────────────────────
// DELETE /patrol/mobile-units/:id
// ─────────────────────────────────────────────
const deleteMobileUnit = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `DELETE FROM mobile_unit WHERE mobile_unit_id = $1`, [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: "Mobile unit not found." });
    }

    res.json({ success: true, message: "Mobile unit deleted." });
  } catch (error) {
    console.error("Delete mobile unit error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ─────────────────────────────────────────────
// GET /patrol/patrols
// ─────────────────────────────────────────────
const getPatrols = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        pa.patrol_id,
        pa.patrol_name,
        pa.shift,
        pa.start_date,
        pa.end_date,
        pa.mobile_unit_id,
        mu.mobile_unit_name,
        mu.plate_number,
        (
          SELECT COALESCE(JSON_AGG(
            JSON_BUILD_OBJECT(
              'active_patroller_id', ap.active_patroller_id,
              'officer_name', TRIM(CONCAT(u.first_name, ' ', u.middle_name, ' ', u.last_name))
            )
          ), '[]')
          FROM patrol_assignment_patroller pap
          JOIN active_patroller ap ON pap.active_patroller_id = ap.active_patroller_id
          JOIN users u ON ap.officer_id = u.user_id
          WHERE pap.patrol_id = pa.patrol_id
        ) AS patrollers,
        (
          SELECT COALESCE(JSON_AGG(
            JSON_BUILD_OBJECT(
              'route_id',   par.route_id,
              'route_date', par.route_date,
              'barangay',   par.barangay,
              'notes',      par.notes,
              'time_start', par.time_start,
              'time_end',   par.time_end,
              'stop_order', par.stop_order
            ) ORDER BY par.route_date, par.stop_order
          ), '[]')
          FROM patrol_assignment_route par
          WHERE par.patrol_id = pa.patrol_id
        ) AS routes
      FROM patrol_assignment pa
      JOIN mobile_unit mu ON pa.mobile_unit_id = mu.mobile_unit_id
      ORDER BY pa.start_date DESC, pa.patrol_id DESC
    `);

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error("Get patrols error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ─────────────────────────────────────────────
// POST /patrol/patrols
// ─────────────────────────────────────────────
const createPatrol = async (req, res) => {
  const {
    patrol_name, mobile_unit_id, shift,
    start_date, end_date,
    patroller_ids, routes
  } = req.body;
  const created_by = req.user?.user_id || null;

  if (!patrol_name || !mobile_unit_id || !shift || !start_date || !end_date) {
    return res.status(400).json({
      success: false,
      message: "Patrol name, mobile unit, shift, start date and end date are required.",
    });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const patrolResult = await client.query(
      `INSERT INTO patrol_assignment
         (patrol_name, mobile_unit_id, shift, start_date, end_date, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING patrol_id`,
      [patrol_name, mobile_unit_id, shift, start_date, end_date, created_by]
    );
    const patrol_id = patrolResult.rows[0].patrol_id;

    if (patroller_ids && patroller_ids.length > 0) {
      for (const active_patroller_id of patroller_ids) {
        await client.query(
          `INSERT INTO patrol_assignment_patroller (patrol_id, active_patroller_id)
           VALUES ($1, $2)`,
          [patrol_id, active_patroller_id]
        );
      }
    }

    if (routes && routes.length > 0) {
      for (const stop of routes) {
        await client.query(
          `INSERT INTO patrol_assignment_route
             (patrol_id, route_date, barangay, notes, time_start, time_end, stop_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [patrol_id, stop.route_date, stop.barangay, stop.notes || null,
           stop.time_start, stop.time_end, stop.stop_order]
        );
      }
    }

    await client.query("COMMIT");
    res.json({ success: true, message: "Patrol created successfully." });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Create patrol error:", error);
    if (error.code === "23505") {
      return res.status(400).json({
        success: false,
        message: "This patroller is already assigned to another patrol.",
      });
    }
    res.status(500).json({ success: false, message: "Server error" });
  } finally {
    client.release();
  }
};

// ─────────────────────────────────────────────
// PUT /patrol/patrols/:id
// ─────────────────────────────────────────────
const updatePatrol = async (req, res) => {
  const { id } = req.params;
  const {
    patrol_name, mobile_unit_id, shift,
    start_date, end_date,
    patroller_ids, routes
  } = req.body;

  if (!patrol_name || !mobile_unit_id || !shift || !start_date || !end_date) {
    return res.status(400).json({
      success: false,
      message: "Patrol name, mobile unit, shift, start date and end date are required.",
    });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(
      `UPDATE patrol_assignment
       SET patrol_name = $1, mobile_unit_id = $2, shift = $3,
           start_date = $4, end_date = $5, updated_at = CURRENT_TIMESTAMP
       WHERE patrol_id = $6`,
      [patrol_name, mobile_unit_id, shift, start_date, end_date, id]
    );

    await client.query(
      `DELETE FROM patrol_assignment_patroller WHERE patrol_id = $1`, [id]
    );
    if (patroller_ids && patroller_ids.length > 0) {
      for (const active_patroller_id of patroller_ids) {
        await client.query(
          `INSERT INTO patrol_assignment_patroller (patrol_id, active_patroller_id)
           VALUES ($1, $2)`,
          [id, active_patroller_id]
        );
      }
    }

    await client.query(
      `DELETE FROM patrol_assignment_route WHERE patrol_id = $1`, [id]
    );
    if (routes && routes.length > 0) {
      for (const stop of routes) {
        await client.query(
          `INSERT INTO patrol_assignment_route
             (patrol_id, route_date, barangay, notes, time_start, time_end, stop_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [id, stop.route_date, stop.barangay, stop.notes || null,
           stop.time_start, stop.time_end, stop.stop_order]
        );
      }
    }

    await client.query("COMMIT");
    res.json({ success: true, message: "Patrol updated successfully." });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Update patrol error:", error);
    if (error.code === "23505") {
      return res.status(400).json({
        success: false,
        message: "This patroller is already assigned to another patrol.",
      });
    }
    res.status(500).json({ success: false, message: "Server error" });
  } finally {
    client.release();
  }
};

// ─────────────────────────────────────────────
// DELETE /patrol/patrols/:id
// ─────────────────────────────────────────────
const deletePatrol = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `DELETE FROM patrol_assignment WHERE patrol_id = $1`, [id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: "Patrol not found." });
    }
    res.json({ success: true, message: "Patrol deleted." });
  } catch (error) {
    console.error("Delete patrol error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
const updateRouteNotes = async (req, res) => {
  const { routeId } = req.params;
  const { notes } = req.body;
  try {
    await pool.query(
      `UPDATE patrol_assignment_route SET notes = $1 WHERE route_id = $2`,
      [notes || null, routeId]
    );
    res.json({ success: true });
  } catch (error) {
    console.error("Update notes error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const updateRouteTime = async (req, res) => {
  const { routeId } = req.params;
  const { time_start, time_end } = req.body;
  try {
    await pool.query(
      `UPDATE patrol_assignment_route SET time_start = $1, time_end = $2 WHERE route_id = $3`,
      [time_start || null, time_end || null, routeId]
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false });
  }
};

module.exports = {
  getPatrolStats,
  getActivePatrollers,
  getAvailablePatrollers,
  getMobileUnits,
  createMobileUnit,
  updateMobileUnit,
  deleteMobileUnit,
  getPatrols,
  createPatrol,
  updatePatrol,
  deletePatrol,
  updateRouteNotes,
  updateRouteTime,
};