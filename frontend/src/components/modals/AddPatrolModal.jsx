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
  const activeShiftRef = useRef("AM");
  const [hoveredBrgy, setHoveredBrgy] = useState(null);
const [showPatrollers, setShowPatrollers] = useState(false);
const [patrollerPage, setPatrollerPage]   = useState(1);




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
  const [availableMobileUnits, setAvailableMobileUnits] = useState(null); // null = no dates yet
const [loadingMobileUnits, setLoadingMobileUnits] = useState(false);
  const [loadingPatrollers, setLoadingPatrollers] = useState(false);
  const [barangays, setBarangays]                 = useState([]);
  const [tasks, setTasks]                         = useState([]);
  const [taskOrder, setTaskOrder] = useState([]); 
  const tasksRef                  = useRef([]);

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
  useEffect(() => {
  setAvailableMobileUnits(null);
  setForm((p) => ({ ...p, mobile_unit_id: "" }));
  if (!form.start_date || !form.end_date || form.end_date < form.start_date) return;

  setLoadingMobileUnits(true);
  fetch(
    `${API_BASE}/patrol/available-mobile-units?start=${form.start_date}&end=${form.end_date}`,
    { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } }
  )
    .then((r) => r.json())
    .then((data) => { if (data.success) setAvailableMobileUnits(data.data); })
    .catch(console.error)
    .finally(() => setLoadingMobileUnits(false));
}, [form.start_date, form.end_date]);

  const amTasks      = tasks.filter((t) => t.shift === "AM");
  const pmTasks      = tasks.filter((t) => t.shift === "PM");
const shiftTasks   = activeShift === "AM" ? amTasks : pmTasks;
const currentTasks = taskOrder
  .map((id) => shiftTasks.find((t) => t._id === id))
  .filter(Boolean);

  const currentSelectedIds    = activeShift === "AM" ? selectedAMIds : selectedPMIds;
  const setCurrentSelectedIds = activeShift === "AM" ? setSelectedAMIds : setSelectedPMIds;
  const otherShiftIds         = activeShift === "AM" ? selectedPMIds : selectedAMIds;

const addTask = () => {
  // Normalize times for PM shift so post-midnight sorts after 20:00+
  const toPmMin = (t) => {
    if (!t) return 0;
    const [h, m] = t.split(":").map(Number);
    const raw = h * 60 + m;
    return raw < 12 * 60 ? raw + 24 * 60 : raw;
  };

  const toMin = (t) => {
    if (!t) return 0;
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };

  const existing = tasks
    .filter((t) => t.shift === activeShift)
    .slice()
    .sort((a, b) =>
      activeShift === "PM"
        ? toPmMin(a.time_start) - toPmMin(b.time_start)
        : toMin(a.time_start)  - toMin(b.time_start)
    );

  // Limit check
  if (existing.length > 0) {
    const last = existing[existing.length - 1];
    if (last.time_end) {
      if (activeShift === "AM" && toMin(last.time_end) >= 20 * 60) {
        setNotif({ message: "AM shift tasks cannot go past 8:00 PM.", type: "warning" });
        return;
      }
      if (activeShift === "PM") {
        const pmMinutes = toPmMin(last.time_end) - 20 * 60;
        if (pmMinutes >= 12 * 60) {
          setNotif({ message: "PM shift tasks cannot go past 8:00 AM.", type: "warning" });
          return;
        }
      }
    }
  }

  // Default start
  let defaultStart;
  if (existing.length === 0) {
    defaultStart = activeShift === "AM" ? "08:00" : "20:00";
  } else {
    const last = existing[existing.length - 1];
    if (last.time_end) {
      const total = toMin(last.time_end) + 1;
      defaultStart = `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
    } else {
      defaultStart = last.time_start || (activeShift === "AM" ? "08:00" : "20:00");
    }
  }

  // Default end = start + 60 min (first task) or + 59 min (subsequent)
  const [dh, dm]   = defaultStart.split(":").map(Number);
  const isFirst    = existing.length === 0;
  const endTotal   = dh * 60 + dm + (isFirst ? 60 : 59);
  const defaultEnd = `${String(Math.floor(endTotal / 60) % 24).padStart(2, "0")}:${String(endTotal % 60).padStart(2, "0")}`;

  const newId   = Date.now();
  const newTask = {
    shift:      activeShift,
    time_start: defaultStart,
    time_end:   defaultEnd,
    notes:      "",
    stop_order: existing.length + 1,
    _id:        newId,
  };

  setTasks((prev) => {
    const next = [...prev, newTask];
    tasksRef.current = next;
    return next;
  });
  setTaskOrder((prev) => [...prev, newId]);
};

const removeTask = (id) => {
  setTasks((prev) => {
    const next = prev.filter((t) => t._id !== id);
    tasksRef.current = next;
    return next;
  });
  setTaskOrder((prev) => prev.filter((x) => x !== id));
};

const sortCurrentShift = useCallback(() => {
  const latest = tasksRef.current;
  const shift  = activeShiftRef.current;
  setTaskOrder((prev) => {
    const shiftIds = latest.filter((t) => t.shift === shift).map((t) => t._id);
    const otherIds = prev.filter((id) => !shiftIds.includes(id));
    const sorted   = latest
      .filter((t) => t.shift === shift)
      .slice()
      .sort((a, b) => {
        const norm = (t) => {
          if (!t) return Infinity;
          const [h, m] = t.split(":").map(Number);
          const raw = h * 60 + m;
          return shift === "PM" && raw < 12 * 60 ? raw + 24 * 60 : raw;
        };
        return norm(a.time_start) - norm(b.time_start);
      })
      .map((t) => t._id);
    return [...otherIds, ...sorted];
  });
}, []);

const updateTask = (id, field, v) => setTasks((prev) => {
  const next = prev.map((t) => t._id === id ? { ...t, [field]: v } : t);
  tasksRef.current = next;
  return next;
});



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
const toPmMin = (t) => {
  if (!t) return 0;
  const [h, m] = t.split(":").map(Number);
  const raw = h * 60 + m;
  return raw < 12 * 60 ? raw + 24 * 60 : raw;
};

for (const task of tasks) {
  if (!task.time_start || !task.time_end) {
    setNotif({ message: "All tasks must have both a start and end time.", type: "warning" }); return;
  }
  const startMin = task.time_start.split(":").map(Number).reduce((h, m) => h * 60 + m);
  const endMin   = task.time_end.split(":").map(Number).reduce((h, m) => h * 60 + m);

  // For PM shift use midnight-aware comparison
  const effectiveStart = task.shift === "PM" ? toPmMin(task.time_start) : startMin;
  const effectiveEnd   = task.shift === "PM" ? toPmMin(task.time_end)   : endMin;

  if (effectiveEnd <= effectiveStart) {
    setNotif({ message: "A task's end time must be after its start time.", type: "warning" }); return;
  }
}

    // Overlap check
   for (const shift of ["AM", "PM"]) {
  const group = tasks
    .filter((t) => t.shift === shift)
    .slice()
    .sort((a, b) => {
      const norm = (t) => {
        const [h, m] = t.split(":").map(Number);
        const raw = h * 60 + m;
        return shift === "PM" && raw < 12 * 60 ? raw + 24 * 60 : raw;
      };
      return norm(a.time_start) - norm(b.time_start);
    });
  for (let i = 0; i < group.length - 1; i++) {
    const norm = (t) => {
      const [h, m] = t.split(":").map(Number);
      const raw = h * 60 + m;
      return shift === "PM" && raw < 12 * 60 ? raw + 24 * 60 : raw;
    };
    if (norm(group[i].time_end) > norm(group[i + 1].time_start)) {
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
  <select
    value={form.mobile_unit_id}
    onChange={(e) => setForm((p) => ({ ...p, mobile_unit_id: e.target.value }))}
    disabled={!form.start_date || !form.end_date || loadingMobileUnits}
  >
    {!form.start_date || !form.end_date
      ? <option value="">— Select dates first —</option>
      : loadingMobileUnits
      ? <option value="">Loading...</option>
      : availableMobileUnits?.length === 0
      ? <option value="">No units available</option>
      : <>
          <option value="">— Select Mobile Unit —</option>
          {(availableMobileUnits || []).map((mu) => (
            <option key={mu.mobile_unit_id} value={mu.mobile_unit_id}>
              {mu.mobile_unit_name} ({mu.plate_number})
            </option>
          ))}
        </>
    }
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
  onClick={() => { setActiveShift("AM"); activeShiftRef.current = "AM"; setPatrollerSearch(""); setShowPatrollers(false); setPatrollerPage(1); }}
>
  AM Shift
  {selectedAMIds.length > 0 && <span className="apm-shift-badge">{selectedAMIds.length}</span>}
</button>
<button
  className={`apm-shift-tab-top ${activeShift === "PM" ? "apm-shift-active" : ""}`}
  onClick={() => { setActiveShift("PM"); activeShiftRef.current = "PM"; setPatrollerSearch(""); setShowPatrollers(false); setPatrollerPage(1); }}
>
  PM Shift
  {selectedPMIds.length > 0 && <span className="apm-shift-badge">{selectedPMIds.length}</span>}
</button>
            </div>

{/* Patrollers */}
<div className="apm-section">
  <div className="apm-section-title-row">
    <div className="apm-section-title">
      {activeShift} Shift Patrollers
      {currentSelectedIds.length > 0 && (
        <span className="apm-shift-badge" style={{ marginLeft: 6 }}>{currentSelectedIds.length}</span>
      )}
    </div>
    {availableForDates !== null && !loadingPatrollers && (
      showPatrollers ? (
        <button className="apm-toggle-btn apm-toggle-hide" onClick={() => { setShowPatrollers(false); setPatrollerPage(1); }}>
          Hide
        </button>
      ) : (
        <button className="apm-toggle-btn apm-toggle-show" onClick={() => setShowPatrollers(true)}>
          Show Patrollers
        </button>
      )
    )}
  </div>

  {availableForDates === null ? (
    <p className="apm-empty" style={{ fontStyle: "normal", color: "#6c757d" }}>
      Please select a start and end date to see available patrollers.
    </p>
  ) : loadingPatrollers ? (
    <p className="apm-empty">Loading patrollers...</p>
  ) : (
    <>
      {!showPatrollers && (
        <p className="apm-patroller-hidden-hint">
          {currentSelectedIds.length > 0
            ? `${currentSelectedIds.length} selected — click Show Patrollers to manage`
            : `${availableForDates.length} available — click Show Patrollers to assign`}
        </p>
      )}

      {showPatrollers && (() => {
        const PER_PAGE    = 5;
        const filtered    = availableForDates.filter((p) =>
          (p.officer_name || "").toLowerCase().includes(patrollerSearch.toLowerCase())
        );
        const totalPP     = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
        const safePP      = Math.min(patrollerPage, totalPP);
        const paged       = filtered.slice((safePP - 1) * PER_PAGE, safePP * PER_PAGE);
        return (
  <>
    <input className="apm-search" type="text" placeholder="Search patroller..."
      value={patrollerSearch}
      onChange={(e) => { setPatrollerSearch(e.target.value); setPatrollerPage(1); }} />
   <div className="apm-checklist">
  {filtered.length === 0 ? (
    <div className="apm-empty">No available patrollers for this period.</div>
  ) : (
    paged.map((p) => {
      const isSelected   = currentSelectedIds.includes(p.active_patroller_id);
      const isOtherShift = otherShiftIds.includes(p.active_patroller_id);
      return (
        <div key={p.active_patroller_id}
          className={`apm-check-item ${isSelected ? "apm-checked" : ""} ${isOtherShift ? "apm-other-shift" : ""}`}
          onClick={() => togglePatroller(p.active_patroller_id)}
          title={isOtherShift ? `Already assigned to ${activeShift === "AM" ? "PM" : "AM"} shift` : ""}>
          <div className="apm-avatar" style={{ overflow: "hidden", padding: 0 }}>
            {p.profile_picture ? (
              <img src={p.profile_picture} alt={p.officer_name}
                style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }} />
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
          <div className="apm-checkbox-col">
            <div className={`apm-checkbox ${isSelected ? "apm-checkbox-on" : ""}`}>
              {isSelected ? "✓" : ""}
            </div>
          </div>
        </div>
      );
    })
  )}
  {filtered.length > 0 && Array.from({ length: Math.max(0, PER_PAGE - paged.length) }).map((_, i) => (
    <div key={`ghost-${i}`} className="apm-checklist-ghost" />
  ))}
</div>
    {totalPP > 1 && (
  <div className="apm-pg-inline">
    <button className="apm-pg-arrow"
      onClick={() => setPatrollerPage((p) => Math.max(1, p - 1))}
      disabled={safePP === 1}>‹</button>
    <span className="apm-pg-label">{safePP} / {totalPP}</span>
    <button className="apm-pg-arrow"
      onClick={() => setPatrollerPage((p) => Math.min(totalPP, p + 1))}
      disabled={safePP === totalPP}>›</button>
  </div>
)}
  </>
);
      })()}
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
                   {currentTasks.map((task, idx) => {
  const toMin = (t) => { if (!t) return null; const [h, m] = t.split(":").map(Number); return h * 60 + m; };
  const prevTask = currentTasks[idx - 1];

const toPmMinRow = (t) => {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  const raw = h * 60 + m;
  return activeShift === "PM" && raw < 12 * 60 ? raw + 24 * 60 : raw;
};

const startMin = toPmMinRow(task.time_start);
const endMin   = toPmMinRow(task.time_end);
const badRange = startMin !== null && endMin !== null && endMin <= startMin;

const hasOverlap = prevTask
  && startMin !== null
  && toPmMinRow(prevTask.time_end) !== null
  && startMin < toPmMinRow(prevTask.time_end);


  const rowError = badRange || hasOverlap;
  return (
  <tr key={task._id} style={rowError ? { background: "#fffbeb", outline: "1px solid #f59e0b" } : {}}>
                          <td className="apm-tt-time">
                            <div className="apm-time-inputs">
 <TimePicker
  value={task.time_start}
  onChange={(v) => updateTask(task._id, "time_start", v)}
  onBlur={sortCurrentShift}
  baseHour={activeShift === "AM" ? 8 : 20}
  allowedPeriods={activeShift === "AM" ? ["AM", "PM"] : ["PM", "AM"]}
  maxPeriod={activeShift === "AM" ? "PM" : null}
  shift={activeShift}
/>
<span>—</span>
<TimePicker
  value={task.time_end || task.time_start}
  onChange={(v) => updateTask(task._id, "time_end", v)}
  onBlur={sortCurrentShift}
  baseHour={task.time_start ? parseInt(task.time_start.split(":")[0]) % 12 || 12 : 8}
  allowedPeriods={activeShift === "AM" ? ["AM", "PM"] : ["PM", "AM"]}
  maxPeriod={activeShift === "AM" ? "PM" : null}
  shift={activeShift}
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
                     );
                    })}
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