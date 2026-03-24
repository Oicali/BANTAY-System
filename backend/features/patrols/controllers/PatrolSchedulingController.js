// ─────────────────────────────────────────────
// GET /patrol/patrols
// Returns all patrols with patrollers and routes
// ─────────────────────────────────────────────
const getPatrols = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        pa.patrol_id,
        pa.patrol_name,
        pa.shift,
        pa.shift_date,
        pa.mobile_unit_id,
        mu.mobile_unit_name,
        mu.plate_number,
        COALESCE(
          JSON_AGG(DISTINCT
            JSON_BUILD_OBJECT(
              'active_patroller_id', ap.active_patroller_id,
              'officer_name', TRIM(CONCAT(u.first_name, ' ', u.middle_name, ' ', u.last_name))
            )
          ) FILTER (WHERE ap.active_patroller_id IS NOT NULL),
          '[]'
        ) AS patrollers,
        COALESCE(
          JSON_AGG(DISTINCT
            JSON_BUILD_OBJECT(
              'route_id',   par.route_id,
              'barangay',   par.barangay,
              'time_start', par.time_start,
              'time_end',   par.time_end,
              'stop_order', par.stop_order
            )
          ) FILTER (WHERE par.route_id IS NOT NULL),
          '[]'
        ) AS routes
      FROM patrol_assignment pa
      JOIN mobile_unit mu ON pa.mobile_unit_id = mu.mobile_unit_id
      LEFT JOIN patrol_assignment_patroller pap ON pa.patrol_id = pap.patrol_id
      LEFT JOIN active_patroller ap ON pap.active_patroller_id = ap.active_patroller_id
      LEFT JOIN users u ON ap.officer_id = u.user_id
      LEFT JOIN patrol_assignment_route par ON pa.patrol_id = par.patrol_id
      GROUP BY pa.patrol_id, mu.mobile_unit_name, mu.plate_number
      ORDER BY pa.shift_date DESC, pa.patrol_id DESC
    `);

    // Sort routes by stop_order
    const data = result.rows.map((row) => ({
      ...row,
      routes: (row.routes || []).sort((a, b) => a.stop_order - b.stop_order),
    }));

    res.json({ success: true, data });
  } catch (error) {
    console.error("Get patrols error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ─────────────────────────────────────────────
// POST /patrol/patrols
// Creates a patrol with patrollers and route stops
// Body: { patrol_name, mobile_unit_id, shift, shift_date, patroller_ids, routes }
// ─────────────────────────────────────────────
const createPatrol = async (req, res) => {
  const { patrol_name, mobile_unit_id, shift, shift_date, patroller_ids, routes } = req.body;
  const created_by = req.user?.user_id || null;

  if (!patrol_name || !mobile_unit_id || !shift || !shift_date) {
    return res.status(400).json({
      success: false,
      message: "Patrol name, mobile unit, shift, and date are required.",
    });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Insert patrol
    const patrolResult = await client.query(
      `INSERT INTO patrol_assignment (patrol_name, mobile_unit_id, shift, shift_date, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING patrol_id`,
      [patrol_name, mobile_unit_id, shift, shift_date, created_by]
    );
    const patrol_id = patrolResult.rows[0].patrol_id;

    // 2. Assign patrollers
    if (patroller_ids && patroller_ids.length > 0) {
      for (const active_patroller_id of patroller_ids) {
        await client.query(
          `INSERT INTO patrol_assignment_patroller (patrol_id, active_patroller_id)
           VALUES ($1, $2)`,
          [patrol_id, active_patroller_id]
        );
      }
    }

    // 3. Insert route stops
    if (routes && routes.length > 0) {
      for (const stop of routes) {
        await client.query(
          `INSERT INTO patrol_assignment_route (patrol_id, barangay, time_start, time_end, stop_order)
           VALUES ($1, $2, $3, $4, $5)`,
          [patrol_id, stop.barangay, stop.time_start, stop.time_end, stop.stop_order]
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
        message: "This mobile unit already has a patrol for this shift on this date.",
      });
    }
    res.status(500).json({ success: false, message: "Server error" });
  } finally {
    client.release();
  }
};

// ─────────────────────────────────────────────
// PUT /patrol/patrols/:id
// Updates a patrol with patrollers and route stops
// ─────────────────────────────────────────────
const updatePatrol = async (req, res) => {
  const { id } = req.params;
  const { patrol_name, mobile_unit_id, shift, shift_date, patroller_ids, routes } = req.body;

  if (!patrol_name || !mobile_unit_id || !shift || !shift_date) {
    return res.status(400).json({
      success: false,
      message: "Patrol name, mobile unit, shift, and date are required.",
    });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Update patrol details
    await client.query(
      `UPDATE patrol_assignment
       SET patrol_name = $1, mobile_unit_id = $2, shift = $3,
           shift_date = $4, updated_at = CURRENT_TIMESTAMP
       WHERE patrol_id = $5`,
      [patrol_name, mobile_unit_id, shift, shift_date, id]
    );

    // 2. Replace patrollers
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

    // 3. Replace route stops
    await client.query(
      `DELETE FROM patrol_assignment_route WHERE patrol_id = $1`, [id]
    );
    if (routes && routes.length > 0) {
      for (const stop of routes) {
        await client.query(
          `INSERT INTO patrol_assignment_route (patrol_id, barangay, time_start, time_end, stop_order)
           VALUES ($1, $2, $3, $4, $5)`,
          [id, stop.barangay, stop.time_start, stop.time_end, stop.stop_order]
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
        message: "This mobile unit already has a patrol for this shift on this date.",
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

module.exports = {
  getPatrols,
  createPatrol,
  updatePatrol,
  deletePatrol,
};