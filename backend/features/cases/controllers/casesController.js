const pool = require("../../../config/database");

// POST /cases — Admin only
const createCase = async (req, res) => {
  try {
    const { blotter_id } = req.body;
    if (!blotter_id) return res.status(400).json({ success: false, message: "blotter_id is required" });

    const blotter = await pool.query("SELECT blotter_id FROM blotter_entries WHERE blotter_id = $1", [blotter_id]);
    if (blotter.rows.length === 0) return res.status(404).json({ success: false, message: "Blotter not found" });

    const existing = await pool.query("SELECT id FROM cases WHERE blotter_id = $1", [blotter_id]);
    if (existing.rows.length > 0) return res.status(409).json({ success: false, message: "A case already exists for this blotter" });

    const year = new Date().getFullYear();
    const countResult = await pool.query("SELECT COUNT(*) FROM cases WHERE EXTRACT(YEAR FROM created_at) = $1", [year]);
    const count = parseInt(countResult.rows[0].count) + 1;
    const case_number = `CASE-${year}-${String(count).padStart(4, "0")}`;

    const result = await pool.query(
      `INSERT INTO cases (blotter_id, case_number, created_by)
       VALUES ($1, $2, $3)
       RETURNING id, case_number, blotter_id, status, priority, created_by, created_at`,
      [blotter_id, case_number, req.user.user_id]
    );

    return res.status(201).json({ success: true, message: "Case created successfully", data: result.rows[0] });
  } catch (error) {
    console.error("Create case error:", error);
    res.status(500).json({ success: false, message: "Error creating case" });
  }
};

// PATCH /cases/:id/assign — Admin only
// PATCH /cases/:id/assign — Admin only
const assignInvestigator = async (req, res) => {
  try {
    const { id } = req.params;
    const { assigned_io_id } = req.body;

    const caseCheck = await pool.query("SELECT id FROM cases WHERE id = $1", [id]);
    if (caseCheck.rows.length === 0) return res.status(404).json({ success: false, message: "Case not found" });

    // Allow unassigning by passing null or empty string
    if (!assigned_io_id || assigned_io_id === '') {
      const result = await pool.query(
        `UPDATE cases SET assigned_io_id = NULL, updated_at = NOW()
         WHERE id = $1 RETURNING id, case_number, assigned_io_id, updated_at`,
        [id]
      );
      return res.status(200).json({
        success: true,
        message: "Investigator unassigned successfully",
        data: { ...result.rows[0], assigned_io_name: null },
      });
    }

    const user = await pool.query(
      `SELECT u.user_id, u.first_name, u.last_name, u.status, r.role_name
       FROM users u JOIN roles r ON u.role_id = r.role_id WHERE u.user_id = $1`,
      [assigned_io_id]
    );
    if (user.rows.length === 0) return res.status(404).json({ success: false, message: "User not found" });
    if (user.rows[0].role_name !== "Investigator") return res.status(400).json({ success: false, message: "Selected user is not an Investigator" });
    if (user.rows[0].status === "locked") return res.status(400).json({ success: false, message: "Cannot assign a locked account" });

    const result = await pool.query(
      `UPDATE cases SET assigned_io_id = $1, updated_at = NOW()
       WHERE id = $2 RETURNING id, case_number, assigned_io_id, updated_at`,
      [assigned_io_id, id]
    );

    const io = user.rows[0];
    return res.status(200).json({
      success: true,
      message: "Investigator assigned successfully",
      data: { ...result.rows[0], assigned_io_name: `${io.first_name} ${io.last_name}` },
    });
  } catch (error) {
    console.error("Assign investigator error:", error);
    res.status(500).json({ success: false, message: "Error assigning investigator" });
  }
};

// PATCH /cases/:id/status — Admin + Investigator
const updateStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const allowed = ["Under Investigation", "Solved", "Cleared"];
    if (!status || !allowed.includes(status)) return res.status(400).json({ success: false, message: "Invalid status value" });

    const caseResult = await pool.query("SELECT * FROM cases WHERE id = $1", [id]);
    if (caseResult.rows.length === 0) return res.status(404).json({ success: false, message: "Case not found" });

    if (req.user.role === "Investigator" && caseResult.rows[0].assigned_io_id !== req.user.user_id) {
      return res.status(403).json({ success: false, message: "You are not assigned to this case" });
    }

    const result = await pool.query(
      `UPDATE cases SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING id, case_number, status, updated_at, blotter_id`,
      [status, id]
    );

const blotterStatusMap = {
  'Under Investigation': 'Under Investigation',
  'Solved': 'Solved',
  'Cleared': 'Cleared',
};
await pool.query(
  `UPDATE blotter_entries SET status = $1 WHERE blotter_id = $2`,
  [blotterStatusMap[status], result.rows[0].blotter_id]
);

return res.status(200).json({ success: true, message: "Case status updated successfully", data: result.rows[0] });
  } catch (error) {
    console.error("Update status error:", error);
    res.status(500).json({ success: false, message: "Error updating status" });
  }
};

// GET /cases — All roles, filtered
const getCases = async (req, res) => {
  try {
    const { status, priority, date_from, date_to } = req.query;
    const role = req.user.role;
    const userId = req.user.user_id;

    let whereConditions = [];
    let params = [];
    let paramCount = 1;

    // Role-based filtering
    // Role-based filtering
if (role === "Investigator") {
  whereConditions.push(`c.assigned_io_id = $${paramCount++}`);
  params.push(userId);
} else if (role === "Patrol") {
  return res.status(200).json({ success: true, data: [] });
} else if (role === "Barangay") {
  // ✅ Barangay users can't access Case Management at all
  return res.status(200).json({ success: true, data: [] });
}

    if (status) { whereConditions.push(`c.status = $${paramCount++}`); params.push(status); }
    if (priority) { whereConditions.push(`c.priority = $${paramCount++}`); params.push(priority); }
    if (date_from) { whereConditions.push(`c.created_at >= $${paramCount++}`); params.push(date_from); }
    if (date_to) { whereConditions.push(`c.created_at <= $${paramCount++}`); params.push(date_to); }

    const where = whereConditions.length > 0 ? `WHERE ${whereConditions.join(" AND ")}` : "";

    const result = await pool.query(
  `SELECT c.id, c.case_number, c.status, c.priority, c.created_at, c.updated_at,
    c.assigned_io_id,
    CONCAT(u.first_name, ' ', u.last_name) AS assigned_io_name,
   b.incident_type,
    b.place_barangay AS barangay,
    b.blotter_entry_number,
    CONCAT(b.place_city_municipality, ', ', b.place_district_province) AS location
 FROM cases c
   LEFT JOIN users u ON c.assigned_io_id = u.user_id
   LEFT JOIN blotter_entries b ON c.blotter_id = b.blotter_id
   ${where}
   ORDER BY 
     CASE c.priority 
       WHEN 'High' THEN 1 
       WHEN 'Medium' THEN 2 
       WHEN 'Low' THEN 3 
       ELSE 4 
     END,
     CASE c.status 
       WHEN 'Under Investigation' THEN 1 
       WHEN 'Cleared' THEN 2 
       WHEN 'Solved' THEN 3 
       ELSE 4 
     END,
     c.created_at DESC`,
  params
);

    return res.status(200).json({ success: true, data: result.rows });
  } catch (error) {
    console.error("Get cases error:", error);
    res.status(500).json({ success: false, message: "Error fetching cases" });
  }
};

// GET /cases/statistics — Admin only
const getStatistics = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
        COUNT(*) AS total_cases,
        COUNT(*) FILTER (WHERE status = 'Under Investigation') AS active_cases,
        COUNT(*) FILTER (WHERE status = 'Solved') AS solved_cases,
        COUNT(*) FILTER (WHERE status = 'Cleared') AS cleared_cases,
        COUNT(*) FILTER (WHERE status = 'Referred') AS referred_cases,
        COUNT(*) FILTER (WHERE assigned_io_id IS NULL) AS unassigned_cases,
        COUNT(*) FILTER (WHERE priority = 'High') AS high_priority_cases
       FROM cases`
    );

    const row = result.rows[0];
    return res.status(200).json({
      success: true,
      data: {
        total_cases: parseInt(row.total_cases) || 0,
        active_cases: parseInt(row.active_cases) || 0,
        solved_cases: parseInt(row.solved_cases) || 0,
        cleared_cases: parseInt(row.cleared_cases) || 0,
        referred_cases: parseInt(row.referred_cases) || 0,
        unassigned_cases: parseInt(row.unassigned_cases) || 0,
        high_priority_cases: parseInt(row.high_priority_cases) || 0,
      },
    });
  } catch (error) {
    console.error("Statistics error:", error);
    res.status(500).json({ success: false, message: "Error fetching statistics" });
  }
};

// GET /cases/:id — Single case with notes
const getCaseById = async (req, res) => {
  try {
    const { id } = req.params;
    const role = req.user.role;
    const userId = req.user.user_id;

    const caseResult = await pool.query(
      `SELECT c.*, 
              CONCAT(u.first_name, ' ', u.last_name) AS assigned_io_name,
              b.incident_type, b.place_barangay AS barangay,
              b.narrative, b.status AS blotter_status,
              CONCAT(b.place_city_municipality, ', ', b.place_district_province) AS location
       FROM cases c
       LEFT JOIN users u ON c.assigned_io_id = u.user_id
       LEFT JOIN blotter_entries b ON c.blotter_id = b.blotter_id
       WHERE c.id = $1`,
      [id]
    );

    if (caseResult.rows.length === 0) return res.status(404).json({ success: false, message: "Case not found" });

    const theCase = caseResult.rows[0];

    // Permission check
    if (role === "Investigator" && theCase.assigned_io_id !== userId) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }
    if (role === "Barangay") {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    // Get notes
    const notes = await pool.query(
      `SELECT cn.id, cn.note, cn.created_at,
              CONCAT(u.first_name, ' ', u.last_name) AS added_by_name
       FROM case_notes cn
       JOIN users u ON cn.added_by_id = u.user_id
       WHERE cn.case_id = $1 ORDER BY cn.created_at DESC`,
      [id]
    );

    return res.status(200).json({ success: true, data: { ...theCase, notes: notes.rows } });
  } catch (error) {
    console.error("Get case error:", error);
    res.status(500).json({ success: false, message: "Error fetching case" });
  }
};

// POST /cases/:id/notes — Admin + Investigator
const addNote = async (req, res) => {
  try {
    const { id } = req.params;
    const { note } = req.body;

    if (!note || note.trim().length < 3) return res.status(400).json({ success: false, message: "Note must be at least 3 characters" });

    const caseResult = await pool.query("SELECT * FROM cases WHERE id = $1", [id]);
    if (caseResult.rows.length === 0) return res.status(404).json({ success: false, message: "Case not found" });

    if (req.user.role === "Investigator" && caseResult.rows[0].assigned_io_id !== req.user.user_id) {
      return res.status(403).json({ success: false, message: "You are not assigned to this case" });
    }

    const result = await pool.query(
      `INSERT INTO case_notes (case_id, note, added_by_id)
       VALUES ($1, $2, $3)
       RETURNING id, case_id, note, created_at`,
      [id, note.trim(), req.user.user_id]
    );

    const user = await pool.query(
      "SELECT CONCAT(first_name, ' ', last_name) AS name FROM users WHERE user_id = $1",
      [req.user.user_id]
    );

    return res.status(201).json({
      success: true,
      message: "Note added successfully",
      data: { ...result.rows[0], added_by_name: user.rows[0].name },
    });
  } catch (error) {
    console.error("Add note error:", error);
    res.status(500).json({ success: false, message: "Error adding note" });
  }
};

const updatePriority = async (req, res) => {
  try {
    const { id } = req.params;
    const { priority } = req.body;
    if (!['Low', 'Medium', 'High'].includes(priority)) {
      return res.status(400).json({ success: false, message: 'Invalid priority' });
    }
    const result = await pool.query(
      'UPDATE cases SET priority = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [priority, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Case not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { createCase, assignInvestigator, updateStatus, updatePriority, getCases, getCaseById, addNote, getStatistics };