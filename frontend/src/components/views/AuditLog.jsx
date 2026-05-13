import React, { useState, useEffect, useCallback } from "react";
import "./AuditLog.css";

const ITEMS_PER_PAGE = 15;
const API_URL = import.meta.env.VITE_API_URL;

const ACTION_BADGE_CLASS = {
  INSERT: "al-action-insert",
  UPDATE: "al-action-update",
  DELETE: "al-action-delete",
  LOGIN:  "al-action-login",
  LOGOUT: "al-action-logout",
  VIEW:   "al-action-view",
};

const DEFAULT_FILTERS = {
  searchTerm:   "",
  actionFilter: "all",
  moduleFilter: "all",
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
  const [stats, setStats]             = useState({ total: 0, today: 0, uniqueUsers: 0, deletions: 0 });

  const [draft, setDraft]                 = useState({ ...DEFAULT_FILTERS });
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
      if (appliedFilters.actionFilter !== "all")
        params.set("action", appliedFilters.actionFilter);
      if (appliedFilters.moduleFilter !== "all")
        params.set("module", appliedFilters.moduleFilter);
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
        setStats(data.stats || { total: 0, today: 0, uniqueUsers: 0, deletions: 0 });
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
    const cols = ["log_id","username","action","module","record_id","record_label","ip_address","created_at"];
    const rows = logs.map(r =>
      [r.log_id, r.username, r.action, r.module,
       r.record_id || "", r.record_label || "",
       r.ip_address || "", r.created_at].join(",")
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
  const getInitials = (firstName, lastName, username) => {
    if (firstName && lastName)
      return `${firstName[0]}${lastName[0]}`.toUpperCase();
    if (username) return username.substring(0, 2).toUpperCase();
    return "NA";
  };

  const formatDate = (dateString) => {
    if (!dateString) return "—";
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  };

  const getActionBadgeClass = (action) =>
    ACTION_BADGE_CLASS[action?.toUpperCase()] || "al-action-view";

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
          <div className="al-stat-label">Deletions</div>
          <div className="al-stat-value al-stat-danger">{stats.deletions.toLocaleString()}</div>
          <div className="al-stat-sub">delete actions total</div>
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
              placeholder="Username, record ID..."
              value={draft.searchTerm}
              onChange={(e) => setDraft(f => ({ ...f, searchTerm: e.target.value }))}
              onKeyDown={(e) => { if (e.key === "Enter") handleApplyFilters(); }}
            />
          </div>

          <div className="al-filter-group">
            <label className="al-filter-label">Action</label>
            <select
              className="al-filter-input"
              value={draft.actionFilter}
              onChange={(e) => setDraft(f => ({ ...f, actionFilter: e.target.value }))}
            >
              <option value="all">All Actions</option>
              <option value="INSERT">INSERT</option>
              <option value="UPDATE">UPDATE</option>
              <option value="DELETE">DELETE</option>
              <option value="LOGIN">LOGIN</option>
              <option value="LOGOUT">LOGOUT</option>
              <option value="VIEW">VIEW</option>
            </select>
          </div>

          <div className="al-filter-group">
            <label className="al-filter-label">Module</label>
            <select
              className="al-filter-input"
              value={draft.moduleFilter}
              onChange={(e) => setDraft(f => ({ ...f, moduleFilter: e.target.value }))}
            >
              <option value="all">All Modules</option>
              <option value="residents">residents</option>
              <option value="clearances">clearances</option>
              <option value="users">users</option>
              <option value="cctv">cctv</option>
              <option value="auth">auth</option>
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
                    <th className="al-col-action">Action</th>
                    <th className="al-col-module">Module</th>
                    <th className="al-col-record">Record</th>
                    <th className="al-col-ip">IP address</th>
                    <th className="al-col-time">Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: "center", padding: "40px" }}>
                        No audit log entries match your filters.
                      </td>
                    </tr>
                  ) : (
                    logs.map((log) => (
                      <tr key={log.log_id}>

                        {/* Log ID */}
                        <td className="al-col-id">
                          <span className="al-log-id">#{log.log_id}</span>
                        </td>

                        {/* User */}
                        <td className="al-col-user">
                          <div className="al-user-cell">
                            <div className="al-user-avatar">
                              {getInitials(log.first_name, log.last_name, log.username)}
                            </div>
                            <div className="al-user-info">
                              <div className="al-user-name">{log.username}</div>
                              <div className="al-user-email">{log.email || ""}</div>
                            </div>
                          </div>
                        </td>

                        {/* Action */}
                        <td className="al-col-action">
                          <span className={`al-action-badge ${getActionBadgeClass(log.action)}`}>
                            {log.action}
                          </span>
                        </td>

                        {/* Module */}
                        <td className="al-col-module">
                          <span className="al-module-badge">{log.module}</span>
                        </td>

                        {/* Record */}
                        <td className="al-col-record">
                          {log.record_id ? (
                            <>
                              <div className="al-record-id">{log.record_id}</div>
                              {log.record_label && (
                                <div className="al-record-label">{log.record_label}</div>
                              )}
                            </>
                          ) : (
                            <span className="al-no-record">—</span>
                          )}
                        </td>

                        {/* IP */}
                        <td className="al-col-ip">
                          <span className="al-ip-address">{log.ip_address || "—"}</span>
                        </td>

                        {/* Timestamp */}
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