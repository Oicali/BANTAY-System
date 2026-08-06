// frontend\src\components\modals\DeletedSchedulesModal.jsx
import { useState } from "react";
import { createPortal } from "react-dom";

const PAGE_SIZE = 10;

const TrashIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);

const RestoreIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="1 4 1 10 7 10" />
    <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
  </svg>
);

const formatDateTime = (ts) => {
  if (!ts) return "—";
  const d = new Date(ts);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hours = d.getHours();
  const mins = String(d.getMinutes()).padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  const h = String(hours % 12 || 12).padStart(2, "0");
  return `${dd}/${mm}/${yyyy}, ${h}:${mins} ${ampm}`;
};

const formatDate = (d) => {
  if (!d) return "—";
  const dt = new Date(d);
  return dt.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
};

const DeletedSchedulesModal = ({ patrols, loading, restoringId, onRestore, onClose }) => {
  const [page, setPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(patrols.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = patrols.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return createPortal(
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1200,
        padding: "20px",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#fff", borderRadius: "12px", width: "100%", maxWidth: "900px",
          maxHeight: "85vh", display: "flex", flexDirection: "column",
          boxShadow: "0 20px 60px rgba(0,0,0,0.3)", overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* HEADER */}
        <div style={{ background: "#0a1628", padding: "20px 24px", position: "relative" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
              <div
                style={{
                  width: "40px", height: "40px", borderRadius: "10px",
                  background: "rgba(255,255,255,0.12)", display: "flex",
                  alignItems: "center", justifyContent: "center", color: "#fff",
                }}
              >
                <TrashIcon />
              </div>
              <div>
                <div style={{ fontSize: "17px", fontWeight: 700, color: "#fff" }}>
                  Deleted Schedules
                </div>
                <div style={{ fontSize: "12.5px", color: "rgba(255,255,255,0.65)", marginTop: "2px" }}>
                  Soft-deleted patrol schedules — restore to recover
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              style={{
                background: "none", border: "none", color: "rgba(255,255,255,0.7)",
                fontSize: "20px", cursor: "pointer", lineHeight: 1, padding: "4px",
              }}
            >
              ✕
            </button>
          </div>
        </div>
        <div style={{ height: "3px", background: "#dc2626" }} />

        {/* BODY */}
        <div style={{ flex: 1, overflowY: "auto", background: "#f8f9fa" }}>
          {loading ? (
            <div style={{ padding: "60px 24px", textAlign: "center", color: "#6c757d", fontSize: "14px" }}>
              Loading deleted schedules...
            </div>
          ) : paged.length === 0 ? (
            <div style={{ padding: "60px 24px", textAlign: "center" }}>
              <div
                style={{
                  width: "56px", height: "56px", borderRadius: "50%", background: "#eceff1",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  margin: "0 auto 16px", color: "#adb5bd",
                }}
              >
                <TrashIcon />
              </div>
              <div style={{ fontSize: "15px", fontWeight: 600, color: "#495057" }}>
                No deleted schedules found
              </div>
              <div style={{ fontSize: "12.5px", color: "#adb5bd", marginTop: "4px" }}>
                Deleted patrol schedules will appear here
              </div>
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr style={{ background: "#fff", borderBottom: "1px solid #e9ecef" }}>
                  <th style={thStyle}>Patrol Name</th>
                  <th style={thStyle}>Duration</th>
                  <th style={thStyle}>Mobile Unit</th>
                  <th style={thStyle}>Reports</th>
                  <th style={thStyle}>Deleted At</th>
                  <th style={thStyle}>Deleted By</th>
                  <th style={thStyle}></th>
                </tr>
              </thead>
              <tbody>
                {paged.map((p) => (
                  <tr key={p.patrol_id} style={{ borderBottom: "1px solid #e9ecef", background: "#fff" }}>
                    <td style={tdStyle}>
                      <span style={{ fontWeight: 600, color: "#0a1628" }}>{p.patrol_name}</span>
                    </td>
                    <td style={tdStyle}>
                      {formatDate(p.start_date)} — {formatDate(p.end_date)}
                    </td>
                    <td style={tdStyle}>
                      {p.mobile_unit_name || (
                        <span style={{ color: "#adb5bd" }}>
                          {p.deleted_unit_name ? `Removed (${p.deleted_unit_name})` : "Removed"}
                        </span>
                      )}
                    </td>
                    <td style={tdStyle}>
                      {p.report_count > 0 ? (
                        <span
                          style={{
                            display: "inline-block", padding: "2px 9px", borderRadius: "999px",
                            background: "#fff3cd", color: "#856404", fontSize: "11.5px", fontWeight: 600,
                          }}
                        >
                          {p.report_count} report{p.report_count !== 1 ? "s" : ""}
                        </span>
                      ) : (
                        <span style={{ color: "#adb5bd" }}>None</span>
                      )}
                    </td>
                    <td style={tdStyle}>{formatDateTime(p.deleted_at)}</td>
                    <td style={tdStyle}>{p.deleted_by_name || "—"}</td>
                    <td style={{ ...tdStyle, textAlign: "right" }}>
                      <button
                        onClick={() => onRestore(p.patrol_id)}
                        disabled={restoringId === p.patrol_id}
                        style={{
                          display: "inline-flex", alignItems: "center", gap: "6px",
                          padding: "6px 14px", background: restoringId === p.patrol_id ? "#94a3b8" : "#16a34a",
                          border: "none", borderRadius: "7px", fontSize: "12.5px", fontWeight: 700,
                          color: "#fff", cursor: restoringId === p.patrol_id ? "default" : "pointer",
                          fontFamily: "inherit",
                        }}
                      >
                        <RestoreIcon />
                        {restoringId === p.patrol_id ? "Restoring…" : "Restore"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* FOOTER */}
        <div
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "14px 24px", borderTop: "1px solid #e9ecef", background: "#fff",
          }}
        >
          <span style={{ fontSize: "12.5px", color: "#6c757d" }}>
            {patrols.length} deleted record{patrols.length !== 1 ? "s" : ""}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage === 1}
              style={pageBtnStyle(safePage === 1)}
            >
              Previous
            </button>
            <span style={{ fontSize: "12.5px", color: "#495057" }}>
              Page {safePage} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage === totalPages}
              style={pageBtnStyle(safePage === totalPages)}
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

const thStyle = {
  textAlign: "left", padding: "10px 16px", fontSize: "11.5px", fontWeight: 700,
  color: "#6c757d", textTransform: "uppercase", letterSpacing: "0.03em",
};

const tdStyle = {
  padding: "12px 16px", color: "#212529", verticalAlign: "middle",
};

const pageBtnStyle = (disabled) => ({
  padding: "6px 14px", background: disabled ? "#f1f3f5" : "#fff",
  border: "1px solid #ced4da", borderRadius: "7px", fontSize: "12.5px",
  fontWeight: 500, color: disabled ? "#adb5bd" : "#495057",
  cursor: disabled ? "not-allowed" : "pointer", fontFamily: "inherit",
});

export default DeletedSchedulesModal;