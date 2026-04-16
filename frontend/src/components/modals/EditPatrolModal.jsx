import { useState, useEffect, useRef, useCallback } from "react";
import Map, { Source, Layer } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import "./PatrolModal.css";
import LoadingModal from "./LoadingModal";
import Notification from "./Notification";
import TimePicker from "./TimePicker";

const API_BASE = import.meta.env.VITE_API_URL;

const fillLayer    = { id: "epm-fill",    type: "fill",   paint: { "fill-color": ["get", "fillColor"], "fill-opacity": 0.5 } };
const outlineLayer = { id: "epm-outline", type: "line",   paint: { "line-color": "#1e3a5f", "line-width": 1.5, "line-opacity": 0.7 } };
const labelLayer   = {
  id: "epm-labels", type: "symbol",
  layout: { "text-field": ["get", "name_db"], "text-size": 10, "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"], "text-max-width": 8, "text-anchor": "center", "text-allow-overlap": false },
  paint:  { "text-color": "#0a1628", "text-halo-color": "rgba(255,255,255,0.85)", "text-halo-width": 1.5 },
};

const toDateStr = (d) => {
  if (!d) return null;
  if (typeof d === "string") {
    if (d.includes("T") || d.includes("Z")) {
      const dt = new Date(d);
      return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")}`;
    }
    return d.substring(0, 10);
  }
  if (d instanceof Date) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  }
  return null;
};

const generateDateRange = (start, end) => {
  if (!start || !end) return [];
  const startStr = toDateStr(start);
  const endStr   = toDateStr(end);
  if (!startStr || !endStr) return [];
  const dates = [];
  const [sy, sm, sd] = startStr.split("-").map(Number);
  const [ey, em, ed] = endStr.split("-").map(Number);
  const cur  = new Date(sy, sm - 1, sd);
  const last = new Date(ey, em - 1, ed);
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

// ── Apply Dates Dialog ─────────────────────────────────────────────
const ApplyDatesDialog = ({ dateRange, activeDate, onConfirm, onCancel }) => {
  const [selected, setSelected] = useState([activeDate]);

  const toggle = (date) => {
    if (date === activeDate) return;
    setSelected((prev) =>
      prev.includes(date) ? prev.filter((d) => d !== date) : [...prev, date]
    );
  };

  const formatD = (d) => {
    const [y, m, day] = d.split("-").map(Number);
    return new Date(y, m - 1, day).toLocaleDateString("en-PH", {
      month: "short", day: "numeric", weekday: "short",
    });
  };

  return (
    <div className="apd-overlay" onClick={(e) => e.stopPropagation()}>
      <div className="apd-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="apd-title">Apply changes to dates</div>
        <div className="apd-sub">Select which dates should receive the task changes from the current date.</div>
        <div className="apd-dates">
          {dateRange.map((date) => (
            <div
              key={date}
              className={`apd-date-item ${selected.includes(date) ? "apd-selected" : ""} ${date === activeDate ? "apd-current" : ""}`}
              onClick={() => toggle(date)}
            >
              <div className={`apd-check ${selected.includes(date) ? "apd-check-on" : ""}`}>
                {selected.includes(date) ? "✓" : ""}
              </div>
              <span>{formatD(date)}</span>
              {date === activeDate && <span className="apd-badge">Current</span>}
            </div>
          ))}
        </div>
        <div className="apd-actions">
          <button className="apd-btn-all" onClick={() => setSelected([...dateRange])}>
            Select All
          </button>
          <div style={{ flex: 1 }} />
          <button className="apd-btn-cancel" onClick={onCancel}>Cancel</button>
          <button className="apd-btn-confirm" onClick={() => onConfirm(selected)}>
            Apply &amp; Save
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Main Component ─────────────────────────────────────────────────
const EditPatrolModal = ({ patrol, mobileUnits, availablePatrollers, geoJSONData, onClose, onSave }) => {
  const token           = () => localStorage.getItem("token");
  const mapRef          = useRef(null);
  const deletedRouteIds = useRef(new Set());
  const tasksDirty = useRef(false);

  const [loading, setLoading]             = useState(false);
  const [notif, setNotif]                 = useState(null);
  const [activeShift, setActiveShift]     = useState("AM");
  const [hoveredBrgy, setHoveredBrgy]     = useState(null);
  const [showApplyDialog, setShowApplyDialog] = useState(false);

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

  const [barangays, setBarangays] = useState(() =>
    [...new Set((patrol?.routes || []).filter((r) => (r.stop_order || 0) <= 0 && r.barangay).map((r) => r.barangay))]
  );

  const [localRoutes, setLocalRoutes] = useState(
    (patrol?.routes || []).filter((r) => (r.stop_order || 0) > 0)
  );

  const dateRange = generateDateRange(toDateStr(form.start_date), toDateStr(form.end_date));

  const [activeDate, setActiveDate] = useState(() => {
    const dates = generateDateRange(toDateStr(patrol?.start_date), toDateStr(patrol?.end_date));
    return dates[0] || null;
  });

  const routesForDateShift = localRoutes
    .filter((r) => toDateStr(r.route_date) === activeDate && r.shift === activeShift)
    .sort((a, b) => (a.stop_order || 0) - (b.stop_order || 0));

  const handleTaskChange = (routeId, field, value) => {
  tasksDirty.current = true;
  setLocalRoutes((prev) =>
    prev.map((r) => r.route_id === routeId ? { ...r, [field]: value } : r)
  );
};

  const addTask = async () => {
    const existingForDateShift = localRoutes
      .filter((r) => toDateStr(r.route_date) === activeDate && r.shift === activeShift)
      .sort((a, b) => (a.stop_order || 0) - (b.stop_order || 0));

    let defaultStart;
    if (existingForDateShift.length === 0) {
      defaultStart = activeShift === "AM" ? "08:00" : "20:00";
    } else {
      const last = existingForDateShift[existingForDateShift.length - 1];
      if (last.time_end) {
        const [h, m] = last.time_end.split(":").map(Number);
        const total = h * 60 + m + 1;
        const nh = Math.floor(total / 60) % 24;
        const nm = total % 60;
        defaultStart = `${String(nh).padStart(2, "0")}:${String(nm).padStart(2, "0")}`;
      } else {
        defaultStart = last.time_start || (activeShift === "AM" ? "08:00" : "20:00");
      }
    }

    const newStopOrder = existingForDateShift.length + 1;

    try {
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
         tasksDirty.current = true;
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

  const removeTask = (routeId) => {
  tasksDirty.current = true;
  deletedRouteIds.current.add(routeId);
  setLocalRoutes((prev) => prev.filter((r) => r.route_id !== routeId));
};

  // ── Validate then show dialog ──────────────────────────────────
  const handleSave = () => {
  if (!form.patrol_name || !form.mobile_unit_id || !form.start_date || !form.end_date) {
    setNotif({ message: "Please fill in all required fields.", type: "warning" });
    return;
  }
 
  const taskRoutes = localRoutes.filter((r) => (r.stop_order || 0) > 0);
for (const r of taskRoutes) {
  if (!r.time_start || !r.time_end) {
    setNotif({ message: "All tasks must have both a start and end time.", type: "warning" });
    return;
  }
  const [sh, sm] = r.time_start.split(":").map(Number);
  const [eh, em] = r.time_end.split(":").map(Number);
  if (eh * 60 + em <= sh * 60 + sm) {
    setNotif({ message: "A task's end time must be after its start time.", type: "warning" });
    return;
  }
}

// Check overlaps — group by date + shift, sort by time_start, check adjacent pairs
const groupKeys = [...new Set(
  taskRoutes.map((r) => `${toDateStr(r.route_date)}__${r.shift}`)
)];

for (const key of groupKeys) {
  const [date, shift] = key.split("__");
  const group = taskRoutes
    .filter((r) => toDateStr(r.route_date) === date && r.shift === shift)
    .sort((a, b) => {
      const [ah, am] = a.time_start.split(":").map(Number);
      const [bh, bm] = b.time_start.split(":").map(Number);
      return (ah * 60 + am) - (bh * 60 + bm);
    });

  for (let i = 0; i < group.length - 1; i++) {
    const cur  = group[i];
    const next = group[i + 1];
    const [eh, em] = cur.time_end.split(":").map(Number);
    const [sh, sm] = next.time_start.split(":").map(Number);
    const curEnd   = eh * 60 + em;
    const nextStart = sh * 60 + sm;

    if (curEnd > nextStart) {
      const fmt = (t) => {
        const [h, m] = t.split(":").map(Number);
        const period = h < 12 ? "AM" : "PM";
        const h12 = h % 12 === 0 ? 12 : h % 12;
        return `${String(h12).padStart(2,"0")}:${String(m).padStart(2,"0")} ${period}`;
      };
      setNotif({
        message: `Task overlap on ${shift} shift: ${fmt(cur.time_start)}–${fmt(cur.time_end)} overlaps with ${fmt(next.time_start)}–${fmt(next.time_end)}.`,
        type: "warning",
      });
      return;
    }
  }
}
  if (tasksDirty.current) {
    // Timetable was changed — ask which dates to apply to
    setShowApplyDialog(true);
  } else {
    // Only patrol info/patrollers/barangays changed — save directly
    executeSave([activeDate]);
  }
};

  // ── Execute save after dialog confirms ────────────────────────
  const executeSave = async (selectedDates) => {
   setShowApplyDialog(false);
  tasksDirty.current = false; // reset
  setLoading(true);
  try {
    // 1. Delete removed tasks
   // 1. Delete removed tasks — on ALL selected dates by matching shift + stop_order
const idsToDelete = [...deletedRouteIds.current];

// For each deleted route, find its shift + stop_order so we can delete matches on other dates
const deletedTaskDetails = idsToDelete.map((routeId) => {
  // Find in the original patrol routes since it's already removed from localRoutes
  return patrol.routes.find((r) => r.route_id === routeId);
}).filter(Boolean);

// Collect all route_ids to delete across all selected dates
const allIdsToDelete = new Set(idsToDelete);

for (const deletedTask of deletedTaskDetails) {
  for (const date of selectedDates) {
    if (date === activeDate) continue; // already in idsToDelete
    const match = localRoutes.find(
      (r) =>
        toDateStr(r.route_date) === toDateStr(date) &&
        r.shift === deletedTask.shift &&
        Number(r.stop_order) === Number(deletedTask.stop_order)
    );
    if (match) allIdsToDelete.add(match.route_id);
  }
}

await Promise.all(
  [...allIdsToDelete].map((routeId) =>
    fetch(`${API_BASE}/patrol/routes/${routeId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token()}` },
    })
  )
);
deletedRouteIds.current.clear();

    // 2. Get active date's tasks as the source
    const activeTasks = localRoutes.filter(
      (r) => (r.stop_order || 0) > 0 && toDateStr(r.route_date) === activeDate
    );

    // 3. Build all PATCH requests across selected dates
    const patchRequests = [];

    for (const date of selectedDates) {
      if (date === activeDate) {
        // Save active date tasks directly by route_id
        for (const r of activeTasks) {
          patchRequests.push(
            fetch(`${API_BASE}/patrol/routes/${r.route_id}/task`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
              body: JSON.stringify({
                time_start: r.time_start || null,
                time_end:   r.time_end   || null,
                notes:      r.notes      || null,
              }),
            })
          );
        }
      } else {
        // For other dates, match by shift + stop_order
        for (const activeTask of activeTasks) {
          // Use toDateStr on both sides to normalize ISO strings vs plain dates
          const match = localRoutes.find(
            (r) =>
              toDateStr(r.route_date) === toDateStr(date) &&
              r.shift === activeTask.shift &&
              Number(r.stop_order) === Number(activeTask.stop_order)
          );
          console.log(`Matching date=${date} shift=${activeTask.shift} stop_order=${activeTask.stop_order}:`, match);
          if (match) {
  patchRequests.push(
    fetch(`${API_BASE}/patrol/routes/${match.route_id}/task`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
      body: JSON.stringify({
        time_start: activeTask.time_start || null,
        time_end:   activeTask.time_end   || null,
        notes:      activeTask.notes      || null,
      }),
    })
  );
} else {
  // Task doesn't exist on this date yet — create it
  patchRequests.push(
    fetch(`${API_BASE}/patrol/routes/add`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
      body: JSON.stringify({
        patrol_id:  patrol.patrol_id,
        route_date: date,
        shift:      activeTask.shift,
        time_start: activeTask.time_start || null,
        time_end:   activeTask.time_end   || null,
        notes:      activeTask.notes      || null,
        stop_order: activeTask.stop_order,
      }),
    })
  );
}
        }
      }
    }

    await Promise.all(patchRequests);

    // 4. Save patrol info last
    onSave({ ...form, patroller_ids: selectedPatrollerIds, barangays });
  } catch (err) {
    console.error("Save error:", err);
    setLoading(false);
    setNotif({ message: "Failed to save. Please try again.", type: "error" });
  }
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
                onChange={(e) => setForm((p) => ({ ...p, patrol_name: e.target.value }))}
                placeholder="e.g. Sector 6 Beat 2" />
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

          {/* LEFT — Map */}
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

          {/* RIGHT — Patrollers + Timetable */}
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

              {/* Shift tabs */}
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
                      <tr><th>Time</th><th>Task / Comment</th><th></th></tr>
                    </thead>
                    <tbody>
                      {routesForDateShift.map((r) => (
                        <tr key={r.route_id}>
                          <td className="epm-tt-time">
                            <div className="epm-time-inputs">
                              <TimePicker
                                value={r.time_start || ""}
                                onChange={(v) => handleTaskChange(r.route_id, "time_start", v)}
                              />
                              <span>—</span>
                              <TimePicker
                                value={r.time_end || r.time_start || ""}
                                onChange={(v) => handleTaskChange(r.route_id, "time_end", v)}
                                baseHour={r.time_start ? parseInt(r.time_start.split(":")[0]) % 12 || 12 : 8}
                              />
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
                          <td>
                            <button className="epm-remove" onClick={() => removeTask(r.route_id)}>×</button>
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

      {/* Apply Dates Dialog — outside epm-modal but inside epm-overlay */}
     {showApplyDialog && (
  <ApplyDatesDialog
    key={activeDate} // forces remount when activeDate changes
    dateRange={dateRange}
    activeDate={activeDate}
    onConfirm={(selectedDates) => executeSave(selectedDates)}
    onCancel={() => setShowApplyDialog(false)}
  />
)}

      <LoadingModal isOpen={loading} message="Saving patrol..." />
      {notif && <Notification message={notif.message} type={notif.type} onClose={() => setNotif(null)} duration={2000} />}
    </div>
  );
};

export default EditPatrolModal;