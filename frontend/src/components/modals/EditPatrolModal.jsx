import { useState, useEffect, useRef, useCallback } from "react";
import Map, { Source, Layer } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import "./EditPatrolModal.css";
import LoadingModal from "./LoadingModal";
import Notification from "./Notification";

const API_BASE = import.meta.env.VITE_API_URL;

const fillLayer    = { id: "epm-fill",    type: "fill",   paint: { "fill-color": ["get", "fillColor"], "fill-opacity": 0.5 } };
const outlineLayer = { id: "epm-outline", type: "line",   paint: { "line-color": "#1e3a5f", "line-width": 1.5, "line-opacity": 0.7 } };
const labelLayer   = {
  id: "epm-labels", type: "symbol",
  layout: { "text-field": ["get", "name_db"], "text-size": 10, "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"], "text-max-width": 8, "text-anchor": "center", "text-allow-overlap": false },
  paint:  { "text-color": "#0a1628", "text-halo-color": "rgba(255,255,255,0.85)", "text-halo-width": 1.5 },
};

// ── Pure string-based date helpers (no timezone issues) ──
const toDateStr = (d) => {
  // Always extract YYYY-MM-DD without any UTC conversion
  if (!d) return null;
  if (typeof d === "string") return d.substring(0, 10);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
};

const generateDateRange = (start, end) => {
  if (!start || !end) return [];
  const startStr = toDateStr(start);
  const endStr   = toDateStr(end);
  if (!startStr || !endStr) return [];
  const dates = [];
  const [sy, sm, sd] = startStr.split("-").map(Number);
  const [ey, em, ed] = endStr.split("-").map(Number);
  const cur  = new Date(sy, sm - 1, sd); // local midnight
  const last = new Date(ey, em - 1, ed); // local midnight
  while (cur <= last) {
    dates.push(toDateStr(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
};

const formatTabDate = (d) => {
  const s = toDateStr(d);
  if (!s) return "—";
  const [y, m, day] = s.split("-").map(Number);
  return new Date(y, m - 1, day).toLocaleDateString("en-PH", { month: "short", day: "numeric" });
};

const EditPatrolModal = ({ patrol, mobileUnits, availablePatrollers, geoJSONData, onClose, onSave }) => {
  const token      = () => localStorage.getItem("token");
  const mapRef     = useRef(null);
  const saveTimers = useRef({});

  const [loading, setLoading]         = useState(false);
  const [notif, setNotif]             = useState(null);
  const [activeShift, setActiveShift] = useState("AM");
  const [hoveredBrgy, setHoveredBrgy] = useState(null);

  const [form, setForm] = useState({
    patrol_name:    patrol?.patrol_name    || "",
    mobile_unit_id: patrol?.mobile_unit_id || "",
    start_date:     toDateStr(patrol?.start_date) || new Date().toISOString().split("T")[0],
    end_date:       toDateStr(patrol?.end_date)   || new Date().toISOString().split("T")[0],
  });

  const [selectedPatrollerIds, setSelectedPatrollerIds] = useState(
    (patrol?.patrollers || []).map((p) => p.active_patroller_id)
  );
  const [patrollerSearch, setPatrollerSearch] = useState("");

  // Barangays for map — from routes with negative stop_order
  const [barangays, setBarangays] = useState(() =>
    [...new Set((patrol?.routes || []).filter((r) => (r.stop_order || 0) <= 0 && r.barangay).map((r) => r.barangay))]
  );

  // Local routes — only timetable tasks (stop_order > 0)
  const [localRoutes, setLocalRoutes] = useState(
    (patrol?.routes || []).filter((r) => (r.stop_order || 0) > 0)
  );

  const dateRange = generateDateRange(
    toDateStr(form.start_date),
    toDateStr(form.end_date)
  );
  const [activeDate, setActiveDate] = useState(() => {
    const dates = generateDateRange(toDateStr(patrol?.start_date), toDateStr(patrol?.end_date));
    return dates[0] || null;
  });

  // Tasks for current date + shift
  const routesForDateShift = localRoutes
    .filter((r) => toDateStr(r.route_date) === activeDate && r.shift === activeShift)
    .sort((a, b) => (a.stop_order || 0) - (b.stop_order || 0));

  // ── Auto-save task ─────────────────────────────────────
  const handleTaskChange = (routeId, field, value) => {
    setLocalRoutes((prev) =>
      prev.map((r) => r.route_id === routeId ? { ...r, [field]: value } : r)
    );
    clearTimeout(saveTimers.current[`${routeId}-${field}`]);
    saveTimers.current[`${routeId}-${field}`] = setTimeout(async () => {
      try {
        const route = localRoutes.find((r) => r.route_id === routeId);
        if (!route) return;
        const updated = { ...route, [field]: value };
        await fetch(`${API_BASE}/patrol/routes/${routeId}/task`, {
          method:  "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
          body:    JSON.stringify({ time_start: updated.time_start, time_end: updated.time_end, notes: updated.notes }),
        });
        setNotif({ message: "Saved.", type: "success" });
      } catch (err) { console.error("Save error:", err); }
    }, 800);
  };

  // ── Add new task for current date + shift ─────────────
  const addTask = async () => {
    const defaultStart = activeShift === "AM" ? "06:00" : "18:00";
    const existingForDateShift = localRoutes.filter(
      (r) => toDateStr(r.route_date) === activeDate && r.shift === activeShift
    );
    const newStopOrder = existingForDateShift.length + 1;

    try {
      // Save to DB immediately so it gets a route_id
      const res = await fetch(`${API_BASE}/patrol/routes/add`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body:    JSON.stringify({
          patrol_id:  patrol.patrol_id,
          route_date: activeDate,
          shift:      activeShift,
          time_start: defaultStart,
          time_end:   null,
          notes:      null,
          stop_order: newStopOrder,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setLocalRoutes((prev) => [...prev, {
          route_id:   data.route_id,
          route_date: activeDate,
          shift:      activeShift,
          time_start: defaultStart,
          time_end:   "",
          notes:      "",
          stop_order: newStopOrder,
        }]);
      }
    } catch (err) { console.error("Add task error:", err); }
  };
  const buildGeoJSON = useCallback(() => {
    if (!geoJSONData) return null;
    return {
      ...geoJSONData,
      features: geoJSONData.features.map((f) => ({
        ...f,
        properties: {
          ...f.properties,
          fillColor: barangays.includes(f.properties.name_db) ? "#1e3a5f" : "#adb5bd",
        },
      })),
    };
  }, [geoJSONData, barangays]);

  const handleMapClick = useCallback((e) => {
    if (!geoJSONData) return;
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
          // Toggle barangay
          setBarangays((prev) =>
            prev.includes(name) ? prev.filter((b) => b !== name) : [...prev, name]
          );
          return;
        }
      }
    }
  }, [geoJSONData]);

  const togglePatroller = (id) =>
    setSelectedPatrollerIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );

  const getInitials = (name) => name ? name.substring(0, 2).toUpperCase() : "NA";

  const filteredPatrollers = [
    ...availablePatrollers,
    ...(patrol?.patrollers || []).filter((p) => !availablePatrollers.find((a) => a.active_patroller_id === p.active_patroller_id)),
  ].filter((p) => (p.officer_name || "").toLowerCase().includes(patrollerSearch.toLowerCase()));

  const handleSave = () => {
    if (!form.patrol_name || !form.mobile_unit_id || !form.start_date || !form.end_date) {
      setNotif({ message: "Please fill in all required fields.", type: "warning" }); return;
    }
    setLoading(true);
    // Only send basic info, patrollers, and barangays — tasks are auto-saved
    onSave({ ...form, patroller_ids: selectedPatrollerIds, barangays });
  };

  if (!patrol) return null;

  return (
    <div className="epm-overlay" onClick={onClose}>
      <div className="epm-modal" onClick={(e) => e.stopPropagation()}>

        {/* TOP BAR */}
        <div className="epm-topbar">
          <div className="epm-topbar-fields">
            <div className="epm-field">
              <label>Patrol Name <span className="epm-req">*</span></label>
              <input type="text" value={form.patrol_name}
                onChange={(e) => setForm((p) => ({ ...p, patrol_name: e.target.value }))} placeholder="e.g. Sector 6 Beat 2" />
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

        {/* BODY */}
        <div className="epm-body">

          {/* LEFT — Map (clickable to toggle barangay) */}
          <div className="epm-map-panel">
            {hoveredBrgy && (
              <div className="epm-map-tooltip">
                <strong>{hoveredBrgy}</strong>
                {barangays.includes(hoveredBrgy) ? " — Click to remove" : " — Click to add"}
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
                const features = e.target.queryRenderedFeatures(e.point, { layers: ["epm-fill"] });
                if (features.length > 0) {
                  e.target.getCanvas().style.cursor = "pointer";
                  setHoveredBrgy(features[0].properties.name_db);
                } else {
                  e.target.getCanvas().style.cursor = "";
                  setHoveredBrgy(null);
                }
              }}
              onMouseLeave={() => setHoveredBrgy(null)}
            >
              {buildGeoJSON() && (
                <Source id="epm-barangays" type="geojson" data={buildGeoJSON()}>
                  <Layer {...fillLayer} />
                  <Layer {...outlineLayer} />
                  <Layer {...labelLayer} />
                </Source>
              )}
            </Map>
            {barangays.length > 0 && (
              <div className="epm-brgy-tags">
                {barangays.map((b) => (
                  <span key={b} className="epm-brgy-tag">
                    {b}
                    <button onClick={() => setBarangays((prev) => prev.filter((x) => x !== b))}>×</button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* RIGHT — Patrollers + Date/Shift tabs + Timetable */}
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

            {/* Timetable */}
            <div className="epm-section epm-section-grow">

              {/* Date tabs */}
              {dateRange.length > 0 && (
                <div className="epm-date-tabs">
                  {dateRange.map((date) => (
                    <button key={date}
                      className={`epm-date-tab ${activeDate === date ? "epm-date-tab-active" : ""}`}
                      onClick={() => setActiveDate(date)}>
                      {formatTabDate(date)}
                    </button>
                  ))}
                </div>
              )}

              {/* AM/PM shift tabs */}
              <div className="epm-timetable-header">
                <div className="epm-section-title">Time Table</div>
                <div className="epm-shift-tabs">
                  <button className={`epm-shift-tab ${activeShift === "AM" ? "epm-shift-active" : ""}`} onClick={() => setActiveShift("AM")}>AM Shift</button>
                  <button className={`epm-shift-tab ${activeShift === "PM" ? "epm-shift-active" : ""}`} onClick={() => setActiveShift("PM")}>PM Shift</button>
                </div>
              </div>

              {routesForDateShift.length === 0 ? (
                <p className="epm-empty">No tasks for this date and shift.</p>
              ) : (
                <div className="epm-timetable-wrap">
                  <table className="epm-timetable">
                    <thead>
                      <tr><th>Time</th><th>Task / Comment</th></tr>
                    </thead>
                    <tbody>
                      {routesForDateShift.map((r) => (
                        <tr key={r.route_id}>
                          <td className="epm-tt-time">
                            <div className="epm-time-inputs">
                              <input type="time" value={r.time_start || ""}
                                onChange={(e) => handleTaskChange(r.route_id, "time_start", e.target.value)} />
                              <span>—</span>
                              <input type="time" value={r.time_end || ""}
                                onChange={(e) => handleTaskChange(r.route_id, "time_end", e.target.value)} />
                            </div>
                          </td>
                          <td className="epm-tt-notes">
                            <textarea className="epm-notes" value={r.notes || ""} placeholder="Enter task..." rows={1}
                              onChange={(e) => {
                                handleTaskChange(r.route_id, "notes", e.target.value);
                                e.target.style.height = "auto";
                                e.target.style.height = e.target.scrollHeight + "px";
                              }} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <button className="epm-add-task-btn" onClick={addTask}>+ Add Task</button>
            </div>

          </div>
        </div>
      </div>

      <LoadingModal isOpen={loading} message="Saving patrol..." />
      {notif && <Notification message={notif.message} type={notif.type} onClose={() => setNotif(null)} duration={2000} />}
    </div>
  );
};

export default EditPatrolModal;