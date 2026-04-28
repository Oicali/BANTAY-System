const pool = require("../../../config/database");

// ── Helper: generate date range ────────────────────────────

const formatDateOnly = (d) => {
  if (!d) return null;
  if (typeof d === "string") return d.substring(0, 10);
  // pg returns date columns as JS Date objects (UTC midnight) — read local parts
  const offset = d.getTimezoneOffset(); // in minutes
  const local  = new Date(d.getTime() - offset * 60000);
  return local.toISOString().substring(0, 10);
};

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
        mu.mobile_unit_name AS mobile_unit_assigned,
        ol.latitude,
        ol.longitude,
        ol.location_name  AS last_location_name,
        ol.updated_at     AS last_location_at
      FROM active_patroller ap
      JOIN users u ON ap.officer_id = u.user_id
      LEFT JOIN patrol_assignment_patroller pap ON ap.active_patroller_id = pap.active_patroller_id
      LEFT JOIN patrol_assignment pa ON pap.patrol_id = pa.patrol_id
      LEFT JOIN mobile_unit mu ON pa.mobile_unit_id = mu.mobile_unit_id
      LEFT JOIN officer_locations ol ON ap.officer_id = ol.officer_id
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
              'active_patroller_id', sub.active_patroller_id,
              'officer_id',          sub.officer_id,
              'officer_name',        sub.officer_name,
              'contact_number',      sub.contact_number,
              'shift',               sub.shift
            )
          ), '[]')
          FROM (
            SELECT DISTINCT ON (pap.active_patroller_id, pap.shift)
              pap.active_patroller_id,
              ap.officer_id,
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

        (
          SELECT COALESCE(JSON_AGG(
            JSON_BUILD_OBJECT(
              'active_patroller_id', ap.active_patroller_id,
              'officer_id',          ap.officer_id,
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
    const data = result.rows.map((p) => ({
  ...p,
  start_date: formatDateOnly(p.start_date),
  end_date:   formatDateOnly(p.end_date),
}));
res.json({ success: true, data });
  } catch (error) {
    console.error("Get patrols error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ─────────────────────────────────────────────
const checkPatrollerConflicts = async (client, patroller_ids, start_date, end_date, exclude_patrol_id = null) => {
  if (!patroller_ids || patroller_ids.length === 0) return [];
  const excludeClause = exclude_patrol_id ? `AND pa.patrol_id != ${exclude_patrol_id}` : "";
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

// ─────────────────────────────────────────────
// POST /patrol/patrols
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
    const allIds = [...new Set([...(patroller_ids_am || []), ...(patroller_ids_pm || [])])];
    const conflicts = await checkPatrollerConflicts(client, allIds, start_date, end_date);
    if (conflicts.length > 0) {
      const c = conflicts[0];
      const fmt = (d) => {
  const dt = new Date(d);
  return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate())
    .toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
};
      return res.status(400).json({
        success: false,
        message: `${c.officer_name} is already assigned to "${c.patrol_name}" (${fmt(c.start_date)} – ${fmt(c.end_date)}) during this period.`,
      });
    }

    await client.query("BEGIN");

    const patrolResult = await client.query(
      `INSERT INTO patrol_assignment (patrol_name, mobile_unit_id, start_date, end_date, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING patrol_id`,
      [patrol_name, mobile_unit_id, start_date, end_date, created_by]
    );
    const patrol_id = patrolResult.rows[0].patrol_id;
    const dates     = getDateRange(start_date, end_date);

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

    if (barangays?.length > 0) {
      for (let i = 0; i < barangays.length; i++) {
        await client.query(
          `INSERT INTO patrol_assignment_route (patrol_id, route_date, barangay, shift, stop_order)
           VALUES ($1, $2, $3, 'AM', $4)`,
          [patrol_id, start_date, barangays[i], -(i + 1)]
        );
      }
    }

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
// ─────────────────────────────────────────────
const updatePatrollersForDate = async (req, res) => {
  const { id, date } = req.params;
  const { patroller_ids_am, patroller_ids_pm } = req.body;

  const client = await pool.connect();
  try {
    const allIds = [...new Set([...(patroller_ids_am || []), ...(patroller_ids_pm || [])])];
    const conflicts = await checkPatrollerConflicts(client, allIds, date, date, parseInt(id));
    if (conflicts.length > 0) {
      const c = conflicts[0];
    const fmt = (d) => {
  const dt = new Date(d);
  return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate())
    .toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
};
      client.release();
      return res.status(400).json({
        success: false,
        message: `${c.officer_name} is already assigned to "${c.patrol_name}" (${fmt(c.start_date)} – ${fmt(c.end_date)}) on this date.`,
      });
    }

    await client.query("BEGIN");
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

// ─────────────────────────────────────────────
// GET /patrol/my-patrols
// ─────────────────────────────────────────────
const getMyPatrols = async (req, res) => {
  const userId = req.user?.user_id;
  if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

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
              'active_patroller_id', sub.active_patroller_id,
              'officer_id',          sub.officer_id,
              'officer_name',        sub.officer_name,
              'contact_number',      sub.contact_number,
              'shift',               sub.shift
            )
          ), '[]')
          FROM (
            SELECT DISTINCT ON (pap.active_patroller_id, pap.shift)
              pap.active_patroller_id,
              ap.officer_id,
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
      WHERE pa.patrol_id IN (
        SELECT DISTINCT pap.patrol_id
        FROM patrol_assignment_patroller pap
        JOIN active_patroller ap ON pap.active_patroller_id = ap.active_patroller_id
        WHERE ap.officer_id = $1
      )
      ORDER BY pa.start_date DESC, pa.patrol_id DESC
    `, [userId]);

    const data = result.rows.map((p) => ({
  ...p,
  start_date: formatDateOnly(p.start_date),
  end_date:   formatDateOnly(p.end_date),
}));
res.json({ success: true, data });
  } catch (error) {
    console.error("getMyPatrols error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ─────────────────────────────────────────────
// POST /patrol/patrols/:id/after-report
//
// SHARED REPORT MODEL
// ─────────────────────────────────────────────
// One report per (patrol_id, patrol_date, shift).
// Any officer in the same shift can create or update it.
//
// DB migration required before deploying:
//
//   ALTER TABLE after_patrol_reports
//     DROP CONSTRAINT IF EXISTS after_patrol_reports_patrol_id_submitted_by_patrol_date_key;
//
//   ALTER TABLE after_patrol_reports
//     ADD COLUMN IF NOT EXISTS shift VARCHAR(2),
//     ADD CONSTRAINT after_patrol_reports_patrol_id_patrol_date_shift_key
//       UNIQUE (patrol_id, patrol_date, shift);
// ─────────────────────────────────────────────
const submitAfterPatrolReport = async (req, res) => {
  const { id: patrol_id } = req.params;
  const userId = req.user?.user_id;
  if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

  const {
    date,
    shift,          // 'AM' | 'PM' — sent by frontend, validated below
    timeFrom,
    timeTo,
    preDeployment,
    action1,
    incidents,
    action2,
    safetyConcerns,
    action3,
    otherServices,
    visitedAreas,
    personsVisited,
    numOfficials,
    numGovt,
    sector,
    mustDos,
    creditHours,
    remarks,
    sigOfficer1,
    sigOfficer2,
    sigSupervisor,
  } = req.body;

  if (!date) {
    return res.status(400).json({ success: false, message: "Patrol date is required." });
  }

  try {
    // Resolve active_patroller_id from logged-in user
    const patrollerResult = await pool.query(
      `SELECT active_patroller_id FROM active_patroller WHERE officer_id = $1 LIMIT 1`,
      [userId]
    );
    if (patrollerResult.rows.length === 0) {
      return res.status(403).json({ success: false, message: "You are not registered as an active patroller." });
    }
    const active_patroller_id = patrollerResult.rows[0].active_patroller_id;

    // Verify the patroller belongs to this patrol
    const assignmentCheck = await pool.query(
      `SELECT 1 FROM patrol_assignment_patroller
       WHERE patrol_id = $1 AND active_patroller_id = $2 LIMIT 1`,
      [patrol_id, active_patroller_id]
    );
    if (assignmentCheck.rows.length === 0) {
      return res.status(403).json({ success: false, message: "You are not assigned to this patrol." });
    }

    // Validate that the patroller actually belongs to the claimed shift
    // (prevents an AM officer submitting under PM and vice-versa)
    if (shift && shift !== "AM & PM") {
      const shiftCheck = await pool.query(
        `SELECT 1 FROM patrol_assignment_patroller
         WHERE patrol_id = $1 AND active_patroller_id = $2 AND shift = $3 LIMIT 1`,
        [patrol_id, active_patroller_id, shift]
      );
      if (shiftCheck.rows.length === 0) {
        return res.status(403).json({
          success: false,
          message: `You are not assigned to the ${shift} shift for this patrol.`,
        });
      }
    }

    // Validate date within patrol duration
    const patrolDates = await pool.query(
      `SELECT start_date, end_date FROM patrol_assignment WHERE patrol_id = $1`,
      [patrol_id]
    );
    if (patrolDates.rows.length > 0) {
      const start_date = formatDateOnly(patrolDates.rows[0].start_date);
const end_date   = formatDateOnly(patrolDates.rows[0].end_date);
if (date < start_date || date > end_date) {
        return res.status(400).json({
          success: false,
          message: `Report date must be within the patrol duration (${start_date} – ${end_date}).`,
        });
      }
    }

    // Upsert: one report per (patrol_id, patrol_date, shift)
    // submitted_by records whoever last saved it
    const result = await pool.query(
      `INSERT INTO after_patrol_reports (
        patrol_id, submitted_by, shift,
        patrol_date, time_from, time_to,
        pre_deployment, action_pre_deployment,
        incidents, action_incidents,
        safety_concerns, action_safety,
        other_services, visited_areas,
        persons_visited, num_officials, num_govt_officials,
        sector_beat, must_dos, credit_hours,
        remarks,
        sig_officer_1, sig_officer_2, sig_supervisor
      ) VALUES (
        $1,  $2,  $3,
        $4,  $5,  $6,
        $7,  $8,
        $9,  $10,
        $11, $12,
        $13, $14,
        $15, $16, $17,
        $18, $19, $20,
        $21,
        $22, $23, $24
      )
      ON CONFLICT (patrol_id, patrol_date, shift)
      DO UPDATE SET
        submitted_by          = EXCLUDED.submitted_by,
        time_from             = EXCLUDED.time_from,
        time_to               = EXCLUDED.time_to,
        pre_deployment        = EXCLUDED.pre_deployment,
        action_pre_deployment = EXCLUDED.action_pre_deployment,
        incidents             = EXCLUDED.incidents,
        action_incidents      = EXCLUDED.action_incidents,
        safety_concerns       = EXCLUDED.safety_concerns,
        action_safety         = EXCLUDED.action_safety,
        other_services        = EXCLUDED.other_services,
        visited_areas         = EXCLUDED.visited_areas,
        persons_visited       = EXCLUDED.persons_visited,
        num_officials         = EXCLUDED.num_officials,
        num_govt_officials    = EXCLUDED.num_govt_officials,
        sector_beat           = EXCLUDED.sector_beat,
        must_dos              = EXCLUDED.must_dos,
        credit_hours          = EXCLUDED.credit_hours,
        remarks               = EXCLUDED.remarks,
        sig_officer_1         = EXCLUDED.sig_officer_1,
        sig_officer_2         = EXCLUDED.sig_officer_2,
        sig_supervisor        = EXCLUDED.sig_supervisor,
        updated_at            = NOW()
      RETURNING report_id`,
      [
        patrol_id,          active_patroller_id,  shift || null,
        date,               timeFrom || null,      timeTo || null,
        preDeployment  || null, action1 || null,
        incidents      || null, action2 || null,
        safetyConcerns || null, action3 || null,
        otherServices  || null, visitedAreas   || null,
        personsVisited || null,
        numOfficials   != null ? parseInt(numOfficials)  : null,
        numGovt        != null ? parseInt(numGovt)       : null,
        sector         || null, mustDos  || null, creditHours || null,
        remarks        || null,
        sigOfficer1    || null, sigOfficer2 || null, sigSupervisor || null,
      ]
    );

    res.json({
      success: true,
      message: "After Patrol Report submitted successfully.",
      report_id: result.rows[0].report_id,
    });
  } catch (error) {
    console.error("submitAfterPatrolReport error:", error);
    res.status(500).json({ success: false, message: "Server error: " + error.message });
  }
};

// ─────────────────────────────────────────────
// GET /patrol/patrols/:id/after-reports
// Admin / supervisor: all reports for a patrol.
// ─────────────────────────────────────────────
const getAfterPatrolReports = async (req, res) => {
  const { id: patrol_id } = req.params;
  try {
    const result = await pool.query(
      `SELECT
        apr.*,
        TRIM(CONCAT(u.first_name, ' ', u.middle_name, ' ', u.last_name)) AS submitted_by_name,
        u.phone AS submitted_by_contact
      FROM after_patrol_reports apr
      JOIN active_patroller ap ON apr.submitted_by = ap.active_patroller_id
      JOIN users u ON ap.officer_id = u.user_id
      WHERE apr.patrol_id = $1
      ORDER BY apr.patrol_date DESC, apr.submitted_at DESC`,
      [patrol_id]
    );
    const data = result.rows.map((r) => ({
  ...r,
  patrol_date: formatDateOnly(r.patrol_date),
}));
res.json({ success: true, data });
  } catch (error) {
    console.error("getAfterPatrolReports error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ─────────────────────────────────────────────
// GET /patrol/patrols/:id/after-reports/mine
//
// Returns all shift-shared reports that the current user is a member of.
// Because one report is shared per shift, "mine" means:
//   any report for a shift the user is assigned to in this patrol.
// ─────────────────────────────────────────────
const getMyAfterPatrolReports = async (req, res) => {
  const { id: patrol_id } = req.params;
  const userId = req.user?.user_id;
  if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

  try {
    const result = await pool.query(
      `SELECT apr.*
       FROM after_patrol_reports apr
       WHERE apr.patrol_id = $1
         AND (
           -- Report belongs to a shift this user is assigned to
           apr.shift IN (
             SELECT DISTINCT pap.shift
             FROM patrol_assignment_patroller pap
             JOIN active_patroller ap ON pap.active_patroller_id = ap.active_patroller_id
             WHERE pap.patrol_id = $1
               AND ap.officer_id = $2
               AND pap.shift IS NOT NULL
           )
           OR
           -- Also surface reports the user personally submitted (covers legacy data / null-shift rows)
           apr.submitted_by IN (
             SELECT active_patroller_id FROM active_patroller WHERE officer_id = $2
           )
         )
       ORDER BY apr.patrol_date ASC`,
      [patrol_id, userId]
    );

  const data = result.rows.map((r) => ({
  ...r,
  patrol_date: formatDateOnly(r.patrol_date),
}));
res.json({ success: true, data });
  } catch (error) {
    console.error("getMyAfterPatrolReports error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ─────────────────────────────────────────────
// DELETE /patrol/after-reports/:reportId
// Any shift member may delete the shared report.
// ─────────────────────────────────────────────
const deleteAfterPatrolReport = async (req, res) => {
  const { reportId } = req.params;
  const userId = req.user?.user_id;

  try {
    // Confirm the user is in the same shift as the report
    const result = await pool.query(
      `DELETE FROM after_patrol_reports apr
       WHERE apr.report_id = $1
         AND (
           -- User is in the same shift
           apr.shift IN (
             SELECT DISTINCT pap.shift
             FROM patrol_assignment_patroller pap
             JOIN active_patroller ap2 ON pap.active_patroller_id = ap2.active_patroller_id
             WHERE pap.patrol_id = apr.patrol_id
               AND ap2.officer_id = $2
           )
           OR
           -- Or they were the original submitter (fallback)
           apr.submitted_by IN (
             SELECT active_patroller_id FROM active_patroller WHERE officer_id = $2
           )
         )`,
      [reportId, userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Report not found or you do not have permission to delete it.",
      });
    }

    res.json({ success: true, message: "Report deleted successfully." });
  } catch (error) {
    console.error("deleteAfterPatrolReport error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const updateOfficerLocation = async (req, res) => {
  const userId = req.user?.user_id;
  if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

  const { latitude, longitude, location_name } = req.body;

  if (latitude == null || longitude == null) {
    return res.status(400).json({ success: false, message: "latitude and longitude are required." });
  }

  try {
    await pool.query(
      `INSERT INTO officer_locations (officer_id, latitude, longitude, location_name, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (officer_id)
       DO UPDATE SET
         latitude      = EXCLUDED.latitude,
         longitude     = EXCLUDED.longitude,
         location_name = EXCLUDED.location_name,
         updated_at    = NOW()`,
      [userId, latitude, longitude, location_name || null]
    );
    res.json({ success: true });
  } catch (error) {
    console.error("updateOfficerLocation error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

module.exports = {
  getMyPatrols,
  getAfterPatrolReports,
  getMyAfterPatrolReports,
  getPatrolStats,
  getActivePatrollers,
  getAvailablePatrollers,
  getMobileUnits,
  createMobileUnit,
  submitAfterPatrolReport,
  updateMobileUnit,
  deleteAfterPatrolReport,
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
  updateOfficerLocation,
};