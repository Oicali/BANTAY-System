import { useState, useEffect, useRef } from "react";
import "./PatrolScheduling.css";
import BeatCard from "../modals/BeatCard";
import AddPatrolModal from "../modals/AddPatrolModal";
import EditPatrolModal from "../modals/EditPatrolModal";
import Notification from "../modals/Notification";
import LoadingModal from "../modals/LoadingModal";
import { useExportPatrolList } from "../../hooks/Useexportpatrol";
const API_BASE = import.meta.env.VITE_API_URL;

const PATROLS_PER_PAGE = 5;

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

// ── Sort dropdown component ───────────────────────────────────────
const SortDropdown = ({ sortOption, onSortChange }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const options = [
    { value: "date_asc",  label: "Sort by Date (Earliest First)" },
    { value: "date_desc", label: "Sort by Date (Latest First)" },
    { value: "name_asc",  label: "Sort A → Z" },
    { value: "name_desc", label: "Sort Z → A" },
  ];

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const currentLabel = options.find((o) => o.value === sortOption)?.label || "Sort";

  return (
    <div className="psch-sort-wrapper" ref={ref}>
      <button
        className={`psch-sort-btn ${open ? "psch-sort-btn-open" : ""}`}
        onClick={() => setOpen((v) => !v)}
        title={currentLabel}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="4" y1="6" x2="20" y2="6"/>
          <line x1="4" y1="12" x2="14" y2="12"/>
          <line x1="4" y1="18" x2="9" y2="18"/>
        </svg>
        <svg
          className={`psch-sort-chevron ${open ? "psch-sort-chevron-open" : ""}`}
          width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {open && (
        <div className="psch-sort-dropdown">
          <div className="psch-sort-dropdown-title">Sort Options</div>
          {options.map((opt) => (
            <button
              key={opt.value}
              className={`psch-sort-option ${sortOption === opt.value ? "psch-sort-option-active" : ""}`}
              onClick={() => { onSortChange(opt.value); setOpen(false); }}
            >
              {sortOption === opt.value && (
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              )}
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// ── Pagination component ──────────────────────────────────────────
const Pagination = ({ currentPage, totalPages, onPageChange }) => {
  if (totalPages <= 1) return null;

  const getPages = () => {
    const pages = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (currentPage > 3) pages.push("...");
      const start = Math.max(2, currentPage - 1);
      const end   = Math.min(totalPages - 1, currentPage + 1);
      for (let i = start; i <= end; i++) pages.push(i);
      if (currentPage < totalPages - 2) pages.push("...");
      pages.push(totalPages);
    }
    return pages;
  };

  return (
    <div className="psch-pagination">
      <button
        className="psch-page-btn psch-page-nav"
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        title="Previous page"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
      </button>

      {getPages().map((page, i) =>
        page === "..." ? (
          <span key={`dots-${i}`} className="psch-page-dots">…</span>
        ) : (
          <button
            key={page}
            className={`psch-page-btn ${currentPage === page ? "psch-page-btn-active" : ""}`}
            onClick={() => onPageChange(page)}
          >
            {page}
          </button>
        )
      )}

      <button
        className="psch-page-btn psch-page-nav"
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        title="Next page"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </button>
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

  // Sort — default: earliest date first
  const [sortOption, setSortOption] = useState("date_asc");

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);

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

  const { exportPatrolList, isExporting } = useExportPatrolList(patrols);

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

  const handleApply = () => {
    setAppliedFilters({ search, status: statusFilter, dateFrom, dateTo });
    setFiltersApplied(
      search !== "" || statusFilter !== "all" || dateFrom !== "" || dateTo !== ""
    );
    setCurrentPage(1);
  };

  const handleReset = () => {
    setSearch(""); setStatus("all"); setDateFrom(""); setDateTo("");
    setAppliedFilters({ search: "", status: "all", dateFrom: "", dateTo: "" });
    setFiltersApplied(false);
    setCurrentPage(1);
  };

  const handleSortChange = (val) => {
    setSortOption(val);
    setCurrentPage(1);
  };

  // Filter
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

  // Sort
  const sortedPatrols = [...filteredPatrols].sort((a, b) => {
    if (sortOption === "name_asc") {
      return (a.patrol_name || "").localeCompare(b.patrol_name || "");
    }
    if (sortOption === "name_desc") {
      return (b.patrol_name || "").localeCompare(a.patrol_name || "");
    }
    // date_asc / date_desc
    const dateA = parseLocalDate(a.start_date)?.getTime() ?? 0;
    const dateB = parseLocalDate(b.start_date)?.getTime() ?? 0;
    return sortOption === "date_asc" ? dateA - dateB : dateB - dateA;
  });

  // Pagination
  const totalPages   = Math.max(1, Math.ceil(sortedPatrols.length / PATROLS_PER_PAGE));
  const safePage     = Math.min(currentPage, totalPages);
  const pagedPatrols = sortedPatrols.slice(
    (safePage - 1) * PATROLS_PER_PAGE,
    safePage * PATROLS_PER_PAGE
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
            <button className="psch-btn psch-btn-outline" onClick={exportPatrolList} disabled={isExporting}>
              {isExporting ? (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="psch-btn-icon psch-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                  Exporting…
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="psch-btn-icon"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  Export PDF
                </>
              )}
            </button>
            <button className="psch-btn psch-btn-primary" onClick={openAddModal}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="psch-btn-icon"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Add Patrol
            </button>
          </div>
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
                setCurrentPage(1);
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

          {/* Sort dropdown — sits right after filter icon */}
          <SortDropdown sortOption={sortOption} onSortChange={handleSortChange} />

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
                ) : pagedPatrols.length === 0 ? (
                  <tr><td colSpan={7} className="psch-empty-row">No patrols found.</td></tr>
                ) : pagedPatrols.map((patrol) => {
                  const uniquePatrollers = patrol.patrollers || [];
                  const barangays        = getUniqueBarangays(patrol.routes);
                  const status           = getPatrolStatus(patrol);
                  const statusCfg        = statusConfig[status] || { label: "—", className: "" };

                  return (
                    <tr key={patrol.patrol_id}>
                      <td><span className="psch-patrol-name">{patrol.patrol_name}</span></td>

                      <td>
                        <span className={`psch-status-badge ${statusCfg.className}`}>
                          {statusCfg.label}
                        </span>
                      </td>

                      <td><span className="psch-unit-text">{patrol.mobile_unit_name || "—"}</span></td>
                      <td><span className="psch-duration-text">{formatDate(patrol.start_date)} — {formatDate(patrol.end_date)}</span></td>

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

          {/* TABLE FOOTER: count + pagination */}
          {!loading && (
            <div className="psch-table-footer">
              <span>
                Showing {sortedPatrols.length === 0 ? 0 : (safePage - 1) * PATROLS_PER_PAGE + 1}–{Math.min(safePage * PATROLS_PER_PAGE, sortedPatrols.length)} of {sortedPatrols.length} patrol{sortedPatrols.length !== 1 ? "s" : ""}
                {filtersApplied && <span className="psch-filtered-label"> (filtered)</span>}
                {" "}· {patrols.length} total
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