import { useState, useEffect, useRef, useCallback } from "react";
import Map, { Source, Layer } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import "./AddPatrolModal.css";
import LoadingModal from "./LoadingModal";
import Notification from "./Notification";

const API_BASE = import.meta.env.VITE_API_URL;

const SHIFTS = ["Morning", "Night"];
const SHIFT_LABELS = { Morning: "Morning", Night: "Night" };

const emptyStop = { barangay: "", notes: "", time_start: "", time_end: "" };

const fillLayer    = { id: "apm-fill",    type: "fill",   paint: { "fill-color": ["get", "fillColor"], "fill-opacity": 0.45 } };
const outlineLayer = { id: "apm-outline", type: "line",   paint: { "line-color": "#1e3a5f", "line-width": 1.2, "line-opacity": 0.6 } };
const labelLayer   = {
  id: "apm-labels", type: "symbol",
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

const AddPatrolModal = ({
  mode,
  patrol,
  mobileUnits,
  availablePatrollers,
  geoJSONData,
  onClose,
  onSave,
}) => {
  const mapRef    = useRef(null);
  const saveTimers = useRef({});
  const [loading, setLoading] = useState(false);
  const [notif, setNotif]     = useState(null);

  // ── Form state ─────────────────────────────────────────
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

  // ── ADD MODE: simple stops ─────────────────────────────
  const [stops, setStops] = useState(() => {
    if (mode !== "add") return [];
    if (!patrol?.routes?.length) return [{ ...emptyStop }];
    const seen = new Set();
    return patrol.routes.reduce((acc, r) => {
      if (!seen.has(r.barangay)) {
        seen.add(r.barangay);
        acc.push({ barangay: r.barangay, notes: r.notes || "", time_start: r.time_start || "", time_end: r.time_end || "" });
      }
      return acc;
    }, []);
  });

  // ── EDIT MODE: local routes per date ───────────────────
  const [localRoutes, setLocalRoutes] = useState(patrol?.routes || []);
  const [activeDate, setActiveDate]   = useState(() => {
    const dates = generateDateRange(patrol?.start_date, patrol?.end_date);
    return dates[0] || null;
  });

  useEffect(() => {
    if (patrol?.routes) setLocalRoutes(patrol.routes);
  }, [patrol]);

  const dateRange = generateDateRange(form.start_date, form.end_date);

  const routesForDate = localRoutes
    .filter((r) => toLocalDateStr(r.route_date) === activeDate)
    .sort((a, b) => (a.stop_order || 0) - (b.stop_order || 0));

  // ── Auto-save notes (edit mode) ────────────────────────
  const handleNotesChange = (routeId, value) => {
    setLocalRoutes((prev) =>
      prev.map((r) => r.route_id === routeId ? { ...r, notes: value } : r)
    );
    clearTimeout(saveTimers.current[routeId]);
    saveTimers.current[routeId] = setTimeout(async () => {
      try {
        const token = localStorage.getItem("token");
        await fetch(`${API_BASE}/patrol/routes/${routeId}/notes`, {
          method:  "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body:    JSON.stringify({ notes: value }),
        });
        setNotif({ message: "Notes saved.", type: "success" });
      } catch (err) { console.error("Auto-save error:", err); }
    }, 800);
  };

  // ── Auto-save time (edit mode) ─────────────────────────
  const handleTimeChange = (routeId, field, value) => {
    setLocalRoutes((prev) =>
      prev.map((r) => r.route_id === routeId ? { ...r, [field]: value } : r)
    );
    clearTimeout(saveTimers.current[`${routeId}-${field}`]);
    saveTimers.current[`${routeId}-${field}`] = setTimeout(async () => {
      try {
        const token = localStorage.getItem("token");
        const route = localRoutes.find((r) => r.route_id === routeId);
        if (!route) return;
        const updatedRoute = { ...route, [field]: value };
        await fetch(`${API_BASE}/patrol/routes/${routeId}/time`, {
          method:  "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body:    JSON.stringify({ time_start: updatedRoute.time_start, time_end: updatedRoute.time_end }),
        });
      } catch (err) { console.error("Time save error:", err); }
    }, 800);
  };

  // ── Map / GeoJSON ──────────────────────────────────────
  const buildGeoJSON = useCallback(() => {
    if (!geoJSONData) return null;
    const selected = mode === "add"
      ? stops.map((s) => s.barangay).filter(Boolean)
      : [...new Set(localRoutes.map((r) => r.barangay).filter(Boolean))];
    return {
      ...geoJSONData,
      features: geoJSONData.features.map((f) => ({
        ...f,
        properties: {
          ...f.properties,
          fillColor: selected.includes(f.properties.name_db) ? "#1e3a5f" : "#adb5bd",
        },
      })),
    };
  }, [geoJSONData, stops, localRoutes, mode]);

  const handleMapClick = useCallback((e) => {
    if (mode !== "add" || !geoJSONData) return; // map only clickable in add mode
    const { lng, lat } = e.lngLat;
    const inside = (pt, vs) => {
      let x = pt[0], y = pt[1], inside = false;
      for (let i = 0, j = vs.length-1; i < vs.length; j = i++) {
        let xi = vs[i][0], yi = vs[i][1], xj = vs[j][0], yj = vs[j][1];
        if ((yi>y) !== (yj>y) && x < ((xj-xi)*(y-yi)/(yj-yi)+xi)) inside = !inside;
      }
      return inside;
    };
    for (const f of geoJSONData.features) {
      const rings = f.geometry.type === "Polygon"
        ? [f.geometry.coordinates[0]]
        : f.geometry.coordinates.map((p) => p[0]);
      for (const ring of rings) {
        if (inside([lng, lat], ring)) {
          const name = f.properties.name_db;
          if (stops.some((s) => s.barangay === name)) return;
          setStops((prev) => [...prev, { ...emptyStop, barangay: name }]);
          return;
        }
      }
    }
  }, [geoJSONData, stops, mode]);

  // ── Stop handlers (add mode) ───────────────────────────
  const removeStop = (idx) => setStops((prev) => prev.filter((_, i) => i !== idx));
  const updateStop = (idx, field, val) => setStops((prev) => prev.map((s, i) => i === idx ? { ...s, [field]: val } : s));

  const togglePatroller = (id) =>
    setSelectedPatrollerIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );

  // ── Submit ─────────────────────────────────────────────
  const handleSave = () => {
    if (!form.patrol_name || !form.mobile_unit_id || !form.shift || !form.start_date || !form.end_date) {
      setNotif({ message: "Please fill in all required fields.", type: "warning" }); return;
    }
    if (parseLocalDate(form.end_date) < parseLocalDate(form.start_date)) {
      setNotif({ message: "End date must be on or after start date.", type: "warning" }); return;
    }

    if (mode === "add") {
      const validStops = stops.filter((s) => s.barangay && s.time_start && s.time_end);
      if (validStops.length === 0) {
        setNotif({ message: "Please add at least one stop with barangay and times.", type: "warning" }); return;
      }
      const dates  = generateDateRange(form.start_date, form.end_date);
      const routes = [];
      dates.forEach((date) => {
        validStops.forEach((s, i) => routes.push({ ...s, route_date: date, stop_order: i+1 }));
      });
      setLoading(true);
      onSave({ ...form, patroller_ids: selectedPatrollerIds, routes });
    } else {
      // Edit mode — only save the basic info + patrollers, routes already auto-saved
      setLoading(true);
      onSave({ ...form, patroller_ids: selectedPatrollerIds, routes: localRoutes });
    }
  };

  const [hoveredBrgy, setHoveredBrgy] = useState(null);
  const getInitials = (name) => name ? name.substring(0, 2).toUpperCase() : "NA";

  const filteredPatrollers = (
    mode === "edit" && patrol
      ? [...availablePatrollers, ...(patrol.patrollers || []).filter((p) => !availablePatrollers.find((a) => a.active_patroller_id === p.active_patroller_id))]
      : availablePatrollers
  ).filter((p) => (p.officer_name || "").toLowerCase().includes(patrollerSearch.toLowerCase()));

  // ── Render ─────────────────────────────────────────────
  return (
    <div className="apm-overlay" onClick={onClose}>
      <div className="apm-modal" onClick={(e) => e.stopPropagation()}>

        {/* TOP BAR */}
        <div className="apm-topbar">
          <div className="apm-topbar-fields">
            <div className="apm-field">
              <label>Patrol Name <span className="apm-req">*</span></label>
              <input type="text" value={form.patrol_name}
                onChange={(e) => setForm((p) => ({ ...p, patrol_name: e.target.value }))}
                placeholder="e.g. Beat 3" />
            </div>
            <div className="apm-field">
              <label>Mobile Unit <span className="apm-req">*</span></label>
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
            <div className="apm-field">
              <label>Shift <span className="apm-req">*</span></label>
              <select value={form.shift}
                onChange={(e) => setForm((p) => ({ ...p, shift: e.target.value }))}>
                <option value="">— Select —</option>
                {SHIFTS.map((s) => <option key={s} value={s}>{SHIFT_LABELS[s]}</option>)}
              </select>
            </div>
            <div className="apm-field">
              <label>Start Date <span className="apm-req">*</span></label>
              <input type="date" value={form.start_date}
                onChange={(e) => setForm((p) => ({ ...p, start_date: e.target.value }))} />
            </div>
            <div className="apm-field">
              <label>End Date <span className="apm-req">*</span></label>
              <input type="date" value={form.end_date} min={form.start_date}
                onChange={(e) => setForm((p) => ({ ...p, end_date: e.target.value }))} />
            </div>
          </div>
          <div className="apm-topbar-actions">
            <button className="apm-btn-cancel" onClick={onClose}>Cancel</button>
            <button className="apm-btn-save" onClick={handleSave}>
              {mode === "add" ? "Create Patrol" : "Save Changes"}
            </button>
            <button className="apm-btn-x" onClick={onClose}>✕</button>
          </div>
        </div>

        {/* BODY */}
        <div className="apm-body">

          {/* LEFT — Map */}
          <div className="apm-map-panel">
            {hoveredBrgy && mode === "add" && (
              <div className="apm-map-tooltip">
                <strong>{hoveredBrgy}</strong>
                {stops.some((s) => s.barangay === hoveredBrgy) ? " — Already added" : " — Click to add stop"}
              </div>
            )}
            {hoveredBrgy && mode === "edit" && (
              <div className="apm-map-tooltip">
                <strong>{hoveredBrgy}</strong>
              </div>
            )}
            <Map
              ref={mapRef}
              mapboxAccessToken={import.meta.env.VITE_MAPBOX_TOKEN}
              initialViewState={{ longitude: 120.964, latitude: 14.4341, zoom: 12 }}
              style={{ width: "100%", height: "100%" }}
              mapStyle="mapbox://styles/mapbox/light-v11"
              onClick={handleMapClick}
              onMouseMove={(e) => {
                if (!geoJSONData) return;
                const features = e.target.queryRenderedFeatures(e.point, { layers: ["apm-fill"] });
                if (features.length > 0) {
                  const name = features[0].properties.name_db;
                  if (mode === "add") {
                    e.target.getCanvas().style.cursor = stops.some((s) => s.barangay === name) ? "not-allowed" : "pointer";
                  } else {
                    e.target.getCanvas().style.cursor = "default";
                  }
                  setHoveredBrgy(name);
                } else {
                  e.target.getCanvas().style.cursor = "";
                  setHoveredBrgy(null);
                }
              }}
              onMouseLeave={() => setHoveredBrgy(null)}
            >
              {buildGeoJSON() && (
                <Source id="apm-barangays" type="geojson" data={buildGeoJSON()}>
                  <Layer {...fillLayer} />
                  <Layer {...outlineLayer} />
                  <Layer {...labelLayer} />
                </Source>
              )}
            </Map>
          </div>

          {/* RIGHT — Patrollers + Timetable */}
          <div className="apm-info-panel">

            {/* Patrollers */}
            <div className="apm-section">
              <div className="apm-section-title">
                Assigned Patrollers
                {selectedPatrollerIds.length > 0 && <span className="apm-count"> ({selectedPatrollerIds.length})</span>}
              </div>
              <input className="apm-search" type="text" placeholder="Search patroller..."
                value={patrollerSearch} onChange={(e) => setPatrollerSearch(e.target.value)} />
              <div className="apm-checklist">
                {filteredPatrollers.length === 0
                  ? <div className="apm-empty">No available patrollers.</div>
                  : filteredPatrollers.map((p) => {
                      const isSelected = selectedPatrollerIds.includes(p.active_patroller_id);
                      return (
                        <div key={p.active_patroller_id}
                          className={`apm-check-item ${isSelected ? "apm-checked" : ""}`}
                          onClick={() => togglePatroller(p.active_patroller_id)}>
                          <div className="apm-avatar">{getInitials(p.officer_name)}</div>
                          <span className="apm-officer-name">{p.officer_name}</span>
                          <div className={`apm-checkbox ${isSelected ? "apm-checkbox-on" : ""}`}>{isSelected ? "✓" : ""}</div>
                        </div>
                      );
                    })
                }
              </div>
            </div>

            {/* ── ADD MODE: Simple timetable ── */}
            {mode === "add" && (
              <div className="apm-section apm-section-grow">
                <div className="apm-section-title">
                  Time Table
                  <span className="apm-hint"> — click map to add stops</span>
                </div>
                {stops.filter((s) => s.barangay).length === 0 ? (
                  <p className="apm-empty">Click a barangay on the map to add a stop.</p>
                ) : (
                  <div className="apm-timetable-wrap">
                    <table className="apm-timetable">
                      <thead>
                        <tr><th>Time</th><th>Notes</th><th>Barangay Area</th><th></th></tr>
                      </thead>
                      <tbody>
                        {stops.map((stop, idx) => {
                          if (!stop.barangay) return null;
                          return (
                            <tr key={idx}>
                              <td className="apm-tt-time">
                                <div className="apm-time-inputs">
                                  <input type="time" value={stop.time_start}
                                    onChange={(e) => updateStop(idx, "time_start", e.target.value)} />
                                  <span>—</span>
                                  <input type="time" value={stop.time_end}
                                    onChange={(e) => updateStop(idx, "time_end", e.target.value)} />
                                </div>
                              </td>
                              <td className="apm-tt-notes">
                                <textarea className="apm-notes" value={stop.notes} placeholder="Add notes..." rows={1}
                                  onChange={(e) => {
                                    updateStop(idx, "notes", e.target.value);
                                    e.target.style.height = "auto";
                                    e.target.style.height = e.target.scrollHeight + "px";
                                  }} />
                              </td>
                              <td className="apm-tt-brgy">{stop.barangay}</td>
                              <td><button className="apm-remove" onClick={() => removeStop(idx)}>×</button></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ── EDIT MODE: Date tabs + per-day timetable ── */}
            {mode === "edit" && (
              <div className="apm-section apm-section-grow">
                <div className="apm-section-title">Time Table</div>

                {/* Date tabs */}
                {dateRange.length > 0 && (
                  <div className="apm-date-tabs">
                    {dateRange.map((date) => (
                      <button
                        key={date}
                        className={`apm-date-tab ${activeDate === date ? "apm-date-tab-active" : ""}`}
                        onClick={() => setActiveDate(date)}
                      >
                        {formatTabDate(date)}
                      </button>
                    ))}
                  </div>
                )}

                {/* Routes for active date */}
                {routesForDate.length > 0 ? (
                  <div className="apm-timetable-wrap">
                    <table className="apm-timetable">
                      <thead>
                        <tr><th>Time</th><th>Notes</th><th>Barangay Area</th></tr>
                      </thead>
                      <tbody>
                        {routesForDate.map((r) => (
                          <tr key={r.route_id}>
                            <td className="apm-tt-time">
                              <div className="apm-time-inputs">
                                <input type="time" value={r.time_start || ""}
                                  onChange={(e) => handleTimeChange(r.route_id, "time_start", e.target.value)} />
                                <span>—</span>
                                <input type="time" value={r.time_end || ""}
                                  onChange={(e) => handleTimeChange(r.route_id, "time_end", e.target.value)} />
                              </div>
                            </td>
                            <td className="apm-tt-notes">
                              <textarea className="apm-notes" value={r.notes || ""} placeholder="Add notes..." rows={1}
                                onChange={(e) => {
                                  handleNotesChange(r.route_id, e.target.value);
                                  e.target.style.height = "auto";
                                  e.target.style.height = e.target.scrollHeight + "px";
                                }} />
                            </td>
                            <td className="apm-tt-brgy">{r.barangay}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="apm-empty">No stops for this date.</p>
                )}
              </div>
            )}

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

export default AddPatrolModal;