const pool = require("../../../config/database");

// ─────────────────────────────────────────────
// GET /patrol/stats
// ─────────────────────────────────────────────
const getPatrolStats = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'Active')              AS active_patrols,
        COUNT(*) FILTER (WHERE mobile_unit_assigned IS NOT NULL) AS assigned_patrollers,
        COUNT(*) FILTER (WHERE mobile_unit_assigned IS NULL)     AS unassigned_patrollers,
        COUNT(*)                                                 AS total_officers
      FROM active_patroller
    `);

    const mobileUnitCount = await pool.query(`
      SELECT COUNT(*) AS mobile_units FROM mobile_unit
    `);

    res.json({
      success: true,
      data: {
        ...result.rows[0],
        mobile_units: mobileUnitCount.rows[0].mobile_units,
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
      SELECT
        ap.active_patroller_id,
        ap.officer_id,
        ap.mobile_unit_assigned,
        ap.status,
        u.last_login,
        TRIM(CONCAT(u.first_name, ' ', u.middle_name, ' ', u.last_name)) AS officer_name
      FROM active_patroller ap
      JOIN users u ON ap.officer_id = u.user_id
      ORDER BY u.last_login DESC
    `);

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error("Patroller fetch error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ─────────────────────────────────────────────
// GET /patrol/available-patrollers
// Returns patrollers NOT yet assigned to any mobile unit
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
      WHERE ap.active_patroller_id NOT IN (
        SELECT active_patroller_id FROM mobile_unit_patroller
      )
      AND ap.status = 'Active'
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
// Returns all mobile units with their patrollers grouped
// ─────────────────────────────────────────────
const getMobileUnits = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        mu.mobile_unit_id,
        mu.mobile_unit_name,
        mu.barangay_area,
        mu.created_at,
        COALESCE(
          JSON_AGG(
            JSON_BUILD_OBJECT(
              'active_patroller_id', ap.active_patroller_id,
              'officer_id',          ap.officer_id,
              'officer_name',        TRIM(CONCAT(u.first_name, ' ', u.middle_name, ' ', u.last_name))
            )
          ) FILTER (WHERE ap.active_patroller_id IS NOT NULL),
          '[]'
        ) AS patrollers
      FROM mobile_unit mu
      LEFT JOIN mobile_unit_patroller mup ON mu.mobile_unit_id = mup.mobile_unit_id
      LEFT JOIN active_patroller ap ON mup.active_patroller_id = ap.active_patroller_id
      LEFT JOIN users u ON ap.officer_id = u.user_id
      GROUP BY mu.mobile_unit_id
      ORDER BY mu.created_at DESC
    `);

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error("Mobile units fetch error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ─────────────────────────────────────────────
// POST /patrol/mobile-units
// Creates a mobile unit and assigns multiple patrollers
// Body: { mobile_unit_name, barangay_area, patroller_ids: [1, 2, 3] }
// ─────────────────────────────────────────────
const createMobileUnit = async (req, res) => {
  const { mobile_unit_name, barangay_area, patroller_ids } = req.body;
  const created_by = req.user?.user_id || null;

  if (!mobile_unit_name || !barangay_area) {
    return res.status(400).json({
      success: false,
      message: "Mobile unit name and barangay area are required.",
    });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Insert mobile unit
    const unitResult = await client.query(
      `INSERT INTO mobile_unit (mobile_unit_name, barangay_area, created_by)
       VALUES ($1, $2, $3)
       RETURNING mobile_unit_id`,
      [mobile_unit_name, barangay_area, created_by]
    );
    const mobile_unit_id = unitResult.rows[0].mobile_unit_id;

    // 2. Assign patrollers if provided
    if (patroller_ids && patroller_ids.length > 0) {
      for (const active_patroller_id of patroller_ids) {
        await client.query(
          `INSERT INTO mobile_unit_patroller (mobile_unit_id, active_patroller_id)
           VALUES ($1, $2)`,
          [mobile_unit_id, active_patroller_id]
        );

        // 3. Update active_patroller.mobile_unit_assigned
        await client.query(
          `UPDATE active_patroller
           SET mobile_unit_assigned = $1
           WHERE active_patroller_id = $2`,
          [mobile_unit_name, active_patroller_id]
        );
      }
    }

    await client.query("COMMIT");
    res.json({ success: true, message: "Mobile unit created successfully." });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Create mobile unit error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  } finally {
    client.release();
  }
};

// ─────────────────────────────────────────────
// PUT /patrol/mobile-units/:id
// Updates a mobile unit and re-assigns patrollers
// Body: { mobile_unit_name, barangay_area, patroller_ids: [1, 2, 3] }
// ─────────────────────────────────────────────
const updateMobileUnit = async (req, res) => {
  const { id } = req.params;
  const { mobile_unit_name, barangay_area, patroller_ids } = req.body;

  if (!mobile_unit_name || !barangay_area) {
    return res.status(400).json({
      success: false,
      message: "Mobile unit name and barangay area are required.",
    });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Update mobile unit details
    await client.query(
      `UPDATE mobile_unit
       SET mobile_unit_name = $1, barangay_area = $2, updated_at = CURRENT_TIMESTAMP
       WHERE mobile_unit_id = $3`,
      [mobile_unit_name, barangay_area, id]
    );

    // 2. Clear old patroller assignments for this unit
    const oldPatrollers = await client.query(
      `SELECT active_patroller_id FROM mobile_unit_patroller WHERE mobile_unit_id = $1`,
      [id]
    );

    // 3. Reset mobile_unit_assigned for old patrollers
    for (const row of oldPatrollers.rows) {
      await client.query(
        `UPDATE active_patroller
         SET mobile_unit_assigned = NULL
         WHERE active_patroller_id = $1`,
        [row.active_patroller_id]
      );
    }

    // 4. Delete old junction records
    await client.query(
      `DELETE FROM mobile_unit_patroller WHERE mobile_unit_id = $1`,
      [id]
    );

    // 5. Insert new patroller assignments
    if (patroller_ids && patroller_ids.length > 0) {
      for (const active_patroller_id of patroller_ids) {
        await client.query(
          `INSERT INTO mobile_unit_patroller (mobile_unit_id, active_patroller_id)
           VALUES ($1, $2)`,
          [id, active_patroller_id]
        );

        // 6. Update active_patroller.mobile_unit_assigned
        await client.query(
          `UPDATE active_patroller
           SET mobile_unit_assigned = $1
           WHERE active_patroller_id = $2`,
          [mobile_unit_name, active_patroller_id]
        );
      }
    }

    await client.query("COMMIT");
    res.json({ success: true, message: "Mobile unit updated successfully." });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Update mobile unit error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  } finally {
    client.release();
  }
};

const deleteMobileUnit = async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Reset mobile_unit_assigned for all patrollers in this unit
    const patrollers = await client.query(
      `SELECT active_patroller_id FROM mobile_unit_patroller WHERE mobile_unit_id = $1`, [id]
    );
    for (const row of patrollers.rows) {
      await client.query(
        `UPDATE active_patroller SET mobile_unit_assigned = NULL WHERE active_patroller_id = $1`,
        [row.active_patroller_id]
      );
    }

    // Delete the unit (cascade deletes junction table rows)
    await client.query(`DELETE FROM mobile_unit WHERE mobile_unit_id = $1`, [id]);

    await client.query("COMMIT");
    res.json({ success: true, message: "Mobile unit deleted." });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Delete error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  } finally {
    client.release();
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
};