// frontend\src\components\views\AuditLog.jsx

import React, { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import "./AuditLog.css";
import LoadingModal from "../modals/LoadingModal";

const ITEMS_PER_PAGE = 15;
const API_URL = import.meta.env.VITE_API_URL;
const getToday = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const addDays = (dateStr, days) => {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const DEFAULT_FILTERS = {
  searchTerm: "",
  statusFilter: "all",
  dateFrom: addDays(getToday(), -364),
  dateTo: getToday(),
};

// =====================================================
// ICON COMPONENTS
// =====================================================
const ExportIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

const RefreshIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="1 4 1 10 7 10" />
    <path d="M3.51 15a9 9 0 1 0 .49-3.24" />
  </svg>
);

// =====================================================
// EXPORT PREVIEW MODAL (matches PdfPreviewModal styling)
// =====================================================
const ExportPreviewModal = ({ preview, onDownload, onClose, formatDate }) => {
  const PREVIEW_LIMIT = 20;
  const previewRows = preview.rows.slice(0, PREVIEW_LIMIT);

  // Keyboard dismiss
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1400,
        background: "rgba(10,22,40,0.72)",
        backdropFilter: "blur(4px)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
      }}
      onClick={onClose}
    >
      {/* Modal shell */}
      <div
        style={{
          background: "#fff",
          borderRadius: "14px",
          boxShadow: "0 24px 64px rgba(0,0,0,0.35)",
          display: "flex",
          flexDirection: "column",
          width: "min(1100px, 96vw)",
          height: "min(94vh, 1000px)",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Toolbar */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: "12px",
            padding: "20px 20px 16px",
            background: "linear-gradient(135deg, #1e3a5f 0%, #0a1628 100%)",
            color: "#fff",
            flexShrink: 0,
          }}
        >
          {/* Icon badge */}
          <div
            style={{
              width: "38px",
              height: "38px",
              background: "rgba(255,255,255,0.15)",
              borderRadius: "9px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#fff"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
          </div>

          {/* Title + subtitle */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                margin: "0 0 3px",
                fontSize: "17px",
                fontWeight: 700,
                color: "#fff",
                lineHeight: 1.3,
              }}
            >
              Export Preview
            </div>
            <div
              style={{
                margin: 0,
                fontSize: "12.5px",
                color: "rgba(255,255,255,0.72)",
                lineHeight: 1.4,
              }}
            >
              {preview.filename} · {preview.total} record
              {preview.total !== 1 ? "s" : ""} total
              {preview.total > PREVIEW_LIMIT &&
                ` · showing first ${PREVIEW_LIMIT}`}
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <button
              onClick={onDownload}
              disabled={preview.total === 0}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "9px 20px",
                background: "rgba(255,255,255,0.15)",
                color: "#fff",
                border: "1.5px solid rgba(255,255,255,0.3)",
                borderRadius: "8px",
                fontSize: "13.5px",
                fontWeight: 600,
                cursor: preview.total === 0 ? "not-allowed" : "pointer",
                opacity: preview.total === 0 ? 0.5 : 1,
                fontFamily: "inherit",
                transition: "background 0.15s",
                whiteSpace: "nowrap",
              }}
              onMouseEnter={(e) => {
                if (preview.total !== 0)
                  e.currentTarget.style.background = "rgba(255,255,255,0.25)";
              }}
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = "rgba(255,255,255,0.15)")
              }
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Download
            </button>

            <button
              onClick={onClose}
              style={{
                width: "30px",
                height: "30px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "rgba(255,255,255,0.12)",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                color: "rgba(255,255,255,0.85)",
                fontSize: "14px",
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = "rgba(255,255,255,0.22)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = "rgba(255,255,255,0.12)")
              }
              title="Close preview"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Table body */}
        <div
          style={{
            flex: 1,
            background: "#e9ecef",
            overflow: "auto",
            position: "relative",
          }}
        >
          <div style={{ background: "#fff", minHeight: "100%" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 12.5,
              }}
            >
              <thead>
                <tr
                  style={{
                    position: "sticky",
                    top: 0,
                    background: "#f8fafc",
                    zIndex: 1,
                  }}
                >
                  {["User", "Event", "Description", "Status", "IP", "Timestamp"].map(
                    (h) => (
                      <th
                        key={h}
                        style={{
                          textAlign: "left",
                          padding: "10px 14px",
                          borderBottom: "1px solid #e5e7eb",
                          color: "#475569",
                          fontWeight: 600,
                        }}
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {previewRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}
                    >
                      No records to export.
                    </td>
                  </tr>
                ) : (
                  previewRows.map((r) => (
                    <tr key={r.log_id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "9px 14px" }}>
                        {r.display_name || r.username || "—"}
                      </td>
                      <td style={{ padding: "9px 14px" }}>{r.event_name}</td>
                      <td
                        style={{
                          padding: "9px 14px",
                          maxWidth: 260,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {r.description}
                      </td>
                      <td style={{ padding: "9px 14px" }}>
                        <span
                          style={{
                            color: r.status === "success" ? "#15803d" : "#b91c1c",
                            fontWeight: 600,
                          }}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td style={{ padding: "9px 14px" }}>{r.ip_address || "—"}</td>
                      <td style={{ padding: "9px 14px" }}>
                        {formatDate(r.created_at)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Dismiss hint */}
      <p
        style={{
          marginTop: "14px",
          color: "rgba(255,255,255,0.55)",
          fontSize: "12px",
        }}
      >
        Click outside or press Esc to close
      </p>
    </div>,
    document.body,
  );
};

// =====================================================
// MAIN COMPONENT
// =====================================================
const AuditLog = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    limit: ITEMS_PER_PAGE,
    totalPages: 1,
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [stats, setStats] = useState({
    total: 0,
    today: 0,
    uniqueUsers: 0,
    failed: 0,
  });
  const [isExporting, setIsExporting] = useState(false);
  const [exportPreview, setExportPreview] = useState(null);

  const [draft, setDraft] = useState({ ...DEFAULT_FILTERS });
  const [appliedFilters, setAppliedFilters] = useState({ ...DEFAULT_FILTERS });

  const isDirty = JSON.stringify(draft) !== JSON.stringify(appliedFilters);

  // Near the top of the AuditLog component, after the state declarations
  const rawUser = localStorage.getItem("user");
  const currentUser = rawUser ? JSON.parse(rawUser) : null;
  const RESTRICTED_ROLES = [
    "Brgy. Captain",
    "Brgy. Official",
    "Investigator",
    "Patrol",
  ];
  const isRestricted = RESTRICTED_ROLES.includes(currentUser?.role);

  const closeExportPreview = () => {
    exportPreview?.revoke();
    setExportPreview(null);
  };

  // ===================================================
  // FETCH LOGS
  // ===================================================
  const fetchLogs = useCallback(
    async (page = 1) => {
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
        if (appliedFilters.dateTo) params.set("dateTo", appliedFilters.dateTo);

        const res = await fetch(`${API_URL}/audit-log?${params.toString()}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });

        if (res.ok) {
          const data = await res.json();
          setLogs(data.logs || []);
          setPagination(
            data.pagination || {
              total: 0,
              page: 1,
              limit: ITEMS_PER_PAGE,
              totalPages: 1,
            },
          );
          setStats(
            data.stats || { total: 0, today: 0, uniqueUsers: 0, failed: 0 },
          );
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
    },
    [appliedFilters],
  );

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
  // EXPORT CSV (build + preview, download on confirm)
  // ===================================================
  const handleExportCSV = async () => {
    setIsExporting(true);
    try {
      const token = localStorage.getItem("token");
      let all = [];
      let page = 1;
      const limit = 100; // backend max

      while (true) {
        const params = new URLSearchParams();
        params.set("page", page);
        params.set("limit", limit);
        if (appliedFilters.searchTerm.trim())
          params.set("search", appliedFilters.searchTerm.trim());
        if (appliedFilters.statusFilter !== "all")
          params.set("status", appliedFilters.statusFilter);
        if (appliedFilters.dateFrom)
          params.set("dateFrom", appliedFilters.dateFrom);
        if (appliedFilters.dateTo) params.set("dateTo", appliedFilters.dateTo);

        const res = await fetch(`${API_URL}/audit-log?${params.toString()}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });
        if (!res.ok) throw new Error("Export fetch failed");
        const data = await res.json();

        all = all.concat(data.logs || []);

        if (page >= (data.pagination?.totalPages || 1)) break;
        page++;
      }

      const cols = [
        "log_id",
        "username",
        "email",
        "event_name",
        "description",
        "status",
        "source",
        "ip_address",
        "created_at",
      ];
      const rows = all.map((r) =>
        [
          r.log_id,
          r.username || "",
          r.email || "",
          r.event_name,
          `"${(r.description || "").replace(/"/g, '""')}"`,
          r.status,
          r.source || "",
          r.ip_address || "",
          r.created_at,
        ].join(","),
      );
      const csv = [cols.join(","), ...rows].join("\n");

      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const blobUrl = URL.createObjectURL(blob);
      const filename = `audit_log_${appliedFilters.dateFrom || "all"}_to_${appliedFilters.dateTo || "all"}.csv`;

      setExportPreview({
        rows: all,
        total: all.length,
        filename,
        blobUrl,
        download: () => {
          const a = document.createElement("a");
          a.href = blobUrl;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          a.remove();
        },
        revoke: () => URL.revokeObjectURL(blobUrl),
      });
    } catch (err) {
      console.error("Export error:", err);
      setError("Failed to export audit logs.");
    } finally {
      setIsExporting(false);
    }
  };

  // ===================================================
  // HELPERS
  // ===================================================
  const formatDate = (dateString) => {
    if (!dateString) return "—";
    const d = new Date(dateString);
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, "0");
    const mins = String(d.getMinutes()).padStart(2, "0");
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
          <h1>Audit Trail</h1>
          <p>Track all system activity — who did what, and when</p>
        </div>
        <div className="al-header-actions">
          {/* <button
            className="al-btn al-btn-secondary"
            onClick={() => fetchLogs(currentPage)}
          >
            <RefreshIcon /> Refresh
          </button> */}
          <button
            className="al-btn al-btn-primary"
            onClick={handleExportCSV}
            disabled={isExporting}
          >
            <ExportIcon /> {isExporting ? "Exporting..." : "Export"}
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
          <div className="al-stat-value">
            {stats.uniqueUsers.toLocaleString()}
          </div>
          <div className="al-stat-sub">unique users logged</div>
        </div>
        <div className="al-stat-card">
          <div className="al-stat-label">Failed attempts</div>
          <div className="al-stat-value al-stat-danger">
            {stats.failed.toLocaleString()}
          </div>
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
              placeholder="Event, Description, IP..."
              value={draft.searchTerm}
              onChange={(e) =>
                setDraft((f) => ({ ...f, searchTerm: e.target.value }))
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") handleApplyFilters();
              }}
            />
          </div>

          <div className="al-filter-group">
            <label className="al-filter-label">Status</label>
            <select
              className="al-filter-input"
              value={draft.statusFilter}
              onChange={(e) =>
                setDraft((f) => ({ ...f, statusFilter: e.target.value }))
              }
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
              max={(() => {
                if (!draft.dateTo) return getToday();
                return addDays(draft.dateTo, -1);
              })()}
              min={draft.dateTo ? addDays(draft.dateTo, -364) : undefined}
              onChange={(e) => {
                const from = e.target.value;
                let autoTo =
                  draft.dateTo && draft.dateTo > from ? draft.dateTo : getToday();
                // clamp autoTo so range never exceeds 364 days
                const maxAllowedTo = addDays(from, 364);
                if (autoTo > maxAllowedTo) autoTo = maxAllowedTo;
                if (autoTo > getToday()) autoTo = getToday();
                setDraft((f) => ({ ...f, dateFrom: from, dateTo: autoTo }));
              }}
              onKeyDown={(e) => e.preventDefault()}
              onPaste={(e) => e.preventDefault()}
              onClick={(e) => {
                if (e.target.showPicker) {
                  try {
                    e.target.showPicker();
                  } catch {}
                }
              }}
            />
          </div>

          <div className="al-filter-group">
            <label className="al-filter-label">Date to</label>
            <input
              type="date"
              className="al-filter-input"
              value={draft.dateTo}
              min={(() => {
                if (!draft.dateFrom) return undefined;
                return addDays(draft.dateFrom, 1);
              })()}
              max={(() => {
                const today = getToday();
                if (!draft.dateFrom) return today;
                const rangeMax = addDays(draft.dateFrom, 364);
                return rangeMax < today ? rangeMax : today;
              })()}
              onChange={(e) => setDraft((f) => ({ ...f, dateTo: e.target.value }))}
              onKeyDown={(e) => e.preventDefault()}
              onPaste={(e) => e.preventDefault()}
              onClick={(e) => {
                if (e.target.showPicker) {
                  try {
                    e.target.showPicker();
                  } catch {}
                }
              }}
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
          <button
            className="al-reset-btn"
            onClick={handleResetFilters}
            title="Reset to defaults"
          >
            ↺
          </button>
        </div>
      </div>

      <LoadingModal isOpen={isExporting} message={"Exporting audit logs..."} />

      {exportPreview && (
        <ExportPreviewModal
          preview={exportPreview}
          formatDate={formatDate}
          onDownload={() => {
            exportPreview.download();
            closeExportPreview();
          }}
          onClose={closeExportPreview}
        />
      )}

      {/* Table */}
      <div className="al-table-card">
        {error && <div className="al-error-message">{error}</div>}

        {loading ? (
          <LoadingModal isOpen={true} message={"Loading audit logs..."} />
        ) : (
          <>
            <div className="al-table-container">
              <table className="al-data-table">
                <thead>
                  <tr>
                    {!isRestricted && <th className="al-col-user">User</th>}
                    {/* ← */}
                    <th className="al-col-event">Event</th>
                    <th className="al-col-desc">Description</th>
                    <th className="al-col-status">Status</th>
                    <th className="al-col-ip">IP Address</th>
                    <th className="al-col-time">Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.length === 0 ? (
                    <tr>
                      <td
                        colSpan={isRestricted ? 5 : 6}
                        style={{
                          textAlign: "center",
                          padding: "40px",
                          color: "#6c757d",
                        }}
                      >
                        No audit log entries match your filters.
                      </td>
                    </tr>
                  ) : (
                    logs.map((log) => (
                      <tr key={log.log_id}>
                        {/* User — plain text, no avatar */}
                        {/* User — rank + full name, role underneath */}
                        {!isRestricted && (
                          <td className="al-col-user">
                            <div className="al-user-name">
                              {log.display_name || log.username || "—"}
                            </div>
                            <div className="al-user-email">
                              {log.role_name || "—"}
                            </div>
                          </td>
                        )}

                        {/* Event name */}
                        <td className="al-col-event">
                          <span className="al-event-badge">
                            {log.event_name}
                          </span>
                        </td>

                        {/* Description */}
                        <td className="al-col-desc">
                          <span className="al-description">
                            {log.description}
                          </span>
                        </td>

                        {/* Status */}
                        <td className="al-col-status">
                          <span
                            className={`al-status-badge ${log.status === "success" ? "al-status-success" : "al-status-failed"}`}
                          >
                            {log.status}
                          </span>
                        </td>

                        {/* Source */}
                        {/* <td className="al-col-source">
                          <span className="al-source">{log.source || "—"}</span>
                        </td> */}

                        {/* IP */}
                        <td className="al-col-ip">
                          <span className="al-ip-address">
                            {log.ip_address || "—"}
                          </span>
                        </td>

                        {/* Timestamp — DD/MM/YYYY HH:MM */}
                        <td className="al-col-time">
                          <span className="al-timestamp">
                            {formatDate(log.created_at)}
                          </span>
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
                  {Math.min(
                    pagination.page * pagination.limit,
                    pagination.total,
                  )}{" "}
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