// src/components/modals/EditPatrolModal.jsx
import { useState, useRef, useCallback, useEffect } from "react";
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
        <div className="apd-sub">Select which dates should receive the changes from the current date.</div>
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
          <button className="apd-btn-all" onClick={() => setSelected([...dateRange])}>Select All</button>
          <div style={{ flex: 1 }} />
          <button className="apd-btn-cancel"  onClick={onCancel}>Cancel</button>
          <button className="apd-btn-confirm" onClick={() => onConfirm(selected)}>Apply &amp; Save</button>
        </div>
      </div>
    </div>
  );
};

// ── Main Component ─────────────────────────────────────────────────
const EditPatrolModal = ({ patrol, mobileUnits, geoJSONData, onClose, onSave }) => {
  const token           = () => localStorage.getItem("token");
  const mapRef          = useRef(null);
  const deletedRouteIds = useRef(new Set());
  const tasksDirty      = useRef(false);

  const [loading, setLoading]                 = useState(false);
  const [notif, setNotif]                     = useState(null);
  const [activeShift, setActiveShift]         = useState("AM");
  const [hoveredBrgy, setHoveredBrgy]         = useState(null);
  const [showApplyDialog, setShowApplyDialog] = useState(false);
const [patrollerSearch, setPatrollerSearch] = useState("");
const [showPatrollers, setShowPatrollers]   = useState(false);
const [patrollerPage, setPatrollerPage]     = useState(1);

  // The full list shown in the checklist (available + already assigned to this patrol)
  const [patrollerList, setPatrollerList]         = useState([]);
  const [loadingPatrollers, setLoadingPatrollers] = useState(true);

  const [form, setForm] = useState({
    patrol_name:    patrol?.patrol_name    || "",
    mobile_unit_id: patrol?.mobile_unit_id || "",
    start_date:     toDateStr(patrol?.start_date) || "",
    end_date:       toDateStr(patrol?.end_date)   || "",
  });

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

  // ── Per-date patroller state ────────────────────────────────────
  // Shape: { "2025-05-02": { am: [id, ...], pm: [id, ...] }, ... }
  const [patrollersByDate, setPatrollersByDate] = useState(() => {
    const map    = {};
    const source = patrol?.patrollers_detail || patrol?.patrollers || [];
    for (const p of source) {
  console.log("patroller row:", p.active_patroller_id, p.route_date, p.shift);
  const d = toDateStr(p.route_date);
  if (!d) continue;
      if (!map[d]) map[d] = { am: [], pm: [] };
      if (p.shift === "AM") map[d].am.push(p.active_patroller_id);
      else                  map[d].pm.push(p.active_patroller_id);
    }
    return map;
  });

  // ── Dirty dates — useState so executeSave closure always sees latest ──
  const [dirtyDates, setDirtyDates] = useState(new Set());
  const markDirty  = (date) => setDirtyDates((prev) => { const n = new Set(prev); n.add(date); return n; });
  const clearDirty = ()     => setDirtyDates(new Set());

  // ── Load patroller list on mount ────────────────────────────────
  // Strategy:
  //   1. Fetch available patrollers for this date range (excludes other patrols)
  //   2. Also collect every patroller already assigned to THIS patrol from patrollers_detail
  //   3. Merge both — this ensures currently-assigned patrollers always appear in the list
  //      even if the available-patrollers endpoint would normally exclude them
  useEffect(() => {
    if (!patrol?.patrol_id) return;

    const start = toDateStr(patrol.start_date);
    const end   = toDateStr(patrol.end_date);
    if (!start || !end) return;

    setLoadingPatrollers(true);

    fetch(
      `${API_BASE}/patrol/available-patrollers?start=${start}&end=${end}&exclude_patrol_id=${patrol.patrol_id}`,
      { headers: { Authorization: `Bearer ${token()}` } }
    )
      .then((r) => r.json())
      .then((data) => {
        // Start with the available list (patrollers not in any other patrol)
        const available = data.success ? data.data : [];

        // Build a map of all patrollers already assigned to THIS patrol
        // from patrollers_detail (full per-date list) or patrollers (deduplicated)
        const assignedSource = patrol?.patrollers_detail || patrol?.patrollers || [];
        const merged = [...available];
for (const p of assignedSource) {
  if (!merged.find((m) => m.active_patroller_id === p.active_patroller_id)) {
    merged.push({
      active_patroller_id: p.active_patroller_id,
      officer_name:        p.officer_name,
      contact_number:      p.contact_number || null,
    });
  }
}
          
console.log("final merged:", merged);
        // Sort alphabetically
        merged.sort((a, b) => (a.officer_name || "").localeCompare(b.officer_name || ""));
        setPatrollerList(merged);
      })
      .catch((err) => {
         console.error("Load patrollers error:", err); // already there
  console.error("catch triggered — this is why list is empty");
        // Fallback: show at least the already-assigned patrollers
        const assignedSource = patrol?.patrollers_detail || patrol?.patrollers || [];
        const seen   = new Set(assignedSource.map((p) => p.active_patroller_id));
const unique = assignedSource.filter((p) => {
  if (seen.has(p.active_patroller_id)) { seen.delete(p.active_patroller_id); return true; }
  return false;
});
setPatrollerList(unique.sort((a, b) => (a.officer_name || "").localeCompare(b.officer_name || "")));
      })
      .finally(() => setLoadingPatrollers(false));
  }, [patrol?.patrol_id]);

  // Derived for current date + shift
  const activeDatePatrollers = patrollersByDate[activeDate] || { am: [], pm: [] };
  const currentPatrollerIds  = activeShift === "AM" ? activeDatePatrollers.am : activeDatePatrollers.pm;
  const otherShiftIds        = activeShift === "AM" ? activeDatePatrollers.pm : activeDatePatrollers.am;

  const togglePatroller = (id) => {
    if (otherShiftIds.includes(id)) {
      setNotif({
        message: `This patroller is already assigned to the ${activeShift === "AM" ? "PM" : "AM"} shift on this date.`,
        type: "warning",
      });
      return;
    }
    // Only mark THIS date dirty — other dates are untouched
    markDirty(activeDate);
    setPatrollersByDate((prev) => {
      const existing = prev[activeDate] || { am: [], pm: [] };
      const key      = activeShift === "AM" ? "am" : "pm";
      const ids      = existing[key];
      return {
        ...prev,
        [activeDate]: {
          ...existing,
          [key]: ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id],
        },
      };
    });
  };

  // ── Routes / tasks ──────────────────────────────────────────────
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
        const total  = h * 60 + m + 1;
        defaultStart = `${String(Math.floor(total / 60) % 24).padStart(2,"0")}:${String(total % 60).padStart(2,"0")}`;
      } else {
        defaultStart = last.time_start || (activeShift === "AM" ? "08:00" : "20:00");
      }
    }

    const newStopOrder = existingForDateShift.length + 1;
    try {
      const res  = await fetch(`${API_BASE}/patrol/routes/add`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body:    JSON.stringify({
          patrol_id: patrol.patrol_id, route_date: activeDate, shift: activeShift,
          time_start: defaultStart, time_end: null, notes: null, stop_order: newStopOrder,
        }),
      });
      const data = await res.json();
      if (data.success) {
        tasksDirty.current = true;
        setLocalRoutes((prev) => [...prev, {
          route_id:   data.route_id, route_date: activeDate, shift: activeShift,
          time_start: defaultStart,  time_end: "", notes: "", stop_order: newStopOrder,
        }]);
      }
    } catch (err) { console.error("Add task error:", err); }
  };

  const removeTask = (routeId) => {
    tasksDirty.current = true;
    deletedRouteIds.current.add(routeId);
    setLocalRoutes((prev) => prev.filter((r) => r.route_id !== routeId));
  };

  // ── Validation ──────────────────────────────────────────────────
  const handleSave = () => {
    if (!form.patrol_name || !form.mobile_unit_id || !form.start_date || !form.end_date) {
      setNotif({ message: "Please fill in all required fields.", type: "warning" }); return;
    }

    const taskRoutes = localRoutes.filter((r) => (r.stop_order || 0) > 0);
    for (const r of taskRoutes) {
      if (!r.time_start || !r.time_end) {
        setNotif({ message: "All tasks must have both a start and end time.", type: "warning" }); return;
      }
      const [sh, sm] = r.time_start.split(":").map(Number);
      const [eh, em] = r.time_end.split(":").map(Number);
      if (eh * 60 + em <= sh * 60 + sm) {
        setNotif({ message: "A task's end time must be after its start time.", type: "warning" }); return;
      }
    }

    const groupKeys = [...new Set(taskRoutes.map((r) => `${toDateStr(r.route_date)}__${r.shift}`))];
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
        const [eh, em] = group[i].time_end.split(":").map(Number);
        const [sh, sm] = group[i + 1].time_start.split(":").map(Number);
        if ((eh * 60 + em) > (sh * 60 + sm)) {
          const fmt = (t) => {
            const [h, m] = t.split(":").map(Number);
            const h12 = h % 12 === 0 ? 12 : h % 12;
            return `${String(h12).padStart(2,"0")}:${String(m).padStart(2,"0")} ${h < 12 ? "AM" : "PM"}`;
          };
          setNotif({
            message: `Task overlap on ${shift}: ${fmt(group[i].time_start)}–${fmt(group[i].time_end)} overlaps ${fmt(group[i+1].time_start)}–${fmt(group[i+1].time_end)}.`,
            type: "warning",
          });
          return;
        }
      }
    }

    if (tasksDirty.current || dirtyDates.size > 0) {
      setShowApplyDialog(true);
    } else {
      executeSave([activeDate]);
    }
  };

  // ── Execute save ────────────────────────────────────────────────
  const executeSave = async (selectedDates) => {
    setShowApplyDialog(false);
    tasksDirty.current = false;
    setLoading(true);

    try {
      // 1. Delete removed tasks + propagate to other selected dates
      const idsToDelete        = [...deletedRouteIds.current];
      const deletedTaskDetails = idsToDelete
        .map((rid) => patrol.routes.find((r) => r.route_id === rid))
        .filter(Boolean);
      const allIdsToDelete = new Set(idsToDelete);

      for (const deletedTask of deletedTaskDetails) {
        for (const date of selectedDates) {
          if (date === activeDate) continue;
          const match = localRoutes.find(
            (r) => toDateStr(r.route_date) === toDateStr(date) &&
                   r.shift === deletedTask.shift &&
                   Number(r.stop_order) === Number(deletedTask.stop_order)
          );
          if (match) allIdsToDelete.add(match.route_id);
        }
      }

      await Promise.all(
        [...allIdsToDelete].map((rid) =>
          fetch(`${API_BASE}/patrol/routes/${rid}`, {
            method: "DELETE", headers: { Authorization: `Bearer ${token()}` },
          })
        )
      );
      deletedRouteIds.current.clear();

      // 2. Patch / create tasks across selected dates
      const activeTasks   = localRoutes.filter(
        (r) => (r.stop_order || 0) > 0 && toDateStr(r.route_date) === activeDate
      );
      const patchRequests = [];

      for (const date of selectedDates) {
        if (date === activeDate) {
          for (const r of activeTasks) {
            patchRequests.push(
              fetch(`${API_BASE}/patrol/routes/${r.route_id}/task`, {
                method:  "PATCH",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
                body:    JSON.stringify({ time_start: r.time_start || null, time_end: r.time_end || null, notes: r.notes || null }),
              })
            );
          }
        } else {
          for (const activeTask of activeTasks) {
            const match = localRoutes.find(
              (r) => toDateStr(r.route_date) === toDateStr(date) &&
                     r.shift === activeTask.shift &&
                     Number(r.stop_order) === Number(activeTask.stop_order)
            );
            patchRequests.push(match
              ? fetch(`${API_BASE}/patrol/routes/${match.route_id}/task`, {
                  method:  "PATCH",
                  headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
                  body:    JSON.stringify({ time_start: activeTask.time_start || null, time_end: activeTask.time_end || null, notes: activeTask.notes || null }),
                })
              : fetch(`${API_BASE}/patrol/routes/add`, {
                  method:  "POST",
                  headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
                  body:    JSON.stringify({
                    patrol_id: patrol.patrol_id, route_date: date, shift: activeTask.shift,
                    time_start: activeTask.time_start || null, time_end: activeTask.time_end || null,
                    notes: activeTask.notes || null, stop_order: activeTask.stop_order,
                  }),
                })
            );
          }
        }
      }
      await Promise.all(patchRequests);

      // 3. Save patrollers for all selected dates using active date's state
//    If patrollers were changed (dirtyDates has activeDate), apply to ALL selectedDates
//    If patrollers were NOT changed, only save the individually dirty dates
const patrollerDatestoSave = dirtyDates.has(activeDate)
  ? [...new Set([...selectedDates, ...dirtyDates])]  // selectedDates + any other dirty dates
  : [...dirtyDates];                                  // only individually toggled dates

const activeDatePatrollerState = patrollersByDate[activeDate] || { am: [], pm: [] };

const patrollerResults = await Promise.all(
  patrollerDatestoSave.map((date) => {
    // For dates in selectedDates, use active date's patroller state (apply-all behavior)
    // For other dirty dates, use that date's own patroller state
    const dp = selectedDates.includes(date)
      ? activeDatePatrollerState
      : (patrollersByDate[date] || { am: [], pm: [] });
    return fetch(`${API_BASE}/patrol/patrols/${patrol.patrol_id}/patrollers/${date}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
      body:    JSON.stringify({ patroller_ids_am: dp.am, patroller_ids_pm: dp.pm }),
    }).then((r) => r.json());
  })
);

      // If any conflict was returned, show it and stop
      const conflict = patrollerResults.find((r) => !r.success);
      if (conflict) {
        setLoading(false);
        setNotif({ message: conflict.message, type: "warning" });
        return;
      }

      clearDirty();

      // 4. Save patrol info + barangays
      onSave({ ...form, barangays });
    } catch (err) {
      console.error("Save error:", err);
      setLoading(false);
      setNotif({ message: "Failed to save. Please try again.", type: "error" });
    }
  };

  // ── Map ─────────────────────────────────────────────────────────
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

  const getInitials = (name) => name ? name.substring(0, 2).toUpperCase() : "NA";

  const filteredPatrollers = patrollerList
    .filter((p) => (p.officer_name || "").toLowerCase().includes(patrollerSearch.toLowerCase()));

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

          {/* RIGHT panel */}
          <div className="epm-info-panel">

            {/* ── Date tabs — very top ── */}
            {dateRange.length > 0 && (
              <div className="epm-date-tabs">
                {dateRange.map((date) => (
                  <button key={date}
                    className={`epm-date-tab ${activeDate === date ? "epm-date-tab-active" : ""}`}
                    onClick={() => { setActiveDate(date); setPatrollerSearch(""); setShowPatrollers(false); setPatrollerPage(1); }}>
                    {formatTabDate(date)}
                    {dirtyDates.has(date) && <span className="epm-date-dirty">●</span>}
                  </button>
                ))}
              </div>
            )}

            {/* ── AM/PM shift tabs ── */}
            <div className="epm-shift-tabs-top">
              <button
                className={`epm-shift-tab-top ${activeShift === "AM" ? "epm-shift-active" : ""}`}
             onClick={() => { setActiveShift("AM"); setPatrollerSearch(""); setShowPatrollers(false); setPatrollerPage(1); }}
              >
                AM Shift
                {activeDatePatrollers.am.length > 0 && (
                  <span className="epm-shift-badge">{activeDatePatrollers.am.length}</span>
                )}
              </button>
              <button
                className={`epm-shift-tab-top ${activeShift === "PM" ? "epm-shift-active" : ""}`}
               onClick={() => { setActiveShift("PM"); setPatrollerSearch(""); setShowPatrollers(false); setPatrollerPage(1); }}
              >
                PM Shift
                {activeDatePatrollers.pm.length > 0 && (
                  <span className="epm-shift-badge">{activeDatePatrollers.pm.length}</span>
                )}
              </button>
            </div>

          {/* ── Patrollers for this date + shift ── */}
<div className="epm-section epm-patroller-section">
  <div className="epm-section-title-row">
    <span className="epm-section-title">
      {activeShift} Patrollers — {formatTabDate(activeDate)}
      {currentPatrollerIds.length > 0 && (
        <span className="epm-shift-badge" style={{ marginLeft: 6 }}>{currentPatrollerIds.length}</span>
      )}
    </span>
    {!loadingPatrollers && (
      showPatrollers ? (
        <button className="epm-toggle-btn epm-toggle-hide" onClick={() => { setShowPatrollers(false); setPatrollerPage(1); }}>
          Hide
        </button>
      ) : (
        <button className="epm-toggle-btn epm-toggle-show" onClick={() => setShowPatrollers(true)}>
          Show Patrollers
        </button>
      )
    )}
  </div>

  {loadingPatrollers ? (
    <div className="epm-empty">Loading patrollers...</div>
  ) : (
    <>
      {!showPatrollers && (
        <p className="epm-patroller-hidden-hint">
          {currentPatrollerIds.length > 0
            ? `${currentPatrollerIds.length} selected — click Show Patrollers to manage`
            : `${patrollerList.length} available — click Show Patrollers to assign`}
        </p>
      )}

      {showPatrollers && (() => {
        const PER_PAGE = 5;
        const totalPP  = Math.max(1, Math.ceil(filteredPatrollers.length / PER_PAGE));
        const safePP   = Math.min(patrollerPage, totalPP);
        const paged    = filteredPatrollers.slice((safePP - 1) * PER_PAGE, safePP * PER_PAGE);
        return (
          <>
            <input className="epm-search" type="text" placeholder="Search patroller..."
              value={patrollerSearch}
              onChange={(e) => { setPatrollerSearch(e.target.value); setPatrollerPage(1); }} />
           <div className="epm-checklist">
  {filteredPatrollers.length === 0 ? (
    <div className="epm-empty">No patrollers available.</div>
  ) : (
    paged.map((p) => {
      const isSelected   = currentPatrollerIds.includes(p.active_patroller_id);
      const isOtherShift = otherShiftIds.includes(p.active_patroller_id);
      return (
        <div key={p.active_patroller_id}
          className={`epm-check-item ${isSelected ? "epm-checked" : ""} ${isOtherShift ? "epm-other-shift" : ""}`}
          onClick={() => togglePatroller(p.active_patroller_id)}
          title={isOtherShift ? `Already in ${activeShift === "AM" ? "PM" : "AM"} shift on this date` : ""}>
          <div className="epm-avatar" style={{ overflow: "hidden", padding: 0 }}>
            {p.profile_picture ? (
              <img src={p.profile_picture} alt={p.officer_name}
                style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }} />
            ) : getInitials(p.officer_name)}
          </div>
          <div className="epm-officer-info">
            <span className="epm-officer-name">{p.officer_name}</span>
            {isOtherShift && (
              <span className="epm-other-shift-label">{activeShift === "AM" ? "PM" : "AM"} shift</span>
            )}
          </div>
          <div className="apm-checkbox-col">
            <div className={`epm-checkbox ${isSelected ? "epm-checkbox-on" : ""}`}>
              {isSelected ? "✓" : ""}
            </div>
          </div>
        </div>
      );
    })
  )}
  {filteredPatrollers.length > 0 && Array.from({ length: Math.max(0, PER_PAGE - paged.length) }).map((_, i) => (
    <div key={`ghost-${i}`} className="epm-checklist-ghost" />
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

            {/* ── Timetable for this date + shift ── */}
            <div className="epm-section epm-section-grow">
              <div className="epm-timetable-header">
                <div className="epm-section-title">{activeShift} Time Table — {formatTabDate(activeDate)}</div>
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

      {showApplyDialog && (
        <ApplyDatesDialog
          key={activeDate}
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