import React, { useState, useEffect, useCallback } from "react";
import "./AuditLog.css";

const ITEMS_PER_PAGE = 15;
const API_URL = import.meta.env.VITE_API_URL;

const DEFAULT_FILTERS = {
  searchTerm:   "",
  statusFilter: "all",
  dateFrom:     "",
  dateTo:       "",
};

// =====================================================
// ICON COMPONENTS
// =====================================================
const ExportIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2.2"
    strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="7 10 12 15 17 10"/>
    <line x1="12" y1="15" x2="12" y2="3"/>
  </svg>
);

const RefreshIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2.2"
    strokeLinecap="round" strokeLinejoin="round">
    <polyline points="1 4 1 10 7 10"/>
    <path d="M3.51 15a9 9 0 1 0 .49-3.24"/>
  </svg>
);

// =====================================================
// MAIN COMPONENT
// =====================================================
const AuditLog = () => {
  const [logs, setLogs]             = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState("");
  const [pagination, setPagination] = useState({
    total: 0, page: 1, limit: ITEMS_PER_PAGE, totalPages: 1,
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [stats, setStats]             = useState({ total: 0, today: 0, uniqueUsers: 0, failed: 0 });

  const [draft, setDraft]                   = useState({ ...DEFAULT_FILTERS });
  const [appliedFilters, setAppliedFilters] = useState({ ...DEFAULT_FILTERS });

  const isDirty = JSON.stringify(draft) !== JSON.stringify(appliedFilters);

  // ===================================================
  // FETCH LOGS
  // ===================================================
  const fetchLogs = useCallback(async (page = 1) => {
    try {
      setLoading(true);
      const token = localStorage.getItem("token");
      const params = new URLSearchParams();
      params.set("page", page);
      params.set("limit", ITEMS_PER_PAGE);

      if (appliedFilters.searchTerm.trim())
        params.set("search", appliedFilters.searchTerm.trim());
      if (appliedFilters.statusFilter !== "all")
        params.set("status", appliedFilters.statusFilter);
      if (appliedFilters.dateFrom)
        params.set("dateFrom", appliedFilters.dateFrom);
      if (appliedFilters.dateTo)
        params.set("dateTo", appliedFilters.dateTo);

      const res = await fetch(`${API_URL}/audit-log?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
        setPagination(data.pagination || {
          total: 0, page: 1, limit: ITEMS_PER_PAGE, totalPages: 1,
        });
        setStats(data.stats || { total: 0, today: 0, uniqueUsers: 0, failed: 0 });
        setError("");
      } else {
        setError("Failed to fetch audit logs.");
      }
    } catch (err) {
      console.error("Error fetching audit logs:", err);
      setError("Error connecting to server.");
    } finally {
      setLoading(false);
    }
  }, [appliedFilters]);

  useEffect(() => {
    setCurrentPage(1);
    fetchLogs(1);
  }, [appliedFilters]);

  // ===================================================
  // FILTER HANDLERS
  // ===================================================
  const handleApplyFilters = () => {
    setCurrentPage(1);
    setAppliedFilters({ ...draft });
  };

  const handleResetFilters = () => {
    setDraft({ ...DEFAULT_FILTERS });
    setAppliedFilters({ ...DEFAULT_FILTERS });
    setCurrentPage(1);
  };

  const handlePageChange = (page) => {
    setCurrentPage(page);
    fetchLogs(page);
  };

  // ===================================================
  // EXPORT CSV
  // ===================================================
  const handleExportCSV = () => {
    const cols = ["log_id", "username", "email", "event_name", "description", "status", "source", "ip_address", "created_at"];
    const rows = logs.map(r =>
      [
        r.log_id,
        r.username   || "",
        r.email      || "",
        r.event_name,
        `"${(r.description || "").replace(/"/g, '""')}"`,
        r.status,
        r.source     || "",
        r.ip_address || "",
        r.created_at,
      ].join(",")
    );
    const csv = [cols.join(","), ...rows].join("\n");
    const a = document.createElement("a");
    a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
    a.download = `audit_log_page${currentPage}.csv`;
    a.click();
  };

  // ===================================================
  // HELPERS
  // ===================================================
  const formatDate = (dateString) => {
    if (!dateString) return "—";
    const d     = new Date(dateString);
    const day   = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year  = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, "0");
    const mins  = String(d.getMinutes()).padStart(2, "0");
    return `${day}/${month}/${year} ${hours}:${mins}`;
  };

  // ===================================================
  // RENDER
  // ===================================================
  return (
    <div className="al-content-area">

      {/* Page header */}
      <div className="al-page-header">
        <div className="al-page-header-left">
          <h1>Audit Log</h1>
          <p>Track all system activity — who did what, and when</p>
        </div>
        <div className="al-header-actions">
          <button className="al-btn al-btn-secondary" onClick={() => fetchLogs(currentPage)}>
            <RefreshIcon /> Refresh
          </button>
          <button className="al-btn al-btn-primary" onClick={handleExportCSV}>
            <ExportIcon /> Export CSV
          </button>
        </div>
      </div>

      {/* Summary stats */}
      <div className="al-stats-grid">
        <div className="al-stat-card">
          <div className="al-stat-label">Total logs</div>
          <div className="al-stat-value">{stats.total.toLocaleString()}</div>
          <div className="al-stat-sub">all time</div>
        </div>
        <div className="al-stat-card">
          <div className="al-stat-label">Today</div>
          <div className="al-stat-value">{stats.today.toLocaleString()}</div>
          <div className="al-stat-sub">entries today</div>
        </div>
        <div className="al-stat-card">
          <div className="al-stat-label">Active users</div>
          <div className="al-stat-value">{stats.uniqueUsers.toLocaleString()}</div>
          <div className="al-stat-sub">unique users logged</div>
        </div>
        <div className="al-stat-card">
          <div className="al-stat-label">Failed attempts</div>
          <div className="al-stat-value al-stat-danger">{stats.failed.toLocaleString()}</div>
          <div className="al-stat-sub">failed events total</div>
        </div>
      </div>

      {/* Filter bar */}
      <div className="al-filter-bar">
        <div className="al-filter-fields">

          <div className="al-filter-group">
            <label className="al-filter-label">Search</label>
            <input
              type="text"
              className="al-filter-input"
              placeholder="Username, description, IP..."
              value={draft.searchTerm}
              onChange={(e) => setDraft(f => ({ ...f, searchTerm: e.target.value }))}
              onKeyDown={(e) => { if (e.key === "Enter") handleApplyFilters(); }}
            />
          </div>

          <div className="al-filter-group">
            <label className="al-filter-label">Status</label>
            <select
              className="al-filter-input"
              value={draft.statusFilter}
              onChange={(e) => setDraft(f => ({ ...f, statusFilter: e.target.value }))}
            >
              <option value="all">All Status</option>
              <option value="success">Success</option>
              <option value="failed">Failed</option>
            </select>
          </div>

          <div className="al-filter-group">
            <label className="al-filter-label">Date from</label>
            <input
              type="date"
              className="al-filter-input"
              value={draft.dateFrom}
              onChange={(e) => setDraft(f => ({ ...f, dateFrom: e.target.value }))}
            />
          </div>

          <div className="al-filter-group">
            <label className="al-filter-label">Date to</label>
            <input
              type="date"
              className="al-filter-input"
              value={draft.dateTo}
              onChange={(e) => setDraft(f => ({ ...f, dateTo: e.target.value }))}
            />
          </div>

        </div>

        <div className="al-filter-actions">
          <button
            className={`al-apply-btn${isDirty ? " al-apply-btn-dirty" : ""}`}
            onClick={handleApplyFilters}
          >
            Apply Filters
          </button>
          <button className="al-reset-btn" onClick={handleResetFilters} title="Reset to defaults">
            ↺
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="al-table-card">
        {error && <div className="al-error-message">{error}</div>}

        {loading ? (
          <div className="al-loading-message">Loading audit logs...</div>
        ) : (
          <>
            <div className="al-table-container">
              <table className="al-data-table">
                <thead>
                  <tr>
                    <th className="al-col-id">Log ID</th>
                    <th className="al-col-user">User</th>
                    <th className="al-col-event">Event</th>
                    <th className="al-col-desc">Description</th>
                    <th className="al-col-status">Status</th>
                    {/* <th className="al-col-source">Source</th> */}
                    <th className="al-col-ip">IP Address</th>
                    <th className="al-col-time">Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ textAlign: "center", padding: "40px", color: "#6c757d" }}>
                        No audit log entries match your filters.
                      </td>
                    </tr>
                  ) : (
                    logs.map((log) => (
                      <tr key={log.log_id}>

                        {/* Log ID */}
                        <td className="al-col-id">
                          <span className="al-log-id">#{log.log_id.slice(0, 8)}</span>
                        </td>

                        {/* User — plain text, no avatar */}
                        <td className="al-col-user">
                          <div className="al-user-name">{log.username || "—"}</div>
                          {log.email && (
                            <div className="al-user-email">{log.email}</div>
                          )}
                        </td>

                        {/* Event name */}
                        <td className="al-col-event">
                          <span className="al-event-badge">{log.event_name}</span>
                        </td>

                        {/* Description */}
                        <td className="al-col-desc">
                          <span className="al-description">{log.description}</span>
                        </td>

                        {/* Status */}
                        <td className="al-col-status">
                          <span className={`al-status-badge ${log.status === "success" ? "al-status-success" : "al-status-failed"}`}>
                            {log.status}
                          </span>
                        </td>

                        {/* Source */}
                        {/* <td className="al-col-source">
                          <span className="al-source">{log.source || "—"}</span>
                        </td> */}

                        {/* IP */}
                        <td className="al-col-ip">
                          <span className="al-ip-address">{log.ip_address || "—"}</span>
                        </td>

                        {/* Timestamp — DD/MM/YYYY HH:MM */}
                        <td className="al-col-time">
                          <span className="al-timestamp">{formatDate(log.created_at)}</span>
                        </td>

                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pagination.total > 0 && (
              <div className="al-pagination">
                <div className="al-pagination-info">
                  Showing {(pagination.page - 1) * pagination.limit + 1}–
                  {Math.min(pagination.page * pagination.limit, pagination.total)}{" "}
                  of {pagination.total} entries
                </div>
                <div className="al-pagination-controls">
                  <button
                    className="al-pagination-btn"
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                  >
                    Previous
                  </button>
                  <span className="al-pagination-current">
                    Page {currentPage} of {pagination.totalPages}
                  </span>
                  <button
                    className="al-pagination-btn"
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === pagination.totalPages}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default AuditLog;