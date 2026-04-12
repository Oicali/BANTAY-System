const pool = require("../../../config/database");

// ── Helper: generate date range ────────────────────────────
const getDateRange = (start_date, end_date) => {
  const dates = [];
  const cur   = new Date(start_date + "T12:00:00"); // noon to avoid timezone issues
  const last  = new Date(end_date   + "T12:00:00");
  while (cur <= last) {
    dates.push(cur.toISOString().split("T")[0]);
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
};

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
    const mobileUnits = await pool.query(`SELECT COUNT(*) AS mobile_units FROM mobile_unit`);
    const totalOfficers = await pool.query(`
      SELECT COUNT(*) AS total_officers FROM active_patroller WHERE status = 'Active'
    `);
    const unassigned = await pool.query(`
      SELECT COUNT(*) AS unassigned_patrollers
      FROM active_patroller ap
      WHERE ap.status = 'Active'
      AND ap.active_patroller_id NOT IN (
        SELECT pap.active_patroller_id FROM patrol_assignment_patroller pap
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
        u.last_login,
        TRIM(CONCAT(u.first_name, ' ', u.middle_name, ' ', u.last_name)) AS officer_name,
        mu.mobile_unit_name AS mobile_unit_assigned
      FROM active_patroller ap
      JOIN users u ON ap.officer_id = u.user_id
      LEFT JOIN patrol_assignment_patroller pap ON ap.active_patroller_id = pap.active_patroller_id
      LEFT JOIN patrol_assignment pa ON pap.patrol_id = pa.patrol_id
      LEFT JOIN mobile_unit mu ON pa.mobile_unit_id = mu.mobile_unit_id
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
        TRIM(CONCAT(u.first_name, ' ', u.middle_name, ' ', u.last_name)) AS officer_name,
        u.phone AS contact_number
      FROM active_patroller ap
      JOIN users u ON ap.officer_id = u.user_id
      WHERE ap.active_patroller_id NOT IN (
        SELECT pap.active_patroller_id FROM patrol_assignment_patroller pap
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
      SELECT mobile_unit_id, mobile_unit_name, vehicle_type, plate_number, created_at
      FROM mobile_unit ORDER BY created_at DESC
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
    return res.status(400).json({ success: false, message: "All fields required." });
  }
  try {
    await pool.query(
      `INSERT INTO mobile_unit (mobile_unit_name, vehicle_type, plate_number, created_by)
       VALUES ($1, $2, $3, $4)`,
      [mobile_unit_name, vehicle_type, plate_number, created_by]
    );
    res.json({ success: true, message: "Mobile unit created." });
  } catch (error) {
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
    return res.status(400).json({ success: false, message: "All fields required." });
  }
  try {
    const result = await pool.query(
      `UPDATE mobile_unit SET mobile_unit_name=$1, vehicle_type=$2, plate_number=$3, updated_at=CURRENT_TIMESTAMP
       WHERE mobile_unit_id=$4`,
      [mobile_unit_name, vehicle_type, plate_number, id]
    );
    if (result.rowCount === 0) return res.status(404).json({ success: false, message: "Not found." });
    res.json({ success: true, message: "Mobile unit updated." });
  } catch (error) {
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
    const result = await pool.query(`DELETE FROM mobile_unit WHERE mobile_unit_id=$1`, [id]);
    if (result.rowCount === 0) return res.status(404).json({ success: false, message: "Not found." });
    res.json({ success: true, message: "Mobile unit deleted." });
  } catch (error) {
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
        pa.start_date,
        pa.end_date,
        pa.mobile_unit_id,
        mu.mobile_unit_name,
        mu.plate_number,
        (
          SELECT COALESCE(JSON_AGG(
            JSON_BUILD_OBJECT(
              'active_patroller_id', ap.active_patroller_id,
              'officer_name', TRIM(CONCAT(u.first_name, ' ', u.middle_name, ' ', u.last_name)),
              'contact_number', u.phone
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
              'shift',      par.shift,
              'barangay',   par.barangay,
              'notes',      par.notes,
              'time_start', par.time_start,
              'time_end',   par.time_end,
              'stop_order', par.stop_order
            ) ORDER BY par.route_date, par.shift, par.stop_order
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
  const { patrol_name, mobile_unit_id, start_date, end_date, patroller_ids, barangays, routes } = req.body;
  const created_by = req.user?.user_id || null;

  if (!patrol_name || !mobile_unit_id || !start_date || !end_date) {
    return res.status(400).json({ success: false, message: "Patrol name, mobile unit, start and end date are required." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Insert patrol
    const patrolResult = await client.query(
      `INSERT INTO patrol_assignment (patrol_name, mobile_unit_id, start_date, end_date, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING patrol_id`,
      [patrol_name, mobile_unit_id, start_date, end_date, created_by]
    );
    const patrol_id = patrolResult.rows[0].patrol_id;

    // 2. Assign patrollers
    if (patroller_ids?.length > 0) {
      for (const active_patroller_id of patroller_ids) {
        await client.query(
          `INSERT INTO patrol_assignment_patroller (patrol_id, active_patroller_id) VALUES ($1, $2)`,
          [patrol_id, active_patroller_id]
        );
      }
    }

    // 3. Insert barangay highlights (one row per barangay, only for start_date, stop_order = 0)
    if (barangays?.length > 0) {
      for (let i = 0; i < barangays.length; i++) {
        await client.query(
          `INSERT INTO patrol_assignment_route (patrol_id, route_date, barangay, shift, stop_order)
           VALUES ($1, $2, $3, 'AM', $4)`,
          [patrol_id, start_date, barangays[i], -(i + 1)] // negative stop_order for barangays to avoid conflicts
        );
      }
    }

    // 4. Insert timetable tasks — duplicate across all dates
    if (routes?.length > 0) {
      const dates = getDateRange(start_date, end_date);
      for (const date of dates) {
        for (let i = 0; i < routes.length; i++) {
          const task = routes[i];
          await client.query(
            `INSERT INTO patrol_assignment_route
               (patrol_id, route_date, barangay, shift, time_start, time_end, notes, stop_order)
             VALUES ($1, $2, NULL, $3, $4, $5, $6, $7)`,
            [patrol_id, date, task.shift, task.time_start || null, task.time_end || null, task.notes || null, i + 1]
          );
        }
      }
    }

    await client.query("COMMIT");
    res.json({ success: true, message: "Patrol created successfully." });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Create patrol error:", error);
    if (error.code === "23505" && error.constraint?.includes("patroller")) {
      return res.status(400).json({ success: false, message: "This patroller is already assigned to another patrol." });
    }
    res.status(500).json({ success: false, message: "Server error: " + error.message });
  } finally {
    client.release();
  }
};

// ─────────────────────────────────────────────
// PUT /patrol/patrols/:id
// Only updates basic info + patrollers
// Tasks are auto-saved separately via PATCH
// ─────────────────────────────────────────────
const updatePatrol = async (req, res) => {
  const { id } = req.params;
  const { patrol_name, mobile_unit_id, start_date, end_date, patroller_ids, barangays } = req.body;

  if (!patrol_name || !mobile_unit_id || !start_date || !end_date) {
    return res.status(400).json({ success: false, message: "All required fields must be filled." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Update patrol info
    await client.query(
      `UPDATE patrol_assignment
       SET patrol_name=$1, mobile_unit_id=$2, start_date=$3, end_date=$4, updated_at=CURRENT_TIMESTAMP
       WHERE patrol_id=$5`,
      [patrol_name, mobile_unit_id, start_date, end_date, id]
    );

    // 2. Replace patrollers only
    await client.query(`DELETE FROM patrol_assignment_patroller WHERE patrol_id=$1`, [id]);
    if (patroller_ids?.length > 0) {
      for (const active_patroller_id of patroller_ids) {
        await client.query(
          `INSERT INTO patrol_assignment_patroller (patrol_id, active_patroller_id) VALUES ($1, $2)`,
          [id, active_patroller_id]
        );
      }
    }

    // 3. Replace barangay highlights only (stop_order < 0)
    if (barangays !== undefined) {
      await client.query(`DELETE FROM patrol_assignment_route WHERE patrol_id=$1 AND stop_order <= 0`, [id]);
      if (barangays?.length > 0) {
        for (let i = 0; i < barangays.length; i++) {
          await client.query(
            `INSERT INTO patrol_assignment_route (patrol_id, route_date, barangay, shift, stop_order)
             VALUES ($1, $2, $3, 'AM', $4)`,
            [id, start_date, barangays[i], -(i + 1)]
          );
        }
      }
    }

    // NOTE: Tasks (stop_order > 0) are NOT touched here — they are auto-saved via PATCH /routes/:id/task

    await client.query("COMMIT");
    res.json({ success: true, message: "Patrol updated successfully." });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Update patrol error:", error);
    if (error.code === "23505" && error.constraint?.includes("patroller")) {
      return res.status(400).json({ success: false, message: "This patroller is already assigned to another patrol." });
    }
    res.status(500).json({ success: false, message: "Server error: " + error.message });
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
    const result = await pool.query(`DELETE FROM patrol_assignment WHERE patrol_id=$1`, [id]);
    if (result.rowCount === 0) return res.status(404).json({ success: false, message: "Patrol not found." });
    res.json({ success: true, message: "Patrol deleted." });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ─────────────────────────────────────────────
// PATCH /patrol/routes/:routeId/notes
// ─────────────────────────────────────────────
const updateRouteNotes = async (req, res) => {
  const { routeId } = req.params;
  const { notes } = req.body;
  try {
    await pool.query(`UPDATE patrol_assignment_route SET notes=$1 WHERE route_id=$2`, [notes || null, routeId]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ─────────────────────────────────────────────
// PATCH /patrol/routes/:routeId/task
// Auto-save full task row (time + notes)
// ─────────────────────────────────────────────
const updateRouteTask = async (req, res) => {
  const { routeId } = req.params;
  const { time_start, time_end, notes } = req.body;
  try {
    await pool.query(
      `UPDATE patrol_assignment_route SET time_start=$1, time_end=$2, notes=$3 WHERE route_id=$4`,
      [time_start || null, time_end || null, notes || null, routeId]
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ─────────────────────────────────────────────
// POST /patrol/routes/add
// Add a new task row to an existing patrol date
// ─────────────────────────────────────────────
const addRouteTask = async (req, res) => {
  const { patrol_id, route_date, shift, time_start, time_end, notes, stop_order } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO patrol_assignment_route
         (patrol_id, route_date, barangay, shift, time_start, time_end, notes, stop_order)
       VALUES ($1, $2, NULL, $3, $4, $5, $6, $7)
       RETURNING route_id`,
      [patrol_id, route_date, shift, time_start || null, time_end || null, notes || null, stop_order]
    );
    res.json({ success: true, route_id: result.rows[0].route_id });
  } catch (error) {
    console.error("Add route task error:", error);
    res.status(500).json({ success: false, message: "Server error" });
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
  updateRouteTask,
  addRouteTask,
};