// ================================================================================
// FILE: backend/features/audit/controllers/auditController.js
// ================================================================================

const pool = require("../../../config/database");

const getAuditLogs = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 15);
    const offset = (page - 1) * limit;

    const { search, action, status, dateFrom, dateTo } = req.query;

    const RESTRICTED_ROLES = ["Brgy. Captain", "Brgy. Official","Investigator", "Patrol"];
    const isRestricted = RESTRICTED_ROLES.includes(req.user.role);

    // ── Build WHERE clauses dynamically ──
    const conditions = [];
    const values = [];

    if (isRestricted) {
      values.push(req.user.user_id);
      conditions.push(`al.user_id = $${values.length}`);
    }

    if (search?.trim()) {
      values.push(`%${search.trim()}%`);
      conditions.push(`(
        al.username    ILIKE $${values.length} OR
        al.ip_address  ILIKE $${values.length} OR
        al.description ILIKE $${values.length} OR
        al.event_name  ILIKE $${values.length}
      )`);
    }

    if (action && action !== "all") {
      values.push(action.toUpperCase());
      conditions.push(`al.action = $${values.length}`);
    }

    if (status && status !== "all") {
      values.push(status.toLowerCase());
      conditions.push(`al.status = $${values.length}`);
    }

    if (dateFrom) {
      values.push(dateFrom);
      conditions.push(`al.created_at >= $${values.length}::date`);
    }

    if (dateTo) {
      values.push(dateTo);
      conditions.push(
        `al.created_at < ($${values.length}::date + INTERVAL '1 day')`,
      );
    }

    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // ── Count query ──
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM audit_logs al ${where}`,
      values,
    );
    const total = parseInt(countResult.rows[0].count);

    // ── Data query ──
    // ── Data query ──
    const dataResult = await pool.query(
      `SELECT
     al.log_id,
     al.user_id,
     al.username,
     al.event_name,
     al.description,
     al.action,
     al.status,
     al.source,
     al.ip_address,
     al.created_at,
     u.first_name,
     u.last_name,
     u.suffix,
     r.role_name,
     pr.abbreviation AS rank_abbr
   FROM audit_logs al
   LEFT JOIN users u        ON al.user_id = u.user_id
   LEFT JOIN roles r        ON u.role_id  = r.role_id
   LEFT JOIN pnp_ranks pr   ON u.rank_id  = pr.rank_id
   ${where}
   ORDER BY al.created_at DESC
   LIMIT $${values.length + 1}
   OFFSET $${values.length + 2}`,
      [...values, limit, offset],
    );

    // ── Stats (unfiltered totals — always reflects full table) ──
    // ── Stats ──
    const statsResult = await pool.query(
      isRestricted
        ? `SELECT
         COUNT(*)                                            AS total,
         COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE) AS today,
         COUNT(DISTINCT user_id)                            AS unique_users,
         COUNT(*) FILTER (WHERE status = 'failed')          AS failed
       FROM audit_logs
       WHERE user_id = $1`
        : `SELECT
         COUNT(*)                                            AS total,
         COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE) AS today,
         COUNT(DISTINCT user_id)                            AS unique_users,
         COUNT(*) FILTER (WHERE status = 'failed')          AS failed
       FROM audit_logs`,
      isRestricted ? [req.user.user_id] : [],
    );
    const s = statsResult.rows[0];

    const logs = dataResult.rows.map((row) => {
      let displayName = row.username; // fallback if no user record

      if (row.first_name) {
        const parts = [
          row.rank_abbr ? `${row.rank_abbr}.` : "",
          row.first_name || "",
          row.last_name || "",
          row.suffix || "",
        ].filter(Boolean);

        const full = parts.join(" ");
        displayName = full.length > 18 ? full.slice(0, 18) + "…" : full;
      }

      return {
        ...row,
        display_name: displayName,
        role_name: row.role_name || "—",
      };
    });
    return res.status(200).json({
      logs, // ← was: dataResult.rows
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
      stats: {
        total: parseInt(s.total),
        today: parseInt(s.today),
        uniqueUsers: parseInt(s.unique_users),
        failed: parseInt(s.failed), // ✅ matches frontend key
      },
    });
  } catch (err) {
    console.error("Audit log fetch error:", err);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch audit logs" });
  }
};

module.exports = { getAuditLogs };
