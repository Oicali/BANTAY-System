// src/components/modals/AddPatrolModal.jsx
import { useState, useRef, useCallback, useEffect } from "react";
import Map, { Source, Layer } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import "./PatrolModal.css";
import LoadingModal from "./LoadingModal";
import Notification from "./Notification";
import TimePicker from "./TimePicker";

const API_BASE = import.meta.env.VITE_API_URL;

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

const AddPatrolModal = ({ mobileUnits, geoJSONData, onClose, onSave }) => {
  const mapRef = useRef(null);
  const [loading, setLoading]         = useState(false);
  const [notif, setNotif]             = useState(null);
  const [activeShift, setActiveShift] = useState("AM");
  const [hoveredBrgy, setHoveredBrgy] = useState(null);

  const [form, setForm] = useState({
    patrol_name:    "",
    mobile_unit_id: "",
    start_date:     "",
    end_date:       "",
  });

  const [selectedAMIds, setSelectedAMIds]         = useState([]);
  const [selectedPMIds, setSelectedPMIds]         = useState([]);
  const [patrollerSearch, setPatrollerSearch]     = useState("");
  const [availableForDates, setAvailableForDates] = useState(null); // null = no dates yet
  const [loadingPatrollers, setLoadingPatrollers] = useState(false);
  const [barangays, setBarangays]                 = useState([]);
  const [tasks, setTasks]                         = useState([]);

  // Fetch available patrollers when dates change
  useEffect(() => {
    setAvailableForDates(null);
    setSelectedAMIds([]);
    setSelectedPMIds([]);
    if (!form.start_date || !form.end_date || form.end_date < form.start_date) return;

    setLoadingPatrollers(true);
    fetch(`${API_BASE}/patrol/available-patrollers?start=${form.start_date}&end=${form.end_date}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
    })
      .then((r) => r.json())
      .then((data) => { if (data.success) setAvailableForDates(data.data); })
      .catch(console.error)
      .finally(() => setLoadingPatrollers(false));
  }, [form.start_date, form.end_date]);

  const amTasks      = tasks.filter((t) => t.shift === "AM");
  const pmTasks      = tasks.filter((t) => t.shift === "PM");
  const currentTasks = activeShift === "AM" ? amTasks : pmTasks;

  const currentSelectedIds    = activeShift === "AM" ? selectedAMIds : selectedPMIds;
  const setCurrentSelectedIds = activeShift === "AM" ? setSelectedAMIds : setSelectedPMIds;
  const otherShiftIds         = activeShift === "AM" ? selectedPMIds : selectedAMIds;

  const addTask = () => {
    const existing = tasks.filter((t) => t.shift === activeShift);
    let defaultStart;
    if (existing.length === 0) {
      defaultStart = activeShift === "AM" ? "08:00" : "20:00";
    } else {
      const last = existing[existing.length - 1];
      if (last.time_end) {
        const [h, m] = last.time_end.split(":").map(Number);
        const total  = h * 60 + m + 1;
        defaultStart = `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
      } else {
        defaultStart = last.time_start || (activeShift === "AM" ? "08:00" : "20:00");
      }
    }
    setTasks((prev) => [
      ...prev,
      { shift: activeShift, time_start: defaultStart, time_end: "", notes: "", stop_order: existing.length + 1, _id: Date.now() },
    ]);
  };

  const removeTask  = (id)           => setTasks((prev) => prev.filter((t) => t._id !== id));
  const updateTask  = (id, field, v) => setTasks((prev) => prev.map((t) => t._id === id ? { ...t, [field]: v } : t));

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
      for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
        let xi = vs[i][0], yi = vs[i][1], xj = vs[j][0], yj = vs[j][1];
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
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
          setBarangays((prev) => prev.includes(name) ? prev.filter((b) => b !== name) : [...prev, name]);
          return;
        }
      }
    }
  }, [geoJSONData]);

  const togglePatroller = (id) => {
    if (otherShiftIds.includes(id)) {
      setNotif({ message: `This patroller is already assigned to the ${activeShift === "AM" ? "PM" : "AM"} shift.`, type: "warning" });
      return;
    }
    setCurrentSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const getInitials = (name) => name ? name.substring(0, 2).toUpperCase() : "NA";

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
    if (selectedAMIds.length === 0 && selectedPMIds.length === 0) {
      setNotif({ message: "Please assign at least one patroller to AM or PM shift.", type: "warning" }); return;
    }

    // Validate tasks
    for (const task of tasks) {
      if (!task.time_start || !task.time_end) {
        setNotif({ message: "All tasks must have both a start and end time.", type: "warning" }); return;
      }
      const [sh, sm] = task.time_start.split(":").map(Number);
      const [eh, em] = task.time_end.split(":").map(Number);
      if (eh * 60 + em <= sh * 60 + sm) {
        setNotif({ message: "A task's end time must be after its start time.", type: "warning" }); return;
      }
    }

    // Overlap check
    for (const shift of ["AM", "PM"]) {
      const group = tasks
        .filter((t) => t.shift === shift)
        .sort((a, b) => {
          const [ah, am] = a.time_start.split(":").map(Number);
          const [bh, bm] = b.time_start.split(":").map(Number);
          return (ah * 60 + am) - (bh * 60 + bm);
        });
      for (let i = 0; i < group.length - 1; i++) {
        const [eh, em] = group[i].time_end.split(":").map(Number);
        const [sh, sm] = group[i + 1].time_start.split(":").map(Number);
        if ((eh * 60 + em) > (sh * 60 + sm)) {
          const fmt = (t) => {
            const [h, m] = t.split(":").map(Number);
            const h12 = h % 12 === 0 ? 12 : h % 12;
            return `${String(h12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
          };
          setNotif({
            message: `Task overlap on ${shift} shift: ${fmt(group[i].time_start)}–${fmt(group[i].time_end)} overlaps with ${fmt(group[i + 1].time_start)}–${fmt(group[i + 1].time_end)}.`,
            type: "warning",
          });
          return;
        }
      }
    }

    setLoading(true);
    onSave({
      ...form,
      patroller_ids_am: selectedAMIds,
      patroller_ids_pm: selectedPMIds,
      barangays,
      routes: tasks.map((t, i) => ({
        shift:      t.shift,
        time_start: t.time_start || null,
        time_end:   t.time_end   || null,
        notes:      t.notes      || null,
        stop_order: i + 1,
      })),
    }, () => setLoading(false));
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
            <div className="pm-map-controls">
  <button className="pm-map-ctrl-btn" title="Zoom in"
    onClick={() => mapRef.current?.getMap?.().zoomIn({ duration: 300 })}>
    <svg width="15" height="15" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  </button>
  <div className="pm-map-ctrl-divider"/>
  <button className="pm-map-ctrl-btn" title="Zoom out"
    onClick={() => mapRef.current?.getMap?.().zoomOut({ duration: 300 })}>
    <svg width="15" height="15" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  </button>
  <div className="pm-map-ctrl-divider"/>
  <button className="pm-map-ctrl-btn" title="Fit to barangays"
    onClick={() => {
      const map = mapRef.current?.getMap?.();
      if (!map || barangays.length === 0 || !geoJSONData) return;
      const coords = [];
      for (const f of geoJSONData.features) {
        if (barangays.includes(f.properties.name_db)) {
          const rings = f.geometry.type === "Polygon"
            ? [f.geometry.coordinates[0]]
            : f.geometry.coordinates.map((p) => p[0]);
          for (const ring of rings) coords.push(...ring);
        }
      }
      if (coords.length === 0) return;
      const lngs = coords.map((c) => c[0]);
      const lats = coords.map((c) => c[1]);
      map.fitBounds(
        [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
        { padding: 60, duration: 800 }
      );
    }}>
    <svg width="15" height="15" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>
    </svg>
  </button>
  <div className="pm-map-ctrl-divider"/>
  <button className="pm-map-ctrl-btn" title="Fullscreen"
    onClick={() => {
      const el = document.querySelector(".bc-map-panel");
      if (!document.fullscreenElement) el?.requestFullscreen();
      else document.exitFullscreen();
    }}>
    <svg width="15" height="15" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
    </svg>
  </button>
</div>
          </div>

          {/* RIGHT */}
          <div className="apm-info-panel">

            {/* Shift tabs */}
            <div className="apm-shift-tabs-top">
              <button
                className={`apm-shift-tab-top ${activeShift === "AM" ? "apm-shift-active" : ""}`}
                onClick={() => { setActiveShift("AM"); setPatrollerSearch(""); }}
              >
                AM Shift
                {selectedAMIds.length > 0 && <span className="apm-shift-badge">{selectedAMIds.length}</span>}
              </button>
              <button
                className={`apm-shift-tab-top ${activeShift === "PM" ? "apm-shift-active" : ""}`}
                onClick={() => { setActiveShift("PM"); setPatrollerSearch(""); }}
              >
                PM Shift
                {selectedPMIds.length > 0 && <span className="apm-shift-badge">{selectedPMIds.length}</span>}
              </button>
            </div>

            {/* Patrollers */}
            <div className="apm-section">
              <div className="apm-section-title">
                {activeShift} Shift Patrollers
                {currentSelectedIds.length > 0 && <span className="apm-count"> ({currentSelectedIds.length})</span>}
              </div>

              {availableForDates === null ? (
                <p className="apm-empty" style={{ fontStyle: "normal", color: "#6c757d" }}>
                  Please select a start and end date to see available patrollers.
                </p>
              ) : loadingPatrollers ? (
                <p className="apm-empty">Loading patrollers...</p>
              ) : (
                <>
                  <input className="apm-search" type="text" placeholder="Search patroller..."
                    value={patrollerSearch} onChange={(e) => setPatrollerSearch(e.target.value)} />
                  <div className="apm-checklist">
                    {availableForDates.filter((p) =>
                      (p.officer_name || "").toLowerCase().includes(patrollerSearch.toLowerCase())
                    ).length === 0 ? (
                      <div className="apm-empty">No available patrollers for this period.</div>
                    ) : (
                      availableForDates
                        .filter((p) => (p.officer_name || "").toLowerCase().includes(patrollerSearch.toLowerCase()))
                        .map((p) => {
                          const isSelected   = currentSelectedIds.includes(p.active_patroller_id);
                          const isOtherShift = otherShiftIds.includes(p.active_patroller_id);
                          return (
                            <div key={p.active_patroller_id}
                              className={`apm-check-item ${isSelected ? "apm-checked" : ""} ${isOtherShift ? "apm-other-shift" : ""}`}
                              onClick={() => togglePatroller(p.active_patroller_id)}
                              title={isOtherShift ? `Already assigned to ${activeShift === "AM" ? "PM" : "AM"} shift` : ""}>
                            <div className="apm-avatar" style={{ overflow: "hidden", padding: 0 }}>
  {p.profile_picture ? (
    <img
      src={p.profile_picture}
      alt={p.officer_name}
      style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }}
    />
  ) : getInitials(p.officer_name)}
</div>
                              <div className="apm-officer-info">
                                <span className="apm-officer-name">{p.officer_name}</span>
                                {isOtherShift && (
                                  <span className="apm-other-shift-label">
                                    {activeShift === "AM" ? "PM" : "AM"} shift
                                  </span>
                                )}
                              </div>
                              <div className={`apm-checkbox ${isSelected ? "apm-checkbox-on" : ""}`}>
                                {isSelected ? "✓" : ""}
                              </div>
                            </div>
                          );
                        })
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Timetable */}
            <div className="apm-section apm-section-grow">
              <div className="apm-timetable-header">
                <div className="apm-section-title">{activeShift} Shift Time Table</div>
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
                                baseHour={activeShift === "AM" ? 8 : 20}
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