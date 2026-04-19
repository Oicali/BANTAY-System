import { useState, useEffect, useRef } from "react";
import "./PatrolScheduling.css";
import BeatCard from "../modals/BeatCard";
import AddPatrolModal from "../modals/AddPatrolModal";
import EditPatrolModal from "../modals/EditPatrolModal";
import Notification from "../modals/Notification";
import LoadingModal from "../modals/LoadingModal";

const API_BASE = import.meta.env.VITE_API_URL;

const parseLocalDate = (d) => {
  if (!d) return null;
  const dt = new Date(d);
  return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
};

const today = () => {
  const t = new Date();
  return new Date(t.getFullYear(), t.getMonth(), t.getDate());
};

const getPatrolStatus = (patrol) => {
  const t     = today();
  const start = parseLocalDate(patrol.start_date);
  const end   = parseLocalDate(patrol.end_date);
  if (!start || !end) return "unknown";
  if (t < start) return "upcoming";
  if (t > end)   return "completed";
  return "active";
};

// ── Hover popup component ─────────────────────────────────────────
const HoverPopup = ({ anchor, children }) => {
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const popupRef      = useRef(null);

  useEffect(() => {
    if (!anchor) return;
    const rect     = anchor.getBoundingClientRect();
    const popupW   = 220;
    const spaceRight = window.innerWidth - rect.right;
    const left = spaceRight >= popupW
      ? rect.right + 8
      : rect.left - popupW - 8;
    setPos({ top: rect.top, left });
  }, [anchor]);

  if (!anchor) return null;

  return (
    <div
      ref={popupRef}
      className="psch-hover-popup"
      style={{ top: pos.top, left: pos.left }}
    >
      {children}
    </div>
  );
};

const PatrolScheduling = () => {
  const token = () => localStorage.getItem("token");

  const [patrols, setPatrols]         = useState([]);
  const [mobileUnits, setMobileUnits] = useState([]);
  const [geoJSONData, setGeoJSONData] = useState(null);
  const [loading, setLoading]         = useState(false);
  const [notif, setNotif]             = useState(null);

  // Filters
  const [search, setSearch]         = useState("");
  const [statusFilter, setStatus]   = useState("all");
  const [dateFrom, setDateFrom]     = useState("");
  const [dateTo, setDateTo]         = useState("");
  const [filtersApplied, setFiltersApplied] = useState(false);

  // Applied filter values (only change on Apply click)
  const [appliedFilters, setAppliedFilters] = useState({
    search: "", status: "all", dateFrom: "", dateTo: "",
  });

  // Hover popups
  const [patrollerAnchor, setPatrollerAnchor] = useState(null);
  const [patrollerData, setPatrollerData]     = useState([]);
  const [barangayAnchor, setBarangayAnchor]   = useState(null);
  const [barangayData, setBarangayData]       = useState([]);

  // Modals
  const [showAddModal, setShowAddModal]     = useState(false);
  const [showEditModal, setShowEditModal]   = useState(false);
  const [showBeatCard, setShowBeatCard]     = useState(false);
  const [editingPatrol, setEditingPatrol]   = useState(null);
  const [beatCardPatrol, setBeatCardPatrol] = useState(null);

  useEffect(() => {
    fetch("/bacoor_barangays.geojson")
      .then((r) => r.json())
      .then((data) => setGeoJSONData(data))
      .catch((err) => console.error("GeoJSON load error:", err));
  }, []);

  const fetchPatrols = async () => {
    setLoading(true);
    try {
      const res  = await fetch(`${API_BASE}/patrol/patrols`, { headers: { Authorization: `Bearer ${token()}` } });
      const data = await res.json();
      if (data.success) setPatrols(data.data);
    } catch (err) { console.error("Patrols error:", err); }
    finally { setLoading(false); }
  };

  const fetchMobileUnits = async () => {
    try {
      const res  = await fetch(`${API_BASE}/patrol/mobile-units`, { headers: { Authorization: `Bearer ${token()}` } });
      const data = await res.json();
      if (data.success) setMobileUnits(data.data);
    } catch (err) { console.error("Mobile units error:", err); }
  };

  useEffect(() => { fetchPatrols(); fetchMobileUnits(); }, []);

  const openAddModal  = () => setShowAddModal(true);
  const openEditModal = (patrol) => { setEditingPatrol(patrol); setShowEditModal(true); };

  const handleAddSave = async (formData, onError) => {
    try {
      const res  = await fetch(`${API_BASE}/patrol/patrols`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (data.success) {
        setShowAddModal(false);
        fetchPatrols();
        setNotif({ message: "Patrol created successfully!", type: "success" });
      } else {
        onError?.();
        setNotif({ message: data.message || "Something went wrong.", type: "error" });
      }
    } catch (err) {
      onError?.();
      setNotif({ message: "Server error.", type: "error" });
    }
  };

  const handleEditSave = async (formData) => {
    try {
      const res  = await fetch(`${API_BASE}/patrol/patrols/${editingPatrol.patrol_id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (data.success) {
        setShowEditModal(false);
        setEditingPatrol(null);
        fetchPatrols();
        setNotif({ message: "Patrol updated successfully!", type: "success" });
      } else {
        setNotif({ message: data.message || "Something went wrong.", type: "error" });
      }
    } catch (err) {
      setNotif({ message: "Server error.", type: "error" });
    }
  };

  const handleDelete = async (id) => {
    try {
      const res  = await fetch(`${API_BASE}/patrol/patrols/${id}`, {
        method: "DELETE", headers: { Authorization: `Bearer ${token()}` },
      });
      const data = await res.json();
      if (data.success) {
        setShowBeatCard(false);
        setBeatCardPatrol(null);
        fetchPatrols();
        setNotif({ message: "Patrol deleted.", type: "success" });
      } else {
        setNotif({ message: data.message || "Something went wrong.", type: "error" });
      }
    } catch (err) { console.error("Delete error:", err); }
  };

  const formatDate = (d) => {
    const dt = parseLocalDate(d);
    return dt ? dt.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) : "—";
  };

  const getUniqueBarangays = (routes) =>
    [...new Set(
      (routes || [])
        .filter((r) => (r.stop_order || 0) <= 0 && r.barangay)
        .map((r) => r.barangay)
        .filter(Boolean)
    )];

  // Apply filters
  const handleApply = () => {
    setAppliedFilters({ search, status: statusFilter, dateFrom, dateTo });
    setFiltersApplied(
      search !== "" || statusFilter !== "all" || dateFrom !== "" || dateTo !== ""
    );
  };

  const handleReset = () => {
    setSearch(""); setStatus("all"); setDateFrom(""); setDateTo("");
    setAppliedFilters({ search: "", status: "all", dateFrom: "", dateTo: "" });
    setFiltersApplied(false);
  };

  // Filter logic
  const filteredPatrols = patrols.filter((p) => {
    const { search: s, status: st, dateFrom: df, dateTo: dt } = appliedFilters;

    if (s && !(
      (p.patrol_name || "").toLowerCase().includes(s.toLowerCase()) ||
      (p.mobile_unit_name || "").toLowerCase().includes(s.toLowerCase())
    )) return false;

    if (st !== "all" && getPatrolStatus(p) !== st) return false;

    if (df) {
      const start = parseLocalDate(p.start_date);
      if (start && start < parseLocalDate(df)) return false;
    }
    if (dt) {
      const end = parseLocalDate(p.end_date);
      if (end && end > parseLocalDate(dt)) return false;
    }

    return true;
  });

  // Status counts for summary badges
  const counts = {
    all:       patrols.length,
    active:    patrols.filter((p) => getPatrolStatus(p) === "active").length,
    upcoming:  patrols.filter((p) => getPatrolStatus(p) === "upcoming").length,
    completed: patrols.filter((p) => getPatrolStatus(p) === "completed").length,
  };

  const statusConfig = {
    active:    { label: "Active",    className: "psch-status-active" },
    upcoming:  { label: "Upcoming",  className: "psch-status-upcoming" },
    completed: { label: "Completed", className: "psch-status-completed" },
  };

  return (
    <div className="dash">
      <div className="psch-content-area">

        {/* HEADER */}
        <div className="psch-page-header">
          <div className="psch-page-header-left">
            <h1>Patrol Scheduling</h1>
            <p>Manage patrol officer schedules and assignments</p>
          </div>
          <button className="psch-btn psch-btn-primary" onClick={openAddModal}>+ Add Patrol</button>
        </div>

        {/* STAT BADGES */}
        <div className="psch-stat-row">
          {[
            { key: "all",       label: "Total",     color: "navy" },
            { key: "active",    label: "Active",    color: "green" },
            { key: "upcoming",  label: "Upcoming",  color: "amber" },
            { key: "completed", label: "Completed", color: "gray" },
          ].map(({ key, label, color }) => (
            <div
              key={key}
              className={`psch-stat-card psch-stat-${color} ${appliedFilters.status === key ? "psch-stat-selected" : ""}`}
             onClick={() => {
  setStatus(key);
  setAppliedFilters((prev) => ({ ...prev, status: key }));
  setFiltersApplied(key !== "all");
}}
            >
              <span className="psch-stat-num">{counts[key]}</span>
              <span className="psch-stat-label">{label}</span>
            </div>
          ))}
        </div>

        {/* FILTER BAR */}
        <div className="psch-filter-bar">
          <div className="psch-filter-icon">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
            </svg>
          </div>

          <input
            className="psch-filter-search"
            type="text"
            placeholder="Search patrol or unit..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleApply()}
          />

          <select
            className="psch-filter-select"
            value={statusFilter}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="upcoming">Upcoming</option>
            <option value="completed">Completed</option>
          </select>

          <div className="psch-filter-date-group">
            <input
              type="date"
              className="psch-filter-date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              title="Start date from"
            />
            <span className="psch-filter-arrow">→</span>
            <input
              type="date"
              className="psch-filter-date"
              value={dateTo}
              min={dateFrom}
              onChange={(e) => setDateTo(e.target.value)}
              title="End date to"
            />
          </div>

          <button className="psch-filter-apply" onClick={handleApply}>Apply Filters</button>

          {filtersApplied && (
            <button className="psch-filter-reset" onClick={handleReset} title="Reset filters">↺</button>
          )}
        </div>

        {/* TABLE */}
        <div className="psch-table-card">
          <div className="psch-table-container">
            <table className="psch-data-table">
              <thead>
                <tr>
                  <th>Patrol Name</th>
                  <th>Status</th>
                  <th>Mobile Unit</th>
                  <th>Duration</th>
                  <th>Assigned Patrollers</th>
                  <th>Area of Responsibility</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} className="psch-empty-row">Loading...</td></tr>
                ) : filteredPatrols.length === 0 ? (
                  <tr><td colSpan={7} className="psch-empty-row">No patrols found.</td></tr>
                ) : filteredPatrols.map((patrol) => {
                  const uniquePatrollers = patrol.patrollers || [];
                  const barangays        = getUniqueBarangays(patrol.routes);
                  const status           = getPatrolStatus(patrol);
                  const statusCfg        = statusConfig[status] || { label: "—", className: "" };

                  return (
                    <tr key={patrol.patrol_id}>
                      <td><span className="psch-patrol-name">{patrol.patrol_name}</span></td>

                      {/* Status badge */}
                      <td>
                        <span className={`psch-status-badge ${statusCfg.className}`}>
                          {statusCfg.label}
                        </span>
                      </td>

                      <td><span className="psch-unit-text">{patrol.mobile_unit_name || "—"}</span></td>
                      <td><span className="psch-duration-text">{formatDate(patrol.start_date)} — {formatDate(patrol.end_date)}</span></td>

                      {/* Patrollers — count + hover */}
                      <td>
                        {uniquePatrollers.length > 0 ? (
                          <span
                            className="psch-count-pill psch-count-patroller"
                            onMouseEnter={(e) => { setPatrollerData(uniquePatrollers); setPatrollerAnchor(e.currentTarget); }}
                            onMouseLeave={() => { setPatrollerAnchor(null); setPatrollerData([]); }}
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                            </svg>
                            {uniquePatrollers.length} Patroller{uniquePatrollers.length !== 1 ? "s" : ""}
                          </span>
                        ) : <span className="psch-none-text">No patrollers</span>}
                      </td>

                      {/* Barangays — count + hover */}
                      <td>
                        {barangays.length > 0 ? (
                          <span
                            className="psch-count-pill psch-count-barangay"
                            onMouseEnter={(e) => { setBarangayData(barangays); setBarangayAnchor(e.currentTarget); }}
                            onMouseLeave={() => { setBarangayAnchor(null); setBarangayData([]); }}
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
                            </svg>
                            {barangays.length} Barangay{barangays.length !== 1 ? "s" : ""}
                          </span>
                        ) : <span className="psch-none-text">No area set</span>}
                      </td>

                      <td>
                        <button className="psch-view-btn"
                          onClick={() => { setBeatCardPatrol(patrol); setShowBeatCard(true); }}>
                          View
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Result count */}
          {!loading && (
            <div className="psch-table-footer">
              Showing {filteredPatrols.length} of {patrols.length} patrol{patrols.length !== 1 ? "s" : ""}
              {filtersApplied && <span className="psch-filtered-label"> (filtered)</span>}
            </div>
          )}
        </div>
      </div>

<LoadingModal isOpen={loading} message="Loading patrols..." />

      {/* HOVER POPUPS — rendered via portal-like fixed positioning */}
      <HoverPopup anchor={patrollerAnchor}>
        <div className="psch-popup-title">Assigned Patrollers</div>
        {patrollerData.map((p, i) => (
          <div key={`${p.active_patroller_id}-${p.shift}-${i}`} className="psch-popup-row">
            <div className="psch-popup-avatar">
              {p.officer_name ? p.officer_name.substring(0, 2).toUpperCase() : "NA"}
            </div>
            <span className="psch-popup-name">{p.officer_name}</span>
            <span className="psch-shift-badge" data-shift={p.shift}>{p.shift}</span>
          </div>
        ))}
      </HoverPopup>

      <HoverPopup anchor={barangayAnchor}>
        <div className="psch-popup-title">Area of Responsibility</div>
        {barangayData.map((b) => (
          <div key={b} className="psch-popup-brgy-row">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#1e3a5f" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
            </svg>
            {b}
          </div>
        ))}
      </HoverPopup>

      {showAddModal && (
        <AddPatrolModal
          mobileUnits={mobileUnits}
          geoJSONData={geoJSONData}
          onClose={() => setShowAddModal(false)}
          onSave={handleAddSave}
        />
      )}

      {showEditModal && editingPatrol && (
        <EditPatrolModal
          patrol={editingPatrol}
          mobileUnits={mobileUnits}
          geoJSONData={geoJSONData}
          onClose={() => { setShowEditModal(false); setEditingPatrol(null); }}
          onSave={handleEditSave}
        />
      )}

      {showBeatCard && beatCardPatrol && (
        <BeatCard
          patrol={beatCardPatrol}
          geoJSONData={geoJSONData}
          onClose={() => { setShowBeatCard(false); setBeatCardPatrol(null); }}
          onEdit={() => { setShowBeatCard(false); openEditModal(beatCardPatrol); }}
          onDelete={() => handleDelete(beatCardPatrol.patrol_id)}
        />
      )}

      {notif && (
        <Notification message={notif.message} type={notif.type} onClose={() => setNotif(null)} duration={3000} />
      )}
    </div>
  );
};

export default PatrolScheduling;