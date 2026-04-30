import { useState, useEffect } from "react";
import "./PatrolDashboard.css";
import LoadingModal from "../modals/LoadingModal";
import Notification from "../modals/Notification";
import {
  ShieldCheck, AlertTriangle, Car, Users, Search,
} from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL;
const VEHICLE_TYPES = ["Car/Sedan", "SUV/Van"];
const PAGE_SIZE = 5;

const PatrollerDashboard = () => {
  const token = () => localStorage.getItem("token");

  // ── State ──────────────────────────────────────────────
  const [loading, setLoading]             = useState(true);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [notif, setNotif]                 = useState(null);
  const [activeTable, setActiveTable]     = useState("patrollers");
  const [patrollers, setPatrollers]       = useState([]);
  const [mobileUnits, setMobileUnits]     = useState([]);
  const [stats, setStats]                 = useState({
    active_patrols_today:  0,
    unassigned_patrollers: 0,
    mobile_units:          0,
    total_officers:        0,
  });

  // ── Patroller filters & pagination ────────────────────
  const [patrollerSearch, setPatrollerSearch] = useState("");
  const [patrollerDateFrom, setPatrollerDateFrom] = useState("");
  const [patrollerDateTo, setPatrollerDateTo]     = useState("");
  const [appliedPatrollerFilters, setAppliedPatrollerFilters] = useState({
    search: "", dateFrom: "", dateTo: "",
  });
  const [patrollerFiltersApplied, setPatrollerFiltersApplied] = useState(false);
  const [patrollerPage, setPatrollerPage] = useState(1);

  // ── Mobile unit filters & pagination ──────────────────
  const [unitSearch, setUnitSearch]       = useState("");
  const [unitDateFrom, setUnitDateFrom]   = useState("");
  const [unitDateTo, setUnitDateTo]       = useState("");
  const [appliedUnitFilters, setAppliedUnitFilters] = useState({
    search: "", dateFrom: "", dateTo: "",
  });
  const [unitFiltersApplied, setUnitFiltersApplied] = useState(false);
  const [unitPage, setUnitPage]           = useState(1);

  // ── Modal state ────────────────────────────────────────
  const [showModal, setShowModal]       = useState(false);
  const [modalMode, setModalMode]       = useState("add");
  const [selectedUnit, setSelectedUnit] = useState(null);
  const [form, setForm]                 = useState({
    mobile_unit_name: "", vehicle_type: "", plate_number: "",
  });

  // ── Fetchers ───────────────────────────────────────────
  const fetchPatrolStats = async () => {
    try {
      const res  = await fetch(`${API_BASE}/patrol/stats`, { headers: { Authorization: `Bearer ${token()}` } });
      const data = await res.json();
      if (data.success) setStats(data.data);
    } catch (err) { console.error("Stats error:", err); }
  };

  const fetchPatrollers = async () => {
    try {
      const res  = await fetch(`${API_BASE}/patrol/active`, { headers: { Authorization: `Bearer ${token()}` } });
      const data = await res.json();
      if (data.success) setPatrollers(data.data);
    } catch (err) { console.error("Patrollers error:", err); }
  };

  const fetchMobileUnits = async () => {
    try {
      const res  = await fetch(`${API_BASE}/patrol/mobile-units`, { headers: { Authorization: `Bearer ${token()}` } });
      const data = await res.json();
      if (data.success) setMobileUnits(data.data);
    } catch (err) { console.error("Mobile units error:", err); }
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
      vehicle_type:     unit.vehicle_type     || "",
      plate_number:     unit.plate_number     || "",
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
      const url = modalMode === "add"
        ? `${API_BASE}/patrol/mobile-units`
        : `${API_BASE}/patrol/mobile-units/${selectedUnit.mobile_unit_id}`;

      const res  = await fetch(url, {
        method: modalMode === "add" ? "POST" : "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
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
  const handleDelete = async (id) => {
    if (!confirm("Are you sure you want to delete this mobile unit?")) return;
    setSubmitLoading(true);
    try {
      const res  = await fetch(`${API_BASE}/patrol/mobile-units/${id}`, {
        method: "DELETE", headers: { Authorization: `Bearer ${token()}` },
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
  const getInitials    = (name) => name ? name.substring(0, 2).toUpperCase() : "NA";
  const formatTime     = (ts)   => ts ? new Date(ts).toLocaleString()     : "No Data";
  const formatDateTime = (ts)   => ts ? new Date(ts).toLocaleDateString() : "No Data";

  const isInDateRange = (ts, from, to) => {
    if (!ts) return !from && !to;
    const d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    if (from) {
      const f = new Date(from); f.setHours(0, 0, 0, 0);
      if (d < f) return false;
    }
    if (to) {
      const t = new Date(to); t.setHours(23, 59, 59, 999);
      if (d > t) return false;
    }
    return true;
  };

  // ── Patroller filter logic ─────────────────────────────
  const applyPatrollerFilters = () => {
    setAppliedPatrollerFilters({ search: patrollerSearch, dateFrom: patrollerDateFrom, dateTo: patrollerDateTo });
    setPatrollerFiltersApplied(patrollerSearch !== "" || patrollerDateFrom !== "" || patrollerDateTo !== "");
    setPatrollerPage(1);
  };

  const resetPatrollerFilters = () => {
    setPatrollerSearch(""); setPatrollerDateFrom(""); setPatrollerDateTo("");
    setAppliedPatrollerFilters({ search: "", dateFrom: "", dateTo: "" });
    setPatrollerFiltersApplied(false);
    setPatrollerPage(1);
  };

  const filteredPatrollers = patrollers.filter((o) => {
    const { search: s, dateFrom: df, dateTo: dt } = appliedPatrollerFilters;
    if (s && !(o.officer_name || "").toLowerCase().includes(s.toLowerCase())) return false;
    if ((df || dt) && !isInDateRange(o.last_login, df, dt)) return false;
    return true;
  });

  const totalPatrollerPages = Math.max(1, Math.ceil(filteredPatrollers.length / PAGE_SIZE));
  const paginatedPatrollers = filteredPatrollers.slice(
    (patrollerPage - 1) * PAGE_SIZE,
    patrollerPage * PAGE_SIZE
  );

  // ── Mobile unit filter logic ───────────────────────────
  const applyUnitFilters = () => {
    setAppliedUnitFilters({ search: unitSearch, dateFrom: unitDateFrom, dateTo: unitDateTo });
    setUnitFiltersApplied(unitSearch !== "" || unitDateFrom !== "" || unitDateTo !== "");
    setUnitPage(1);
  };

  const resetUnitFilters = () => {
    setUnitSearch(""); setUnitDateFrom(""); setUnitDateTo("");
    setAppliedUnitFilters({ search: "", dateFrom: "", dateTo: "" });
    setUnitFiltersApplied(false);
    setUnitPage(1);
  };

  const sortedUnits = [...mobileUnits].sort((a, b) =>
    a.mobile_unit_name.localeCompare(b.mobile_unit_name, undefined, { numeric: true, sensitivity: "base" })
  );

  const filteredUnits = sortedUnits.filter((u) => {
    const { search: s, dateFrom: df, dateTo: dt } = appliedUnitFilters;
    if (s && !(u.mobile_unit_name || "").toLowerCase().includes(s.toLowerCase()) &&
             !(u.plate_number     || "").toLowerCase().includes(s.toLowerCase()) &&
             !(u.vehicle_type     || "").toLowerCase().includes(s.toLowerCase())) return false;
    if ((df || dt) && !isInDateRange(u.created_at, df, dt)) return false;
    return true;
  });

  const totalUnitPages = Math.max(1, Math.ceil(filteredUnits.length / PAGE_SIZE));
  const paginatedUnits = filteredUnits.slice(
    (unitPage - 1) * PAGE_SIZE,
    unitPage * PAGE_SIZE
  );

  // ── Pagination component — CaseManagement style ────────
  const Pagination = ({ page, totalPages, onPage, total, filtered }) => (
    <div className="pd-table-footer">
      <span className="pd-footer-count">
        Showing {filtered === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered)} of {filtered} records
        {filtered !== total && <span className="pd-filtered-label"> (filtered)</span>}
      </span>
      <div className="pd-pagination">
        <button
          className="pd-page-btn"
          onClick={() => onPage(page - 1)}
          disabled={page === 1}
        >
          Previous
        </button>
        <span className="pd-page-current">Page {page} of {totalPages || 1}</span>
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

  // ── Filter bar component ───────────────────────────────
  const FilterBar = ({
    search, onSearch, dateFrom, onDateFrom, dateTo, onDateTo,
    onApply, onReset, filtersApplied, searchPlaceholder,
    rightContent,
  }) => (
    <div className="pd-filter-bar">
      <div className="pd-filter-icon">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
        </svg>
      </div>
      <input
        className="pd-filter-search"
        type="text"
        placeholder={searchPlaceholder || "Search..."}
        value={search}
        onChange={(e) => onSearch(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onApply()}
      />
      <div className="pd-filter-date-group">
        <input
          type="date"
          className="pd-filter-date"
          value={dateFrom}
          onChange={(e) => onDateFrom(e.target.value)}
          title="From date"
        />
        <span className="pd-filter-arrow">→</span>
        <input
          type="date"
          className="pd-filter-date"
          value={dateTo}
          min={dateFrom}
          onChange={(e) => onDateTo(e.target.value)}
          title="To date"
        />
      </div>
      <button className="pd-filter-apply" onClick={onApply}>Apply</button>
      {filtersApplied && (
        <button className="pd-filter-reset" onClick={onReset} title="Reset filters">↺</button>
      )}
      {rightContent && <div className="pd-filter-right">{rightContent}</div>}
    </div>
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

        {/* STATS */}
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-card-header">
              <div className="stat-icon green"><ShieldCheck size={20} /></div>
            </div>
            <div className="stat-value">{stats.active_patrols_today}</div>
            <div className="stat-label">Active Patrols Today</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-header">
              <div className="stat-icon yellow"><AlertTriangle size={20} /></div>
            </div>
            <div className="stat-value">{stats.unassigned_patrollers}</div>
            <div className="stat-label">Unassigned Patrollers</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-header">
              <div className="stat-icon gray"><Car size={20} /></div>
            </div>
            <div className="stat-value">{stats.mobile_units}</div>
            <div className="stat-label">Total Mobile Units</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-header">
              <div className="stat-icon blue"><Users size={20} /></div>
            </div>
            <div className="stat-value">{stats.total_officers}</div>
            <div className="stat-label">Total Officers</div>
          </div>
        </div>

        {/* TABLE CARD */}
        <div className="table-card">
          {/* Toggle */}
          <div className="table-header">
            <div className="table-toggle">
              <button
                className={`toggle-btn ${activeTable === "patrollers" ? "toggle-active" : ""}`}
                onClick={() => setActiveTable("patrollers")}
              >Patrollers</button>
              <button
                className={`toggle-btn ${activeTable === "mobile" ? "toggle-active" : ""}`}
                onClick={() => setActiveTable("mobile")}
              >Mobile Units</button>
            </div>
          </div>

          {/* ── PATROLLERS ── */}
          {activeTable === "patrollers" && (
            <>
              <FilterBar
                search={patrollerSearch}
                onSearch={setPatrollerSearch}
                dateFrom={patrollerDateFrom}
                onDateFrom={setPatrollerDateFrom}
                dateTo={patrollerDateTo}
                onDateTo={setPatrollerDateTo}
                onApply={applyPatrollerFilters}
                onReset={resetPatrollerFilters}
                filtersApplied={patrollerFiltersApplied}
                searchPlaceholder="Search officer..."
              />
              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Officer</th>
                      <th>Status</th>
                      <th>Location</th>
                      <th>Last Update</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedPatrollers.length === 0 ? (
                      <tr><td colSpan={4} className="empty-row">No patrollers found.</td></tr>
                    ) : paginatedPatrollers.map((officer, index) => {
                      const lastSeen    = officer.last_location_at ? new Date(officer.last_location_at) : null;
                      const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000);
                      const isOnline    = lastSeen && lastSeen > fiveMinsAgo;

                      return (
                        <tr key={officer.officer_id || index}>
                          <td>
                            <div className="officer-info">
                              <div className="officer-avatar" style={{ overflow: "hidden", padding: 0 }}>
                                {officer.profile_picture ? (
                                  <img
                                    src={officer.profile_picture}
                                    alt={officer.officer_name}
                                    style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }}
                                  />
                                ) : (
                                  getInitials(officer.officer_name)
                                )}
                              </div>
                              <div className="officer-name">{officer.officer_name || "Unknown"}</div>
                            </div>
                          </td>
                          <td>
                            <span className={`online-badge ${isOnline ? "online-badge-on" : "online-badge-off"}`}>
                              <span className={`online-dot ${isOnline ? "online-dot-on" : "online-dot-off"}`} />
                              {isOnline ? "Online" : "Offline"}
                            </span>
                          </td>
                          <td>
                            <span className="location-text">
                              {officer.last_location_name
                                ? (isOnline ? officer.last_location_name : `Last seen: ${officer.last_location_name}`)
                                : <span className="unassigned-badge">No data</span>
                              }
                            </span>
                          </td>
                          <td>
                            <span className="time-badge">
                              {lastSeen ? lastSeen.toLocaleString() : "Never"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
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
              <FilterBar
                search={unitSearch}
                onSearch={setUnitSearch}
                dateFrom={unitDateFrom}
                onDateFrom={setUnitDateFrom}
                dateTo={unitDateTo}
                onDateTo={setUnitDateTo}
                onApply={applyUnitFilters}
                onReset={resetUnitFilters}
                filtersApplied={unitFiltersApplied}
                searchPlaceholder="Search unit, plate..."
                rightContent={
                  <button className="add-btn" onClick={openAddModal}>+ Add Mobile Unit</button>
                }
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
                      <tr><td colSpan={5} className="empty-row">No mobile units found.</td></tr>
                    ) : paginatedUnits.map((unit, index) => (
                      <tr key={unit.mobile_unit_id || index}>
                        <td><span className="unit-badge">{unit.mobile_unit_name}</span></td>
                        <td>
                          <span className={`vehicle-badge ${unit.vehicle_type === "Car/Sedan" ? "vehicle-car" : "vehicle-suv"}`}>
                            {unit.vehicle_type}
                          </span>
                        </td>
                        <td><span className="plate-number">{unit.plate_number}</span></td>
                        <td><span className="time-badge">{formatDateTime(unit.created_at)}</span></td>
                        <td>
                          <div className="action-btns">
                            <button className="edit-btn" onClick={() => openEditModal(unit)}>Edit</button>
                            <button className="delete-btn" onClick={() => handleDelete(unit.mobile_unit_id)}>Delete</button>
                          </div>
                        </td>
                      </tr>
                    ))}
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
                <label>Mobile Unit Name <span className="required">*</span></label>
                <input type="text" name="mobile_unit_name" value={form.mobile_unit_name} onChange={handleFormChange} placeholder="e.g. Mobile 1" />
              </div>
              <div className="form-group">
                <label>Vehicle Type <span className="required">*</span></label>
                <select name="vehicle_type" value={form.vehicle_type} onChange={handleFormChange}>
                  <option value="">— Select Vehicle Type —</option>
                  {VEHICLE_TYPES.map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Plate Number <span className="required">*</span></label>
                <input type="text" name="plate_number" value={form.plate_number} onChange={handleFormChange} placeholder="e.g. ABC 1234" style={{ textTransform: "uppercase" }} />
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

      <LoadingModal isOpen={loading}       message="Loading dashboard..." />
      <LoadingModal isOpen={submitLoading} message={modalMode === "add" ? "Adding mobile unit..." : "Saving changes..."} />

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