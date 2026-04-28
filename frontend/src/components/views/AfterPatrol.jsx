// src/components/views/AfterPatrol.jsx
import { useState, useEffect } from "react";
import "./AfterPatrol.css";
import TimePicker from "../modals/TimePicker";
import Notification from "../modals/Notification";
import BeatCard from "../modals/BeatCard";

const API_BASE = import.meta.env.VITE_API_URL;

const parseLocalDate = (d) => {
  if (!d) return null;
  const dt = new Date(d);
  return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
};

const todayDate = () => {
  const t = new Date();
  return new Date(t.getFullYear(), t.getMonth(), t.getDate());
};



const getPatrolStatus = (patrol) => {
  const t     = todayDate();
  const start = parseLocalDate(patrol.start_date);
  const end   = parseLocalDate(patrol.end_date);
  if (!start || !end) return "unknown";
  if (t < start) return "upcoming";
  if (t > end)   return "completed";
  return "active";
};

const formatDate = (d) => {
  const dt = parseLocalDate(d);
  if (!dt) return "—";
  return dt.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
};

const formatDateShort = (d) => {
  const dt = parseLocalDate(d);
  if (!dt) return "—";
  return dt.toLocaleDateString("en-PH", { month: "short", day: "numeric" });
};

const formatDateTime = (d) => {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-PH", {
    month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
};

const toInputDate = (d) => {
  if (!d) return "";
  const dt = typeof d === "string" ? parseLocalDate(d) : d;
  if (!dt) return "";
  const y  = dt.getFullYear();
  const mo = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${y}-${mo}-${dd}`;
};

const getPatrolDateRange = (startDate, endDate) => {
  const dates = [];
  const start = parseLocalDate(startDate);
  const end   = parseLocalDate(endDate);
  if (!start || !end) return dates;
  const cur = new Date(start);
  while (cur <= end) {
    const y  = cur.getFullYear();
    const mo = String(cur.getMonth() + 1).padStart(2, "0");
    const dd = String(cur.getDate()).padStart(2, "0");
    dates.push(`${y}-${mo}-${dd}`);
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
};

const getMyUserId = () => {
  const raw = localStorage.getItem("token");
  if (!raw) return null;
  try {
    const payload = raw.split(".")[1];
    const b64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = JSON.parse(atob(b64));
    return json.sub ?? json.user_id ?? json.id ?? json.userId ?? null;
  } catch {
    return null;
  }
};
const getMyRole = () => {
  const raw = localStorage.getItem("token");
  if (!raw) return null;
  try {
    const b64  = raw.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = JSON.parse(atob(b64));
    return json.role ?? json.user_role ?? json.roles ?? null;
  } catch { return null; }
};

const getMyShift = (patrol) => {
  if (!patrol?.patrollers) return null;
  const myId = getMyUserId();
  if (!myId) return null;
  const mine = patrol.patrollers.filter(
    (p) => String(p.officer_id) === String(myId)
  );
  if (mine.length === 0) return null;
  const shifts = [...new Set(mine.map((p) => p.shift).filter(Boolean))].sort();
  if (shifts.length === 0) return null;
  return shifts.length === 1 ? shifts[0] : shifts.join(" & ");
};

const calcCreditHours = (from, to) => {
  if (!from || !to) return "";
  const [fh, fm] = from.split(":").map(Number);
  const [th, tm] = to.split(":").map(Number);
  if (isNaN(fh) || isNaN(th)) return "";
  let fromMins = fh * 60 + fm;
  let toMins   = th * 60 + tm;
  if (toMins <= fromMins) toMins += 24 * 60;
  const totalMins = toMins - fromMins;
  const hrs  = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (mins === 0) return `${hrs} hrs`;
  return `${hrs} hrs ${mins} min`;
};

const DEFAULT_TIMES = {
  AM:        { timeFrom: "08:00", timeTo: "20:00" },
  PM:        { timeFrom: "20:00", timeTo: "08:00" },
  "AM & PM": { timeFrom: "08:00", timeTo: "08:00" },
};

const token = () => localStorage.getItem("token");

// ── Icons ──────────────────────────────────────────────────────────
const ReportIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
    <line x1="16" y1="13" x2="8" y2="13"/>
    <line x1="16" y1="17" x2="8" y2="17"/>
    <polyline points="10 9 9 9 8 9"/>
  </svg>
);

const ViewIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
);

const HistoryIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <polyline points="12 6 12 12 16 14"/>
  </svg>
);

const EditIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>
);

const ShiftBadge = ({ shift, size = "normal" }) => {
  if (!shift) return null;
  const isAM   = shift === "AM";
  const isBoth = shift === "AM & PM";
  const small  = size === "small";

  if (isBoth) {
    return (
      <span style={{
        display: "inline-flex", alignItems: "center", gap: 4,
        fontSize: small ? 10 : 11, fontWeight: 700,
        padding: small ? "2px 6px" : "3px 9px",
        borderRadius: 20, letterSpacing: "0.3px",
        background: "linear-gradient(90deg,#fef3c7 50%,#e0e7f0 50%)",
        color: "#1e3a5f", border: "1px solid #93afc9", flexShrink: 0,
      }}>
        AM &amp; PM
      </span>
    );
  }

  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 3,
      fontSize: small ? 10 : 11, fontWeight: 700,
      padding: small ? "2px 6px" : "3px 9px",
      borderRadius: 20, letterSpacing: "0.3px",
      background: isAM ? "#fef3c7" : "#e0e7f0",
      color:      isAM ? "#92400e" : "#1e3a5f",
      border:     `1px solid ${isAM ? "#fcd34d" : "#93afc9"}`,
      flexShrink: 0,
    }}>
      {shift}
    </span>
  );
};

const StatusBadge = ({ status }) => {
  const map    = { active: "pd-status-active", upcoming: "pd-status-upcoming", completed: "pd-status-completed" };
  const labels = { active: "Active", upcoming: "Upcoming", completed: "Completed" };
  return (
    <span className={`pd-status-badge ${map[status] || "pd-status-completed"}`}>
      {labels[status] || "Unknown"}
    </span>
  );
};

const emptyForm = (patrol, shift) => {
  const times = (shift && DEFAULT_TIMES[shift]) || { timeFrom: "", timeTo: "" };
  const creditHours = calcCreditHours(times.timeFrom, times.timeTo);
  return {
    date:           toInputDate(patrol?.start_date) || "",
    timeFrom:       times.timeFrom,
    timeTo:         times.timeTo,
    preDeployment:  "",
    action1:        "",
    incidents:      "",
    action2:        "",
    safetyConcerns: "",
    action3:        "",
    otherServices:  "",
    visitedAreas:   "",
    personsVisited: "",
    numOfficials:   "",
    numGovt:        "",
    sector:         patrol?.mobile_unit_name || "",
    mustDos:        "",
    remarks:        "",
    creditHours,
    sigOfficer1:    "",
    sigOfficer2:    "",
    sigSupervisor:  "",
  };
};

const dbRowToForm = (row) => ({
  date:           toInputDate(row.patrol_date),
  timeFrom:       row.time_from             || "",
  timeTo:         row.time_to               || "",
  preDeployment:  row.pre_deployment        || "",
  action1:        row.action_pre_deployment || "",
  incidents:      row.incidents             || "",
  action2:        row.action_incidents      || "",
  safetyConcerns: row.safety_concerns       || "",
  action3:        row.action_safety         || "",
  otherServices:  row.other_services        || "",
  visitedAreas:   row.visited_areas         || "",
  personsVisited: row.persons_visited       || "",
  numOfficials:   row.num_officials         != null ? String(row.num_officials)      : "",
  numGovt:        row.num_govt_officials    != null ? String(row.num_govt_officials) : "",
  sector:         row.sector_beat           || "",
  mustDos:        row.must_dos              || "",
  remarks:        row.remarks               || "",
  creditHours:    row.credit_hours          || "",
  sigOfficer1:    row.sig_officer_1         || "",
  sigOfficer2:    row.sig_officer_2         || "",
  sigSupervisor:  row.sig_supervisor        || "",
});

const ShiftBanner = ({ shift }) => {
  if (!shift) return null;
  const isAM   = shift === "AM";
  const isBoth = shift === "AM & PM";
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "10px 18px", borderRadius: 8, marginBottom: 4,
      background: isBoth ? "linear-gradient(90deg,#fef3c7,#e0e7f0)" : isAM ? "#fef3c7" : "#e0e7f0",
      border: `1px solid ${isBoth ? "#93afc9" : isAM ? "#fcd34d" : "#93afc9"}`,
    }}>
      <div>
        <div style={{
          fontSize: 12, fontWeight: 800, letterSpacing: "0.5px",
          color: isAM ? "#92400e" : "#1e3a5f", textTransform: "uppercase",
        }}>
          {isBoth ? "AM & PM Shift" : `${shift} Shift`}
        </div>
        <div style={{ fontSize: 11, color: "#6b7280", marginTop: 1 }}>
          You are assigned to this shift for this patrol
        </div>
      </div>
    </div>
  );
};

const SignatureSelect = ({ label, value, onChange, patrollers, shift }) => {
  const names = patrollers
    .filter((p) => !shift || p.shift === shift || shift === "AM & PM")
    .map((p) => p.officer_name)
    .filter(Boolean);

  const isCustom = value && !names.includes(value);
  const [showCustom, setShowCustom] = useState(isCustom);

  const handleSelect = (e) => {
    const v = e.target.value;
    if (v === "__custom__") { setShowCustom(true); onChange(""); }
    else { setShowCustom(false); onChange(v); }
  };

  return (
    <div className="pd-form-group">
      <label className="pd-modal-label">{label}</label>
      {!showCustom ? (
        <select className="pd-modal-input" value={value || ""} onChange={handleSelect}>
          <option value="">— Select officer —</option>
          {names.map((n) => <option key={n} value={n}>{n}</option>)}
          <option value="__custom__">+ Add officer manually…</option>
        </select>
      ) : (
        <div style={{ display: "flex", gap: 6 }}>
          <input type="text" className="pd-modal-input" placeholder="Rank and name"
            value={value} onChange={(e) => onChange(e.target.value)} style={{ flex: 1 }} />
          <button type="button"
            onClick={() => { setShowCustom(false); onChange(""); }}
            style={{
              padding: "0 10px", fontSize: 12, cursor: "pointer",
              border: "1px solid #d1d5db", borderRadius: 6,
              background: "white", color: "#6b7280",
            }}>↩</button>
        </div>
      )}
    </div>
  );
};

// ── After Patrol Report Modal ──────────────────────────────────────
const AfterPatrolModal = ({ patrol, existingReport, myShift, onClose, onSubmit }) => {
  const [form,       setForm]       = useState(
    existingReport ? dbRowToForm(existingReport) : emptyForm(patrol, myShift)
  );
  const [submitting, setSubmitting] = useState(false);

  const patrolDates = getPatrolDateRange(patrol?.start_date, patrol?.end_date);
  const minDate     = toInputDate(patrol?.start_date);
  const maxDate     = toInputDate(patrol?.end_date);
  const patrollers  = patrol?.patrollers || [];

  const set     = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const setTime = (key) => (v) => {
    setForm((f) => {
      const next = { ...f, [key]: v };
      next.creditHours = calcCreditHours(next.timeFrom, next.timeTo);
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!form.date) { alert("Patrol date is required."); return; }
    const chosen = parseLocalDate(form.date);
    const start  = parseLocalDate(patrol?.start_date);
    const end    = parseLocalDate(patrol?.end_date);
    if (chosen < start || chosen > end) {
      alert(`Date must be within the patrol duration: ${formatDate(patrol?.start_date)} – ${formatDate(patrol?.end_date)}`);
      return;
    }
    if (!isEditing) {
    try {
      const res  = await fetch(`${API_BASE}/patrol/patrols/${patrol.patrol_id}/after-reports/mine`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      const data = await res.json();
      if (data.success) {
        const existing = data.data.find((r) => toInputDate(r.patrol_date) === form.date);
        if (existing) {
          const confirmed = window.confirm(
            `A report has already been submitted for this date (${formatDate(form.date)}) by your shift.\n\nDo you want to overwrite it with your new entries?`
          );
          if (!confirmed) return;
        }
      }
    } catch {
      // If the check fails, let the submit proceed — backend upsert handles deduplication
    }
  }

  setSubmitting(true);
  await onSubmit(patrol.patrol_id, form, myShift);
  setSubmitting(false);
  onClose();
};

  const isEditing = !!existingReport;

  return (
    <div className="pd-modal">
      <div className="pd-modal-content">
        <div className="pd-modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{
              width: 42, height: 42, borderRadius: 10,
              background: "rgba(255,255,255,0.15)",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0, border: "1px solid rgba(255,255,255,0.2)",
            }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"
                viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
              </svg>
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <h2 style={{ margin: 0 }}>{isEditing ? "Edit After Patrol Report" : "After Patrol Report"}</h2>
                {myShift && <ShiftBadge shift={myShift} />}
              </div>
              <div className="pd-modal-header-sub">
                {patrol?.patrol_name} &nbsp;·&nbsp; {formatDate(patrol?.start_date)} – {formatDate(patrol?.end_date)}
              </div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 1, display: "flex", alignItems: "center", gap: 8 }}>
                ANNEX D · PNPM-DO-DS-3-3-15 (DO)
                {isEditing && (
                  <span style={{
                    background: "rgba(245,158,11,0.3)", color: "#fde68a",
                    padding: "1px 6px", borderRadius: 4, fontWeight: 700,
                  }}>
                    EDITING EXISTING REPORT
                  </span>
                )}
              </div>
            </div>
          </div>
          <span className="pd-modal-close" onClick={onClose}>&times;</span>
        </div>

        <div className="pd-modal-body">
          {myShift && <ShiftBanner shift={myShift} />}

          {myShift && (
            <div style={{
              display: "flex", alignItems: "flex-start", gap: 8,
              padding: "9px 14px", borderRadius: 7, marginBottom: 8,
              background: "rgba(30,58,95,0.05)", border: "1px solid rgba(30,58,95,0.12)",
              fontSize: 12, color: "#374151",
            }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
                fill="none" stroke="#1e3a5f" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
                style={{ flexShrink: 0, marginTop: 1 }}>
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
              <span>
                This report is <strong>shared</strong> with all officers in the <strong>{myShift} shift</strong>.
                Any shift-mate can view and edit it.
              </span>
            </div>
          )}

          <h3 className="pd-section-title">1. Patrol Date &amp; Time</h3>

          <div style={{
            display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
            marginBottom: 12, padding: "8px 12px",
            background: "rgba(30,58,95,0.05)", borderRadius: 8,
            border: "1px solid rgba(30,58,95,0.1)", fontSize: 12,
          }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24"
              fill="none" stroke="#1e3a5f" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <span style={{ color: "#1e3a5f", fontWeight: 600 }}>
              Allowed dates: {formatDate(patrol?.start_date)} – {formatDate(patrol?.end_date)}
            </span>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginLeft: 4 }}>
              {patrolDates.map((key) => {
                const isSelected = form.date === key;
                return (
                  <button key={key} type="button"
                    onClick={() => setForm((f) => ({ ...f, date: key }))}
                    style={{
                      padding: "2px 10px", fontSize: 11, fontWeight: 700,
                      borderRadius: 20, cursor: "pointer", border: "1px solid",
                      borderColor: isSelected ? "#1e3a5f" : "#93afc9",
                      background:  isSelected ? "#1e3a5f" : "white",
                      color:       isSelected ? "white"   : "#1e3a5f",
                      transition:  "all 0.15s",
                    }}>
                    {formatDateShort(key)}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="pd-form-grid">
            <div className="pd-form-group">
              <label className="pd-modal-label">Date *</label>
              <input type="date" className="pd-modal-input" value={form.date}
                onChange={set("date")} min={minDate} max={maxDate} />
            </div>
            <div className="pd-form-group">
              <label className="pd-modal-label">Time From</label>
              <TimePicker value={form.timeFrom} onChange={setTime("timeFrom")} />
            </div>
            <div className="pd-form-group">
              <label className="pd-modal-label">Time To</label>
              <TimePicker value={form.timeTo} onChange={setTime("timeTo")} />
            </div>
          </div>

          <h3 className="pd-section-title">2. Pre-Deployment Instructions</h3>
          <div className="pd-form-grid">
            <div className="pd-form-group pd-full">
              <label className="pd-modal-label">Specific instructions received</label>
              <textarea className="pd-modal-input" rows={3} value={form.preDeployment}
                onChange={set("preDeployment")} placeholder="Enter pre-deployment instructions..." />
            </div>
            <div className="pd-form-group pd-full">
              <label className="pd-modal-label">Action Taken</label>
              <input type="text" className="pd-modal-input" placeholder="Action taken..."
                value={form.action1} onChange={set("action1")} />
            </div>
          </div>

          <h3 className="pd-section-title">3. Incidents &amp; Unusual Events</h3>
          <div style={{ fontSize: 12, color: "var(--gray-400)", marginBottom: 12, fontStyle: "italic" }}>
            Crime incidents, public disturbance, major events, etc.
          </div>
          <div className="pd-form-grid">
            <div className="pd-form-group pd-full">
              <label className="pd-modal-label">Incidents / Unusual situations</label>
              <textarea className="pd-modal-input" rows={3} value={form.incidents}
                onChange={set("incidents")} placeholder="Describe incidents or unusual events..." />
            </div>
            <div className="pd-form-group pd-full">
              <label className="pd-modal-label">Action Taken</label>
              <input type="text" className="pd-modal-input" placeholder="Action taken..."
                value={form.action2} onChange={set("action2")} />
            </div>
          </div>

          <h3 className="pd-section-title">4. Public Safety Concerns</h3>
          <div style={{ fontSize: 12, color: "var(--gray-400)", marginBottom: 12, fontStyle: "italic" }}>
            Uncovered manholes, busted lights, uncollected garbage, fire hazard, missing bridge railings, etc.
          </div>
          <div className="pd-form-grid">
            <div className="pd-form-group pd-full">
              <label className="pd-modal-label">Safety concerns observed</label>
              <textarea className="pd-modal-input" rows={3} value={form.safetyConcerns}
                onChange={set("safetyConcerns")} placeholder="Describe public safety concerns..." />
            </div>
            <div className="pd-form-group pd-full">
              <label className="pd-modal-label">Action Taken</label>
              <input type="text" className="pd-modal-input" placeholder="Action taken..."
                value={form.action3} onChange={set("action3")} />
            </div>
          </div>

          <h3 className="pd-section-title">5. Other Services &amp; Visited Areas</h3>
          <div className="pd-form-grid">
            <div className="pd-form-group pd-full">
              <label className="pd-modal-label">Other public safety services rendered</label>
              <textarea className="pd-modal-input" rows={2} value={form.otherServices}
                onChange={set("otherServices")}
                placeholder="Area and route security, assistance to PWD, recovered property, etc." />
            </div>
            <div className="pd-form-group pd-full">
              <label className="pd-modal-label">Visited areas</label>
              <textarea className="pd-modal-input" rows={2} value={form.visitedAreas}
                onChange={set("visitedAreas")}
                placeholder="House, school, church, business, barangay, etc." />
            </div>
          </div>

          <h3 className="pd-section-title">6. Persons Visited</h3>
          <div className="pd-form-grid">
            <div className="pd-form-group pd-full">
              <label className="pd-modal-label">Name of persons visited / local officials</label>
              <textarea className="pd-modal-input" rows={2} value={form.personsVisited}
                onChange={set("personsVisited")} placeholder="List persons visited..." />
            </div>
            <div className="pd-form-group">
              <label className="pd-modal-label">No. of officials visited</label>
              <input type="number" min={0} className="pd-modal-input" placeholder="0"
                value={form.numOfficials} onChange={set("numOfficials")} />
            </div>
            <div className="pd-form-group">
              <label className="pd-modal-label">Total gov&apos;t officials in area (incl. brgy.)</label>
              <input type="number" min={0} className="pd-modal-input" placeholder="0"
                value={form.numGovt} onChange={set("numGovt")} />
            </div>
            <div className="pd-form-group" />
          </div>

          <h3 className="pd-section-title">7. Patrol Information</h3>
          <div className="pd-form-grid">
            <div className="pd-form-group">
              <label className="pd-modal-label">Sector / Beat Patrolled</label>
              <input type="text" className="pd-modal-input" value={form.sector} onChange={set("sector")} />
            </div>
            <div className="pd-form-group">
              <label className="pd-modal-label">Total Patrol Credit Hours</label>
              <input type="text" className="pd-modal-input"
                placeholder="Auto-calculated from times"
                value={form.creditHours} onChange={set("creditHours")}
                style={{ background: form.creditHours ? "rgba(34,197,94,0.05)" : undefined }} />
            </div>
            <div className="pd-form-group" />
            <div className="pd-form-group pd-full">
              <label className="pd-modal-label">Patrolled MUST DOs such as</label>
              <textarea className="pd-modal-input" rows={2} value={form.mustDos}
                onChange={set("mustDos")} placeholder="List MUST DOs patrolled..." />
            </div>
          </div>

          <h3 className="pd-section-title">8. Remarks &amp; Recommendations</h3>
          <div className="pd-form-grid">
            <div className="pd-form-group pd-full">
              <label className="pd-modal-label">Remarks / Recommendations</label>
              <textarea className="pd-modal-input" rows={3} value={form.remarks}
                onChange={set("remarks")}
                placeholder="Best practices, traffic assistance rendered, etc." />
            </div>
          </div>

          <h3 className="pd-section-title">9. Signatures</h3>
          <div className="pd-form-grid">
            <SignatureSelect label="Patrol Officer 1" value={form.sigOfficer1}
              onChange={(v) => setForm((f) => ({ ...f, sigOfficer1: v }))}
              patrollers={patrollers} shift={myShift} />
            <SignatureSelect label="Patrol Officer 2" value={form.sigOfficer2}
              onChange={(v) => setForm((f) => ({ ...f, sigOfficer2: v }))}
              patrollers={patrollers} shift={myShift} />
            <SignatureSelect label="Patrol Supervisor" value={form.sigSupervisor}
              onChange={(v) => setForm((f) => ({ ...f, sigSupervisor: v }))}
              patrollers={patrollers} shift={myShift} />
          </div>
        </div>

        <div className="pd-modal-footer">
          <button type="button" className="pd-btn pd-btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="pd-btn pd-btn-navy" onClick={handleSubmit}
            disabled={submitting} style={{ minWidth: 200 }}>
            {submitting ? "Submitting..." : isEditing ? "Update After Patrol Report" : "Submit After Patrol Report"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── My Reports History Modal ───────────────────────────────────────
const MyReportsModal = ({ patrol, onClose, onEdit, onShowToast }) => {
  const [reports,    setReports]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [activeDate, setActiveDate] = useState(null);
  const [deleting,   setDeleting]   = useState(null);
  

  const patrolDates = getPatrolDateRange(patrol?.start_date, patrol?.end_date);

  const fetchReports = async () => {
  setLoading(true);
  try {
    const role = getMyRole();
    const isAdmin = role === "Administrator";
    const endpoint = isAdmin
      ? `${API_BASE}/patrol/patrols/${patrol.patrol_id}/after-reports`
      : `${API_BASE}/patrol/patrols/${patrol.patrol_id}/after-reports/mine`;

    const res = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${token()}` },
    });
    const data = await res.json();
    if (data.success) {
      setReports(data.data);
      if (data.data.length > 0 && !activeDate) {
        setActiveDate(toInputDate(data.data[0].patrol_date));
      }
    }
  } catch (err) {
    console.error("Fetch my reports error:", err);
  } finally {
    setLoading(false);
  }
};

  const handleDelete = async (reportId) => {
    if (!window.confirm("Delete this report? This cannot be undone.")) return;
    setDeleting(reportId);
    try {
      const res  = await fetch(`${API_BASE}/patrol/after-reports/${reportId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token()}` },
      });
      const data = await res.json();
      if (data.success) {
        onShowToast?.("Report deleted successfully.", "success");
        setReports((prev) => prev.filter((r) => r.report_id !== reportId));
      } else {
        onShowToast?.(data.message || "Failed to delete report.", "error");
      }
    } catch {
      onShowToast?.("Server error while deleting.", "error");
    } finally {
      setDeleting(null);
    }
  };

  useEffect(() => {
    if (patrolDates.length > 0) setActiveDate(patrolDates[0]);
    fetchReports();
  }, [patrol.patrol_id]);

  const reportsByDate = {};
  reports.forEach((r) => {
    const key = toInputDate(r.patrol_date);
    if (!reportsByDate[key]) reportsByDate[key] = [];
    reportsByDate[key].push(r);
  });

  const activeReports = activeDate ? (reportsByDate[activeDate] || []) : [];

  return (
    <div className="pd-modal">
      <div className="pd-modal-content" style={{ maxWidth: 720 }}>
        <div className="pd-modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{
              width: 42, height: 42, borderRadius: 10,
              background: "rgba(255,255,255,0.15)",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0, border: "1px solid rgba(255,255,255,0.2)",
            }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"
                viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
              </svg>
            </div>
            <div>
              <h2>{getMyRole() === "Administrator" ? "All Shift Reports" : "My Submitted Reports"}</h2>
              <div className="pd-modal-header-sub">
                {patrol?.patrol_name} &nbsp;·&nbsp; {formatDate(patrol?.start_date)} – {formatDate(patrol?.end_date)}
              </div>
            </div>
          </div>
          <span className="pd-modal-close" onClick={onClose}>&times;</span>
        </div>

        <div style={{
          display: "flex", borderBottom: "2px solid #e5e7eb",
          background: "#f9fafb", overflowX: "auto",
          flexShrink: 0, padding: "0 20px",
        }}>
          {patrolDates.map((d) => {
            const count    = (reportsByDate[d] || []).length;
            const isActive = activeDate === d;
            return (
              <button key={d} type="button" onClick={() => setActiveDate(d)}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "10px 14px", background: "transparent", border: "none",
                  borderBottom: `3px solid ${isActive ? "#1e3a5f" : "transparent"}`,
                  marginBottom: -2, fontSize: 13, fontWeight: isActive ? 700 : 500,
                  color: isActive ? "#1e3a5f" : "#6b7280",
                  cursor: "pointer", whiteSpace: "nowrap",
                  fontFamily: "inherit", transition: "all 0.15s",
                }}>
                {formatDateShort(d)}
                {count > 0 && (
                  <span style={{
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    minWidth: 18, height: 18, padding: "0 5px",
                    borderRadius: 9, fontSize: 10, fontWeight: 700,
                    background: isActive ? "#1e3a5f" : "#d1d5db",
                    color: isActive ? "white" : "#374151",
                  }}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div style={{ overflowY: "auto", flex: 1 }}>
          <div style={{
            fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: 700,
            color: "white", padding: "10px 32px",
            background: "linear-gradient(135deg, var(--navy-dark) 0%, var(--navy-primary) 100%)",
            textTransform: "uppercase", letterSpacing: "0.8px",
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <span>{activeDate ? formatDate(activeDate) : "Select a date"}</span>
            <span style={{ opacity: 0.7, fontWeight: 400, fontSize: 12 }}>
              {activeReports.length} submission{activeReports.length !== 1 ? "s" : ""}
            </span>
          </div>

          <div style={{ padding: "20px 32px 28px", background: "var(--gray-50)", minHeight: 120 }}>
            {loading ? (
              <div style={{ textAlign: "center", padding: 32, color: "#9ca3af" }}>Loading reports...</div>
            ) : activeReports.length === 0 ? (
              <div style={{
                textAlign: "center", padding: 28, color: "#9ca3af",
                background: "rgba(30,58,95,0.03)", borderRadius: 8,
                border: "1px dashed #e5e7eb", fontSize: 13,
              }}>
                <div style={{ fontWeight: 600, color: "#6b7280", marginBottom: 4 }}>
                  No report submitted for {activeDate ? formatDate(activeDate) : "this date"}
                </div>
                <div style={{ fontSize: 12 }}>Use the "After Report" button to submit a report for this date.</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {activeReports.map((r) => (
                  <div key={r.report_id} style={{
                    background: "white", border: "1px solid var(--gray-200)",
                    borderRadius: 8, overflow: "hidden",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                  }}>
                    <div style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "10px 20px",
                      background: "linear-gradient(to right, rgba(30,58,95,0.06), transparent)",
                      borderBottom: "1px solid var(--gray-200)",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: 700, color: "var(--navy-primary)" }}>
                          {formatDate(r.patrol_date)}
                        </span>
                        {r.time_from && r.time_to && (
                          <span style={{ fontSize: 11, color: "var(--gray-600)", fontWeight: 500, background: "var(--gray-100)", padding: "2px 8px", borderRadius: 4 }}>
                            {r.time_from} – {r.time_to}
                          </span>
                        )}
                        {r.credit_hours && (
                          <span style={{
                            fontSize: 11, color: "#16a34a", fontWeight: 700,
                            background: "rgba(34,197,94,0.08)", padding: "2px 8px",
                            borderRadius: 4, border: "1px solid #86efac",
                          }}>
                            {r.credit_hours}
                          </span>
                        )}
                        {r.shift && <ShiftBadge shift={r.shift} size="small" />}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 11, color: "var(--gray-400)" }}>
                          Submitted {formatDateTime(r.submitted_at)}
                        </span>
                        <button className="pd-action-btn pd-action-btn-edit"
                          onClick={() => onEdit(patrol, r)}>
                          <EditIcon /> Edit
                        </button>
                        <button className="pd-action-btn pd-action-btn-delete"
                          disabled={deleting === r.report_id}
                          onClick={() => handleDelete(r.report_id)}>
                          {deleting === r.report_id ? "Deleting…" : (
                            <>
                              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12"
                                viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="3 6 5 6 21 6"/>
                                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                                <path d="M10 11v6"/><path d="M14 11v6"/>
                                <path d="M9 6V4h6v2"/>
                              </svg>
                              Delete
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)" }}>
                      {[
                        { label: "Sector / Beat",     value: r.sector_beat },
                        { label: "Officials Visited", value: r.num_officials != null ? String(r.num_officials) : null },
                        { label: "Signatures",        value: [r.sig_officer_1, r.sig_officer_2, r.sig_supervisor].filter(Boolean).join(", ") || null },
                        { label: "Incidents",         value: r.incidents, full: true },
                        { label: "Remarks",           value: r.remarks,   full: true },
                      ].map(({ label, value, full }, i) => (
                        <div key={i} style={{
                          padding: "10px 20px",
                          gridColumn: full ? "1 / -1" : undefined,
                          borderRight: !full && (i + 1) % 3 !== 0 ? "1px solid var(--gray-100)" : "none",
                          borderBottom: "1px solid var(--gray-100)",
                        }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--gray-400)", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 3 }}>
                            {label}
                          </div>
                          <div style={{ fontSize: 13, color: value ? "var(--gray-900)" : "#9ca3af", fontStyle: value ? "normal" : "italic" }}>
                            {value || "—"}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="pd-modal-footer">
          <button type="button" className="pd-btn pd-btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};

// ── View Patrol Modal ──────────────────────────────────────────────
const ViewPatrolModal = ({ patrol, onClose }) => {
  const patrollers = patrol.patrollers || [];
  const barangays  = [...new Set(
    (patrol.routes || [])
      .filter((r) => (r.stop_order || 0) <= 0 && r.barangay)
      .map((r) => r.barangay)
  )];

  const SectionHeader = ({ children }) => (
    <div style={{
      fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: 700,
      color: "white", padding: "10px 32px",
      background: "linear-gradient(135deg, var(--navy-dark) 0%, var(--navy-primary) 100%)",
      textTransform: "uppercase", letterSpacing: "0.8px",
    }}>
      {children}
    </div>
  );

  const amPatrollers = patrollers.filter((p) => p.shift === "AM");
  const pmPatrollers = patrollers.filter((p) => p.shift === "PM");
  const noShift      = patrollers.filter((p) => !p.shift);

  return (
    <div className="pd-modal">
      <div className="pd-modal-content" style={{ maxWidth: 640 }}>
        <div className="pd-modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{
              width: 42, height: 42, borderRadius: 10,
              background: "rgba(255,255,255,0.15)",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0, border: "1px solid rgba(255,255,255,0.2)",
            }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"
                viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            </div>
            <div>
              <h2>View Patrol Assignment</h2>
              <div className="pd-modal-header-sub">Read-only view of patrol record</div>
              <span style={{
                display: "inline-flex", alignItems: "center",
                background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: 6, padding: "2px 8px", marginTop: 4,
                fontFamily: "monospace", fontSize: 12, fontWeight: 700,
                color: "rgba(255,255,255,0.85)", letterSpacing: "0.5px",
              }}>
                # {patrol.patrol_name}
              </span>
            </div>
          </div>
          <span className="pd-modal-close" onClick={onClose}>&times;</span>
        </div>

        <div style={{ overflowY: "auto", flex: 1 }}>
          <SectionHeader>Patrol Information</SectionHeader>
          <div style={{ padding: "20px 32px 28px", background: "var(--gray-50)" }}>
            <div style={{ background: "white", border: "1px solid var(--gray-200)", borderRadius: 8, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)" }}>
                {[
                  { label: "Patrol Name",      value: patrol.patrol_name },
                  { label: "Status",           value: <StatusBadge status={getPatrolStatus(patrol)} /> },
                  { label: "Mobile Unit",      value: patrol.mobile_unit_name || "—" },
                  { label: "Start Date",       value: formatDate(patrol.start_date) },
                  { label: "End Date",         value: formatDate(patrol.end_date) },
                  { label: "Total Patrollers", value: patrollers.length || "—" },
                ].map(({ label, value }, i) => (
                  <div key={i} style={{
                    display: "flex", flexDirection: "column", gap: 4, padding: "14px 20px",
                    borderRight: (i + 1) % 3 !== 0 ? "1px solid var(--gray-100)" : "none",
                    borderBottom: i < 3 ? "1px solid var(--gray-100)" : "none",
                  }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "var(--gray-400)", textTransform: "uppercase", letterSpacing: "0.6px" }}>{label}</span>
                    <span style={{ fontSize: 14, color: "var(--gray-900)", fontWeight: 500 }}>{value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <SectionHeader>Patrollers Assigned</SectionHeader>
          <div style={{ padding: "20px 32px 28px", background: "var(--gray-50)" }}>
            {patrollers.length === 0 ? (
              <div style={{ textAlign: "center", padding: 28, color: "#9ca3af", background: "rgba(30,58,95,0.03)", borderRadius: 8, border: "1px dashed #e5e7eb", fontSize: 13 }}>
                No patrollers assigned
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {amPatrollers.length > 0 && (
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <ShiftBadge shift="AM" />
                      <span style={{ fontSize: 12, color: "#6b7280", fontWeight: 600 }}>
                        {amPatrollers.length} patroller{amPatrollers.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {amPatrollers.map((p, i) => <PatrollerCard key={i} p={p} />)}
                    </div>
                  </div>
                )}
                {pmPatrollers.length > 0 && (
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <ShiftBadge shift="PM" />
                      <span style={{ fontSize: 12, color: "#6b7280", fontWeight: 600 }}>
                        {pmPatrollers.length} patroller{pmPatrollers.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {pmPatrollers.map((p, i) => <PatrollerCard key={i} p={p} />)}
                    </div>
                  </div>
                )}
                {noShift.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {noShift.map((p, i) => <PatrollerCard key={i} p={p} />)}
                  </div>
                )}
              </div>
            )}
          </div>

          {barangays.length > 0 && (
            <>
              <SectionHeader>Area of Responsibility</SectionHeader>
              <div style={{ padding: "20px 32px 28px", background: "var(--gray-50)" }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {barangays.map((b, i) => (
                    <span key={i} className="pd-count-pill pd-count-barangay">{b}</span>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="pd-modal-footer">
          <button type="button" className="pd-btn pd-btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};

const PatrollerCard = ({ p }) => (
  <div style={{
    background: "white", border: "1px solid var(--gray-200)",
    borderRadius: 8, padding: "10px 16px",
    display: "flex", alignItems: "center", gap: 12,
    boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
  }}>
    <div style={{
      width: 34, height: 34, borderRadius: "50%",
      background: "var(--navy-primary)", color: "white",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 13, fontWeight: 700, flexShrink: 0,
    }}>
      {(p.officer_name || "?").charAt(0).toUpperCase()}
    </div>
    <div style={{ fontWeight: 700, color: "var(--gray-900)", fontSize: 14 }}>
      {p.officer_name || "Unknown"}
    </div>
    {p.shift && <ShiftBadge shift={p.shift} size="small" />}
  </div>
);

// ── Main AfterPatrol ───────────────────────────────────────────────
const AfterPatrol = () => {
  const [patrols,         setPatrols]         = useState([]);
  const [loading,         setLoading]         = useState(false);
  const [notif,           setNotif]           = useState(null);
  const [selectedReport,  setSelectedReport]  = useState(null);
  const [selectedView,    setSelectedView]    = useState(null);
  const [selectedHistory, setSelectedHistory] = useState(null);
  const [filters,         setFilters]         = useState({ search: "", status: "", date_from: "", date_to: "" });
  const [currentPage,     setCurrentPage]     = useState(1);
  const ITEMS_PER_PAGE = 15;
  const [selectedBeat, setSelectedBeat] = useState(null);
  const [geoJSONData, setGeoJSONData] = useState(null);

  const showToast = (message, type = "success") => {
    setNotif({ message, type });
  };

  const fetchMyPatrols = async () => {
  setLoading(true);
  try {
    const role = getMyRole();
    const isAdmin = role === "Administrator";
    const endpoint = isAdmin
      ? `${API_BASE}/patrol/patrols`
      : `${API_BASE}/patrol/my-patrols`;

    const res = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${token()}` },
    });
    const data = await res.json();
    if (data.success) setPatrols(data.data);
  } catch (err) {
    console.error("AfterPatrol fetch error:", err);
  } finally {
    setLoading(false);
  }
};

  useEffect(() => { fetchMyPatrols(); }, []);
  useEffect(() => {
  fetch("/bacoor_barangays.geojson")
    .then((r) => r.json())
    .then((data) => setGeoJSONData(data))
    .catch((err) => console.error("GeoJSON load error:", err));
}, []);

  const handleSubmitReport = async (patrolId, formData, shift) => {
    try {
      const res  = await fetch(`${API_BASE}/patrol/patrols/${patrolId}/after-report`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ ...formData, shift }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message || "After Patrol Report submitted successfully!", "success");
      } else {
        showToast(data.message || "Something went wrong.", "error");
      }
    } catch {
      showToast("Server error while submitting report.", "error");
    }
  };

  const handleEditFromHistory = (patrol, existingReport) => {
    const myShift = getMyShift(patrol);
    setSelectedHistory(null);
    setTimeout(() => {
      setSelectedReport({ patrol, existingReport, myShift });
      showToast("Opening report for editing.", "info");
    }, 150);
  };

  // ── KEY FUNCTION: check for existing report before opening form ──
  const handleOpenAfterReport = async (patrol, myShift) => {
    try {
      const res  = await fetch(`${API_BASE}/patrol/patrols/${patrol.patrol_id}/after-reports/mine`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      const data = await res.json();
      if (!data.success) {
        showToast("Could not check existing reports.", "error");
        return;
      }

      const todayStr = toInputDate(new Date());
      const existing = data.data.find(
        (r) => toInputDate(r.patrol_date) === todayStr &&
               (r.shift === myShift || !myShift)
      );

      if (existing) {
        showToast(
          "A report for today already exists. Opening it for editing.",
          "info"
        );
        setTimeout(() => {
          setSelectedReport({ patrol, existingReport: existing, myShift });
        }, 600);
        return;
      }

      setSelectedReport({ patrol, existingReport: null, myShift });
    } catch {
      showToast("Server error while checking reports.", "error");
    }
  };

  // ── Filter + paginate ──────────────────────────────────────────
  const filtered = patrols.filter((p) => {
    const status      = getPatrolStatus(p);
    const matchSearch = !filters.search ||
      (p.patrol_name      || "").toLowerCase().includes(filters.search.toLowerCase()) ||
      (p.mobile_unit_name || "").toLowerCase().includes(filters.search.toLowerCase());
    const matchStatus = !filters.status    || status === filters.status;
    const matchFrom   = !filters.date_from || new Date(p.start_date) >= new Date(filters.date_from);
    const matchTo     = !filters.date_to   || new Date(p.end_date)   <= new Date(filters.date_to);
    return matchSearch && matchStatus && matchFrom && matchTo;
  });

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paginated  = filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  const stats = {
    total:     patrols.length,
    active:    patrols.filter((p) => getPatrolStatus(p) === "active").length,
    upcoming:  patrols.filter((p) => getPatrolStatus(p) === "upcoming").length,
    completed: patrols.filter((p) => getPatrolStatus(p) === "completed").length,
  };

  const handleFilterChange = (e) => {
    setFilters((f) => ({ ...f, [e.target.name]: e.target.value }));
    setCurrentPage(1);
  };

  const clearFilters = () => {
    setFilters({ search: "", status: "", date_from: "", date_to: "" });
    setCurrentPage(1);
  };

  return (
     <div className="ap-wrap pd-content-area">

      <div className="pd-page-header">
        <div className="pd-page-header-left">
          <h1>Patrol Dashboard</h1>
          <p>Your assigned patrol duties and after-patrol reports</p>
        </div>
        <div className="pd-page-header-right">
          <button className="pd-btn pd-btn-secondary" onClick={fetchMyPatrols}>
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
              <path d="M3 3v5h5"/>
            </svg>
            Refresh
          </button>
        </div>
      </div>

      <div className="pd-stat-row">
        {[
          {
            label: "Total Assigned", num: stats.total, iconClass: "pd-stat-icon-navy",
            icon: (
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
            ),
          },
          {
            label: "Active Patrols", num: stats.active, iconClass: "pd-stat-icon-green",
            icon: (
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
              </svg>
            ),
          },
          {
            label: "Upcoming", num: stats.upcoming, iconClass: "pd-stat-icon-amber",
            icon: (
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
              </svg>
            ),
          },
          {
            label: "Completed", num: stats.completed, iconClass: "pd-stat-icon-gray",
            icon: (
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            ),
          },
        ].map(({ label, num, iconClass, icon }, i) => (
          <div className="pd-stat-card" key={i}>
            <div className={`pd-stat-icon ${iconClass}`}>{icon}</div>
            <div>
              <div className="pd-stat-num">{num}</div>
              <div className="pd-stat-label">{label}</div>
            </div>
          </div>
        ))}
      </div>

     <div className="pd-filter-bar">
  <div className="pd-filter-icon">
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
    </svg>
  </div>
  <input
    className="pd-filter-search"
    type="text"
    placeholder="Search by patrol name or unit..."
    name="search"
    value={filters.search}
    onChange={handleFilterChange}
    onKeyDown={(e) => e.key === "Enter" && setCurrentPage(1)}
  />
  <select
    className="pd-filter-select"
    name="status"
    value={filters.status}
    onChange={handleFilterChange}
  >
    <option value="">All Statuses</option>
    <option value="active">Active</option>
    <option value="upcoming">Upcoming</option>
    <option value="completed">Completed</option>
  </select>
  <div className="pd-filter-date-group">
    <input type="date" className="pd-filter-date" name="date_from"
      value={filters.date_from} onChange={handleFilterChange} />
    <span className="pd-filter-arrow">→</span>
    <input type="date" className="pd-filter-date" name="date_to"
      value={filters.date_to} onChange={handleFilterChange} />
  </div>
  <button className="pd-filter-apply" onClick={() => setCurrentPage(1)}>Apply</button>
  {(filters.search || filters.status || filters.date_from || filters.date_to) && (
    <button className="pd-filter-reset" onClick={clearFilters} title="Reset filters">↺</button>
  )}
</div>

      <div className="pd-table-card">
        <div className="pd-table-container">
          <table className="pd-data-table">
           <thead>
  <tr>
    <th>Patrol Name</th>
    <th>Status</th>
    <th>Duration</th>
    {getMyRole() === "Administrator" ? <th>Patrollers</th> : <th>My Shift</th>}
    <th>Actions</th>
  </tr>
</thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} style={{ textAlign: "center", padding: 32, color: "#9ca3af" }}>Loading...</td></tr>
              ) : paginated.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: "center", padding: 32, color: "#9ca3af" }}>No patrol assignments found.</td></tr>
              ) : paginated.map((patrol) => {
                  const isAdmin    = getMyRole() === "Administrator";  // ← add this
                const status     = getPatrolStatus(patrol);
                const myShift    = getMyShift(patrol);
                const patrollers = patrol.patrollers || [];
                const amCount    = patrollers.filter((p) => p.shift === "AM").length;
                const pmCount    = patrollers.filter((p) => p.shift === "PM").length;
                const barangays  = [...new Set(
                  (patrol.routes || [])
                    .filter((r) => (r.stop_order || 0) <= 0 && r.barangay)
                    .map((r) => r.barangay)
                )];
                return (
                 <tr key={patrol.patrol_id}>
  <td>
    <span className="ap-patrol-name-badge">
      {patrol.patrol_name}
    </span>
  </td>
  <td><StatusBadge status={status} /></td>
  <td>
    <span className="ap-duration">
      {formatDate(patrol.start_date)} — {formatDate(patrol.end_date)}
    </span>
  </td>
  {isAdmin ? (
    <td>
      {patrollers.length > 0 ? (
        <div className="ap-patroller-counts">
          {amCount > 0 && <span className="ap-shift-pill ap-shift-am">AM · {amCount} officer{amCount !== 1 ? "s" : ""}</span>}
          {pmCount > 0 && <span className="ap-shift-pill ap-shift-pm">PM · {pmCount} officer{pmCount !== 1 ? "s" : ""}</span>}
          {patrollers.length - amCount - pmCount > 0 && (
            <span className="pd-count-pill pd-count-patroller">{patrollers.length - amCount - pmCount} other</span>
          )}
        </div>
      ) : <span className="ap-empty">—</span>}
    </td>
  ) : (
    <td>
      {myShift ? <ShiftBadge shift={myShift} /> : <span className="ap-empty">—</span>}
    </td>
  )}
  <td>
    <div className="ap-wrap pd-action-links">
      <button className="pd-action-btn pd-action-btn-view"
        onClick={() => setSelectedBeat(patrol)}>
        <ViewIcon /> View
      </button>
      <button className="pd-action-btn pd-action-btn-history"
        onClick={() => setSelectedHistory(patrol)}>
        <HistoryIcon /> History
      </button>
      <button className="pd-action-btn pd-action-btn-report"
        onClick={() => handleOpenAfterReport(patrol, myShift)}>
        <ReportIcon /> After Report
      </button>
    </div>
  </td>
</tr> 
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="pd-pagination">
          <div className="pd-pagination-info">
            Showing {filtered.length === 0 ? 0 : (currentPage - 1) * ITEMS_PER_PAGE + 1}–
            {Math.min(currentPage * ITEMS_PER_PAGE, filtered.length)} of {filtered.length} records
          </div>
          <div className="pd-pagination-controls">
            <button className="pd-pagination-btn" disabled={currentPage === 1}
              onClick={() => setCurrentPage((p) => p - 1)}>Previous</button>
            <span className="pd-pagination-current">Page {currentPage} of {totalPages || 1}</span>
            <button className="pd-pagination-btn" disabled={currentPage === totalPages || totalPages === 0}
              onClick={() => setCurrentPage((p) => p + 1)}>Next</button>
          </div>
        </div>
      </div>

      {selectedReport && (
        <AfterPatrolModal
          patrol={selectedReport.patrol}
          existingReport={selectedReport.existingReport}
          myShift={selectedReport.myShift}
          onClose={() => setSelectedReport(null)}
          onSubmit={handleSubmitReport}
        />
      )}
      {selectedView && (
        <ViewPatrolModal
          patrol={selectedView}
          onClose={() => setSelectedView(null)}
        />
      )}
      {selectedHistory && (
        <MyReportsModal
          patrol={selectedHistory}
          onClose={() => setSelectedHistory(null)}
          onEdit={handleEditFromHistory}
          onShowToast={showToast}
        />
      )}

      {notif && (
        <Notification
          message={notif.message}
          type={notif.type}
          onClose={() => setNotif(null)}
          duration={3500}
        />
      )}
    {selectedBeat && geoJSONData && (
  <BeatCard
    patrol={selectedBeat}
    geoJSONData={geoJSONData}
    onClose={() => setSelectedBeat(null)}
    onEdit={() => {}}
    onDelete={() => {}}
    hideEdit={true}
    hideDelete={true}
  />
)}
    </div>
  );
};

export default AfterPatrol;