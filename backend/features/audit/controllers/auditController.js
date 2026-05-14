// ================================================================================
// FILE: backend/features/audit/controllers/auditController.js
// ================================================================================

const pool = require("../../../config/database");

const getAuditLogs = async (req, res) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(100, parseInt(req.query.limit) || 15);
    const offset = (page - 1) * limit;

    const { search, action, status, dateFrom, dateTo } = req.query;

    // ── Build WHERE clauses dynamically ──
    const conditions = [];
    const values     = [];

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
      conditions.push(`al.created_at < ($${values.length}::date + INTERVAL '1 day')`);
    }

    const where = conditions.length > 0
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

    // ── Count query ──
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM audit_logs al ${where}`,
      values
    );
    const total = parseInt(countResult.rows[0].count);

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
         u.email
       FROM audit_logs al
       LEFT JOIN users u ON al.user_id = u.user_id
       ${where}
       ORDER BY al.created_at DESC
       LIMIT $${values.length + 1}
       OFFSET $${values.length + 2}`,
      [...values, limit, offset]
    );

    // ── Stats (unfiltered totals — always reflects full table) ──
    const statsResult = await pool.query(`
      SELECT
        COUNT(*)                                           AS total,
        COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE) AS today,
        COUNT(DISTINCT user_id)                            AS unique_users,
        COUNT(*) FILTER (WHERE status = 'failed')          AS failed
      FROM audit_logs
    `);
    const s = statsResult.rows[0];

    return res.status(200).json({
      logs: dataResult.rows,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
      stats: {
        total:       parseInt(s.total),
        today:       parseInt(s.today),
        uniqueUsers: parseInt(s.unique_users),
        failed:      parseInt(s.failed),   // ✅ matches frontend key
      },
    });
  } catch (err) {
    console.error("Audit log fetch error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch audit logs" });
  }
};

module.exports = { getAuditLogs };