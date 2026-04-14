import { useState, useRef, useCallback } from "react";
import Map, { Source, Layer } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import "./PatrolModal.css";
import LoadingModal from "./LoadingModal";
import Notification from "./Notification";
import TimePicker from "./TimePicker.jsx";

const fillLayer    = { id: "apm-fill",    type: "fill",   paint: { "fill-color": ["get", "fillColor"], "fill-opacity": 0.45 } };
const outlineLayer = { id: "apm-outline", type: "line",   paint: { "line-color": "#1e3a5f", "line-width": 1.2, "line-opacity": 0.6 } };
const labelLayer   = {
  id: "apm-labels", type: "symbol",
  layout: { "text-field": ["get", "name_db"], "text-size": 10, "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"], "text-max-width": 8, "text-anchor": "center", "text-allow-overlap": false },
  paint:  { "text-color": "#0a1628", "text-halo-color": "rgba(255,255,255,0.85)", "text-halo-width": 1.5 },
};

const parseLocalDate = (d) => {
  if (!d) return null;
  const dt = new Date(d);
  return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
};

const AddPatrolModal = ({ mobileUnits, availablePatrollers, geoJSONData, onClose, onSave }) => {
  const mapRef = useRef(null);
  const [loading, setLoading]         = useState(false);
  const [notif, setNotif]             = useState(null);
  const [activeShift, setActiveShift] = useState("AM");
  const [hoveredBrgy, setHoveredBrgy] = useState(null);

  const [form, setForm] = useState({
    patrol_name:    "",
    mobile_unit_id: "",
    start_date:     new Date().toISOString().split("T")[0],
    end_date:       new Date().toISOString().split("T")[0],
  });

  const [selectedPatrollerIds, setSelectedPatrollerIds] = useState([]);
  const [patrollerSearch, setPatrollerSearch]           = useState("");
  const [barangays, setBarangays]                       = useState([]);
  const [tasks, setTasks]                               = useState([]);

  const amTasks      = tasks.filter((t) => t.shift === "AM");
  const pmTasks      = tasks.filter((t) => t.shift === "PM");
  const currentTasks = activeShift === "AM" ? amTasks : pmTasks;

  const addTask = () => {
  const existing = tasks.filter((t) => t.shift === activeShift);

  let defaultStart;
  if (existing.length === 0) {
    // First task: 08:00 for AM, 20:00 for PM
    defaultStart = activeShift === "AM" ? "08:00" : "20:00";
  } else {
    // Pick up from where the last task's time_end left off
    const last = existing[existing.length - 1];
    if (last.time_end) {
      // Add 1 minute to last time_end
      const [h, m] = last.time_end.split(":").map(Number);
      const total = h * 60 + m + 1;
      const nh = Math.floor(total / 60) % 24;
      const nm = total % 60;
      defaultStart = `${String(nh).padStart(2, "0")}:${String(nm).padStart(2, "0")}`;
    } else {
      defaultStart = last.time_start || (activeShift === "AM" ? "08:00" : "20:00");
    }
  }

  setTasks((prev) => [
    ...prev,
    {
      shift:      activeShift,
      time_start: defaultStart,
      time_end:   "",
      notes:      "",
      stop_order: existing.length + 1,
      _id:        Date.now(),
    },
  ]);
};

  const removeTask  = (id)           => setTasks((prev) => prev.filter((t) => t._id !== id));
  const updateTask  = (id, field, v) => setTasks((prev) => prev.map((t) => t._id === id ? { ...t, [field]: v } : t));

  // Map click — toggle barangay
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

  const filteredPatrollers = availablePatrollers.filter((p) =>
    (p.officer_name || "").toLowerCase().includes(patrollerSearch.toLowerCase())
  );

  const handleSave = () => {
    if (!form.patrol_name || !form.mobile_unit_id || !form.start_date || !form.end_date) {
      setNotif({ message: "Please fill in all required fields.", type: "warning" }); return;
    }
    if (parseLocalDate(form.end_date) < parseLocalDate(form.start_date)) {
      setNotif({ message: "End date must be on or after start date.", type: "warning" }); return;
    }
    if (barangays.length === 0) {
      setNotif({ message: "Please select at least one barangay on the map.", type: "warning" }); return;
    }
    if (selectedPatrollerIds.length === 0) {
      setNotif({ message: "Please assign at least one patroller.", type: "warning" }); return;
    }
    // Validate tasks
for (const task of tasks) {
  if (!task.time_start || !task.time_end) {
    setNotif({ message: "All tasks must have both a start and end time.", type: "warning" });
    return;
  }
  const [sh, sm] = task.time_start.split(":").map(Number);
  const [eh, em] = task.time_end.split(":").map(Number);
  const startMins = sh * 60 + sm;
  const endMins   = eh * 60 + em;
  if (endMins <= startMins) {
    setNotif({ message: `A task has an end time that is not after its start time.`, type: "warning" });
    return;
  }
}
    setLoading(true);
    onSave({
      ...form,
      patroller_ids: selectedPatrollerIds,
      barangays,
      routes: tasks.map((t, i) => ({
        shift:      t.shift,
        time_start: t.time_start || null,
        time_end:   t.time_end   || null,
        notes:      t.notes      || null,
        stop_order: i + 1,
      })),
    });
  };

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
                placeholder="e.g. Sector 6 Beat 2" />
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
            <button className="apm-btn-save"   onClick={handleSave}>Create Patrol</button>
            <button className="apm-btn-x"      onClick={onClose}>✕</button>
          </div>
        </div>

        {/* BODY */}
        <div className="apm-body">

          {/* LEFT — Map */}
          <div className="apm-map-panel">
            {hoveredBrgy && (
              <div className="apm-map-tooltip">
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
                const features = e.target.queryRenderedFeatures(e.point, { layers: ["apm-fill"] });
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
                <Source id="apm-barangays" type="geojson" data={buildGeoJSON()}>
                  <Layer {...fillLayer} />
                  <Layer {...outlineLayer} />
                  <Layer {...labelLayer} />
                </Source>
              )}
            </Map>
            {barangays.length > 0 && (
              <div className="apm-brgy-tags">
                {barangays.map((b) => (
                  <span key={b} className="apm-brgy-tag">
                    {b}
                    <button onClick={() => setBarangays((prev) => prev.filter((x) => x !== b))}>×</button>
                  </span>
                ))}
              </div>
            )}
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

            {/* Timetable */}
            <div className="apm-section apm-section-grow">
              <div className="apm-timetable-header">
                <div className="apm-section-title">Time Table</div>
                <div className="apm-shift-tabs">
                  <button className={`apm-shift-tab ${activeShift === "AM" ? "apm-shift-active" : ""}`} onClick={() => setActiveShift("AM")}>AM Shift</button>
                  <button className={`apm-shift-tab ${activeShift === "PM" ? "apm-shift-active" : ""}`} onClick={() => setActiveShift("PM")}>PM Shift</button>
                </div>
              </div>

              {currentTasks.length === 0 ? (
                <p className="apm-empty">No tasks yet. Click "+ Add Task" below.</p>
              ) : (
                <div className="apm-timetable-wrap">
                  <table className="apm-timetable">
                    <thead>
                      <tr><th>Time</th><th>Task / Comment</th><th></th></tr>
                    </thead>
                    <tbody>
                      {currentTasks.map((task) => (
                        <tr key={task._id}>
                          <td className="apm-tt-time">
                           <div className="apm-time-inputs">
  <TimePicker
    value={task.time_start}
    onChange={(v) => updateTask(task._id, "time_start", v)}
    baseHour={activeShift === "AM" ? 8 : 8}
  />
  <span>—</span>
  <TimePicker
  value={task.time_end || task.time_start}
  onChange={(v) => updateTask(task._id, "time_end", v)}
  baseHour={task.time_start ? parseInt(task.time_start.split(":")[0]) % 12 || 12 : 8}
/>
</div>
                          </td>
                          <td className="apm-tt-notes">
                            <textarea className="apm-notes" value={task.notes} placeholder="Enter task or comment..." rows={1}
                              onChange={(e) => {
                                updateTask(task._id, "notes", e.target.value);
                                e.target.style.height = "auto";
                                e.target.style.height = e.target.scrollHeight + "px";
                              }} />
                          </td>
                          <td>
                            <button className="apm-remove" onClick={() => removeTask(task._id)}>×</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <button className="apm-add-task-btn" onClick={addTask}>+ Add Task</button>
            </div>
          </div>
        </div>
      </div>

      <LoadingModal isOpen={loading} message="Creating patrol..." />
      {notif && <Notification message={notif.message} type={notif.type} onClose={() => setNotif(null)} duration={3000} />}
    </div>
  );
};

export default AddPatrolModal;