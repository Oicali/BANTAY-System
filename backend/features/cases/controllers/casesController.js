// backend\features\cases\controllers\casesController.js

const pool = require("../../../config/database");
const { logAudit, getClientIp } = require("../../../shared/utils/auditLogger");
const { createNotification, notifyAllByRole } = require("../../notifications/notificationService");
// POST /cases — Admin only
const createCase = async (req, res) => {
  try {
    const { blotter_id } = req.body;
    if (!blotter_id)
      return res
        .status(400)
        .json({ success: false, message: "blotter_id is required" });

    const blotter = await pool.query(
      "SELECT blotter_id, incident_type, date_time_reported, date_time_commission FROM blotter_entries WHERE blotter_id = $1",
      [blotter_id],
    );
    if (blotter.rows.length === 0)
      return res
        .status(404)
        .json({ success: false, message: "Blotter not found" });

    const existing = await pool.query(
      "SELECT id FROM cases WHERE blotter_id = $1",
      [blotter_id],
    );
    if (existing.rows.length > 0)
      return res.status(409).json({
        success: false,
        message: "A case already exists for this blotter",
      });

    const year = new Date().getFullYear();
    const countResult = await pool.query(
      "SELECT COUNT(*) FROM cases WHERE EXTRACT(YEAR FROM created_at) = $1",
      [year],
    );
    const count = parseInt(countResult.rows[0].count) + 1;
    const case_number = `CASE-${year}-${String(count).padStart(4, "0")}`;

    const reportedDate =
      blotter.rows[0].date_time_reported ||
      blotter.rows[0].date_time_commission;
    const blotterYear = reportedDate
      ? new Date(reportedDate).getFullYear()
      : new Date().getFullYear();
    const currentYear = new Date().getFullYear();
    const incidentType = (blotter.rows[0].incident_type || "")
      .toLowerCase()
      .trim();

    let autoPriority = "Low";
    if (blotterYear === currentYear) {
      const highCrimes = [
        "murder",
        "homicide",
        "rape",
        "special complex crime",
      ];
      const mediumCrimes = ["robbery", "carnapping - mc", "carnapping - mv"];

      if (highCrimes.includes(incidentType)) {
        autoPriority = "High";
      } else if (mediumCrimes.includes(incidentType)) {
        autoPriority = "Medium";
      }
    }

    const result = await pool.query(
      `INSERT INTO cases (blotter_id, case_number, created_by, priority)
   VALUES ($1, $2, $3, $4)
   RETURNING id, case_number, blotter_id, status, priority, created_by, created_at`,
      [blotter_id, case_number, req.user.user_id, autoPriority],
    );

    await logAudit({
      userId: req.user?.user_id,
      username: req.user?.username,
      eventName: "Case Created",
      description: `Created case ${case_number} from blotter ID ${blotter_id}`,
      action: "CREATE",
      status: "success",
      source: "Web Portal",
      ipAddress: getClientIp(req),
    });

    return res.status(201).json({
      success: true,
      message: "Case created successfully",
      data: result.rows[0],
    });
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

    const caseCheck = await pool.query("SELECT id FROM cases WHERE id = $1", [
      id,
    ]);
    if (caseCheck.rows.length === 0)
      return res
        .status(404)
        .json({ success: false, message: "Case not found" });

    // Allow unassigning by passing null or empty string
    if (!assigned_io_id || assigned_io_id === "") {
      const result = await pool.query(
        `UPDATE cases SET assigned_io_id = NULL, updated_at = NOW()
         WHERE id = $1 RETURNING id, case_number, assigned_io_id, updated_at`,
        [id],
      );

    await logAudit({
  userId: req.user?.user_id,
  username: req.user?.username,
  eventName: "Investigator Unassigned",
  description: `Unassigned investigator from case ID ${id}`,
  action: "UPDATE",
  status: "success",
  source: "Web Portal",
  ipAddress: getClientIp(req),
});
return res.status(200).json({
  success: true,
  message: "Investigator unassigned successfully",
  data: { ...result.rows[0], assigned_io_name: null },
});
    }

    const user = await pool.query(
      `SELECT u.user_id, u.first_name, u.last_name, u.status, r.role_name
       FROM users u JOIN roles r ON u.role_id = r.role_id WHERE u.user_id = $1`,
      [assigned_io_id],
    );
    if (user.rows.length === 0)
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    if (user.rows[0].role_name !== "Investigator")
      return res.status(400).json({
        success: false,
        message: "Selected user is not an Investigator",
      });
    if (user.rows[0].status === "locked")
      return res
        .status(400)
        .json({ success: false, message: "Cannot assign a locked account" });

    const result = await pool.query(
      `UPDATE cases SET assigned_io_id = $1, updated_at = NOW()
       WHERE id = $2 RETURNING id, case_number, assigned_io_id, updated_at`,
      [assigned_io_id, id],
    );
const blotterRef = await pool.query(
  `SELECT b.blotter_entry_number FROM cases c 
   JOIN blotter_entries b ON c.blotter_id = b.blotter_id 
   WHERE c.id = $1`,
  [id]
);
const blotterEntryNumber = blotterRef.rows[0]?.blotter_entry_number || result.rows[0].case_number;

    const io = user.rows[0];
    await logAudit({
      userId: req.user?.user_id,
      username: req.user?.username,
      eventName: "Investigator Assigned",
      description: `Assigned ${io.first_name} ${io.last_name} to case ID ${id}`,
      action: "UPDATE",
      status: "success",
      source: "Web Portal",
      ipAddress: getClientIp(req),
    });
    console.log("Sending notif to:", assigned_io_id, "type:", typeof assigned_io_id);
      await createNotification({
      recipientId: assigned_io_id,
      senderId: req.user.user_id,
      senderName: req.user.username,
      type: "CASE_ASSIGNED",
      title: "Case Assigned to You",
      message: `You have been assigned to ${blotterEntryNumber}`,
      linkTo: "/case-management",
    });
    return res.status(200).json({
      success: true,
      message: "Investigator assigned successfully",
      data: {
        ...result.rows[0],
        assigned_io_name: `${io.first_name} ${io.last_name}`,
      },
    });
    
  } catch (error) {
    console.error("Assign investigator error:", error);
    res
      .status(500)
      .json({ success: false, message: "Error assigning investigator" });
  }
};

// PATCH /cases/:id/status — Admin + Investigator
const updateStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const allowed = ["Under Investigation", "Solved", "Cleared"];
    if (!status || !allowed.includes(status))
      return res
        .status(400)
        .json({ success: false, message: "Invalid status value" });

    const caseResult = await pool.query("SELECT * FROM cases WHERE id = $1", [
      id,
    ]);
    if (caseResult.rows.length === 0)
      return res
        .status(404)
        .json({ success: false, message: "Case not found" });

    if (
      req.user.role === "Investigator" &&
      caseResult.rows[0].assigned_io_id !== req.user.user_id
    ) {
      return res
        .status(403)
        .json({ success: false, message: "You are not assigned to this case" });
    }

    const result = await pool.query(
      `UPDATE cases SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING id, case_number, status, updated_at, blotter_id`,
      [status, id],
    );

    const blotterStatusMap = {
      "Under Investigation": "Under Investigation",
      Solved: "Solved",
      Cleared: "Cleared",
    };
    const blotterUpdate = await pool.query(
  `UPDATE blotter_entries SET status = $1 WHERE blotter_id = $2 
   RETURNING blotter_entry_number`,
  [blotterStatusMap[status], result.rows[0].blotter_id],
);
const blotterEntryNumber = blotterUpdate.rows[0]?.blotter_entry_number || result.rows[0].case_number;
    await logAudit({
      userId: req.user?.user_id,
      username: req.user?.username,
      eventName: "Case Status Updated",
      description: `Case ID ${id} status has been changed to "${status}"`,
      action: "UPDATE",
      status: "success",
      source: "Web Portal",
      ipAddress: getClientIp(req),
    });
    // Notify the assigned investigator (only if someone is assigned)
const assignedIoId = caseResult.rows[0].assigned_io_id;
if (assignedIoId && assignedIoId !== req.user.user_id) {
  await createNotification({
    recipientId: assignedIoId,
    senderId: req.user.user_id,
    senderName: req.user.username,
    type: "CASE_ASSIGNED",
    title: "Case Status Updated",
    message: `${blotterEntryNumber} status changed to "${status}"`,
    linkTo: "/case-management",
  });
}
// Notify admins only when investigator changes it (exclude self)
if (req.user.role === "Investigator") {
  await notifyAllByRole(["Administrator", "Technical Administrator"], {
    senderId: req.user.user_id,
    senderName: req.user.username,
    type: "CASE_ASSIGNED",
    title: "Case Status Updated",
    message: `${req.user.username} updated ${blotterEntryNumber} to "${status}"`,
    linkTo: "/case-management",
  }, req.user.user_id);
}
    return res.status(200).json({
      success: true,
      message: "Case status updated successfully",
      data: result.rows[0],
    });
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

    if (status) {
      whereConditions.push(`c.status = $${paramCount++}`);
      params.push(status);
    }
    if (priority) {
      whereConditions.push(`c.priority = $${paramCount++}`);
      params.push(priority);
    }
    if (date_from) {
      whereConditions.push(`b.date_time_commission >= $${paramCount++}`);
      params.push(date_from);
    }
    if (date_to) {
      whereConditions.push(
        `b.date_time_commission < ($${paramCount++}::date + interval '1 day')`,
      );
      params.push(date_to);
    }

    const where =
      whereConditions.length > 0
        ? `WHERE ${whereConditions.join(" AND ")}`
        : "";

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
   INNER JOIN blotter_entries b ON c.blotter_id = b.blotter_id AND b.deleted_at IS NULL
${where}
   ORDER BY 
  CASE 
    WHEN c.priority = 'High' AND c.status = 'Under Investigation' THEN 1
    WHEN c.priority = 'Medium' AND c.status = 'Under Investigation' THEN 2
    WHEN c.priority = 'Low' AND c.status = 'Under Investigation' THEN 3
    WHEN c.priority = 'High' AND c.status = 'Cleared' THEN 4
    WHEN c.priority = 'Medium' AND c.status = 'Cleared' THEN 5
    WHEN c.priority = 'Low' AND c.status = 'Cleared' THEN 6
    WHEN c.priority = 'High' AND c.status = 'Solved' THEN 7
    WHEN c.priority = 'Medium' AND c.status = 'Solved' THEN 8
    WHEN c.priority = 'Low' AND c.status = 'Solved' THEN 9
    ELSE 10
  END,
  c.created_at DESC`,
      params,
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
    const { date_from, date_to, status, priority } = req.query;
    const conditions = ["b.deleted_at IS NULL"];
    const params = [];
    let p = 1;
    if (date_from) {
      conditions.push(`b.date_time_commission >= $${p++}`);
      params.push(date_from);
    }
    if (date_to) {
      conditions.push(
        `b.date_time_commission < ($${p++}::date + interval '1 day')`,
      );
      params.push(date_to);
    }
    if (status) {
      conditions.push(`c.status = $${p++}`);
      params.push(status);
    }
    if (priority) {
      conditions.push(`c.priority = $${p++}`);
      params.push(priority);
    }
    const where = "WHERE " + conditions.join(" AND ");
    const result = await pool.query(
      `SELECT
    COUNT(*) AS total_cases,
    COUNT(*) FILTER (WHERE c.status = 'Under Investigation') AS active_cases,
    COUNT(*) FILTER (WHERE c.status = 'Solved') AS solved_cases,
    COUNT(*) FILTER (WHERE c.status = 'Cleared') AS cleared_cases,
    COUNT(*) FILTER (WHERE c.status = 'Referred') AS referred_cases,
    COUNT(*) FILTER (WHERE c.assigned_io_id IS NULL) AS unassigned_cases,
    COUNT(*) FILTER (WHERE c.priority = 'High') AS high_priority_cases
   FROM cases c
   INNER JOIN blotter_entries b ON c.blotter_id = b.blotter_id
   ${where}`,
      params,
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
    res
      .status(500)
      .json({ success: false, message: "Error fetching statistics" });
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
          b.blotter_entry_number,
          CONCAT(b.place_city_municipality, ', ', b.place_district_province) AS location
   FROM cases c
       LEFT JOIN users u ON c.assigned_io_id = u.user_id
       LEFT JOIN blotter_entries b ON c.blotter_id = b.blotter_id
       WHERE c.id = $1`,
      [id],
    );

    if (caseResult.rows.length === 0)
      return res
        .status(404)
        .json({ success: false, message: "Case not found" });

    const theCase = caseResult.rows[0];

    // Permission check
    if (role === "Investigator" && theCase.assigned_io_id !== userId) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }
    if (role === "Barangay") {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    // Get notes
    const isAdmin = req.user.role === "Administrator";
    const notes = await pool.query(
      `SELECT cn.id, cn.note, cn.note_date,
to_char(cn.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
to_char(cn.edited_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS edited_at,
to_char(cn.deleted_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS deleted_at,
          cn.added_by_id,
          CONCAT(u.first_name, ' ', u.last_name) AS added_by_name
   FROM case_notes cn
   JOIN users u ON cn.added_by_id = u.user_id
   WHERE cn.case_id = $1 ${isAdmin ? "" : "AND cn.deleted_at IS NULL"}
   ORDER BY cn.created_at DESC`,
      [id],
    );

    return res
      .status(200)
      .json({ success: true, data: { ...theCase, notes: notes.rows } });
  } catch (error) {
    console.error("Get case error:", error);
    res.status(500).json({ success: false, message: "Error fetching case" });
  }
};

// POST /cases/:id/notes — Admin + Investigator
const addNote = async (req, res) => {
  try {
    const { id } = req.params;
    const { note, note_date } = req.body;
    if (!note || note.trim().length < 3)
      return res.status(400).json({
        success: false,
        message: "Note must be at least 3 characters",
      });

    const caseResult = await pool.query("SELECT * FROM cases WHERE id = $1", [
      id,
    ]);
    if (caseResult.rows.length === 0)
      return res
        .status(404)
        .json({ success: false, message: "Case not found" });

    if (
      req.user.role === "Investigator" &&
      caseResult.rows[0].assigned_io_id !== req.user.user_id
    )
      return res
        .status(403)
        .json({ success: false, message: "You are not assigned to this case" });

    const result = await pool.query(
      `INSERT INTO case_notes (case_id, note, added_by_id, note_date)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [id, note.trim(), req.user.user_id, note_date || new Date()],
    );

    const user = await pool.query(
      "SELECT CONCAT(first_name, ' ', last_name) AS name FROM users WHERE user_id = $1",
      [req.user.user_id],
    );

    await logAudit({
      userId: req.user?.user_id,
      username: req.user?.username,
      eventName: "Case Note Added",
      description: `Added note to case ID ${id}`,
      action: "CREATE",
      status: "success",
      source: "Web Portal",
      ipAddress: getClientIp(req),
    });
const theCase = caseResult.rows[0];
const blotterRow = await pool.query(
  `SELECT blotter_entry_number FROM blotter_entries WHERE blotter_id = $1`,
  [theCase.blotter_id]
);
const blotterEntryNumber = blotterRow.rows[0]?.blotter_entry_number || theCase.case_number;
const assignedIoId = theCase.assigned_io_id;

// Notify investigator if someone else added the note
if (assignedIoId && assignedIoId !== req.user.user_id) {
  await createNotification({
    recipientId: assignedIoId,
    senderId: req.user.user_id,
    senderName: req.user.username,
    type: "CASE_ASSIGNED",
    title: "New Note Added",
    message: `${req.user.username} added a note to ${blotterEntryNumber}`,
    linkTo: "/case-management",
  });
}
// Notify admins if investigator added the note
if (req.user.role === "Investigator") {
  await notifyAllByRole(["Administrator", "Technical Administrator"], {
    senderId: req.user.user_id,
    senderName: req.user.username,
    type: "CASE_ASSIGNED",
    title: "New Note Added",
    message: `${req.user.username} added a note to ${blotterEntryNumber}`,
    linkTo: "/case-management",
  }, req.user.user_id);
}
    return res.status(201).json({
      success: true,
      message: "Note added",
      data: { ...result.rows[0], added_by_name: user.rows[0].name },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Error adding note" });
  }
};

const updatePriority = async (req, res) => {
  try {
    const { id } = req.params;
    const { priority } = req.body;
    if (!["Low", "Medium", "High"].includes(priority))
      return res
        .status(400)
        .json({ success: false, message: "Invalid priority" });

    // ADD THIS:
    const caseResult = await pool.query("SELECT * FROM cases WHERE id = $1", [
      id,
    ]);
    if (caseResult.rows.length === 0)
      return res
        .status(404)
        .json({ success: false, message: "Case not found" });
    if (
      req.user.role === "Investigator" &&
      caseResult.rows[0].assigned_io_id !== req.user.user_id
    )
      return res
        .status(403)
        .json({ success: false, message: "You are not assigned to this case" });

    const result = await pool.query(
      "UPDATE cases SET priority = $1, updated_at = NOW() WHERE id = $2 RETURNING *",
      [priority, id],
    );
    await logAudit({
      userId: req.user?.user_id,
      username: req.user?.username,
      eventName: "Case Priority Updated",
      description: `Updated case ID ${id} priority to "${priority}"`,
      action: "UPDATE",
      status: "success",
      source: "Web Portal",
      ipAddress: getClientIp(req),
    });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const editNote = async (req, res) => {
  try {
    const { noteId } = req.params;
    const { note, note_date } = req.body;
    if (!note || note.trim().length < 3)
      return res
        .status(400)
        .json({ success: false, message: "Note too short" });

    const existing = await pool.query(
      "SELECT * FROM case_notes WHERE id = $1 AND deleted_at IS NULL",
      [noteId],
    );
    if (existing.rows.length === 0)
      return res
        .status(404)
        .json({ success: false, message: "Note not found" });

    if (
      req.user.role === "Investigator" &&
      existing.rows[0].added_by_id !== req.user.user_id
    )
      return res
        .status(403)
        .json({ success: false, message: "Cannot edit others' notes" });

    const result = await pool.query(
      `UPDATE case_notes SET note = $1, edited_at = NOW()
   WHERE id = $2 RETURNING *`,
      [note.trim(), noteId],
    );
    await logAudit({
      userId: req.user?.user_id,
      username: req.user?.username,
      eventName: "Case Note Edited",
      description: `Edited note ID ${noteId}`,
      action: "UPDATE",
      status: "success",
      source: "Web Portal",
      ipAddress: getClientIp(req),
    });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const deleteNote = async (req, res) => {
  try {
    const { noteId } = req.params;
    const existing = await pool.query(
      "SELECT * FROM case_notes WHERE id = $1 AND deleted_at IS NULL",
      [noteId],
    );
    if (existing.rows.length === 0)
      return res
        .status(404)
        .json({ success: false, message: "Note not found" });

    if (
      req.user.role === "Investigator" &&
      existing.rows[0].added_by_id !== req.user.user_id
    )
      return res
        .status(403)
        .json({ success: false, message: "Cannot delete others' notes" });

    await pool.query("UPDATE case_notes SET deleted_at = NOW() WHERE id = $1", [
      noteId,
    ]);

    await logAudit({
      userId: req.user?.user_id,
      username: req.user?.username,
      eventName: "Case Note Deleted",
      description: `Soft-deleted note ID ${noteId}`,
      action: "DELETE",
      status: "success",
      source: "Web Portal",
      ipAddress: getClientIp(req),
    });
    res.json({ success: true, message: "Note deleted" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const restoreNote = async (req, res) => {
  try {
    const { noteId } = req.params;
    const existing = await pool.query(
      "SELECT * FROM case_notes WHERE id = $1 AND deleted_at IS NOT NULL",
      [noteId],
    );
    if (existing.rows.length === 0)
      return res
        .status(404)
        .json({ success: false, message: "Note not found or not deleted" });

    await pool.query("UPDATE case_notes SET deleted_at = NULL WHERE id = $1", [
      noteId,
    ]);
    await logAudit({
      userId: req.user?.user_id,
      username: req.user?.username,
      eventName: "Case Note Restored",
      description: `Restored note ID ${noteId}`,
      action: "UPDATE",
      status: "success",
      source: "Web Portal",
      ipAddress: getClientIp(req),
    });
    res.json({ success: true, message: "Note restored" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = {
  createCase,
  assignInvestigator,
  updateStatus,
  updatePriority,
  getCases,
  getCaseById,
  addNote,
  editNote,
  deleteNote,
  restoreNote,
  getStatistics,
};
