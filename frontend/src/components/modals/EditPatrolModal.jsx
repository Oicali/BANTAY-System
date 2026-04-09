import { useState, useEffect, useRef, useCallback } from "react";
import Map, { Source, Layer } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import "./EditPatrolModal.css";
import LoadingModal from "./LoadingModal";
import Notification from "./Notification";

const API_BASE = import.meta.env.VITE_API_URL;

const SHIFTS = ["Morning", "Night"];
const SHIFT_LABELS = { Morning: "Morning", Night: "Night" };

const fillLayer    = { id: "epm-fill",    type: "fill",   paint: { "fill-color": ["get", "fillColor"], "fill-opacity": 0.5 } };
const outlineLayer = { id: "epm-outline", type: "line",   paint: { "line-color": "#1e3a5f", "line-width": 1.5, "line-opacity": 0.7 } };
const labelLayer   = {
  id: "epm-labels", type: "symbol",
  layout: { "text-field": ["get", "name_db"], "text-size": 10, "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"], "text-max-width": 8, "text-anchor": "center", "text-allow-overlap": false },
  paint:  { "text-color": "#0a1628", "text-halo-color": "rgba(255,255,255,0.85)", "text-halo-width": 1.5 },
};

// ── Date helpers ───────────────────────────────────────────
const parseLocalDate = (d) => {
  if (!d) return null;
  const dt = new Date(d);
  return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
};
const toLocalDateStr = (d) => {
  const dt = parseLocalDate(d);
  if (!dt) return null;
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")}`;
};
const generateDateRange = (start, end) => {
  if (!start || !end) return [];
  const dates = [], cur = parseLocalDate(start), last = parseLocalDate(end);
  if (!cur || !last) return [];
  while (cur <= last) { dates.push(toLocalDateStr(cur)); cur.setDate(cur.getDate()+1); }
  return dates;
};
const formatDate    = (d) => { const dt = parseLocalDate(d); return dt ? dt.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) : "—"; };
const formatTabDate = (d) => { const dt = parseLocalDate(d); return dt ? dt.toLocaleDateString("en-PH", { month: "short", day: "numeric" }) : "—"; };
const formatTime    = (t) => t ? t.substring(0, 5) : "—";

const EditPatrolModal = ({
  patrol,
  mobileUnits,
  availablePatrollers,
  geoJSONData,
  onClose,
  onSave,
}) => {
  const token   = () => localStorage.getItem("token");
  const mapRef  = useRef(null);
  const saveTimers = useRef({});

  const [loading, setLoading] = useState(false);
  const [notif, setNotif]     = useState(null);

  // ── Form (basic info) ──────────────────────────────────
  const [form, setForm] = useState({
    patrol_name:    patrol?.patrol_name    || "",
    mobile_unit_id: patrol?.mobile_unit_id || "",
    shift:          patrol?.shift          || "",
    start_date:     toLocalDateStr(patrol?.start_date) || new Date().toISOString().split("T")[0],
    end_date:       toLocalDateStr(patrol?.end_date)   || new Date().toISOString().split("T")[0],
  });

  const [selectedPatrollerIds, setSelectedPatrollerIds] = useState(
    (patrol?.patrollers || []).map((p) => p.active_patroller_id)
  );
  const [patrollerSearch, setPatrollerSearch] = useState("");

  // ── Local routes (for per-day editing) ────────────────
  const [localRoutes, setLocalRoutes] = useState(patrol?.routes || []);

  useEffect(() => {
    if (patrol?.routes) setLocalRoutes(patrol.routes);
  }, [patrol]);

  // ── Date tabs ──────────────────────────────────────────
  const dateRange = generateDateRange(form.start_date, form.end_date);
  const [activeDate, setActiveDate] = useState(dateRange[0] || null);

  // Routes for currently selected date tab
  const routesForDate = localRoutes
    .filter((r) => toLocalDateStr(r.route_date) === activeDate)
    .sort((a, b) => (a.stop_order || 0) - (b.stop_order || 0));

  // ── Auto-save notes per route_id ───────────────────────
  const handleNotesChange = (routeId, value) => {
    // Update local state immediately so UI feels instant
    setLocalRoutes((prev) =>
      prev.map((r) => r.route_id === routeId ? { ...r, notes: value } : r)
    );
    // Debounce the actual API call
    clearTimeout(saveTimers.current[routeId]);
    saveTimers.current[routeId] = setTimeout(async () => {
      try {
        await fetch(`${API_BASE}/patrol/routes/${routeId}/notes`, {
          method:  "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
          body:    JSON.stringify({ notes: value }),
        });
        setNotif({ message: "Notes saved.", type: "success" });
      } catch (err) {
        console.error("Auto-save error:", err);
        setNotif({ message: "Failed to save notes.", type: "error" });
      }
    }, 800);
  };

  // ── GeoJSON — highlight all assigned barangays ─────────
  const buildGeoJSON = useCallback(() => {
    if (!geoJSONData || !patrol) return null;
    const assigned = [...new Set((patrol.routes || []).map((r) => r.barangay).filter(Boolean))];
    return {
      ...geoJSONData,
      features: geoJSONData.features.map((f) => ({
        ...f,
        properties: {
          ...f.properties,
          fillColor: assigned.includes(f.properties.name_db) ? "#1e3a5f" : "#e9ecef",
        },
      })),
    };
  }, [geoJSONData, patrol]);

  // ── Patroller toggle ───────────────────────────────────
  const togglePatroller = (id) =>
    setSelectedPatrollerIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );

  // ── Save basic info + patrollers ───────────────────────
  const handleSave = () => {
    if (!form.patrol_name || !form.mobile_unit_id || !form.shift || !form.start_date || !form.end_date) {
      setNotif({ message: "Please fill in all required fields.", type: "warning" }); return;
    }
    setLoading(true);
    // Notes are already auto-saved per route_id — just save the basic info
    onSave({ ...form, patroller_ids: selectedPatrollerIds, routes: localRoutes });
  };

  // ── Helpers ────────────────────────────────────────────
  const getInitials = (name) => name ? name.substring(0, 2).toUpperCase() : "NA";

  const filteredPatrollers = [
    ...availablePatrollers,
    ...(patrol?.patrollers || []).filter(
      (p) => !availablePatrollers.find((a) => a.active_patroller_id === p.active_patroller_id)
    ),
  ].filter((p) => (p.officer_name || "").toLowerCase().includes(patrollerSearch.toLowerCase()));

  if (!patrol) return null;

  return (
    <div className="epm-overlay" onClick={onClose}>
      <div className="epm-modal" onClick={(e) => e.stopPropagation()}>

        {/* ── TOP BAR ── */}
        <div className="epm-topbar">
          <div className="epm-topbar-fields">
            <div className="epm-field">
              <label>Patrol Name <span className="epm-req">*</span></label>
              <input type="text" value={form.patrol_name}
                onChange={(e) => setForm((p) => ({ ...p, patrol_name: e.target.value }))}
                placeholder="e.g. Beat 3" />
            </div>
            <div className="epm-field">
              <label>Mobile Unit <span className="epm-req">*</span></label>
              <select value={form.mobile_unit_id}
                onChange={(e) => setForm((p) => ({ ...p, mobile_unit_id: e.target.value }))}>
                <option value="">— Select —</option>
                {mobileUnits.map((mu) => (
                  <option key={mu.mobile_unit_id} value={mu.mobile_unit_id}>
                    {mu.mobile_unit_name} ({mu.plate_number})
                  </option>
                ))}
              </select>
            </div>
            <div className="epm-field">
              <label>Shift <span className="epm-req">*</span></label>
              <select value={form.shift}
                onChange={(e) => setForm((p) => ({ ...p, shift: e.target.value }))}>
                <option value="">— Select —</option>
                {SHIFTS.map((s) => <option key={s} value={s}>{SHIFT_LABELS[s]}</option>)}
              </select>
            </div>
            <div className="epm-field">
              <label>Start Date <span className="epm-req">*</span></label>
              <input type="date" value={form.start_date}
                onChange={(e) => setForm((p) => ({ ...p, start_date: e.target.value }))} />
            </div>
            <div className="epm-field">
              <label>End Date <span className="epm-req">*</span></label>
              <input type="date" value={form.end_date} min={form.start_date}
                onChange={(e) => setForm((p) => ({ ...p, end_date: e.target.value }))} />
            </div>
          </div>
          <div className="epm-topbar-actions">
            <button className="epm-btn-cancel" onClick={onClose}>Cancel</button>
            <button className="epm-btn-save"   onClick={handleSave}>Save Changes</button>
            <button className="epm-btn-x"      onClick={onClose}>✕</button>
          </div>
        </div>

        {/* ── BODY ── */}
        <div className="epm-body">

          {/* LEFT — Map (read-only, shows assigned barangays) */}
          <div className="epm-map-panel">
            <Map
              ref={mapRef}
              mapboxAccessToken={import.meta.env.VITE_MAPBOX_TOKEN}
              initialViewState={{ longitude: 120.964, latitude: 14.4341, zoom: 12 }}
              style={{ width: "100%", height: "100%" }}
              mapStyle="mapbox://styles/mapbox/light-v11"
            >
              {buildGeoJSON() && (
                <Source id="epm-barangays" type="geojson" data={buildGeoJSON()}>
                  <Layer {...fillLayer} />
                  <Layer {...outlineLayer} />
                  <Layer {...labelLayer} />
                </Source>
              )}
            </Map>
          </div>

          {/* RIGHT — Patrollers + Date tabs + Timetable */}
          <div className="epm-info-panel">

            {/* Patrollers */}
            <div className="epm-section">
              <div className="epm-section-title">
                Assigned Patrollers
                {selectedPatrollerIds.length > 0 && <span className="epm-count"> ({selectedPatrollerIds.length})</span>}
              </div>
              <input className="epm-search" type="text" placeholder="Search patroller..."
                value={patrollerSearch} onChange={(e) => setPatrollerSearch(e.target.value)} />
              <div className="epm-checklist">
                {filteredPatrollers.length === 0
                  ? <div className="epm-empty">No available patrollers.</div>
                  : filteredPatrollers.map((p) => {
                      const isSelected = selectedPatrollerIds.includes(p.active_patroller_id);
                      return (
                        <div key={p.active_patroller_id}
                          className={`epm-check-item ${isSelected ? "epm-checked" : ""}`}
                          onClick={() => togglePatroller(p.active_patroller_id)}>
                          <div className="epm-avatar">{getInitials(p.officer_name)}</div>
                          <span className="epm-officer-name">{p.officer_name}</span>
                          <div className={`epm-checkbox ${isSelected ? "epm-checkbox-on" : ""}`}>{isSelected ? "✓" : ""}</div>
                        </div>
                      );
                    })
                }
              </div>
            </div>

            {/* Timetable with date tabs */}
            <div className="epm-section epm-section-grow">
              <div className="epm-section-title">Time Table</div>

              {/* Date tabs */}
              {dateRange.length > 0 && (
                <div className="epm-date-tabs">
                  {dateRange.map((date) => (
                    <button
                      key={date}
                      className={`epm-date-tab ${activeDate === date ? "epm-date-tab-active" : ""}`}
                      onClick={() => setActiveDate(date)}
                    >
                      {formatTabDate(date)}
                    </button>
                  ))}
                </div>
              )}

              {/* Routes for active date */}
              {routesForDate.length > 0 ? (
                <div className="epm-timetable-wrap">
                  <table className="epm-timetable">
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Notes</th>
                        <th>Barangay Area</th>
                      </tr>
                    </thead>
                    <tbody>
                      {routesForDate.map((r) => (
                        <tr key={r.route_id}>
                          <td className="epm-tt-time">
                            {formatTime(r.time_start)} — {formatTime(r.time_end)}
                          </td>
                          <td className="epm-tt-notes">
                            <textarea
                              className="epm-notes"
                              value={r.notes || ""}
                              placeholder="Add notes..."
                              rows={1}
                              onChange={(e) => {
                                handleNotesChange(r.route_id, e.target.value);
                                e.target.style.height = "auto";
                                e.target.style.height = e.target.scrollHeight + "px";
                              }}
                            />
                          </td>
                          <td className="epm-tt-brgy">{r.barangay}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="epm-empty">No stops for this date.</p>
              )}
            </div>

          </div>
        </div>
      </div>

      <LoadingModal isOpen={loading} message="Saving patrol..." />
      {notif && (
        <Notification message={notif.message} type={notif.type} onClose={() => setNotif(null)} duration={2000} />
      )}
      
    </div>
  );
};

export default EditPatrolModal;