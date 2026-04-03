//1-12 only
import { useState, useEffect, useRef, useCallback } from "react";
import Map, { Source, Layer } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import "./PatrolScheduling.css";
import BeatCard from "../modals/BeatCard";
import LoadingModal from "../modals/LoadingModal";
const API_BASE = import.meta.env.VITE_API_URL;

const SHIFTS = ["Morning", "Night"];
const SHIFT_LABELS = {
  Morning: "Morning",
  Night: "Night",
};

const emptyForm = {
  patrol_name: "",
  mobile_unit_id: "",
  shift: "",
  start_date: new Date().toISOString().split("T")[0],
  end_date: new Date().toISOString().split("T")[0],
};

const emptyStop = { barangay: "", notes: "", time_start: "", time_end: "" };

// ── Map layer styles ───────────────────────────────────────
const fillLayer = {
  id: "psch-brgy-fill",
  type: "fill",
  paint: { "fill-color": ["get", "fillColor"], "fill-opacity": 0.45 },
};
const outlineLayer = {
  id: "psch-brgy-outline",
  type: "line",
  paint: { "line-color": "#1e3a5f", "line-width": 1.2, "line-opacity": 0.6 },
};
const labelLayer = {
  id: "psch-brgy-labels",
  type: "symbol",
  layout: {
    "text-field": ["get", "name_db"],
    "text-size": 10,
    "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"],
    "text-max-width": 8,
    "text-anchor": "center",
    "text-allow-overlap": false,
  },
  paint: {
    "text-color": "#0a1628",
    "text-halo-color": "rgba(255,255,255,0.85)",
    "text-halo-width": 1.5,
  },
};

const PatrolScheduling = () => {
  const token = () => localStorage.getItem("token");

  // ── Data ───────────────────────────────────────────────
  const [patrols, setPatrols] = useState([]);
  const [mobileUnits, setMobileUnits] = useState([]);
  const [availablePatrollers, setAvailablePatrollers] = useState([]);

  // ── Table filters ──────────────────────────────────────
  const [search, setSearch] = useState("");
  const [filterShift, setFilterShift] = useState("");

  // ── Main modal ─────────────────────────────────────────
  const [showModal, setShowModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [modalMode, setModalMode] = useState("add");
  const [step, setStep] = useState(1);
  const [selectedPatrol, setSelectedPatrol] = useState(null);
  const [showBeatCard, setShowBeatCard] = useState(false);
  const [beatCardPatrol, setBeatCardPatrol] = useState(null);

  // Step 1
  const [form, setForm] = useState(emptyForm);
  const [selectedPatrollerIds, setSelectedPatrollerIds] = useState([]);
  const [patrollerSearch, setPatrollerSearch] = useState("");

  // Step 2 — simple stops (no date tabs)
  const [stops, setStops] = useState([{ ...emptyStop }]);
  const [barangaySearches, setBarangaySearches] = useState([""]);
  const [barangayOpenIdx, setBarangayOpenIdx] = useState(null);
  const barangayRefs = useRef([]);

  // ── Map modal ──────────────────────────────────────────
  const [showMapModal, setShowMapModal] = useState(false);
  const [mapMode, setMapMode] = useState("single");
  const [mapTargetIdx, setMapTargetIdx] = useState(null);
  const [mapSelectedBrgy, setMapSelectedBrgy] = useState(null);
  const [mapDropdownSearch, setMapDropdownSearch] = useState("");
  const [mapDropdownOpen, setMapDropdownOpen] = useState(false);
  const [geoJSONData, setGeoJSONData] = useState(null);
  const [hoveredBrgy, setHoveredBrgy] = useState(null);
  const mapRef = useRef(null);
  const mapDropdownRef = useRef(null);

  // ── Load GeoJSON ───────────────────────────────────────
  useEffect(() => {
    fetch("/bacoor_barangays.geojson")
      .then((r) => r.json())
      .then((data) => setGeoJSONData(data))
      .catch((err) => console.error("GeoJSON load error:", err));
  }, []);

  // ── Close map dropdown on outside click ────────────────
  useEffect(() => {
    const handler = (e) => {
      if (mapDropdownRef.current && !mapDropdownRef.current.contains(e.target))
        setMapDropdownOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── Close barangay dropdown on outside click ───────────
  useEffect(() => {
    const handler = (e) => {
      if (
        barangayOpenIdx !== null &&
        barangayRefs.current[barangayOpenIdx] &&
        !barangayRefs.current[barangayOpenIdx].contains(e.target)
      )
        setBarangayOpenIdx(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [barangayOpenIdx]);

  //BeatCard open handler -------------------------
  const openBeatCard = (patrol) => {
    setBeatCardPatrol(patrol);
    setShowBeatCard(true);
  };
  // ── Build GeoJSON ──────────────────────────────────────
  const buildGeoJSON = useCallback(() => {
    if (!geoJSONData) return null;
    const otherStopBrgys = stops
      .filter((_, i) => i !== mapTargetIdx)
      .map((s) => s.barangay)
      .filter(Boolean);

    const highlighted =
      mapMode === "single"
        ? mapSelectedBrgy
          ? [mapSelectedBrgy]
          : []
        : stops.map((s) => s.barangay).filter(Boolean);

    return {
      ...geoJSONData,
      features: geoJSONData.features.map((f) => {
        const name = f.properties.name_db;
        const isSelected = highlighted.includes(name);
        const isLocked = mapMode === "single" && otherStopBrgys.includes(name);
        return {
          ...f,
          properties: {
            ...f.properties,
            fillColor: isSelected
              ? "#1e3a5f"
              : isLocked
                ? "#6b7280"
                : "#adb5bd",
          },
        };
      }),
    };
  }, [geoJSONData, stops, mapMode, mapSelectedBrgy, mapTargetIdx]);

  // ── Map click ──────────────────────────────────────────
  const handleMapClick = useCallback(
    (e) => {
      if (!geoJSONData) return;
      const { lng, lat } = e.lngLat;

      const inside = (point, vs) => {
        let x = point[0],
          y = point[1],
          inside = false;
        for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
          let xi = vs[i][0],
            yi = vs[i][1],
            xj = vs[j][0],
            yj = vs[j][1];
          if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
            inside = !inside;
        }
        return inside;
      };

      for (const feature of geoJSONData.features) {
        const geom = feature.geometry;
        const rings =
          geom.type === "Polygon"
            ? [geom.coordinates[0]]
            : geom.coordinates.map((p) => p[0]);

        for (const ring of rings) {
          if (inside([lng, lat], ring)) {
            const name = feature.properties.name_db;
            if (mapMode === "single") {
              const otherBrgys = stops
                .filter((_, i) => i !== mapTargetIdx)
                .map((s) => s.barangay)
                .filter(Boolean);
              if (otherBrgys.includes(name)) return;
              setMapSelectedBrgy(name);
              setMapDropdownSearch(name);
            } else {
              if (stops.some((s) => s.barangay === name)) return;
              setStops((prev) => [...prev, { ...emptyStop, barangay: name }]);
              setBarangaySearches((prev) => [...prev, ""]);
            }
            return;
          }
        }
      }
    },
    [geoJSONData, stops, mapMode, mapTargetIdx],
  );

  // ── Map open helpers ───────────────────────────────────
  const openMapForStop = (idx) => {
    setMapMode("single");
    setMapTargetIdx(idx);
    setMapSelectedBrgy(stops[idx]?.barangay || null);
    setMapDropdownSearch(stops[idx]?.barangay || "");
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
      updateStop(mapTargetIdx, "barangay", mapSelectedBrgy);
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
      setIsLoading(true);
      const res = await fetch(`${API_BASE}/patrol/patrols`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      const data = await res.json();
      if (data.success) setPatrols(data.data);
    } catch (err) {
      console.error("Patrols error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchMobileUnits = async () => {
    try {
      const res = await fetch(`${API_BASE}/patrol/mobile-units`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      const data = await res.json();
      if (data.success) setMobileUnits(data.data);
    } catch (err) {
      console.error("Mobile units error:", err);
    }
  };

  const fetchAvailablePatrollers = async () => {
    try {
      const res = await fetch(`${API_BASE}/patrol/available-patrollers`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      const data = await res.json();
      if (data.success) setAvailablePatrollers(data.data);
    } catch (err) {
      console.error("Available patrollers error:", err);
    }
  };

  useEffect(() => {
    fetchPatrols();
    fetchMobileUnits();
  }, []);

  // ── Modal open/close ───────────────────────────────────
  const openAddModal = () => {
    setModalMode("add");
    setSelectedPatrol(null);
    setForm(emptyForm);
    setSelectedPatrollerIds([]);
    setPatrollerSearch("");
    setStops([{ ...emptyStop }]);
    setBarangaySearches([""]);
    setStep(1);
    fetchAvailablePatrollers();
    setShowModal(true);
  };

  const openEditModal = (patrol) => {
    setModalMode("edit");
    setSelectedPatrol(patrol);
    setForm({
      patrol_name: patrol.patrol_name || "",
      mobile_unit_id: patrol.mobile_unit_id || "",
      shift: patrol.shift || "",
      start_date: patrol.start_date
        ? new Date(patrol.start_date).toLocaleDateString("en-CA", {
            timeZone: "Asia/Manila",
          })
        : new Date().toISOString().split("T")[0],
      end_date: patrol.end_date
        ? new Date(patrol.end_date).toLocaleDateString("en-CA", {
            timeZone: "Asia/Manila",
          })
        : new Date().toISOString().split("T")[0],
    });
    setSelectedPatrollerIds(
      (patrol.patrollers || []).map((p) => p.active_patroller_id),
    );
    setPatrollerSearch("");

    // Deduplicate stops by barangay (since same stop repeats per route_date)
    const seen = new Set();
    const uniqueStops = (patrol.routes || []).reduce((acc, r) => {
      if (!seen.has(r.barangay)) {
        seen.add(r.barangay);
        acc.push({
          barangay: r.barangay,
          notes: r.notes || "",
          time_start: r.time_start || "",
          time_end: r.time_end || "",
        });
      }
      return acc;
    }, []);

    setStops(uniqueStops.length > 0 ? uniqueStops : [{ ...emptyStop }]);
    setBarangaySearches(uniqueStops.map(() => ""));
    setStep(1);
    fetchAvailablePatrollers();
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedPatrol(null);
    setStep(1);
    setSelectedPatrollerIds([]);
    setStops([{ ...emptyStop }]);
    setBarangaySearches([""]);
    setBarangayOpenIdx(null);
  };

  // ── Form handlers ──────────────────────────────────────
  const handleFormChange = (e) =>
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const togglePatroller = (id) =>
    setSelectedPatrollerIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );

  const goToStep2 = () => {
    if (
      !form.patrol_name ||
      !form.mobile_unit_id ||
      !form.shift ||
      !form.start_date ||
      !form.end_date
    ) {
      alert("Please fill in all required fields.");
      return;
    }
    if (new Date(form.end_date) < new Date(form.start_date)) {
      alert("End date must be on or after start date.");
      return;
    }
    setStep(2);
  };

  // ── Stop handlers ──────────────────────────────────────
  const addStop = () => {
    setStops((prev) => [...prev, { ...emptyStop }]);
    setBarangaySearches((prev) => [...prev, ""]);
  };

  const removeStop = (idx) => {
    setStops((prev) => prev.filter((_, i) => i !== idx));
    setBarangaySearches((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateStop = (idx, field, value) =>
    setStops((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, [field]: value } : s)),
    );

  const updateBarangaySearch = (idx, value) =>
    setBarangaySearches((prev) => prev.map((s, i) => (i === idx ? value : s)));

  const selectBarangay = (idx, brgy) => {
    updateStop(idx, "barangay", brgy);
    updateBarangaySearch(idx, "");
    setBarangayOpenIdx(null);
  };

  // ── Submit ─────────────────────────────────────────────
  const handleSubmit = async () => {
    const validStops = stops.filter(
      (s) => s.barangay && s.time_start && s.time_end,
    );
    if (validStops.length === 0) {
      alert("Please add at least one route stop with barangay and times.");
      return;
    }
    setIsSaving(true);
    try {
      const url =
        modalMode === "add"
          ? `${API_BASE}/patrol/patrols`
          : `${API_BASE}/patrol/patrols/${selectedPatrol.patrol_id}`;

      const res = await fetch(url, {
        method: modalMode === "add" ? "POST" : "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token()}`,
        },
        body: JSON.stringify({
          ...form,
          patroller_ids: selectedPatrollerIds,
          // route_date = start_date for now; beat card view will handle per-day display later
          routes: validStops.map((s, i) => ({
            ...s,
            route_date: form.start_date,
            stop_order: i + 1,
          })),
        }),
      });
      const data = await res.json();
      if (data.success) {
        closeModal();
        fetchPatrols();
      } else alert(data.message || "Something went wrong.");
    } catch (err) {
      console.error("Submit error:", err);
    } finally {
      setIsSaving(false);
    }
  };

  // ── Delete ─────────────────────────────────────────────
  const handleDelete = async (id) => {
    if (!confirm("Are you sure you want to delete this patrol?")) return;
    try {
      const res = await fetch(`${API_BASE}/patrol/patrols/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token()}` },
      });
      const data = await res.json();
      if (data.success) fetchPatrols();
      else alert(data.message || "Something went wrong.");
    } catch (err) {
      console.error("Delete error:", err);
    }
  };

  // ── Helpers ────────────────────────────────────────────
  const getInitials = (name) =>
    name ? name.substring(0, 2).toUpperCase() : "NA";
  const formatDate = (d) =>
    d
      ? new Date(d).toLocaleDateString("en-PH", {
          month: "short",
          day: "numeric",
          year: "numeric",
          timeZone: "Asia/Manila",
        })
      : "—";

  const getShiftClass = (shift) => {
    if (shift === "Morning") return "shift-morning";
    if (shift === "Afternoon") return "shift-afternoon";
    if (shift === "Night") return "shift-night";
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
            (p) =>
              !availablePatrollers.find(
                (a) => a.active_patroller_id === p.active_patroller_id,
              ),
          ),
        ]
      : availablePatrollers
  ).filter((p) =>
    (p.officer_name || "")
      .toLowerCase()
      .includes(patrollerSearch.toLowerCase()),
  );

  const brgyList = geoJSONData
    ? geoJSONData.features.map((f) => f.properties.name_db).filter(Boolean)
    : [];

  // Get unique barangays from routes for table display
  const getAreaSummary = (routes) => {
    if (!routes || routes.length === 0) return null;
    const unique = [...new Set(routes.map((r) => r.barangay).filter(Boolean))];
    return unique.join(", ");
  };

  // ── Render ─────────────────────────────────────────────
  return (
    <div className="dash">
      <LoadingModal
        isOpen={isLoading && patrols.length === 0}
        message="Loading scheduling..."
      />
      <LoadingModal isOpen={isSaving} message="Saving patrol..." />
      <div className="psch-content-area">
        {/* PAGE HEADER */}
        <div className="psch-page-header">
          <div className="psch-page-header-left">
            <h1>Patrol Scheduling</h1>
            <p>Manage patrol officer schedules and assignments</p>
          </div>
          <button className="psch-btn psch-btn-primary" onClick={openAddModal}>
            + Add Patrol
          </button>
        </div>

        {/* FILTERS */}
        <div className="psch-filters">
          <div className="psch-search-box">
            <input
              type="text"
              placeholder="Search patrol name or mobile unit..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="psch-filter-select"
            value={filterShift}
            onChange={(e) => setFilterShift(e.target.value)}
          >
            <option value="">All Shifts</option>
            {SHIFTS.map((s) => (
              <option key={s} value={s}>
                {SHIFT_LABELS[s]}
              </option>
            ))}
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
                  <th>Assigned Patrollers</th>
                  <th>Area of Responsibility</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredPatrols.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="psch-empty-row">
                      No patrols found.
                    </td>
                  </tr>
                ) : (
                  filteredPatrols.map((patrol) => (
                    <tr key={patrol.patrol_id}>
                      <td>
                        <span className="psch-patrol-name">
                          {patrol.patrol_name}
                        </span>
                      </td>
                      <td>
                        <span className="psch-unit-text">
                          {patrol.mobile_unit_name || "—"}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`psch-shift-badge ${getShiftClass(patrol.shift)}`}
                        >
                          {patrol.shift || "—"}
                        </span>
                      </td>
                      <td>
                        <span className="psch-duration-text">
                          {formatDate(patrol.start_date)} —{" "}
                          {formatDate(patrol.end_date)}
                        </span>
                      </td>
                      <td>
                        {patrol.patrollers?.length > 0 ? (
                          <div className="psch-patroller-stack">
                            {patrol.patrollers.map((p) => (
                              <div
                                key={p.active_patroller_id}
                                className="psch-patroller-row"
                              >
                                <div className="psch-avatar">
                                  {getInitials(p.officer_name)}
                                </div>
                                <span className="psch-officer-name">
                                  {p.officer_name}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="psch-none-text">No patrollers</span>
                        )}
                      </td>
                      <td>
                        {getAreaSummary(patrol.routes) ? (
                          <span className="psch-area-summary">
                            {getAreaSummary(patrol.routes)}
                          </span>
                        ) : (
                          <span className="psch-none-text">No route set</span>
                        )}
                      </td>
                      <td>
                        <button
                          className="psch-view-btn"
                          onClick={() => openBeatCard(patrol)}
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── MAIN MODAL ── */}
      {showModal && (
        <div className="psch-modal-overlay" onClick={closeModal}>
          <div className="psch-modal" onClick={(e) => e.stopPropagation()}>
            <div className="psch-modal-header">
              <div className="psch-modal-title">
                <h3>{modalMode === "add" ? "Add Patrol" : "Edit Patrol"}</h3>
                <div className="psch-step-indicator">
                  <span
                    className={`psch-step ${step === 1 ? "psch-step-active" : "psch-step-done"}`}
                  >
                    1. Basic Info
                  </span>
                  <span className="psch-step-divider">›</span>
                  <span
                    className={`psch-step ${step === 2 ? "psch-step-active" : ""}`}
                  >
                    2. Route Stops
                  </span>
                </div>
              </div>
              <button className="psch-modal-close" onClick={closeModal}>
                ×
              </button>
            </div>

            {/* STEP 1 */}
            {step === 1 && (
              <>
                <div className="psch-modal-body">
                  <div className="psch-form-group">
                    <label>
                      Patrol Name <span className="psch-required">*</span>
                    </label>
                    <input
                      type="text"
                      name="patrol_name"
                      value={form.patrol_name}
                      onChange={handleFormChange}
                      placeholder="e.g. Beat 3 AM"
                    />
                  </div>
                  <div className="psch-form-group">
                    <label>
                      Mobile Unit <span className="psch-required">*</span>
                    </label>
                    <select
                      name="mobile_unit_id"
                      value={form.mobile_unit_id}
                      onChange={handleFormChange}
                    >
                      <option value="">— Select Mobile Unit —</option>
                      {mobileUnits.map((mu) => (
                        <option
                          key={mu.mobile_unit_id}
                          value={mu.mobile_unit_id}
                        >
                          {mu.mobile_unit_name} ({mu.plate_number})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="psch-form-group">
                    <label>
                      Shift <span className="psch-required">*</span>
                    </label>
                    <select
                      name="shift"
                      value={form.shift}
                      onChange={handleFormChange}
                    >
                      <option value="">— Select Shift —</option>
                      {SHIFTS.map((s) => (
                        <option key={s} value={s}>
                          {SHIFT_LABELS[s]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="psch-form-row">
                    <div className="psch-form-group">
                      <label>
                        Start Date <span className="psch-required">*</span>
                      </label>
                      <input
                        type="date"
                        name="start_date"
                        value={form.start_date}
                        onChange={handleFormChange}
                      />
                    </div>
                    <div className="psch-form-group">
                      <label>
                        End Date <span className="psch-required">*</span>
                      </label>
                      <input
                        type="date"
                        name="end_date"
                        value={form.end_date}
                        onChange={handleFormChange}
                        min={form.start_date}
                      />
                    </div>
                  </div>
                  <div className="psch-form-group">
                    <label>
                      Assign Patrollers
                      {selectedPatrollerIds.length > 0 && (
                        <span className="psch-selected-count">
                          {" "}
                          ({selectedPatrollerIds.length} selected)
                        </span>
                      )}
                    </label>
                    <div className="psch-checklist-search">
                      <input
                        type="text"
                        placeholder="Search patroller..."
                        value={patrollerSearch}
                        onChange={(e) => setPatrollerSearch(e.target.value)}
                      />
                    </div>
                    {modalPatrollerList.length === 0 ? (
                      <div className="psch-empty-list">
                        No available patrollers.
                      </div>
                    ) : (
                      <div className="psch-checklist">
                        {modalPatrollerList.map((p) => {
                          const isSelected = selectedPatrollerIds.includes(
                            p.active_patroller_id,
                          );
                          return (
                            <div
                              key={p.active_patroller_id}
                              className={`psch-check-item ${isSelected ? "psch-checked" : ""}`}
                              onClick={() =>
                                togglePatroller(p.active_patroller_id)
                              }
                            >
                              <div className="psch-avatar sm">
                                {getInitials(p.officer_name)}
                              </div>
                              <span className="psch-officer-name">
                                {p.officer_name}
                              </span>
                              <div
                                className={`psch-check-box ${isSelected ? "psch-check-on" : ""}`}
                              >
                                {isSelected ? "✓" : ""}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
                <div className="psch-modal-footer">
                  <button className="psch-btn-cancel" onClick={closeModal}>
                    Cancel
                  </button>
                  <button
                    className="psch-btn psch-btn-primary"
                    onClick={goToStep2}
                  >
                    Next: Route Stops
                  </button>
                </div>
              </>
            )}

            {/* STEP 2 */}
            {step === 2 && (
              <>
                <div className="psch-modal-body">
                  <p className="psch-step-hint">
                    Add barangay stops for this patrol. Use search or click Map
                    to select. Notes and times are required.
                  </p>

                  {stops.map((stop, idx) => (
                    <div key={idx} className="psch-stop-card">
                      <div className="psch-stop-card-header">
                        <div className="psch-stop-number">{idx + 1}</div>
                        {stops.length > 1 && (
                          <button
                            className="psch-remove-stop"
                            onClick={() => removeStop(idx)}
                          >
                            ×
                          </button>
                        )}
                      </div>

                      {/* Barangay */}
                      <div className="psch-form-group">
                        <label>Barangay</label>
                        <div className="psch-barangay-row">
                          <div
                            className="psch-stop-barangay"
                            ref={(el) => (barangayRefs.current[idx] = el)}
                          >
                            <input
                              type="text"
                              placeholder="Search barangay..."
                              value={
                                stop.barangay || barangaySearches[idx] || ""
                              }
                              onChange={(e) => {
                                updateStop(idx, "barangay", "");
                                updateBarangaySearch(idx, e.target.value);
                              }}
                              onFocus={() => setBarangayOpenIdx(idx)}
                            />
                            {stop.barangay && (
                              <div className="psch-selected-brgy-tag">
                                {stop.barangay}
                                <button
                                  onClick={() =>
                                    updateStop(idx, "barangay", "")
                                  }
                                >
                                  ×
                                </button>
                              </div>
                            )}
                            {barangayOpenIdx === idx && !stop.barangay && (
                              <div className="psch-brgy-dropdown">
                                {brgyList
                                  .filter((b) =>
                                    b
                                      .toLowerCase()
                                      .includes(
                                        (
                                          barangaySearches[idx] || ""
                                        ).toLowerCase(),
                                      ),
                                  )
                                  .map((brgy) => (
                                    <div
                                      key={brgy}
                                      className="psch-brgy-option"
                                      onMouseDown={() =>
                                        selectBarangay(idx, brgy)
                                      }
                                    >
                                      {brgy}
                                    </div>
                                  ))}
                              </div>
                            )}
                          </div>
                          <button
                            className="psch-map-icon-btn"
                            onClick={() => openMapForStop(idx)}
                          >
                            Map
                          </button>
                        </div>
                      </div>

                      {/* Notes */}
                      <div className="psch-form-group">
                        <label>
                          Notes{" "}
                          <span className="psch-optional">(optional)</span>
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Check the market area near the main road"
                          value={stop.notes}
                          onChange={(e) =>
                            updateStop(idx, "notes", e.target.value)
                          }
                        />
                      </div>

                      {/* Time */}
                      <div className="psch-form-row">
                        <div className="psch-form-group">
                          <label>Time Start</label>
                          <input
                            type="time"
                            value={stop.time_start}
                            onChange={(e) =>
                              updateStop(idx, "time_start", e.target.value)
                            }
                          />
                        </div>
                        <div className="psch-form-group">
                          <label>Time End</label>
                          <input
                            type="time"
                            value={stop.time_end}
                            onChange={(e) =>
                              updateStop(idx, "time_end", e.target.value)
                            }
                          />
                        </div>
                      </div>
                    </div>
                  ))}

                  <button
                    className="psch-add-stop-btn"
                    onClick={openMapForAddStop}
                  >
                    + Add Stop
                  </button>
                </div>
                <div className="psch-modal-footer">
                  <button
                    className="psch-btn-cancel"
                    onClick={() => setStep(1)}
                  >
                    Back
                  </button>
                  <button
                    className="psch-btn psch-btn-primary"
                    onClick={handleSubmit}
                  >
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
                <h3>
                  {mapMode === "single"
                    ? "Select Barangay"
                    : "Add Stops from Map"}
                </h3>
                <p>
                  {mapMode === "single"
                    ? "Click a barangay or search below. Click Done to confirm."
                    : "Click barangays to add as stops, or use search."}
                </p>
              </div>
              <button
                className="psch-modal-close"
                onClick={confirmMapSelection}
              >
                ×
              </button>
            </div>

            <div className="psch-map-search-bar" ref={mapDropdownRef}>
              <input
                type="text"
                placeholder="Search barangay..."
                value={mapDropdownSearch}
                onChange={(e) => {
                  setMapDropdownSearch(e.target.value);
                  setMapDropdownOpen(true);
                }}
                onFocus={() => setMapDropdownOpen(true)}
              />
              {mapDropdownOpen && (
                <div className="psch-map-search-dropdown">
                  {brgyList
                    .filter((b) =>
                      b.toLowerCase().includes(mapDropdownSearch.toLowerCase()),
                    )
                    .map((brgy) => {
                      const alreadyAdded =
                        mapMode === "multi"
                          ? stops.some((s) => s.barangay === brgy)
                          : stops
                              .filter((_, i) => i !== mapTargetIdx)
                              .some((s) => s.barangay === brgy);
                      return (
                        <div
                          key={brgy}
                          className={`psch-map-search-item ${alreadyAdded ? "psch-map-search-disabled" : ""}`}
                          onMouseDown={() => {
                            if (alreadyAdded) return;
                            if (mapMode === "single") {
                              setMapSelectedBrgy(brgy);
                              setMapDropdownSearch(brgy);
                              setMapDropdownOpen(false);
                            } else {
                              setStops((prev) => [
                                ...prev,
                                { ...emptyStop, barangay: brgy },
                              ]);
                              setBarangaySearches((prev) => [...prev, ""]);
                              setMapDropdownSearch("");
                              setMapDropdownOpen(false);
                            }
                          }}
                        >
                          {brgy}
                          {alreadyAdded && (
                            <span className="psch-map-search-added">Added</span>
                          )}
                        </div>
                      );
                    })}
                </div>
              )}
            </div>

            {mapMode === "single" && mapSelectedBrgy && (
              <div className="psch-map-single-selected">
                Selected: <strong>{mapSelectedBrgy}</strong>
              </div>
            )}

            {mapMode === "multi" &&
              stops.filter((s) => s.barangay).length > 0 && (
                <div className="psch-map-tags">
                  {stops
                    .filter((s) => s.barangay)
                    .map((s, i) => (
                      <span key={i} className="psch-map-tag">
                        {s.barangay}
                        <button
                          onClick={() => {
                            const idx = stops.findIndex(
                              (st) => st.barangay === s.barangay,
                            );
                            if (idx !== -1) removeStop(idx);
                          }}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                </div>
              )}

            <div className="psch-map-container">
              {hoveredBrgy && (
                <div className="psch-map-tooltip">
                  <strong>{hoveredBrgy.name}</strong>
                  {(() => {
                    const otherBrgys = stops
                      .filter((_, i) => i !== mapTargetIdx)
                      .map((s) => s.barangay)
                      .filter(Boolean);
                    if (
                      mapMode === "single" &&
                      otherBrgys.includes(hoveredBrgy.name)
                    )
                      return " — Already used";
                    if (
                      mapMode === "multi" &&
                      stops.some((s) => s.barangay === hoveredBrgy.name)
                    )
                      return " — Already added";
                    return " — Click to select";
                  })()}
                </div>
              )}
              <Map
                ref={mapRef}
                mapboxAccessToken={import.meta.env.VITE_MAPBOX_TOKEN}
                initialViewState={{
                  longitude: 120.964,
                  latitude: 14.4341,
                  zoom: 12,
                }}
                style={{ width: "100%", height: "100%" }}
                mapStyle="mapbox://styles/mapbox/light-v11"
                onClick={handleMapClick}
                onMouseMove={(e) => {
                  if (!geoJSONData) return;
                  const features = e.target.queryRenderedFeatures(e.point, {
                    layers: ["psch-brgy-fill"],
                  });
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
                  <Source
                    id="psch-barangays"
                    type="geojson"
                    data={buildGeoJSON()}
                  >
                    <Layer {...fillLayer} />
                    <Layer {...outlineLayer} />
                    <Layer {...labelLayer} />
                  </Source>
                )}
              </Map>
            </div>

            <div className="psch-map-modal-footer">
              <p className="psch-map-hint">
                {mapMode === "single"
                  ? "Dark blue = selected. Click Done to confirm."
                  : "Dark blue = added. Click Done when finished."}
              </p>
              <button
                className="psch-btn psch-btn-primary"
                onClick={confirmMapSelection}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
      {showBeatCard && (
        <BeatCard
          patrol={beatCardPatrol}
          geoJSONData={geoJSONData}
          onClose={() => {
            setShowBeatCard(false);
            setBeatCardPatrol(null);
          }}
          onEdit={() => {
            setShowBeatCard(false);
            openEditModal(beatCardPatrol);
          }}
          onDelete={async () => {
            if (!confirm("Are you sure you want to delete this patrol?"))
              return;
            try {
              const res = await fetch(
                `${API_BASE}/patrol/patrols/${beatCardPatrol.patrol_id}`,
                {
                  method: "DELETE",
                  headers: { Authorization: `Bearer ${token()}` },
                },
              );
              const data = await res.json();
              if (data.success) {
                setShowBeatCard(false);
                fetchPatrols();
              } else alert(data.message || "Something went wrong.");
            } catch (err) {
              console.error("Delete error:", err);
            }
          }}
        />
      )}
    </div>
  );
};

export default PatrolScheduling;
