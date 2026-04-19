const pool = require("../../../config/database");

// ── Helper: generate date range ────────────────────────────
const getDateRange = (start_date, end_date) => {
  const dates = [];
  const cur   = new Date(start_date + "T12:00:00");
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
    const mobileUnits   = await pool.query(`SELECT COUNT(*) AS mobile_units FROM mobile_unit`);
    const totalOfficers = await pool.query(`SELECT COUNT(*) AS total_officers FROM active_patroller`);
    const unassigned    = await pool.query(`
      SELECT COUNT(*) AS unassigned_patrollers
      FROM active_patroller ap
      WHERE ap.active_patroller_id NOT IN (
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
  const { start, end, exclude_patrol_id } = req.query;
  try {
    let result;
    if (start && end) {
      if (exclude_patrol_id) {
  result = await pool.query(`
    SELECT ap.active_patroller_id, ap.officer_id,
      TRIM(CONCAT(u.first_name, ' ', u.middle_name, ' ', u.last_name)) AS officer_name,
      u.phone AS contact_number
    FROM active_patroller ap
    JOIN users u ON ap.officer_id = u.user_id
    WHERE ap.active_patroller_id NOT IN (
      SELECT DISTINCT pap.active_patroller_id
      FROM patrol_assignment_patroller pap
      JOIN patrol_assignment pa ON pap.patrol_id = pa.patrol_id
      WHERE pa.start_date <= $2
        AND pa.end_date   >= $1
        AND pa.patrol_id  != $3
    )
    ORDER BY officer_name ASC
  `, [start, end, parseInt(exclude_patrol_id)]);
} else {
  result = await pool.query(`
    SELECT ap.active_patroller_id, ap.officer_id,
      TRIM(CONCAT(u.first_name, ' ', u.middle_name, ' ', u.last_name)) AS officer_name,
      u.phone AS contact_number
    FROM active_patroller ap
    JOIN users u ON ap.officer_id = u.user_id
    WHERE ap.active_patroller_id NOT IN (
      SELECT DISTINCT pap.active_patroller_id
      FROM patrol_assignment_patroller pap
      JOIN patrol_assignment pa ON pap.patrol_id = pa.patrol_id
      WHERE pa.start_date <= $2
        AND pa.end_date   >= $1
    )
    ORDER BY officer_name ASC
  `, [start, end]);
}
    } else {
      result = await pool.query(`
        SELECT ap.active_patroller_id, ap.officer_id,
          TRIM(CONCAT(u.first_name, ' ', u.middle_name, ' ', u.last_name)) AS officer_name,
          u.phone AS contact_number
        FROM active_patroller ap
        JOIN users u ON ap.officer_id = u.user_id
        ORDER BY officer_name ASC
      `);
    }
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
//
// patrollers array has TWO parts:
//   1. "summary" rows — DISTINCT per patroller+shift, no route_date.
//      Used by PatrolScheduling table (no duplicates).
//   2. "detail" rows  — one per patroller+shift+date.
//      Used by EditPatrolModal and BeatCard to show per-date assignments.
//
// We return BOTH in one response to avoid a second API call:
//   patrollers        → deduplicated list for the table column
//   patrollers_detail → full per-date list for modals
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

        -- DEDUPLICATED list: one entry per unique patroller+shift pair
        -- Used by the patrol table "Assigned Patrollers" column
        (
          SELECT COALESCE(JSON_AGG(
    JSON_BUILD_OBJECT(
      'active_patroller_id', sub.active_patroller_id,
      'officer_name', sub.officer_name,
      'contact_number', sub.contact_number,
      'shift', sub.shift
    )
  ), '[]')
  FROM (
    SELECT DISTINCT ON (pap.active_patroller_id, pap.shift)
      pap.active_patroller_id,
      pap.shift,
      TRIM(CONCAT(u.first_name, ' ', u.middle_name, ' ', u.last_name)) AS officer_name,
      u.phone AS contact_number
    FROM patrol_assignment_patroller pap
    JOIN active_patroller ap ON pap.active_patroller_id = ap.active_patroller_id
    JOIN users u ON ap.officer_id = u.user_id
    WHERE pap.patrol_id = pa.patrol_id
    ORDER BY pap.active_patroller_id, pap.shift
  ) sub
) AS patrollers,

        -- FULL detail list: one entry per patroller+shift+date
        -- Used by EditPatrolModal and BeatCard for per-date display
        (
          SELECT COALESCE(JSON_AGG(
            JSON_BUILD_OBJECT(
              'active_patroller_id', ap.active_patroller_id,
              'officer_name', TRIM(CONCAT(u.first_name, ' ', u.middle_name, ' ', u.last_name)),
              'contact_number', u.phone,
              'shift', pap.shift,
              'route_date', pap.route_date
            ) ORDER BY pap.route_date, pap.shift, u.last_name
          ), '[]')
          FROM patrol_assignment_patroller pap
          JOIN active_patroller ap ON pap.active_patroller_id = ap.active_patroller_id
          JOIN users u ON ap.officer_id = u.user_id
          WHERE pap.patrol_id = pa.patrol_id
        ) AS patrollers_detail,

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

const checkPatrollerConflicts = async (client, patroller_ids, start_date, end_date, exclude_patrol_id = null) => {
  if (!patroller_ids || patroller_ids.length === 0) return [];
  
  const excludeClause = exclude_patrol_id 
    ? `AND pa.patrol_id != ${exclude_patrol_id}` 
    : "";

  const result = await client.query(`
    SELECT 
      pap.active_patroller_id,
      TRIM(CONCAT(u.first_name, ' ', u.middle_name, ' ', u.last_name)) AS officer_name,
      pa.patrol_name,
      pa.start_date,
      pa.end_date
    FROM patrol_assignment_patroller pap
    JOIN patrol_assignment pa ON pap.patrol_id = pa.patrol_id
    JOIN active_patroller ap ON pap.active_patroller_id = ap.active_patroller_id
    JOIN users u ON ap.officer_id = u.user_id
    WHERE pap.active_patroller_id = ANY($1::int[])
      AND pa.start_date <= $2
      AND pa.end_date   >= $3
      ${excludeClause}
    LIMIT 1
  `, [patroller_ids, end_date, start_date]);

  return result.rows;
};

// POST /patrol/patrols
// AM/PM patrollers inserted for ALL dates in range
// ─────────────────────────────────────────────
const createPatrol = async (req, res) => {
  const {
    patrol_name, mobile_unit_id, start_date, end_date,
    patroller_ids_am, patroller_ids_pm, barangays, routes,
  } = req.body;
  const created_by = req.user?.user_id || null;

  if (!patrol_name || !mobile_unit_id || !start_date || !end_date) {
    return res.status(400).json({ success: false, message: "Patrol name, mobile unit, start and end date are required." });
  }

  const client = await pool.connect();
  try {
    // ── Conflict check BEFORE transaction ──────────────────────
    const allIds = [...new Set([...(patroller_ids_am || []), ...(patroller_ids_pm || [])])];
    const conflicts = await checkPatrollerConflicts(client, allIds, start_date, end_date);
    if (conflicts.length > 0) {
      const c = conflicts[0];
      const fmt = (d) => new Date(d).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
      return res.status(400).json({
        success: false,
        message: `${c.officer_name} is already assigned to "${c.patrol_name}" (${fmt(c.start_date)} – ${fmt(c.end_date)}) during this period.`,
      });
    }
    // ──────────────────────────────────────────────────────────

    await client.query("BEGIN");

    const patrolResult = await client.query(
      `INSERT INTO patrol_assignment (patrol_name, mobile_unit_id, start_date, end_date, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING patrol_id`,
      [patrol_name, mobile_unit_id, start_date, end_date, created_by]
    );
    const patrol_id = patrolResult.rows[0].patrol_id;
    const dates     = getDateRange(start_date, end_date);

    // Insert AM patrollers for every date in range
    if (patroller_ids_am?.length > 0) {
      for (const date of dates) {
        for (const active_patroller_id of patroller_ids_am) {
          await client.query(
            `INSERT INTO patrol_assignment_patroller (patrol_id, active_patroller_id, shift, route_date)
             VALUES ($1, $2, 'AM', $3)`,
            [patrol_id, active_patroller_id, date]
          );
        }
      }
    }

    // Insert PM patrollers for every date in range
    if (patroller_ids_pm?.length > 0) {
      for (const date of dates) {
        for (const active_patroller_id of patroller_ids_pm) {
          await client.query(
            `INSERT INTO patrol_assignment_patroller (patrol_id, active_patroller_id, shift, route_date)
             VALUES ($1, $2, 'PM', $3)`,
            [patrol_id, active_patroller_id, date]
          );
        }
      }
    }

    // Barangay highlights
    if (barangays?.length > 0) {
      for (let i = 0; i < barangays.length; i++) {
        await client.query(
          `INSERT INTO patrol_assignment_route (patrol_id, route_date, barangay, shift, stop_order)
           VALUES ($1, $2, $3, 'AM', $4)`,
          [patrol_id, start_date, barangays[i], -(i + 1)]
        );
      }
    }

    // Timetable tasks duplicated across all dates
    if (routes?.length > 0) {
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
    res.status(500).json({ success: false, message: "Server error: " + error.message });
  } finally {
    client.release();
  }
};

// ─────────────────────────────────────────────
// PUT /patrol/patrols/:id
// Updates basic info + barangays only.
// Patrollers per date are managed via PATCH /patrollers/:date
// ─────────────────────────────────────────────
const updatePatrol = async (req, res) => {
  const { id } = req.params;
  const { patrol_name, mobile_unit_id, start_date, end_date, barangays } = req.body;

  if (!patrol_name || !mobile_unit_id || !start_date || !end_date) {
    return res.status(400).json({ success: false, message: "All required fields must be filled." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(
      `UPDATE patrol_assignment
       SET patrol_name=$1, mobile_unit_id=$2, start_date=$3, end_date=$4, updated_at=CURRENT_TIMESTAMP
       WHERE patrol_id=$5`,
      [patrol_name, mobile_unit_id, start_date, end_date, id]
    );

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

    await client.query("COMMIT");
    res.json({ success: true, message: "Patrol updated successfully." });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Update patrol error:", error);
    res.status(500).json({ success: false, message: "Server error: " + error.message });
  } finally {
    client.release();
  }
};

// ─────────────────────────────────────────────
// PATCH /patrol/patrols/:id/patrollers/:date
// Replace patrollers for ONE specific date only.
// Body: { patroller_ids_am: [], patroller_ids_pm: [] }
// ─────────────────────────────────────────────
const updatePatrollersForDate = async (req, res) => {
  const { id, date } = req.params;
  const { patroller_ids_am, patroller_ids_pm } = req.body;

  const client = await pool.connect();
  try {
    // ── Conflict check — exclude current patrol ─────────────────
    const allIds = [...new Set([...(patroller_ids_am || []), ...(patroller_ids_pm || [])])];
    const conflicts = await checkPatrollerConflicts(client, allIds, date, date, parseInt(id));
    if (conflicts.length > 0) {
      const c = conflicts[0];
      const fmt = (d) => new Date(d).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
      client.release();
      return res.status(400).json({
        success: false,
        message: `${c.officer_name} is already assigned to "${c.patrol_name}" (${fmt(c.start_date)} – ${fmt(c.end_date)}) on this date.`,
      });
    }
    // ──────────────────────────────────────────────────────────

    await client.query("BEGIN");
    // ... rest of updatePatrollersForDate unchanged

    // Delete ONLY this patrol + this specific date — other dates untouched
    await client.query(
      `DELETE FROM patrol_assignment_patroller WHERE patrol_id=$1 AND route_date=$2`,
      [id, date]
    );

    if (patroller_ids_am?.length > 0) {
      for (const active_patroller_id of patroller_ids_am) {
        await client.query(
          `INSERT INTO patrol_assignment_patroller (patrol_id, active_patroller_id, shift, route_date)
           VALUES ($1, $2, 'AM', $3)`,
          [id, active_patroller_id, date]
        );
      }
    }

    if (patroller_ids_pm?.length > 0) {
      for (const active_patroller_id of patroller_ids_pm) {
        await client.query(
          `INSERT INTO patrol_assignment_patroller (patrol_id, active_patroller_id, shift, route_date)
           VALUES ($1, $2, 'PM', $3)`,
          [id, active_patroller_id, date]
        );
      }
    }

    await client.query("COMMIT");
    res.json({ success: true, message: "Patrollers updated for date." });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Update patrollers for date error:", error);
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

// ─────────────────────────────────────────────
// DELETE /patrol/routes/:routeId
// ─────────────────────────────────────────────
const removeRouteTask = async (req, res) => {
  const { routeId } = req.params;
  try {
    await pool.query(`DELETE FROM patrol_assignment_route WHERE route_id = $1`, [routeId]);
    res.json({ success: true });
  } catch (error) {
    console.error("Remove route task error:", error);
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
  updatePatrollersForDate,
  deletePatrol,
  updateRouteNotes,
  updateRouteTask,
  addRouteTask,
  removeRouteTask,
};