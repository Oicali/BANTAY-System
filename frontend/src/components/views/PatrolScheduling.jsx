import { useState, useEffect, useRef, useCallback } from "react";
import Map, { Source, Layer } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import "./PatrolScheduling.css";

const API_BASE = import.meta.env.VITE_API_URL;

const SHIFTS = ["Morning", "Afternoon", "Night"];
const SHIFT_LABELS = {
  Morning:   "Morning (6AM - 2PM)",
  Afternoon: "Afternoon (2PM - 10PM)",
  Night:     "Night (10PM - 6AM)",
};

const emptyForm = {
  patrol_name:    "",
  mobile_unit_id: "",
  shift:          "",
  start_date:     new Date().toISOString().split("T")[0],
  end_date:       new Date().toISOString().split("T")[0],
};

const emptyStop = { barangay: "", notes: "", time_start: "", time_end: "" };

// ── Map layer styles ───────────────────────────────────────
const fillLayer    = { id: "psch-brgy-fill",    type: "fill",   paint: { "fill-color": ["get", "fillColor"], "fill-opacity": 0.45 } };
const outlineLayer = { id: "psch-brgy-outline", type: "line",   paint: { "line-color": "#1e3a5f", "line-width": 1.2, "line-opacity": 0.6 } };
const labelLayer   = {
  id: "psch-brgy-labels", type: "symbol",
  layout: { "text-field": ["get", "name_db"], "text-size": 10, "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"], "text-max-width": 8, "text-anchor": "center", "text-allow-overlap": false },
  paint:  { "text-color": "#0a1628", "text-halo-color": "rgba(255,255,255,0.85)", "text-halo-width": 1.5 },
};

// ── Helper: generate array of dates between start and end ──
const generateDateRange = (start, end) => {
  if (!start || !end) return [];
  const dates = [];
  const cur = new Date(start);
  const last = new Date(end);
  while (cur <= last) {
    dates.push(cur.toISOString().split("T")[0]);
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
};

const PatrolScheduling = () => {
  const token = () => localStorage.getItem("token");

  // ── Data ───────────────────────────────────────────────
  const [patrols, setPatrols]                         = useState([]);
  const [mobileUnits, setMobileUnits]                 = useState([]);
  const [availablePatrollers, setAvailablePatrollers] = useState([]);

  // ── Table filters ──────────────────────────────────────
  const [search, setSearch]           = useState("");
  const [filterShift, setFilterShift] = useState("");

  // ── Main modal ─────────────────────────────────────────
  const [showModal, setShowModal]           = useState(false);
  const [modalMode, setModalMode]           = useState("add");
  const [step, setStep]                     = useState(1);
  const [selectedPatrol, setSelectedPatrol] = useState(null);

  // Step 1
  const [form, setForm]                                     = useState(emptyForm);
  const [selectedPatrollerIds, setSelectedPatrollerIds]     = useState([]);
  const [patrollerSearch, setPatrollerSearch]               = useState("");

  // Step 2 — per-day stops
  // stopsPerDay: { "2024-03-25": [{barangay, notes, time_start, time_end}], ... }
  const [stopsPerDay, setStopsPerDay]             = useState({});
  const [activeDateTab, setActiveDateTab]         = useState(null);
  const [barangaySearches, setBarangaySearches]   = useState([""]);
  const [barangayOpenIdx, setBarangayOpenIdx]     = useState(null);
  const barangayRefs                              = useRef([]);

  // ── Map modal ──────────────────────────────────────────
  const [showMapModal, setShowMapModal]           = useState(false);
  const [mapMode, setMapMode]                     = useState("single");
  const [mapTargetIdx, setMapTargetIdx]           = useState(null);
  const [mapSelectedBrgy, setMapSelectedBrgy]     = useState(null);
  const [mapDropdownSearch, setMapDropdownSearch] = useState("");
  const [mapDropdownOpen, setMapDropdownOpen]     = useState(false);
  const [geoJSONData, setGeoJSONData]             = useState(null);
  const [hoveredBrgy, setHoveredBrgy]             = useState(null);
  const mapRef                                    = useRef(null);
  const mapDropdownRef                            = useRef(null);

  // ── Load GeoJSON ───────────────────────────────────────
  useEffect(() => {
    fetch("/bacoor_barangays.geojson")
      .then((r) => r.json())
      .then((data) => setGeoJSONData(data))
      .catch((err) => console.error("GeoJSON load error:", err));
  }, []);

  // ── Close dropdowns on outside click ──────────────────
  useEffect(() => {
    const handler = (e) => {
      if (mapDropdownRef.current && !mapDropdownRef.current.contains(e.target))
        setMapDropdownOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (
        barangayOpenIdx !== null &&
        barangayRefs.current[barangayOpenIdx] &&
        !barangayRefs.current[barangayOpenIdx].contains(e.target)
      ) setBarangayOpenIdx(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [barangayOpenIdx]);

  // ── When dates change, initialize stopsPerDay ─────────
  useEffect(() => {
    if (!form.start_date || !form.end_date) return;
    const dates = generateDateRange(form.start_date, form.end_date);
    if (dates.length === 0) return;

    setStopsPerDay((prev) => {
      const updated = {};
      dates.forEach((d) => {
        updated[d] = prev[d] || [{ ...emptyStop }];
      });
      return updated;
    });

    setActiveDateTab((prev) => {
      if (prev && dates.includes(prev)) return prev;
      return dates[0];
    });
  }, [form.start_date, form.end_date]);

  // ── Current day's stops ────────────────────────────────
  const currentStops = (activeDateTab && stopsPerDay[activeDateTab]) || [{ ...emptyStop }];

  // ── Build GeoJSON ──────────────────────────────────────
  const buildGeoJSON = useCallback(() => {
    if (!geoJSONData) return null;
    const otherStopBrgys = currentStops
      .filter((_, i) => i !== mapTargetIdx)
      .map((s) => s.barangay)
      .filter(Boolean);

    const highlighted = mapMode === "single"
      ? (mapSelectedBrgy ? [mapSelectedBrgy] : [])
      : currentStops.map((s) => s.barangay).filter(Boolean);

    return {
      ...geoJSONData,
      features: geoJSONData.features.map((f) => {
        const name = f.properties.name_db;
        const isSelected = highlighted.includes(name);
        const isLocked   = mapMode === "single" && otherStopBrgys.includes(name);
        return {
          ...f,
          properties: {
            ...f.properties,
            fillColor: isSelected ? "#1e3a5f" : isLocked ? "#6b7280" : "#adb5bd",
          },
        };
      }),
    };
  }, [geoJSONData, currentStops, mapMode, mapSelectedBrgy, mapTargetIdx]);

  // ── Map click ──────────────────────────────────────────
  const handleMapClick = useCallback((e) => {
    if (!geoJSONData) return;
    const { lng, lat } = e.lngLat;

    const inside = (point, vs) => {
      let x = point[0], y = point[1], inside = false;
      for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
        let xi = vs[i][0], yi = vs[i][1], xj = vs[j][0], yj = vs[j][1];
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
          inside = !inside;
      }
      return inside;
    };

    for (const feature of geoJSONData.features) {
      const geom = feature.geometry;
      const rings = geom.type === "Polygon"
        ? [geom.coordinates[0]]
        : geom.coordinates.map((p) => p[0]);

      for (const ring of rings) {
        if (inside([lng, lat], ring)) {
          const name = feature.properties.name_db;
          if (mapMode === "single") {
            const otherBrgys = currentStops
              .filter((_, i) => i !== mapTargetIdx)
              .map((s) => s.barangay).filter(Boolean);
            if (otherBrgys.includes(name)) return;
            setMapSelectedBrgy(name);
            setMapDropdownSearch(name);
          } else {
            if (currentStops.some((s) => s.barangay === name)) return;
            updateStopsForDay(activeDateTab, (prev) => [...prev, { ...emptyStop, barangay: name }]);
            setBarangaySearches((prev) => [...prev, ""]);
          }
          return;
        }
      }
    }
  }, [geoJSONData, currentStops, mapMode, mapTargetIdx, activeDateTab]);

  // ── Stops per day helpers ──────────────────────────────
  const updateStopsForDay = (date, updater) => {
    setStopsPerDay((prev) => ({
      ...prev,
      [date]: typeof updater === "function" ? updater(prev[date] || []) : updater,
    }));
  };

  const addStopForDay = (date) => {
    updateStopsForDay(date, (prev) => [...prev, { ...emptyStop }]);
    setBarangaySearches((prev) => [...prev, ""]);
  };

  const removeStopForDay = (date, idx) => {
    updateStopsForDay(date, (prev) => prev.filter((_, i) => i !== idx));
    setBarangaySearches((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateStopFieldForDay = (date, idx, field, value) => {
    updateStopsForDay(date, (prev) =>
      prev.map((s, i) => (i === idx ? { ...s, [field]: value } : s))
    );
  };

  const updateBarangaySearch = (idx, value) =>
    setBarangaySearches((prev) => prev.map((s, i) => (i === idx ? value : s)));

  const selectBarangay = (date, idx, brgy) => {
    updateStopFieldForDay(date, idx, "barangay", brgy);
    updateBarangaySearch(idx, "");
    setBarangayOpenIdx(null);
  };

  // ── Map open helpers ───────────────────────────────────
  const openMapForStop = (idx) => {
    setMapMode("single");
    setMapTargetIdx(idx);
    setMapSelectedBrgy(currentStops[idx]?.barangay || null);
    setMapDropdownSearch(currentStops[idx]?.barangay || "");
    setMapDropdownOpen(false);
    setShowMapModal(true);
  };

  const openMapForAddStop = () => {
    setMapMode("multi");
    setMapTargetIdx(null);
    setMapSelectedBrgy(null);
    setMapDropdownSearch("");
    setMapDropdownOpen(false);
    setShowMapModal(true);
  };

  const confirmMapSelection = () => {
    if (mapMode === "single" && mapTargetIdx !== null && mapSelectedBrgy) {
      updateStopFieldForDay(activeDateTab, mapTargetIdx, "barangay", mapSelectedBrgy);
    }
    setShowMapModal(false);
    setMapSelectedBrgy(null);
    setMapDropdownSearch("");
    setMapDropdownOpen(false);
    setHoveredBrgy(null);
  };

  // ── Fetchers ───────────────────────────────────────────
  const fetchPatrols = async () => {
    try {
      const res  = await fetch(`${API_BASE}/patrol/patrols`, { headers: { Authorization: `Bearer ${token()}` } });
      const data = await res.json();
      if (data.success) setPatrols(data.data);
    } catch (err) { console.error("Patrols error:", err); }
  };

  const fetchMobileUnits = async () => {
    try {
      const res  = await fetch(`${API_BASE}/patrol/mobile-units`, { headers: { Authorization: `Bearer ${token()}` } });
      const data = await res.json();
      if (data.success) setMobileUnits(data.data);
    } catch (err) { console.error("Mobile units error:", err); }
  };

  const fetchAvailablePatrollers = async () => {
    try {
      const res  = await fetch(`${API_BASE}/patrol/available-patrollers`, { headers: { Authorization: `Bearer ${token()}` } });
      const data = await res.json();
      if (data.success) setAvailablePatrollers(data.data);
    } catch (err) { console.error("Available patrollers error:", err); }
  };

  useEffect(() => { fetchPatrols(); fetchMobileUnits(); }, []);

  // ── Modal open/close ───────────────────────────────────
  const openAddModal = () => {
    setModalMode("add");
    setSelectedPatrol(null);
    setForm(emptyForm);
    setSelectedPatrollerIds([]);
    setPatrollerSearch("");
    setStopsPerDay({});
    setActiveDateTab(null);
    setBarangaySearches([""]);
    setStep(1);
    fetchAvailablePatrollers();
    setShowModal(true);
  };

  const openEditModal = (patrol) => {
    setModalMode("edit");
    setSelectedPatrol(patrol);
    setForm({
      patrol_name:    patrol.patrol_name    || "",
      mobile_unit_id: patrol.mobile_unit_id || "",
      shift:          patrol.shift          || "",
      start_date: patrol.start_date ? new Date(patrol.start_date).toLocaleDateString("en-CA", { timeZone: "Asia/Manila" }) : new Date().toISOString().split("T")[0],
end_date:   patrol.end_date   ? new Date(patrol.end_date).toLocaleDateString("en-CA", { timeZone: "Asia/Manila" }) : new Date().toISOString().split("T")[0],
    });
    setSelectedPatrollerIds((patrol.patrollers || []).map((p) => p.active_patroller_id));
    setPatrollerSearch("");

    // Rebuild stopsPerDay from existing routes
    const built = {};
    (patrol.routes || []).forEach((r) => {
      const d = r.route_date?.split("T")[0] || r.route_date;
      if (!built[d]) built[d] = [];
      built[d].push({
        barangay:   r.barangay,
        notes:      r.notes || "",
        time_start: r.time_start,
        time_end:   r.time_end,
      });
    });
    setStopsPerDay(built);

    const dates = generateDateRange(
      patrol.start_date?.split("T")[0],
      patrol.end_date?.split("T")[0]
    );
    setActiveDateTab(dates[0] || null);
    setBarangaySearches([""]);
    setStep(1);
    fetchAvailablePatrollers();
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedPatrol(null);
    setStep(1);
    setSelectedPatrollerIds([]);
    setStopsPerDay({});
    setActiveDateTab(null);
    setBarangaySearches([""]);
    setBarangayOpenIdx(null);
  };

  // ── Form handlers ──────────────────────────────────────
  const handleFormChange = (e) =>
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const togglePatroller = (id) =>
    setSelectedPatrollerIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );

  const goToStep2 = () => {
    if (!form.patrol_name || !form.mobile_unit_id || !form.shift || !form.start_date || !form.end_date) {
      alert("Please fill in all required fields.");
      return;
    }
    if (new Date(form.end_date) < new Date(form.start_date)) {
      alert("End date must be on or after start date.");
      return;
    }
    setStep(2);
  };

  // ── Submit ─────────────────────────────────────────────
  const handleSubmit = async () => {
    // Flatten all stops across all days into routes array
    const routes = [];
    Object.entries(stopsPerDay).forEach(([date, dayStops]) => {
      dayStops.forEach((stop, idx) => {
        if (stop.barangay && stop.time_start && stop.time_end) {
          routes.push({
            route_date: date,
            barangay:   stop.barangay,
            notes:      stop.notes || null,
            time_start: stop.time_start,
            time_end:   stop.time_end,
            stop_order: idx + 1,
          });
        }
      });
    });

    if (routes.length === 0) {
      alert("Please add at least one route stop with barangay and times.");
      return;
    }

    try {
      const url = modalMode === "add"
        ? `${API_BASE}/patrol/patrols`
        : `${API_BASE}/patrol/patrols/${selectedPatrol.patrol_id}`;

      const res  = await fetch(url, {
        method: modalMode === "add" ? "POST" : "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ ...form, patroller_ids: selectedPatrollerIds, routes }),
      });
      const data = await res.json();
      if (data.success) { closeModal(); fetchPatrols(); }
      else alert(data.message || "Something went wrong.");
    } catch (err) { console.error("Submit error:", err); }
  };

  // ── Delete ─────────────────────────────────────────────
  const handleDelete = async (id) => {
    if (!confirm("Are you sure you want to delete this patrol?")) return;
    try {
      const res  = await fetch(`${API_BASE}/patrol/patrols/${id}`, {
        method: "DELETE", headers: { Authorization: `Bearer ${token()}` },
      });
      const data = await res.json();
      if (data.success) fetchPatrols();
      else alert(data.message || "Something went wrong.");
    } catch (err) { console.error("Delete error:", err); }
  };

  // ── Helpers ────────────────────────────────────────────
  const getInitials  = (name) => name ? name.substring(0, 2).toUpperCase() : "NA";
  const formatDate    = (d) => d ? new Date(d).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" }) : "—";
const formatTabDate = (d) => d ? new Date(d).toLocaleDateString("en-PH", { month: "short", day: "numeric", timeZone: "Asia/Manila" }) : "—";
  const formatTime   = (t)    => t ? t.substring(0, 5) : "—";

  const getShiftClass = (shift) => {
    if (shift === "Morning")   return "shift-morning";
    if (shift === "Afternoon") return "shift-afternoon";
    if (shift === "Night")     return "shift-night";
    return "";
  };

  const filteredPatrols = patrols.filter((p) => {
    const matchSearch = search
      ? (p.patrol_name || "").toLowerCase().includes(search.toLowerCase()) ||
        (p.mobile_unit_name || "").toLowerCase().includes(search.toLowerCase())
      : true;
    const matchShift = filterShift ? p.shift === filterShift : true;
    return matchSearch && matchShift;
  });

  const modalPatrollerList = (
    modalMode === "edit" && selectedPatrol
      ? [
          ...availablePatrollers,
          ...(selectedPatrol.patrollers || []).filter(
            (p) => !availablePatrollers.find((a) => a.active_patroller_id === p.active_patroller_id)
          ),
        ]
      : availablePatrollers
  ).filter((p) => (p.officer_name || "").toLowerCase().includes(patrollerSearch.toLowerCase()));

  const brgyList = geoJSONData
    ? geoJSONData.features.map((f) => f.properties.name_db).filter(Boolean)
    : [];

  const dateRange = generateDateRange(form.start_date, form.end_date);

  // Group routes by date for table display
  const groupRoutesByDate = (routes) => {
    const grouped = {};
    (routes || []).forEach((r) => {
      const d = r.route_date 
  ? new Date(r.route_date).toLocaleDateString("en-CA", { timeZone: "Asia/Manila" })
  : null;
      if (!grouped[d]) grouped[d] = [];
      grouped[d].push(r);
    });
    return grouped;
  };

  // ── Render ─────────────────────────────────────────────
  return (
    <div className="dash">
      <div className="psch-content-area">

        {/* PAGE HEADER */}
        <div className="psch-page-header">
          <div className="psch-page-header-left">
            <h1>Patrol Scheduling</h1>
            <p>Manage patrol officer schedules and assignments</p>
          </div>
          <button className="psch-btn psch-btn-primary" onClick={openAddModal}>+ Add Patrol</button>
        </div>

        {/* FILTERS */}
        <div className="psch-filters">
          <div className="psch-search-box">
            <input type="text" placeholder="Search patrol name or mobile unit..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="psch-filter-select" value={filterShift} onChange={(e) => setFilterShift(e.target.value)}>
            <option value="">All Shifts</option>
            {SHIFTS.map((s) => <option key={s} value={s}>{SHIFT_LABELS[s]}</option>)}
          </select>
        </div>

        {/* TABLE */}
        <div className="psch-table-card">
          <div className="psch-table-container">
            <table className="psch-data-table">
              <thead>
                <tr>
                  <th>Patrol Name</th>
                  <th>Mobile Unit</th>
                  <th>Shift</th>
                  <th>Duration</th>
                  <th>Date</th>
                  <th>Assigned Patrollers</th>
                  <th>Area of Responsibility</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredPatrols.length === 0 ? (
                  <tr><td colSpan={8} className="psch-empty-row">No patrols found.</td></tr>
                ) : (
                  filteredPatrols.map((patrol) => {
                    const grouped   = groupRoutesByDate(patrol.routes);
                    const dates     = Object.keys(grouped).sort();
                    const rowCount  = Math.max(dates.length, 1);

                    return dates.length === 0 ? (
                      <tr key={patrol.patrol_id}>
                        <td><span className="psch-patrol-name">{patrol.patrol_name}</span></td>
                        <td><span className="psch-unit-text">{patrol.mobile_unit_name || "—"}</span></td>
                        <td><span className={`psch-shift-badge ${getShiftClass(patrol.shift)}`}>{patrol.shift}</span></td>
                        <td><span className="psch-date-text">{formatDate(patrol.start_date)} — {formatDate(patrol.end_date)}</span></td>
                        <td><span className="psch-date-text">—</span></td>
                        <td>
                          {patrol.patrollers?.length > 0 ? (
                            <div className="psch-patroller-stack">
                              {patrol.patrollers.map((p) => (
                                <div key={p.active_patroller_id} className="psch-patroller-row">
                                  <div className="psch-avatar">{getInitials(p.officer_name)}</div>
                                  <span className="psch-officer-name">{p.officer_name}</span>
                                </div>
                              ))}
                            </div>
                          ) : <span className="psch-none-text">No patrollers</span>}
                        </td>
                        <td><span className="psch-none-text">No route set</span></td>
                        <td>
                          <div className="psch-action-btns">
                            <button className="psch-edit-btn" onClick={() => openEditModal(patrol)}>Edit</button>
                            <button className="psch-delete-btn" onClick={() => handleDelete(patrol.patrol_id)}>Delete</button>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      dates.map((date, dateIdx) => (
                        <tr key={`${patrol.patrol_id}-${date}`} className={dateIdx > 0 ? "psch-sub-row" : ""}>

                          {/* Merged cells — only on first row */}
                          {dateIdx === 0 && (
                            <>
                              <td rowSpan={rowCount}><span className="psch-patrol-name">{patrol.patrol_name}</span></td>
                              <td rowSpan={rowCount}><span className="psch-unit-text">{patrol.mobile_unit_name || "—"}</span></td>
                              <td rowSpan={rowCount}><span className={`psch-shift-badge ${getShiftClass(patrol.shift)}`}>{patrol.shift}</span></td>
                              <td rowSpan={rowCount}>
                                <span className="psch-duration-text">
                                  {formatDate(patrol.start_date)} — {formatDate(patrol.end_date)}
                                </span>
                              </td>
                            </>
                          )}

                          {/* Per-day date */}
                          <td>
                            <span className="psch-date-chip">{formatTabDate(date)}</span>
                          </td>

                          {/* Patrollers — merged */}
                          {dateIdx === 0 && (
                            <td rowSpan={rowCount}>
                              {patrol.patrollers?.length > 0 ? (
                                <div className="psch-patroller-stack">
                                  {patrol.patrollers.map((p) => (
                                    <div key={p.active_patroller_id} className="psch-patroller-row">
                                      <div className="psch-avatar">{getInitials(p.officer_name)}</div>
                                      <span className="psch-officer-name">{p.officer_name}</span>
                                    </div>
                                  ))}
                                </div>
                              ) : <span className="psch-none-text">No patrollers</span>}
                            </td>
                          )}

                          {/* Routes for this date */}
                          <td>
                            <div className="psch-route-stack">
                              {(grouped[date] || []).map((r, i) => (
                                <div key={i} className="psch-route-row">
                                  <span className="psch-route-time">{formatTime(r.time_start)} - {formatTime(r.time_end)}</span>
                                  <div className="psch-route-details">
                                    <span className="psch-route-brgy">{r.barangay}</span>
                                    {r.notes && <span className="psch-route-notes">{r.notes}</span>}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </td>

                          {/* Actions — merged */}
                          {dateIdx === 0 && (
                            <td rowSpan={rowCount}>
                              <div className="psch-action-btns">
                                <button className="psch-edit-btn" onClick={() => openEditModal(patrol)}>Edit</button>
                                <button className="psch-delete-btn" onClick={() => handleDelete(patrol.patrol_id)}>Delete</button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── MAIN MODAL ── */}
      {showModal && (
        <div className="psch-modal-overlay" onClick={closeModal}>
          <div className="psch-modal psch-modal-wide" onClick={(e) => e.stopPropagation()}>

            <div className="psch-modal-header">
              <div className="psch-modal-title">
                <h3>{modalMode === "add" ? "Add Patrol" : "Edit Patrol"}</h3>
                <div className="psch-step-indicator">
                  <span className={`psch-step ${step === 1 ? "psch-step-active" : "psch-step-done"}`}>1. Basic Info</span>
                  <span className="psch-step-divider">›</span>
                  <span className={`psch-step ${step === 2 ? "psch-step-active" : ""}`}>2. Route Stops</span>
                </div>
              </div>
              <button className="psch-modal-close" onClick={closeModal}>×</button>
            </div>

            {/* STEP 1 */}
            {step === 1 && (
              <>
                <div className="psch-modal-body">
                  <div className="psch-form-group">
                    <label>Patrol Name <span className="psch-required">*</span></label>
                    <input type="text" name="patrol_name" value={form.patrol_name} onChange={handleFormChange} placeholder="e.g. Beat 3 AM" />
                  </div>
                  <div className="psch-form-group">
                    <label>Mobile Unit <span className="psch-required">*</span></label>
                    <select name="mobile_unit_id" value={form.mobile_unit_id} onChange={handleFormChange}>
                      <option value="">— Select Mobile Unit —</option>
                      {mobileUnits.map((mu) => (
                        <option key={mu.mobile_unit_id} value={mu.mobile_unit_id}>
                          {mu.mobile_unit_name} ({mu.plate_number})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="psch-form-group">
                    <label>Shift <span className="psch-required">*</span></label>
                    <select name="shift" value={form.shift} onChange={handleFormChange}>
                      <option value="">— Select Shift —</option>
                      {SHIFTS.map((s) => <option key={s} value={s}>{SHIFT_LABELS[s]}</option>)}
                    </select>
                  </div>
                  <div className="psch-form-row">
                    <div className="psch-form-group">
                      <label>Start Date <span className="psch-required">*</span></label>
                      <input type="date" name="start_date" value={form.start_date} onChange={handleFormChange} />
                    </div>
                    <div className="psch-form-group">
                      <label>End Date <span className="psch-required">*</span></label>
                      <input type="date" name="end_date" value={form.end_date} onChange={handleFormChange} min={form.start_date} />
                    </div>
                  </div>
                  <div className="psch-form-group">
                    <label>
                      Assign Patrollers
                      {selectedPatrollerIds.length > 0 && (
                        <span className="psch-selected-count"> ({selectedPatrollerIds.length} selected)</span>
                      )}
                    </label>
                    <div className="psch-checklist-search">
                      <input type="text" placeholder="Search patroller..." value={patrollerSearch} onChange={(e) => setPatrollerSearch(e.target.value)} />
                    </div>
                    {modalPatrollerList.length === 0 ? (
                      <div className="psch-empty-list">No available patrollers.</div>
                    ) : (
                      <div className="psch-checklist">
                        {modalPatrollerList.map((p) => {
                          const isSelected = selectedPatrollerIds.includes(p.active_patroller_id);
                          return (
                            <div key={p.active_patroller_id} className={`psch-check-item ${isSelected ? "psch-checked" : ""}`} onClick={() => togglePatroller(p.active_patroller_id)}>
                              <div className="psch-avatar sm">{getInitials(p.officer_name)}</div>
                              <span className="psch-officer-name">{p.officer_name}</span>
                              <div className={`psch-check-box ${isSelected ? "psch-check-on" : ""}`}>{isSelected ? "✓" : ""}</div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
                <div className="psch-modal-footer">
                  <button className="psch-btn-cancel" onClick={closeModal}>Cancel</button>
                  <button className="psch-btn psch-btn-primary" onClick={goToStep2}>Next: Route Stops</button>
                </div>
              </>
            )}

            {/* STEP 2 */}
            {step === 2 && (
              <>
                <div className="psch-modal-body psch-step2-body">

                  {/* Date tabs */}
                  <div className="psch-date-tabs">
                    {dateRange.map((date) => (
                      <button
                        key={date}
                        className={`psch-date-tab ${activeDateTab === date ? "psch-date-tab-active" : ""}`}
                        onClick={() => { setActiveDateTab(date); setBarangayOpenIdx(null); }}
                      >
                        {formatTabDate(date)}
                        {stopsPerDay[date]?.some((s) => s.barangay) && (
                          <span className="psch-date-tab-dot" />
                        )}
                      </button>
                    ))}
                  </div>

                  {/* Stops for active date */}
                  <div className="psch-stops-area">
                    <p className="psch-step-hint">
                      Adding stops for <strong>{formatDate(activeDateTab)}</strong>. Use search or click Map to select barangay.
                    </p>

                    {currentStops.map((stop, idx) => (
                      <div key={idx} className="psch-stop-card">
                        <div className="psch-stop-card-header">
                          <div className="psch-stop-number">{idx + 1}</div>
                          {currentStops.length > 1 && (
                            <button className="psch-remove-stop" onClick={() => removeStopForDay(activeDateTab, idx)}>×</button>
                          )}
                        </div>

                        {/* Barangay */}
                        <div className="psch-form-group">
                          <label>Barangay</label>
                          <div className="psch-barangay-row">
                            <div className="psch-stop-barangay" ref={(el) => (barangayRefs.current[idx] = el)}>
                              <input
                                type="text"
                                placeholder="Search barangay..."
                                value={stop.barangay || barangaySearches[idx] || ""}
                                onChange={(e) => {
                                  updateStopFieldForDay(activeDateTab, idx, "barangay", "");
                                  updateBarangaySearch(idx, e.target.value);
                                }}
                                onFocus={() => setBarangayOpenIdx(idx)}
                              />
                              {stop.barangay && (
                                <div className="psch-selected-brgy-tag">
                                  {stop.barangay}
                                  <button onClick={() => updateStopFieldForDay(activeDateTab, idx, "barangay", "")}>×</button>
                                </div>
                              )}
                              {barangayOpenIdx === idx && !stop.barangay && (
                                <div className="psch-brgy-dropdown">
                                  {brgyList
                                    .filter((b) => b.toLowerCase().includes((barangaySearches[idx] || "").toLowerCase()))
                                    .map((brgy) => (
                                      <div key={brgy} className="psch-brgy-option" onMouseDown={() => selectBarangay(activeDateTab, idx, brgy)}>
                                        {brgy}
                                      </div>
                                    ))}
                                </div>
                              )}
                            </div>
                            <button className="psch-map-icon-btn" onClick={() => openMapForStop(idx)}>Map</button>
                          </div>
                        </div>

                        {/* Notes */}
                        <div className="psch-form-group">
                          <label>Notes <span className="psch-optional">(optional)</span></label>
                          <input type="text" placeholder="e.g. Check the market area" value={stop.notes} onChange={(e) => updateStopFieldForDay(activeDateTab, idx, "notes", e.target.value)} />
                        </div>

                        {/* Time */}
                        <div className="psch-form-row">
                          <div className="psch-form-group">
                            <label>Time Start</label>
                            <input type="time" value={stop.time_start} onChange={(e) => updateStopFieldForDay(activeDateTab, idx, "time_start", e.target.value)} />
                          </div>
                          <div className="psch-form-group">
                            <label>Time End</label>
                            <input type="time" value={stop.time_end} onChange={(e) => updateStopFieldForDay(activeDateTab, idx, "time_end", e.target.value)} />
                          </div>
                        </div>
                      </div>
                    ))}

                    <button className="psch-add-stop-btn" onClick={openMapForAddStop}>+ Add Stop</button>
                  </div>
                </div>
                <div className="psch-modal-footer">
                  <button className="psch-btn-cancel" onClick={() => setStep(1)}>Back</button>
                  <button className="psch-btn psch-btn-primary" onClick={handleSubmit}>
                    {modalMode === "add" ? "Create Patrol" : "Save Changes"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── MAP MODAL ── */}
      {showMapModal && (
        <div className="psch-map-overlay" onClick={confirmMapSelection}>
          <div className="psch-map-modal" onClick={(e) => e.stopPropagation()}>
            <div className="psch-map-modal-header">
              <div>
                <h3>{mapMode === "single" ? "Select Barangay" : "Add Stops from Map"}</h3>
                <p>{mapMode === "single" ? "Click a barangay or search below. Click Done to confirm." : "Click barangays to add as stops, or use search."}</p>
              </div>
              <button className="psch-modal-close" onClick={confirmMapSelection}>×</button>
            </div>

            <div className="psch-map-search-bar" ref={mapDropdownRef}>
              <input
                type="text"
                placeholder="Search barangay..."
                value={mapDropdownSearch}
                onChange={(e) => { setMapDropdownSearch(e.target.value); setMapDropdownOpen(true); }}
                onFocus={() => setMapDropdownOpen(true)}
              />
              {mapDropdownOpen && (
                <div className="psch-map-search-dropdown">
                  {brgyList.filter((b) => b.toLowerCase().includes(mapDropdownSearch.toLowerCase())).map((brgy) => {
                    const alreadyAdded = mapMode === "multi"
                      ? currentStops.some((s) => s.barangay === brgy)
                      : currentStops.filter((_, i) => i !== mapTargetIdx).some((s) => s.barangay === brgy);
                    return (
                      <div key={brgy} className={`psch-map-search-item ${alreadyAdded ? "psch-map-search-disabled" : ""}`}
                        onMouseDown={() => {
                          if (alreadyAdded) return;
                          if (mapMode === "single") {
                            setMapSelectedBrgy(brgy);
                            setMapDropdownSearch(brgy);
                            setMapDropdownOpen(false);
                          } else {
                            updateStopsForDay(activeDateTab, (prev) => [...prev, { ...emptyStop, barangay: brgy }]);
                            setBarangaySearches((prev) => [...prev, ""]);
                            setMapDropdownSearch("");
                            setMapDropdownOpen(false);
                          }
                        }}>
                        {brgy}
                        {alreadyAdded && <span className="psch-map-search-added">Added</span>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {mapMode === "single" && mapSelectedBrgy && (
              <div className="psch-map-single-selected">Selected: <strong>{mapSelectedBrgy}</strong></div>
            )}
            {mapMode === "multi" && currentStops.filter((s) => s.barangay).length > 0 && (
              <div className="psch-map-tags">
                {currentStops.filter((s) => s.barangay).map((s, i) => (
                  <span key={i} className="psch-map-tag">
                    {s.barangay}
                    <button onClick={() => {
                      const idx = currentStops.findIndex((st) => st.barangay === s.barangay);
                      if (idx !== -1) removeStopForDay(activeDateTab, idx);
                    }}>×</button>
                  </span>
                ))}
              </div>
            )}

            <div className="psch-map-container">
              {hoveredBrgy && (
                <div className="psch-map-tooltip">
                  <strong>{hoveredBrgy.name}</strong>
                  {(() => {
                    const otherBrgys = currentStops.filter((_, i) => i !== mapTargetIdx).map((s) => s.barangay).filter(Boolean);
                    if (mapMode === "single" && otherBrgys.includes(hoveredBrgy.name)) return " — Already used";
                    if (mapMode === "multi" && currentStops.some((s) => s.barangay === hoveredBrgy.name)) return " — Already added";
                    return " — Click to select";
                  })()}
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
                  const features = e.target.queryRenderedFeatures(e.point, { layers: ["psch-brgy-fill"] });
                  if (features.length > 0) {
                    e.target.getCanvas().style.cursor = "pointer";
                    setHoveredBrgy({ name: features[0].properties.name_db });
                  } else {
                    e.target.getCanvas().style.cursor = "";
                    setHoveredBrgy(null);
                  }
                }}
                onMouseLeave={() => setHoveredBrgy(null)}
              >
                {buildGeoJSON() && (
                  <Source id="psch-barangays" type="geojson" data={buildGeoJSON()}>
                    <Layer {...fillLayer} />
                    <Layer {...outlineLayer} />
                    <Layer {...labelLayer} />
                  </Source>
                )}
              </Map>
            </div>

            <div className="psch-map-modal-footer">
              <p className="psch-map-hint">{mapMode === "single" ? "Dark blue = selected. Click Done to confirm." : "Dark blue = added stops. Click Done when finished."}</p>
              <button className="psch-btn psch-btn-primary" onClick={confirmMapSelection}>Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PatrolScheduling;