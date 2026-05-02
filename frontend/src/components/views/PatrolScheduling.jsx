// src/components/views/PatrolScheduling.jsx
import { useState, useEffect, useRef } from "react";
import "./PatrolScheduling.css";
import BeatCard from "../modals/BeatCard";
import AddPatrolModal from "../modals/AddPatrolModal";
import EditPatrolModal from "../modals/EditPatrolModal";
import Notification from "../modals/Notification";
import LoadingModal from "../modals/LoadingModal";
import PdfPreviewModal from "../modals/PdfPreviewModal";
import { useExportPatrolList } from "../../hooks/UseExportPatrol.js";

const API_BASE = import.meta.env.VITE_API_URL;

const PATROLS_PER_PAGE = 15;


const ViewIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
);

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
  const t = today();
  const start = parseLocalDate(patrol.start_date);
  const end = parseLocalDate(patrol.end_date);
  if (!start || !end) return "unknown";
  if (t < start) return "upcoming";
  if (t > end) return "completed";
  return "active";
};

// ── Hover popup component ─────────────────────────────────────────
const HoverPopup = ({ anchor, children }) => {
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const popupRef = useRef(null);

  useEffect(() => {
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const popupW = 220;
    const spaceRight = window.innerWidth - rect.right;
    const left = spaceRight >= popupW ? rect.right + 8 : rect.left - popupW - 8;
    setPos({ top: rect.top, left });
  }, [anchor]);

  if (!anchor) return null;

  return (
    <div ref={popupRef} className="psch-hover-popup" style={{ top: pos.top, left: pos.left }}>
      {children}
    </div>
  );
};

// ── Pagination component — CaseManagement style ───────────────────
const Pagination = ({ currentPage, totalPages, onPageChange }) => {
  if (totalPages <= 0) return null;
  return (
    <div className="psch-pagination">
      <button
        className="psch-page-btn"
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
      >
        Previous
      </button>
      <span className="psch-page-current">
        Page {currentPage} of {totalPages}
      </span>
      <button
        className="psch-page-btn"
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
      >
        Next
      </button>
    </div>
  );
};

const PatrolScheduling = () => {
  const token = () => localStorage.getItem("token");
 const [isAdmin] = useState(() => localStorage.getItem("role") === "Administrator");

  const [patrols, setPatrols] = useState([]);
  const [mobileUnits, setMobileUnits] = useState([]);
  const [geoJSONData, setGeoJSONData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [notif, setNotif] = useState(null);

  // Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatus] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [filtersApplied, setFiltersApplied] = useState(false);
const [barangayFilters, setBarangayFilters] = useState([]); 
const [barangaySearch, setBrgySearch] = useState("");
const [showBrgyDropdown, setShowBrgyDropdown] = useState(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);

  // Applied filter values (only change on Apply click)
const [appliedFilters, setAppliedFilters] = useState({
  search: "", status: "all", dateFrom: "", dateTo: "", barangays: [], 
});

  // Hover popups
  const [patrollerAnchor, setPatrollerAnchor] = useState(null);
  const [patrollerData, setPatrollerData] = useState([]);
  const [barangayAnchor, setBarangayAnchor] = useState(null);
  const [barangayData, setBarangayData] = useState([]);

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showBeatCard, setShowBeatCard] = useState(false);
  const [editingPatrol, setEditingPatrol] = useState(null);
  const [beatCardPatrol, setBeatCardPatrol] = useState(null);

  // PDF list preview state
  const [listPdfPreview, setListPdfPreview] = useState(null);

  const { exportPatrolList, isExporting } = useExportPatrolList(patrols);

  const closeListPreview = () => {
    listPdfPreview?.revoke();
    setListPdfPreview(null);
  };

  useEffect(() => {
    fetch("/bacoor_barangays.geojson")
      .then((r) => r.json())
      .then((data) => setGeoJSONData(data))
      .catch((err) => console.error("GeoJSON load error:", err));
  }, []);

  const fetchPatrols = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/patrol/patrols`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      const data = await res.json();
      if (data.success) setPatrols(data.data);
    } catch (err) {
      console.error("Patrols error:", err);
    } finally {
      setLoading(false);
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
    fetchPatrols();
    fetchMobileUnits();
  }, []);

  const openAddModal = () => setShowAddModal(true);
  const openEditModal = (patrol) => {
    setEditingPatrol(patrol);
    setShowEditModal(true);
  };

  const handleAddSave = async (formData, onError) => {
    try {
      const res = await fetch(`${API_BASE}/patrol/patrols`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token()}`,
        },
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
      const res = await fetch(`${API_BASE}/patrol/patrols/${editingPatrol.patrol_id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token()}`,
        },
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
      const res = await fetch(`${API_BASE}/patrol/patrols/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token()}` },
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
    } catch (err) {
      console.error("Delete error:", err);
    }
  };

  const formatDate = (d) => {
    const dt = parseLocalDate(d);
    return dt
      ? dt.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })
      : "—";
  };

  const getUniqueBarangays = (routes) => [
    ...new Set(
      (routes || [])
        .filter((r) => (r.stop_order || 0) <= 0 && r.barangay)
        .map((r) => r.barangay)
        .filter(Boolean),
    ),
  ];

 const handleApply = () => {
  setAppliedFilters({ search, status: statusFilter, dateFrom, dateTo, barangays: barangayFilters });
  setFiltersApplied(
    search !== "" || statusFilter !== "all" || dateFrom !== "" || dateTo !== "" || barangayFilters.length > 0
  );
  setCurrentPage(1);
};

const handleReset = () => {
  setSearch("");
  setStatus("all");
  setDateFrom("");
  setDateTo("");
  setBarangayFilters([]);
  setBrgySearch("");
  setAppliedFilters({ search: "", status: "all", dateFrom: "", dateTo: "", barangays: [] });
  setFiltersApplied(false);
  setCurrentPage(1);
};

  const handleExportListClick = async () => {
    if (isExporting) return;
    try {
      const authToken = localStorage.getItem("token");
      const response = await fetch(`${API_BASE}/patrol/export/list`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ patrols }),
      });
      if (!response.ok) throw new Error("Export failed");

      const dateStr = new Date().toISOString().slice(0, 10);
      const filename = `patrol_list_${dateStr}.pdf`;
      const blob = await response.blob();
      const file = new File([blob], filename, { type: "application/pdf" });
      const blobUrl = URL.createObjectURL(file);

      setListPdfPreview({
        blobUrl,
        download: () => {
          const link = document.createElement("a");
          link.href = blobUrl;
          link.download = filename;
          document.body.appendChild(link);
          link.click();
          link.remove();
        },
        revoke: () => URL.revokeObjectURL(blobUrl),
      });
    } catch (err) {
      console.error("[PatrolScheduling] export list preview failed:", err);
      exportPatrolList();
    }
  };


  
  // Filter
const allBarangays = [...new Set(
  patrols.flatMap((p) =>
    (p.routes || [])
      .filter((r) => (r.stop_order || 0) <= 0 && r.barangay)
      .map((r) => r.barangay)
  )
)].sort();

const filteredBrgyOptions = allBarangays.filter((b) =>
  b.toLowerCase().includes(barangaySearch.toLowerCase())
);

  const filteredPatrols = patrols.filter((p) => {
    const { search: s, status: st, dateFrom: df, dateTo: dt } = appliedFilters;

    if (
      s &&
      !(
        (p.patrol_name || "").toLowerCase().includes(s.toLowerCase()) ||
        (p.mobile_unit_name || "").toLowerCase().includes(s.toLowerCase())
      )
    )
      return false;

    if (st !== "all" && getPatrolStatus(p) !== st) return false;

    if (df) {
      const start = parseLocalDate(p.start_date);
      if (start && start < parseLocalDate(df)) return false;
    }
    if (dt) {
      const end = parseLocalDate(p.end_date);
      if (end && end > parseLocalDate(dt)) return false;
    }
    if (appliedFilters.barangays.length > 0) {
  const hasMatch = appliedFilters.barangays.every((selected) =>
    (p.routes || []).some(
      (r) => (r.stop_order || 0) <= 0 && r.barangay === selected
    )
  );
  if (!hasMatch) return false;
}
    return true;
  });

  // Sort — default date ascending only (no sort dropdown)
 const STATUS_ORDER = { active: 0, upcoming: 1, completed: 2, unknown: 3 };

const sortedPatrols = [...filteredPatrols].sort((a, b) => {
  const statusA = STATUS_ORDER[getPatrolStatus(a)] ?? 3;
  const statusB = STATUS_ORDER[getPatrolStatus(b)] ?? 3;
  if (statusA !== statusB) return statusA - statusB;

  // Primary: sort by start_date ascending
  const startA = parseLocalDate(a.start_date)?.getTime() ?? 0;
  const startB = parseLocalDate(b.start_date)?.getTime() ?? 0;
  if (startA !== startB) return startA - startB;

  // Secondary: if same start_date, sort by end_date ascending
  const endA = parseLocalDate(a.end_date)?.getTime() ?? 0;
  const endB = parseLocalDate(b.end_date)?.getTime() ?? 0;
  return endA - endB;
});

  // Pagination — 15 items per page
  const totalPages = Math.max(1, Math.ceil(sortedPatrols.length / PATROLS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const pagedPatrols = sortedPatrols.slice(
    (safePage - 1) * PATROLS_PER_PAGE,
    safePage * PATROLS_PER_PAGE,
  );

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
          <div className="psch-header-actions">
            <button
              className="psch-btn psch-btn-outline"
              onClick={handleExportListClick}
              disabled={isExporting}
            >
              {isExporting ? (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="psch-btn-icon psch-spin">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                  Exporting…
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="psch-btn-icon">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  Export PDF
                </>
              )}
            </button>
            {isAdmin && (
              <button className="psch-btn psch-btn-primary" onClick={openAddModal}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="psch-btn-icon">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Add Patrol
              </button>
            )}
          </div>
        </div>

        {/* STAT CARDS — CaseManagement style, no click handler */}
        <div className="psch-stat-row">
          {[
            { key: "all",       label: "Total",     color: "navy"  },
            { key: "active",    label: "Active",    color: "green" },
            { key: "upcoming",  label: "Upcoming",  color: "amber" },
            { key: "completed", label: "Completed", color: "gray"  },
          ].map(({ key, label, color }) => (
            <div key={key} className={`psch-stat-card psch-stat-${color}`}>
              <span className="psch-stat-num">{counts[key]}</span>
              <span className="psch-stat-label">{label}</span>
            </div>
          ))}
        </div>

        {/* FILTER BAR — CrimeMapping style, no sort dropdown */}
        <div className="psch-filter-bar">
          <div className="psch-filter-icon">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
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

<div className="psch-brgy-dropdown-wrap" style={{ position: "relative" }}>

 

  {/* Search input */}
 <input
  className="psch-filter-select"
  type="text"
  placeholder="Filter by barangay..."
  value={
    barangayFilters.length > 0
      ? barangayFilters.join(", ") + (barangaySearch ? ", " + barangaySearch : "")
      : barangaySearch
  }
  onChange={(e) => {
    // Only update the search portion (after the last comma)
    const parts = e.target.value.split(",");
    setBrgySearch(parts[parts.length - 1].trim());
    setShowBrgyDropdown(true);
  }}
  onFocus={() => setShowBrgyDropdown(true)}
  onBlur={() => setTimeout(() => setShowBrgyDropdown(false), 150)}
  onKeyDown={(e) => {
    // Backspace on empty search removes last selected barangay
    if (e.key === "Backspace" && barangaySearch === "") {
      setBarangayFilters((prev) => prev.slice(0, -1));
    }
  }}
/>

  {/* Dropdown options */}
  {showBrgyDropdown && filteredBrgyOptions.length > 0 && (
    <div style={{
      position: "absolute", top: "100%", left: 0, zIndex: 999,
      background: "#fff", border: "1px solid #dde3f0", borderRadius: 8,
      boxShadow: "0 4px 16px rgba(0,0,0,0.10)", maxHeight: 200,
      overflowY: "auto", minWidth: 200, width: "100%",
    }}>
      {filteredBrgyOptions
        .filter((b) => !barangayFilters.includes(b)) // hide already selected
        .map((b) => (
          <div
            key={b}
            style={{ padding: "8px 14px", cursor: "pointer", fontSize: 13 }}
            onMouseDown={() => {
              setBarangayFilters((prev) => [...prev, b]);
              setBrgySearch("");
              setShowBrgyDropdown(false);
            }}
          >
            {b}
          </div>
        ))}
    </div>
  )}
</div>
<button className="psch-filter-apply" onClick={handleApply}>
  Apply Filters
</button>

<button className="psch-filter-reset" onClick={handleReset} title="Reset filters">
  ↺
</button>
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
                  <tr>
                    <td colSpan={7} className="psch-empty-row">Loading...</td>
                  </tr>
                ) : pagedPatrols.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="psch-empty-row">No patrols found.</td>
                  </tr>
                ) : (
                  pagedPatrols.map((patrol) => {
                    const uniquePatrollers = patrol.patrollers || [];
                    const barangays = getUniqueBarangays(patrol.routes);
                    const status = getPatrolStatus(patrol);
                    const statusCfg = statusConfig[status] || { label: "—", className: "" };

                    return (
                      <tr key={patrol.patrol_id}>
                        <td>
                          <span className="psch-patrol-name">{patrol.patrol_name}</span>
                        </td>

                        <td>
                          <span className={`psch-status-badge ${statusCfg.className}`}>
                            {statusCfg.label}
                          </span>
                        </td>

                        <td>
                          <span className="psch-unit-text">{patrol.mobile_unit_name || "—"}</span>
                        </td>

                        <td>
                          <span className="psch-duration-text">
                            {formatDate(patrol.start_date)} — {formatDate(patrol.end_date)}
                          </span>
                        </td>

                        <td>
                          {uniquePatrollers.length > 0 ? (
                            <span
                              className="psch-count-pill psch-count-patroller"
                              onMouseEnter={(e) => {
                                setPatrollerData(uniquePatrollers);
                                setPatrollerAnchor(e.currentTarget);
                              }}
                              onMouseLeave={() => {
                                setPatrollerAnchor(null);
                                setPatrollerData([]);
                              }}
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                                <circle cx="9" cy="7" r="4" />
                                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                              </svg>
                              {uniquePatrollers.length} Patroller{uniquePatrollers.length !== 1 ? "s" : ""}
                            </span>
                          ) : (
                            <span className="psch-none-text">No patrollers</span>
                          )}
                        </td>

                        <td>
                          {barangays.length > 0 ? (
                            <span
                              className="psch-count-pill psch-count-barangay"
                              onMouseEnter={(e) => {
                                setBarangayData(barangays);
                                setBarangayAnchor(e.currentTarget);
                              }}
                              onMouseLeave={() => {
                                setBarangayAnchor(null);
                                setBarangayData([]);
                              }}
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                                <circle cx="12" cy="10" r="3" />
                              </svg>
                              {barangays.length} Barangay{barangays.length !== 1 ? "s" : ""}
                            </span>
                          ) : (
                            <span className="psch-none-text">No area set</span>
                          )}
                        </td>

                        <td>
                          {/* View button — CaseManagement action style */}
                       <button
  className="psch-view-btn"
  onClick={() => {
    setBeatCardPatrol(patrol);
    setShowBeatCard(true);
  }}
>
  <ViewIcon /> View
</button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* TABLE FOOTER — CaseManagement pagination style */}
          {!loading && sortedPatrols.length > 0 && (
  <div className="psch-table-footer">
    <span>
      Showing{" "}
      {sortedPatrols.length === 0 ? 0 : (safePage - 1) * PATROLS_PER_PAGE + 1}–
      {Math.min(safePage * PATROLS_PER_PAGE, sortedPatrols.length)} of{" "}
      {sortedPatrols.length} record{sortedPatrols.length !== 1 ? "s" : ""}
      {filtersApplied && <span className="psch-filtered-label"> (filtered)</span>}
    </span>
    <Pagination
      currentPage={safePage}
      totalPages={totalPages}
      onPageChange={(p) => setCurrentPage(p)}
    />
  </div>
)}
        </div>
      </div>

      <LoadingModal isOpen={loading} message="Loading patrols..." />

      <HoverPopup anchor={patrollerAnchor}>
        <div className="psch-popup-title">Assigned Patrollers</div>
        {patrollerData.map((p, i) => (
         <div key={`${p.active_patroller_id}-${p.shift}-${i}`} className="psch-popup-row">
  <div className="psch-popup-avatar" style={{ overflow: "hidden", padding: 0 }}>
    {p.profile_picture ? (
      <img
        src={p.profile_picture}
        alt={p.officer_name}
        style={{
          width: "100%",
          height: "100%",
          borderRadius: "50%",
          objectFit: "cover",
        }}
      />
    ) : (
      p.officer_name ? p.officer_name.substring(0, 2).toUpperCase() : "NA"
    )}
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
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
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
          onClose={() => {
            setShowEditModal(false);
            setEditingPatrol(null);
          }}
          onSave={handleEditSave}
        />
      )}

      {showBeatCard && beatCardPatrol && (
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
          onDelete={() => handleDelete(beatCardPatrol.patrol_id)}
          hideEdit={!isAdmin}
          hideDelete={!isAdmin}
        />
      )}

      {notif && (
        <Notification
          message={notif.message}
          type={notif.type}
          onClose={() => setNotif(null)}
          duration={3000}
        />
      )}

      {listPdfPreview && (
        <PdfPreviewModal
          blobUrl={listPdfPreview.blobUrl}
          onDownload={() => {
            listPdfPreview.download();
            closeListPreview();
          }}
          onClose={closeListPreview}
        />
      )}
    </div>
  );
};

export default PatrolScheduling;