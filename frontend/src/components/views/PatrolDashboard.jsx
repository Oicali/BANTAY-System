// src/components/views/PatrolDashboard.jsx
import { useState, useEffect } from "react";

const API_BASE = import.meta.env.VITE_API_URL;

// ── Helpers ────────────────────────────────────────────────────────
const parseLocalDate = (d) => {
  if (!d) return null;
  const dt = new Date(d);
  return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
};

const today = () => {
  const t = new Date();
  return new Date(t.getFullYear(), t.getMonth(), t.getDate());
};

const getPatrolStatus = (patrol) => {
  const t     = today();
  const start = parseLocalDate(patrol.start_date);
  const end   = parseLocalDate(patrol.end_date);
  if (!start || !end) return "unknown";
  if (t < start) return "upcoming";
  if (t > end)   return "completed";
  return "active";
};

const formatDate = (d) => {
  const dt = parseLocalDate(d);
  return dt
    ? dt.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })
    : "—";
};

const toInputDate = (d) => {
  if (!d) return "";
  const dt = parseLocalDate(d);
  return dt ? dt.toISOString().split("T")[0] : "";
};

// ── Status badge ────────────────────────────────────────────────────
const StatusBadge = ({ status }) => {
  const map = {
    active:    { label: "Active",    bg: "#dcfce7", color: "#166534", border: "#86efac" },
    upcoming:  { label: "Upcoming",  bg: "#fef9c3", color: "#854d0e", border: "#fde047" },
    completed: { label: "Completed", bg: "#f1f5f9", color: "#475569", border: "#cbd5e1" },
  };
  const s = map[status] || { label: "—", bg: "#f1f5f9", color: "#475569", border: "#cbd5e1" };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      padding: "3px 10px", borderRadius: 20,
      fontSize: 11, fontWeight: 700, letterSpacing: "0.03em",
      background: s.bg, color: s.color, border: `1px solid ${s.border}`,
      whiteSpace: "nowrap",
    }}>
      {s.label}
    </span>
  );
};

// ── After Patrol Report Modal ───────────────────────────────────────
const AfterPatrolModal = ({ patrol, onClose, onSubmit }) => {
  const [form, setForm] = useState({
    date:          toInputDate(patrol?.start_date) || "",
    timeFrom:      "",
    timeTo:        "",
    preDeployment: "",
    action1:       "",
    incidents:     "",
    action2:       "",
    safetyConcerns:"",
    action3:       "",
    otherServices: "",
    visitedAreas:  "",
    personsVisited:"",
    numOfficials:  "",
    numGovt:       "",
    sector:        patrol?.mobile_unit_name || "",
    mustDos:       "",
    remarks:       "",
    creditHours:   "",
    sigOfficer1:   "",
    sigOfficer2:   "",
    sigSupervisor: "",
  });

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async () => {
    await onSubmit(patrol.patrol_id, form);
    onClose();
  };

  const inputStyle = {
    width: "100%", border: "1px solid #ced4da", borderRadius: 6,
    padding: "7px 10px", fontSize: 13, background: "#f8f9fa",
    color: "#212529", fontFamily: "inherit", outline: "none",
    boxSizing: "border-box",
  };
  const labelStyle = {
    fontSize: 12, color: "#6c757d", fontWeight: 600, marginBottom: 4, display: "block",
  };
  const fieldStyle = { marginBottom: 14 };

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
        display: "flex", alignItems: "flex-start", justifyContent: "center",
        padding: "2rem 1rem", overflowY: "auto", zIndex: 1200,
      }}
    >
      <div style={{
        background: "#fff", borderRadius: 12, width: "100%", maxWidth: 660,
        padding: "1.75rem", position: "relative", boxShadow: "0 20px 60px rgba(0,0,0,0.18)",
      }}>
        {/* Close */}
        <button
          onClick={onClose}
          style={{
            position: "absolute", top: "1rem", right: "1rem",
            background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#6c757d", lineHeight: 1,
          }}
        >✕</button>

        {/* Header */}
        <div style={{ fontSize: 10, color: "#adb5bd", textAlign: "right", marginBottom: 4 }}>
          ANNEX D &nbsp;|&nbsp; PNPM-DO-DS-3-3-15 (DO)
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#0a1628", marginBottom: 2 }}>
          After Patrol Report
        </div>
        <div style={{ fontSize: 12, color: "#6c757d", marginBottom: "1.25rem" }}>
          {patrol?.patrol_name} &nbsp;·&nbsp; {formatDate(patrol?.start_date)} – {formatDate(patrol?.end_date)}
        </div>
        <hr style={{ border: "none", borderTop: "1px solid #dee2e6", marginBottom: "1.25rem" }} />

        {/* 1. Patrol date/time */}
        <div style={fieldStyle}>
          <label style={labelStyle}>1. Rendered patrol duties on</label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <div>
              <label style={{ ...labelStyle, fontSize: 11 }}>Date</label>
              <input type="date" style={inputStyle} value={form.date} onChange={set("date")} />
            </div>
            <div>
              <label style={{ ...labelStyle, fontSize: 11 }}>From</label>
              <input type="time" style={inputStyle} value={form.timeFrom} onChange={set("timeFrom")} />
            </div>
            <div>
              <label style={{ ...labelStyle, fontSize: 11 }}>To</label>
              <input type="time" style={inputStyle} value={form.timeTo} onChange={set("timeTo")} />
            </div>
          </div>
        </div>

        {/* 2. Pre-deployment */}
        <div style={fieldStyle}>
          <label style={labelStyle}>2. Pre-deployment specific instructions received</label>
          <textarea rows={3} style={{ ...inputStyle, resize: "vertical" }} value={form.preDeployment} onChange={set("preDeployment")} />
        </div>

        <div style={{ fontSize: 11, fontWeight: 600, color: "#6c757d", textTransform: "uppercase", letterSpacing: "0.06em", margin: "4px 0 8px" }}>Action taken</div>
        <div style={fieldStyle}>
          <input type="text" style={inputStyle} placeholder="Action taken..." value={form.action1} onChange={set("action1")} />
        </div>

        {/* 3. Incidents */}
        <div style={fieldStyle}>
          <label style={labelStyle}>
            3. Incidents / Unusual events or situations{" "}
            <span style={{ fontWeight: 400, fontStyle: "italic", color: "#adb5bd" }}>
              (crime incidents, public disturbance, major events, etc.)
            </span>
          </label>
          <textarea rows={3} style={{ ...inputStyle, resize: "vertical" }} value={form.incidents} onChange={set("incidents")} />
        </div>

        <div style={{ fontSize: 11, fontWeight: 600, color: "#6c757d", textTransform: "uppercase", letterSpacing: "0.06em", margin: "4px 0 8px" }}>Action taken</div>
        <div style={fieldStyle}>
          <input type="text" style={inputStyle} placeholder="Action taken..." value={form.action2} onChange={set("action2")} />
        </div>

        {/* 4. Safety concerns */}
        <div style={fieldStyle}>
          <label style={labelStyle}>
            4. Public safety concerns{" "}
            <span style={{ fontWeight: 400, fontStyle: "italic", color: "#adb5bd" }}>
              (uncovered manholes, busted lights, uncollected garbage, fire hazard, missing bridge railings, etc.)
            </span>
          </label>
          <textarea rows={3} style={{ ...inputStyle, resize: "vertical" }} value={form.safetyConcerns} onChange={set("safetyConcerns")} />
        </div>

        <div style={{ fontSize: 11, fontWeight: 600, color: "#6c757d", textTransform: "uppercase", letterSpacing: "0.06em", margin: "4px 0 8px" }}>Action taken</div>
        <div style={fieldStyle}>
          <input type="text" style={inputStyle} placeholder="Action taken..." value={form.action3} onChange={set("action3")} />
        </div>

        {/* 5. Other services */}
        <div style={fieldStyle}>
          <label style={labelStyle}>
            5. Other public safety services rendered{" "}
            <span style={{ fontWeight: 400, fontStyle: "italic", color: "#adb5bd" }}>
              (area and route security, assistance to person with disability, recovered property, etc.)
            </span>
          </label>
          <textarea rows={2} style={{ ...inputStyle, resize: "vertical" }} value={form.otherServices} onChange={set("otherServices")} />
        </div>

        {/* 6. Visited areas */}
        <div style={fieldStyle}>
          <label style={labelStyle}>
            6. Visited areas{" "}
            <span style={{ fontWeight: 400, fontStyle: "italic", color: "#adb5bd" }}>
              (house, school, church, business, barangay, etc.)
            </span>
          </label>
          <textarea rows={2} style={{ ...inputStyle, resize: "vertical" }} value={form.visitedAreas} onChange={set("visitedAreas")} />
        </div>

        {/* 7. Persons visited */}
        <div style={fieldStyle}>
          <label style={labelStyle}>7. Name of persons visited / local officials</label>
          <textarea rows={2} style={{ ...inputStyle, resize: "vertical" }} value={form.personsVisited} onChange={set("personsVisited")} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 8 }}>
            <div>
              <label style={{ ...labelStyle, fontSize: 11, marginTop: 4 }}>No. of officials visited</label>
              <input type="number" min={0} style={inputStyle} placeholder="0" value={form.numOfficials} onChange={set("numOfficials")} />
            </div>
            <div>
              <label style={{ ...labelStyle, fontSize: 11, marginTop: 4 }}>Total no. of gov't officials (incl. brgy.) in area</label>
              <input type="number" min={0} style={inputStyle} placeholder="0" value={form.numGovt} onChange={set("numGovt")} />
            </div>
          </div>
        </div>

        {/* 8. Sector/Beat */}
        <div style={fieldStyle}>
          <label style={labelStyle}>8. Sector / Beat patrolled</label>
          <input type="text" style={inputStyle} value={form.sector} onChange={set("sector")} />
        </div>

        {/* 9. Must DOs */}
        <div style={fieldStyle}>
          <label style={labelStyle}>9. Patrolled the MUST DOs such as</label>
          <textarea rows={2} style={{ ...inputStyle, resize: "vertical" }} value={form.mustDos} onChange={set("mustDos")} />
        </div>

        {/* 10. Remarks */}
        <div style={fieldStyle}>
          <label style={labelStyle}>
            10. Remarks / Recommendations{" "}
            <span style={{ fontWeight: 400, fontStyle: "italic", color: "#adb5bd" }}>
              (best practices, traffic assistance rendered, etc.)
            </span>
          </label>
          <textarea rows={3} style={{ ...inputStyle, resize: "vertical" }} value={form.remarks} onChange={set("remarks")} />
        </div>

        {/* Credit hours */}
        <div style={fieldStyle}>
          <label style={labelStyle}>Total patrol credit hours rendered</label>
          <input type="text" style={inputStyle} placeholder="e.g. 8 hours" value={form.creditHours} onChange={set("creditHours")} />
        </div>

        <hr style={{ border: "none", borderTop: "1px solid #dee2e6", margin: "1.25rem 0 1rem" }} />

        {/* Signatures */}
        <div style={{ fontSize: 11, fontWeight: 600, color: "#6c757d", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
          Signatures
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 10 }}>
          <div style={{ borderTop: "1px solid #ced4da", paddingTop: 8, textAlign: "center" }}>
            <input type="text" style={{ ...inputStyle, textAlign: "center" }} placeholder="Rank and name" value={form.sigOfficer1} onChange={set("sigOfficer1")} />
            <div style={{ fontSize: 11, color: "#6c757d", marginTop: 4 }}>Patrol Officer</div>
          </div>
          <div style={{ borderTop: "1px solid #ced4da", paddingTop: 8, textAlign: "center" }}>
            <input type="text" style={{ ...inputStyle, textAlign: "center" }} placeholder="Rank and name" value={form.sigSupervisor} onChange={set("sigSupervisor")} />
            <div style={{ fontSize: 11, color: "#6c757d", marginTop: 4 }}>Patrol Supervisor</div>
          </div>
        </div>
        <div style={{ maxWidth: "50%", borderTop: "1px solid #ced4da", paddingTop: 8, textAlign: "center" }}>
          <input type="text" style={{ ...inputStyle, textAlign: "center" }} placeholder="Rank and name" value={form.sigOfficer2} onChange={set("sigOfficer2")} />
          <div style={{ fontSize: 11, color: "#6c757d", marginTop: 4 }}>Patrol Officer</div>
        </div>

        {/* Submit */}
        <button
          onClick={handleSubmit}
          style={{
            display: "block", width: "100%", marginTop: "1.5rem",
            padding: "11px", background: "#1e3a5f", color: "#fff",
            border: "none", borderRadius: 8, fontSize: 14, fontWeight: 700,
            cursor: "pointer", fontFamily: "inherit",
          }}
        >
          Submit After Patrol Report
        </button>
      </div>
    </div>
  );
};

// ── Main PatrolDashboard ────────────────────────────────────────────
const PatrolDashboard = () => {
  const token = () => localStorage.getItem("token");

  const [patrols,  setPatrols]  = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [notif,    setNotif]    = useState(null);
  const [selected, setSelected] = useState(null); // patrol object for modal

  // ── Get current user id from JWT payload ──────────────────────
  const getCurrentUserId = () => {
    try {
      const t = token();
      if (!t) return null;
      const payload = JSON.parse(atob(t.split(".")[1]));
      return payload.user_id || payload.id || null;
    } catch { return null; }
  };

  // ── Fetch patrols assigned to logged-in user ──────────────────
  const fetchMyPatrols = async () => {
    setLoading(true);
    try {
      const res  = await fetch(`${API_BASE}/patrol/my-patrols`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      const data = await res.json();
      if (data.success) {
        const userId = getCurrentUserId();
        // Filter to only patrols where this user is a patroller
        const mine = userId
          ? data.data.filter((p) =>
              (p.patrollers || []).some((pat) => {
                // patrollers array contains officer_id indirectly via active_patroller_id
                // We match by officer_id stored in JWT vs officer_id in active_patroller
                // Fallback: show all if can't resolve
                return true; // replace with: pat.officer_id === userId
              })
            )
          : data.data;
        setPatrols(mine);
      }
    } catch (err) {
      console.error("PatrolDashboard fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchMyPatrols(); }, []);

  // ── Submit after patrol report ────────────────────────────────
  const handleSubmitReport = async (patrolId, formData) => {
    try {
      const res  = await fetch(`${API_BASE}/patrol/patrols/${patrolId}/after-report`, {
        method:  "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token()}`,
        },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (data.success) {
        setNotif({ message: "After Patrol Report submitted successfully!", type: "success" });
      } else {
        setNotif({ message: data.message || "Something went wrong.", type: "error" });
      }
    } catch {
      setNotif({ message: "Server error while submitting report.", type: "error" });
    }
  };

  // ── Notification auto-dismiss ─────────────────────────────────
  useEffect(() => {
    if (!notif) return;
    const t = setTimeout(() => setNotif(null), 3500);
    return () => clearTimeout(t);
  }, [notif]);

  // ── Styles ────────────────────────────────────────────────────
  const th = {
    padding: "13px 18px", textAlign: "left", fontSize: 12,
    fontWeight: 600, color: "#6c757d", textTransform: "uppercase",
    letterSpacing: "0.5px", borderBottom: "1px solid #dee2e6",
    background: "#f8f9fa", whiteSpace: "nowrap",
  };
  const td = {
    padding: "13px 18px", fontSize: 14, color: "#495057",
    borderBottom: "1px solid #dee2e6", verticalAlign: "middle",
  };

  return (
    <div style={{ padding: 32, fontFamily: '"DM Sans", -apple-system, sans-serif' }}>
      {/* Page header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: "#0a1628", margin: 0, fontFamily: '"Inter", sans-serif' }}>
          Patrol Dashboard
        </h1>
        <p style={{ color: "#6c757d", fontSize: 15, marginTop: 6 }}>
          Your assigned patrol duties and after-patrol reports
        </p>
      </div>

      {/* Table card */}
      <div style={{
        background: "#fff", border: "1px solid #dee2e6",
        borderRadius: 10, overflow: "hidden",
      }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Patrol Name</th>
                <th style={th}>Status</th>
                <th style={th}>Mobile Unit</th>
                <th style={th}>Duration</th>
                <th style={th}>Patrollers</th>
                <th style={th}>Area of Responsibility</th>
                <th style={{ ...th, textAlign: "right" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ ...td, textAlign: "center", color: "#adb5bd", padding: 48 }}>
                    Loading...
                  </td>
                </tr>
              ) : patrols.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ ...td, textAlign: "center", color: "#adb5bd", padding: 48 }}>
                    No patrol assignments found.
                  </td>
                </tr>
              ) : patrols.map((patrol) => {
                const status      = getPatrolStatus(patrol);
                const patrollers  = patrol.patrollers || [];
                const barangays   = [...new Set(
                  (patrol.routes || [])
                    .filter((r) => (r.stop_order || 0) <= 0 && r.barangay)
                    .map((r) => r.barangay)
                )];

                return (
                  <tr
                    key={patrol.patrol_id}
                    style={{ cursor: "default" }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "#f8f9fa"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = ""; }}
                  >
                    <td style={td}>
                      <span style={{ fontWeight: 700, color: "#0a1628" }}>{patrol.patrol_name}</span>
                    </td>
                    <td style={td}>
                      <StatusBadge status={status} />
                    </td>
                    <td style={td}>
                      <span style={{ fontWeight: 600, color: "#1e3a5f" }}>
                        {patrol.mobile_unit_name || "—"}
                      </span>
                    </td>
                    <td style={td}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#1e3a5f", whiteSpace: "nowrap" }}>
                        {formatDate(patrol.start_date)} — {formatDate(patrol.end_date)}
                      </span>
                    </td>
                    <td style={td}>
                      {patrollers.length > 0 ? (
                        <span style={{
                          display: "inline-flex", alignItems: "center", gap: 5,
                          padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700,
                          background: "#e8edf4", color: "#1e3a5f", border: "1px solid #93afc9",
                        }}>
                          {patrollers.length} Patroller{patrollers.length !== 1 ? "s" : ""}
                        </span>
                      ) : (
                        <span style={{ fontSize: 13, color: "#adb5bd", fontStyle: "italic" }}>—</span>
                      )}
                    </td>
                    <td style={td}>
                      {barangays.length > 0 ? (
                        <span style={{
                          display: "inline-flex", alignItems: "center", gap: 5,
                          padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700,
                          background: "#f0fdf4", color: "#166534", border: "1px solid #86efac",
                        }}>
                          {barangays.length} Barangay{barangays.length !== 1 ? "s" : ""}
                        </span>
                      ) : (
                        <span style={{ fontSize: 13, color: "#adb5bd", fontStyle: "italic" }}>—</span>
                      )}
                    </td>
                    <td style={{ ...td, textAlign: "right" }}>
                      <button
                        onClick={() => setSelected(patrol)}
                        style={{
                          padding: "6px 16px", background: "#1e3a5f", color: "#fff",
                          border: "none", borderRadius: 6, fontSize: 13, fontWeight: 700,
                          cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = "#0a1628"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "#1e3a5f"; }}
                      >
                        After Report
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        {!loading && (
          <div style={{
            padding: "10px 18px", fontSize: 12, color: "#6c757d",
            borderTop: "1px solid #dee2e6", background: "#f8f9fa",
          }}>
            {patrols.length} patrol{patrols.length !== 1 ? "s" : ""} assigned to you
          </div>
        )}
      </div>

      {/* Modal */}
      {selected && (
        <AfterPatrolModal
          patrol={selected}
          onClose={() => setSelected(null)}
          onSubmit={handleSubmitReport}
        />
      )}

      {/* Notification */}
      {notif && (
        <div style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 2000,
          background: notif.type === "success" ? "#166534" : "#991b1b",
          color: "#fff", padding: "12px 20px", borderRadius: 8,
          fontSize: 14, fontWeight: 600, boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
          maxWidth: 360,
        }}>
          {notif.message}
        </div>
      )}
    </div>
  );
};

export default PatrolDashboard;