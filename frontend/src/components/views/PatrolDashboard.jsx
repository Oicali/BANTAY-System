// frontend\src\components\views\PatrolDashboard.jsx

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import "./PatrolDashboard.css";
import LoadingModal from "../modals/LoadingModal";
import Notification from "../modals/Notification";
import { ShieldCheck, AlertTriangle, Car, Users } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL;
const VEHICLE_TYPES = ["Car/Sedan", "SUV/Van"];
const PAGE_SIZE = 5;

// ── FIX 1: FilterBar and Pagination are defined OUTSIDE the component.
//    This prevents React from treating them as new components on every render,
//    which was causing the search field to lose focus on every keystroke.

// ── Pagination component ───────────────────────────────────────────────────
const Pagination = ({ page, totalPages, onPage, total, filtered }) => (
  <div className="pd-table-footer">
    <span className="pd-footer-count">
      Showing {filtered === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}–
      {Math.min(page * PAGE_SIZE, filtered)} of {filtered} records
      {filtered !== total && (
        <span className="pd-filtered-label"> (filtered)</span>
      )}
    </span>
    <div className="pd-pagination">
      <button
        className="pd-page-btn"
        onClick={() => onPage(page - 1)}
        disabled={page === 1}
      >
        Previous
      </button>
      <span className="pd-page-current">
        Page {page} of {totalPages || 1}
      </span>
      <button
        className="pd-page-btn"
        onClick={() => onPage(page + 1)}
        disabled={page === totalPages}
      >
        Next
      </button>
    </div>
  </div>
);

// ── FIX 2 & 3: PatrollerFilterBar — replaces date filter with Status + Location dropdowns
//    Accepts `barangayOptions` (derived from live data) for the searchable location dropdown.
const PatrollerFilterBar = ({
  search,
  onSearch,
  statusFilter,
  onStatusFilter,
  locationFilter,
  onLocationFilter,
  locationSearch,
  onLocationSearch,
  barangayOptions,
  onApply,
  onReset,
  // FIX 4: reset button is always shown (controlled by parent, not filtersApplied flag)
}) => {
  const [locationOpen, setLocationOpen] = useState(false);
  const locationRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e) => {
      if (locationRef.current && !locationRef.current.contains(e.target)) {
        setLocationOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filteredLocations = barangayOptions.filter((b) =>
    b.toLowerCase().includes(locationSearch.toLowerCase())
  );

  return (
    <div className="pd-filter-bar">
      <div className="pd-filter-icon">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
        </svg>
      </div>

      {/* Search by name */}
      <input
        className="pd-filter-search"
        type="text"
        placeholder="Search officer..."
        value={search}
        onChange={(e) => onSearch(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onApply()}
      />

      {/* FIX 2: Status dropdown — Online / Offline */}
      <select
        className="pd-filter-select"
        value={statusFilter}
        onChange={(e) => onStatusFilter(e.target.value)}
      >
        <option value="">All Status</option>
        <option value="online">Online</option>
        <option value="offline">Offline</option>
      </select>

      {/* FIX 2: Searchable barangay dropdown */}
      <div className="pd-location-dropdown" ref={locationRef}>
        <input
          className="pd-filter-search pd-location-input"
          type="text"
          placeholder={locationFilter || "Last Location..."}
          value={locationFilter ? locationFilter : locationSearch}
          onChange={(e) => {
            onLocationSearch(e.target.value);
            onLocationFilter(""); // clear selection when typing
            setLocationOpen(true);
          }}
          onFocus={() => setLocationOpen(true)}
        />
        {locationOpen && (
          <div className="pd-location-list">
            <div
              className="pd-location-option pd-location-clear"
              onMouseDown={() => {
                onLocationFilter("");
                onLocationSearch("");
                setLocationOpen(false);
              }}
            >
              — All Locations —
            </div>
            {filteredLocations.length === 0 ? (
              <div className="pd-location-option pd-location-empty">No results</div>
            ) : (
              filteredLocations.map((b) => (
                <div
                  key={b}
                  className={`pd-location-option ${locationFilter === b ? "pd-location-selected" : ""}`}
                  onMouseDown={() => {
                    onLocationFilter(b);
                    onLocationSearch("");
                    setLocationOpen(false);
                  }}
                >
                  {b}
                </div>
              ))
            )}
          </div>
        )}
      </div>

      <button className="pd-filter-apply" onClick={onApply}>
        Apply
      </button>

      {/* FIX 4: Reset button is ALWAYS visible */}
      <button className="pd-filter-reset" onClick={onReset} title="Reset filters">
        ↺
      </button>
    </div>
  );
};

// ── FIX 3 & 4: MobileUnitFilterBar — no date filter, search + vehicle type dropdown.
//    Reset always visible. Reset is between Apply and Add button.
const MobileUnitFilterBar = ({
  search,
  onSearch,
  vehicleFilter,
  onVehicleFilter,
  onApply,
  onReset,
}) => (
  <div className="pd-filter-bar">
    <div className="pd-filter-icon">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
      </svg>
    </div>

    {/* Search */}
    <input
      className="pd-filter-search"
      type="text"
      placeholder="Search unit, plate..."
      value={search}
      onChange={(e) => onSearch(e.target.value)}
      onKeyDown={(e) => e.key === "Enter" && onApply()}
    />

    {/* FIX 3: Vehicle type dropdown */}
    <select
      className="pd-filter-select"
      value={vehicleFilter}
      onChange={(e) => onVehicleFilter(e.target.value)}
    >
      <option value="">All Vehicle Types</option>
      {VEHICLE_TYPES.map((t) => (
        <option key={t} value={t}>{t}</option>
      ))}
    </select>

    <button className="pd-filter-apply" onClick={onApply}>
      Apply
    </button>

    {/* FIX 4: Reset always visible, placed between Apply and Add button */}
    <button className="pd-filter-reset" onClick={onReset} title="Reset filters">
      ↺
    </button>
  </div>
);
const DeleteConfirmDialog = ({ itemName, onConfirm, onCancel }) =>
  createPortal(
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1200,
      }}
      onClick={onCancel}
    >
      <div
        style={{
          background: "#fff", borderRadius: "12px", padding: "28px 28px 22px",
          width: "360px", boxShadow: "0 16px 48px rgba(0,0,0,0.2)",
          display: "flex", flexDirection: "column", gap: "12px",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: "17px", fontWeight: 700, color: "#0a1628" }}>Delete Mobile Unit</div>
        <div style={{ fontSize: "13px", color: "#6c757d", lineHeight: 1.6 }}>
          Are you sure you want to delete{" "}
          <strong style={{ color: "#212529" }}>{itemName}</strong>?{" "}
          This action cannot be undone.
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "8px" }}>
          <button
            onClick={onCancel}
            style={{
              padding: "8px 18px", background: "transparent", border: "1px solid #ced4da",
              borderRadius: "7px", fontSize: "13px", fontWeight: 500, color: "#495057",
              cursor: "pointer", fontFamily: "inherit",
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{
              padding: "8px 20px", background: "#dc2626", border: "none",
              borderRadius: "7px", fontSize: "13px", fontWeight: 700, color: "#fff",
              cursor: "pointer", fontFamily: "inherit",
            }}
          >
            Delete
          </button>
        </div>
      </div>
    </div>,
    document.body
  );

// ─────────────────────────────────────────────────────────────────────────────
const PatrollerDashboard = () => {
  const token = () => localStorage.getItem("token");

  // ── State ──────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [notif, setNotif] = useState(null);
  const [activeTable, setActiveTable] = useState("patrollers");
  const [patrollers, setPatrollers] = useState([]);
  const [mobileUnits, setMobileUnits] = useState([]);
  const [stats, setStats] = useState({
    active_patrols_today: 0,
    unassigned_patrollers: 0,
    mobile_units: 0,
    total_officers: 0,
  });

  // ── Patroller filters & pagination ────────────────────
  const [patrollerSearch, setPatrollerSearch] = useState("");
  const [patrollerStatusFilter, setPatrollerStatusFilter] = useState("");
  const [patrollerLocationFilter, setPatrollerLocationFilter] = useState("");
  const [patrollerLocationSearch, setPatrollerLocationSearch] = useState("");
  const [appliedPatrollerFilters, setAppliedPatrollerFilters] = useState({
    search: "",
    status: "",
    location: "",
  });
  const [patrollerPage, setPatrollerPage] = useState(1);

  // ── Mobile unit filters & pagination ──────────────────
  const [unitSearch, setUnitSearch] = useState("");
  const [unitVehicleFilter, setUnitVehicleFilter] = useState("");
  const [appliedUnitFilters, setAppliedUnitFilters] = useState({
    search: "",
    vehicle: "",
  });
  const [unitPage, setUnitPage] = useState(1);

  // ── Modal state ────────────────────────────────────────
  const [showModal, setShowModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null); // { id, name }
  const [modalMode, setModalMode] = useState("add");
  const [selectedUnit, setSelectedUnit] = useState(null);
  const [form, setForm] = useState({
    mobile_unit_name: "",
    vehicle_type: "",
    plate_number: "",
  });

  // ── Fetchers ───────────────────────────────────────────
  const fetchPatrolStats = async () => {
    try {
      const res = await fetch(`${API_BASE}/patrol/stats`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      const data = await res.json();
      if (data.success) setStats(data.data);
    } catch (err) {
      console.error("Stats error:", err);
    }
  };

  const fetchPatrollers = async () => {
    try {
      const res = await fetch(`${API_BASE}/patrol/active`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      const data = await res.json();
      if (data.success) setPatrollers(data.data);
    } catch (err) {
      console.error("Patrollers error:", err);
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

  useEffect(() => {
    const loadData = async (isInitial = false) => {
      if (isInitial) setLoading(true);
      await Promise.all([fetchPatrolStats(), fetchPatrollers(), fetchMobileUnits()]);
      if (isInitial) setLoading(false);
    };
    loadData(true);
    const interval = setInterval(() => loadData(false), 10000);
    return () => clearInterval(interval);
  }, []);

  // ── FIX 5: Compute online/offline counts from patrollers array ─────────────
  //    "Online Patrollers Today" = patrollers whose last_location_at is within 30s
  //    "Offline Patrollers"      = all others (previously "Unassigned Patrollers")
  const onlineCount = patrollers.filter((o) => {
    const lastSeen = o.last_location_at ? new Date(o.last_location_at) : null;
    return lastSeen && Date.now() - lastSeen.getTime() <= 30000;
  }).length;

  const offlineCount = patrollers.length - onlineCount;

  // ── Modal handlers ─────────────────────────────────────
  const openAddModal = () => {
    setModalMode("add");
    setSelectedUnit(null);
    setForm({ mobile_unit_name: "", vehicle_type: "", plate_number: "" });
    setShowModal(true);
  };

  const openEditModal = (unit) => {
    setModalMode("edit");
    setSelectedUnit(unit);
    setForm({
      mobile_unit_name: unit.mobile_unit_name || "",
      vehicle_type: unit.vehicle_type || "",
      plate_number: unit.plate_number || "",
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedUnit(null);
    setForm({ mobile_unit_name: "", vehicle_type: "", plate_number: "" });
  };

  const handleFormChange = (e) =>
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  // ── Submit ─────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!form.mobile_unit_name || !form.vehicle_type || !form.plate_number) {
      setNotif({ message: "Please fill in all required fields.", type: "warning" });
      return;
    }
    setSubmitLoading(true);
    try {
      const url =
        modalMode === "add"
          ? `${API_BASE}/patrol/mobile-units`
          : `${API_BASE}/patrol/mobile-units/${selectedUnit.mobile_unit_id}`;

      const res = await fetch(url, {
        method: modalMode === "add" ? "POST" : "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token()}`,
        },
        body: JSON.stringify(form),
      });
      const data = await res.json();

      if (data.success) {
        closeModal();
        await Promise.all([fetchMobileUnits(), fetchPatrolStats()]);
        setNotif({
          message: modalMode === "add" ? "Mobile unit added successfully!" : "Mobile unit updated successfully!",
          type: "success",
        });
      } else {
        setNotif({ message: data.message || "Something went wrong.", type: "error" });
      }
    } catch (err) {
      setNotif({ message: "Server error. Please try again.", type: "error" });
    } finally {
      setSubmitLoading(false);
    }
  };

  // ── Delete ─────────────────────────────────────────────
const confirmDelete = (id, name) => {
  setDeleteTarget({ id, name });
};

const handleDelete = async () => {
  if (!deleteTarget) return;
  const id = deleteTarget.id;
  setDeleteTarget(null);
  setSubmitLoading(true);
  try {
    const res = await fetch(`${API_BASE}/patrol/mobile-units/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token()}` },
    });
    const data = await res.json();
    if (data.success) {
      await Promise.all([fetchMobileUnits(), fetchPatrolStats()]);
      setNotif({ message: "Mobile unit deleted.", type: "success" });
    } else {
      setNotif({ message: data.message || "Something went wrong.", type: "error" });
    }
  } catch (err) {
    setNotif({ message: "Server error. Please try again.", type: "error" });
  } finally {
    setSubmitLoading(false);
  }
};

  // ── Helpers ────────────────────────────────────────────
  const getInitials = (name) => (name ? name.substring(0, 2).toUpperCase() : "NA");

  const formatDateTime = (ts) => (ts ? new Date(ts).toLocaleDateString() : "No Data");

  // ── FIX 2: Build barangay options from live patroller data ─────────────────
  const barangayOptions = [
    ...new Set(
      patrollers
        .map((o) => o.current_barangay || o.last_location_name)
        .filter(Boolean)
    ),
  ].sort();

  // ── Patroller filter logic ─────────────────────────────
  const applyPatrollerFilters = () => {
    setAppliedPatrollerFilters({
      search: patrollerSearch,
      status: patrollerStatusFilter,
      location: patrollerLocationFilter,
    });
    setPatrollerPage(1);
  };

  const resetPatrollerFilters = () => {
    setPatrollerSearch("");
    setPatrollerStatusFilter("");
    setPatrollerLocationFilter("");
    setPatrollerLocationSearch("");
    setAppliedPatrollerFilters({ search: "", status: "", location: "" });
    setPatrollerPage(1);
  };

  const filteredPatrollers = patrollers.filter((o) => {
    const { search: s, status, location } = appliedPatrollerFilters;

    // Name search
    if (s && !(o.officer_name || "").toLowerCase().includes(s.toLowerCase()))
      return false;

    // Status filter
    if (status) {
      const lastSeen = o.last_location_at ? new Date(o.last_location_at) : null;
      const isOnline = lastSeen && Date.now() - lastSeen.getTime() <= 30000;
      if (status === "online" && !isOnline) return false;
      if (status === "offline" && isOnline) return false;
    }

    // Location filter
    if (location) {
      const barangay = o.current_barangay || o.last_location_name || "";
      if (!barangay.toLowerCase().includes(location.toLowerCase())) return false;
    }

    return true;
  });

  const totalPatrollerPages = Math.max(1, Math.ceil(filteredPatrollers.length / PAGE_SIZE));
  const paginatedPatrollers = filteredPatrollers.slice(
    (patrollerPage - 1) * PAGE_SIZE,
    patrollerPage * PAGE_SIZE
  );

  // ── Mobile unit filter logic ───────────────────────────
  const applyUnitFilters = () => {
    setAppliedUnitFilters({ search: unitSearch, vehicle: unitVehicleFilter });
    setUnitPage(1);
  };

  const resetUnitFilters = () => {
    setUnitSearch("");
    setUnitVehicleFilter("");
    setAppliedUnitFilters({ search: "", vehicle: "" });
    setUnitPage(1);
  };

  const sortedUnits = [...mobileUnits].sort((a, b) =>
    a.mobile_unit_name.localeCompare(b.mobile_unit_name, undefined, {
      numeric: true,
      sensitivity: "base",
    })
  );

  const filteredUnits = sortedUnits.filter((u) => {
    const { search: s, vehicle } = appliedUnitFilters;
    if (
      s &&
      !(u.mobile_unit_name || "").toLowerCase().includes(s.toLowerCase()) &&
      !(u.plate_number || "").toLowerCase().includes(s.toLowerCase()) &&
      !(u.vehicle_type || "").toLowerCase().includes(s.toLowerCase())
    )
      return false;
    if (vehicle && u.vehicle_type !== vehicle) return false;
    return true;
  });

  const totalUnitPages = Math.max(1, Math.ceil(filteredUnits.length / PAGE_SIZE));
  const paginatedUnits = filteredUnits.slice(
    (unitPage - 1) * PAGE_SIZE,
    unitPage * PAGE_SIZE
  );

  // ── Render ─────────────────────────────────────────────
  return (
    <div className="dash">
      <div className="content-area">
        {/* PAGE HEADER */}
        <div className="page-header">
          <h1>Patroller Dashboard</h1>
          <p>Real-time Patroller status and monitoring</p>
        </div>

        {/* FIX 5: STATS — Online Patrollers Today + Offline Patrollers */}
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-card-header">
              <div className="stat-icon green">
                <ShieldCheck size={20} />
              </div>
            </div>
            {/* FIX 5: Was "active_patrols_today" from server. Now computed client-side from patrollers. */}
            <div className="stat-value">{onlineCount}</div>
            <div className="stat-label">Online Patrollers Today</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-header">
              <div className="stat-icon yellow">
                <AlertTriangle size={20} />
              </div>
            </div>
            {/* FIX 5: Was "unassigned_patrollers". Now counts offline patrollers. */}
            <div className="stat-value">{offlineCount}</div>
            <div className="stat-label">Offline Patrollers</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-header">
              <div className="stat-icon gray">
                <Car size={20} />
              </div>
            </div>
            <div className="stat-value">{stats.mobile_units}</div>
            <div className="stat-label">Total Mobile Units</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-header">
              <div className="stat-icon blue">
                <Users size={20} />
              </div>
            </div>
            <div className="stat-value">{stats.total_officers}</div>
            <div className="stat-label">Total Officers</div>
          </div>
        </div>

        {/* TABLE CARD */}
        <div className="table-card">
          {/* Toggle + Add button (Add only shows on Mobile tab) */}
          <div className="table-header">
            <div className="table-toggle">
              <button
                className={`toggle-btn ${activeTable === "patrollers" ? "toggle-active" : ""}`}
                onClick={() => setActiveTable("patrollers")}
              >
                Patrollers
              </button>
              <button
                className={`toggle-btn ${activeTable === "mobile" ? "toggle-active" : ""}`}
                onClick={() => setActiveTable("mobile")}
              >
                Mobile Units
              </button>
            </div>
            {activeTable === "mobile" && (
              <button className="add-btn" onClick={openAddModal}>
                + Add Mobile Unit
              </button>
            )}
          </div>

          {/* ── PATROLLERS ── */}
          {activeTable === "patrollers" && (
            <>
              {/* FIX 1: PatrollerFilterBar is defined outside — no focus loss
                  FIX 2: Status + Location dropdowns replace date filter
                  FIX 4: Reset always visible */}
              <PatrollerFilterBar
                search={patrollerSearch}
                onSearch={setPatrollerSearch}
                statusFilter={patrollerStatusFilter}
                onStatusFilter={setPatrollerStatusFilter}
                locationFilter={patrollerLocationFilter}
                onLocationFilter={setPatrollerLocationFilter}
                locationSearch={patrollerLocationSearch}
                onLocationSearch={setPatrollerLocationSearch}
                barangayOptions={barangayOptions}
                onApply={applyPatrollerFilters}
                onReset={resetPatrollerFilters}
              />
              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Officer</th>
                      <th>Status</th>
                      <th>Last Location</th>
                      <th>Last Update</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedPatrollers.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="empty-row">
                          No patrollers found.
                        </td>
                      </tr>
                    ) : (
                      paginatedPatrollers.map((officer, index) => {
                        const lastSeen = officer.last_location_at
                          ? new Date(officer.last_location_at)
                          : null;
                        const thirtySecsAgo = new Date(Date.now() - 30 * 1000);
                        const isOnline = lastSeen && lastSeen > thirtySecsAgo;

                        return (
                          <tr key={officer.officer_id || index}>
                            <td>
                              <div className="officer-info">
                                <div
                                  className="officer-avatar"
                                  style={{ overflow: "hidden", padding: 0 }}
                                >
                                  {officer.profile_picture ? (
                                    <img
                                      src={officer.profile_picture}
                                      alt={officer.officer_name}
                                      style={{
                                        width: "100%",
                                        height: "100%",
                                        borderRadius: "50%",
                                        objectFit: "cover",
                                      }}
                                    />
                                  ) : (
                                    getInitials(officer.officer_name)
                                  )}
                                </div>
                                <div className="officer-name">
                                  {officer.officer_name || "Unknown"}
                                </div>
                              </div>
                            </td>
                            <td>
                              <span
                                className={`online-badge ${isOnline ? "online-badge-on" : "online-badge-off"}`}
                              >
                                <span
                                  className={`online-dot ${isOnline ? "online-dot-on" : "online-dot-off"}`}
                                />
                                {isOnline ? "Online" : "Offline"}
                              </span>
                            </td>
                            <td>
                              <span className="location-text">
                                {officer.latitude && officer.longitude ? (
                                  (() => {
                                    if (officer.current_barangay) {
                                      return `${officer.current_barangay}`;
                                    } else if (officer.location_name) {
                                      return `📍 ${officer.location_name}`;
                                    } else {
                                      return (
                                        <span className="unassigned-badge">
                                          Unregistered Area
                                        </span>
                                      );
                                    }
                                  })()
                                ) : (
                                  <span className="unassigned-badge">No signal</span>
                                )}
                              </span>
                            </td>
                            <td>
                              <span className="time-badge">
                                {lastSeen
                                  ? (() => {
                                      const dd = String(lastSeen.getDate()).padStart(2, "0");
                                      const mm = String(lastSeen.getMonth() + 1).padStart(2, "0");
                                      const yyyy = lastSeen.getFullYear();
                                      const hours = lastSeen.getHours();
                                      const mins = String(lastSeen.getMinutes()).padStart(2, "0");
                                      const ampm = hours >= 12 ? "PM" : "AM";
                                      const h = String(hours % 12 || 12).padStart(2, "0");
                                      return `${dd}/${mm}/${yyyy}, ${h}:${mins} ${ampm}`;
                                    })()
                                  : "Never"}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
              {filteredPatrollers.length > 0 && (
                <Pagination
                  page={patrollerPage}
                  totalPages={totalPatrollerPages}
                  onPage={setPatrollerPage}
                  total={patrollers.length}
                  filtered={filteredPatrollers.length}
                />
              )}
            </>
          )}

          {/* ── MOBILE UNITS ── */}
          {activeTable === "mobile" && (
            <>
              {/* FIX 1: MobileUnitFilterBar defined outside — no focus loss
                  FIX 3: No date filter, vehicle type dropdown added
                  FIX 4: Reset always visible and between Apply and Add button */}
              <MobileUnitFilterBar
                search={unitSearch}
                onSearch={setUnitSearch}
                vehicleFilter={unitVehicleFilter}
                onVehicleFilter={setUnitVehicleFilter}
                onApply={applyUnitFilters}
                onReset={resetUnitFilters}
              />
              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Mobile Unit</th>
                      <th>Vehicle Type</th>
                      <th>Plate Number</th>
                      <th>Created At</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedUnits.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="empty-row">
                          No mobile units found.
                        </td>
                      </tr>
                    ) : (
                      paginatedUnits.map((unit, index) => (
                        <tr key={unit.mobile_unit_id || index}>
                          <td>
                            <span className="unit-badge">{unit.mobile_unit_name}</span>
                          </td>
                          <td>
                            <span
                              className={`vehicle-badge ${unit.vehicle_type === "Car/Sedan" ? "vehicle-car" : "vehicle-suv"}`}
                            >
                              {unit.vehicle_type}
                            </span>
                          </td>
                          <td>
                            <span className="plate-number">{unit.plate_number}</span>
                          </td>
                          <td>
                            <span className="time-badge">
                              {formatDateTime(unit.created_at)}
                            </span>
                          </td>
                          <td>
                            <div className="action-btns">
                              <button
                                className="edit-btn"
                                onClick={() => openEditModal(unit)}
                              >
                                Edit
                              </button>
                              <button
  className="delete-btn"
  onClick={() => confirmDelete(unit.mobile_unit_id, unit.mobile_unit_name)}
>
  Delete
</button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              {filteredUnits.length > 0 && (
                <Pagination
                  page={unitPage}
                  totalPages={totalUnitPages}
                  onPage={setUnitPage}
                  total={mobileUnits.length}
                  filtered={filteredUnits.length}
                />
              )}
            </>
          )}
        </div>
      </div>


      {/* ── ADD / EDIT MODAL ── */}
      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{modalMode === "add" ? "Add Mobile Unit" : "Edit Mobile Unit"}</h3>
              <button className="modal-close" onClick={closeModal}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>
                  Mobile Unit Name <span className="required">*</span>
                </label>
                <input
                  type="text"
                  name="mobile_unit_name"
                  value={form.mobile_unit_name}
                  onChange={handleFormChange}
                  placeholder="e.g. Mobile 1"
                />
              </div>
              <div className="form-group">
                <label>
                  Vehicle Type <span className="required">*</span>
                </label>
                <select
                  name="vehicle_type"
                  value={form.vehicle_type}
                  onChange={handleFormChange}
                >
                  <option value="">— Select Vehicle Type —</option>
                  {VEHICLE_TYPES.map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>
                  Plate Number <span className="required">*</span>
                </label>
                <input
                  type="text"
                  name="plate_number"
                  value={form.plate_number}
                  onChange={handleFormChange}
                  placeholder="e.g. ABC 1234"
                  style={{ textTransform: "uppercase" }}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-cancel" onClick={closeModal}>Cancel</button>
              <button className="btn-save" onClick={handleSubmit}>
                {modalMode === "add" ? "Add Unit" : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      
{deleteTarget && (
  <DeleteConfirmDialog
    itemName={deleteTarget.name}
    onConfirm={handleDelete}
    onCancel={() => setDeleteTarget(null)}
  />
)}
      <LoadingModal isOpen={loading} message="Loading dashboard..." />
      <LoadingModal
        isOpen={submitLoading}
        message={modalMode === "add" ? "Adding mobile unit..." : "Saving changes..."}
      />

      {notif && (
        <Notification
          message={notif.message}
          type={notif.type}
          onClose={() => setNotif(null)}
          duration={3000}
        />
      )}
    </div>
  );
};

export default PatrollerDashboard;