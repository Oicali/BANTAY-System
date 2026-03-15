import { useState, useEffect, useRef } from "react";
import "./PatrolDashboard.css";

const API_BASE = `${import.meta.env.VITE_API_URL}`;

const BARANGAY_LIST = [
  "Brgy. Aguinaldo", "Brgy. Alima", "Brgy. Aniban I", "Brgy. Aniban II",
  "Brgy. Aniban III", "Brgy. Aniban IV", "Brgy. Aniban V", "Brgy. Banalo",
  "Brgy. Bayanan", "Brgy. Campo Santo", "Brgy. Daang Bukid", "Brgy. Digman",
  "Brgy. Dulong Bayan", "Brgy. Emirville", "Brgy. Habay I", "Brgy. Habay II",
  "Brgy. Kaingin", "Brgy. Ligas I", "Brgy. Ligas II", "Brgy. Ligas III",
  "Brgy. Mabolo I", "Brgy. Mabolo II", "Brgy. Mabolo III", "Brgy. Maliksi I",
  "Brgy. Maliksi II", "Brgy. Maliksi III", "Brgy. Mambog I", "Brgy. Mambog II",
  "Brgy. Mambog III", "Brgy. Mambog IV", "Brgy. Mambog V", "Brgy. Molino I",
  "Brgy. Molino II", "Brgy. Molino III", "Brgy. Molino IV", "Brgy. Molino V",
  "Brgy. Molino VI", "Brgy. Molino VII", "Brgy. Niog I", "Brgy. Niog II",
  "Brgy. Niog III", "Brgy. P.F. Espiritu I", "Brgy. P.F. Espiritu II",
  "Brgy. P.F. Espiritu III", "Brgy. P.F. Espiritu IV", "Brgy. P.F. Espiritu V",
  "Brgy. P.F. Espiritu VI", "Brgy. P.F. Espiritu VII", "Brgy. P.F. Espiritu VIII",
  "Brgy. Queens Row Central", "Brgy. Queens Row East", "Brgy. Queens Row West",
  "Brgy. Real I", "Brgy. Real II", "Brgy. Salinas I", "Brgy. Salinas II",
  "Brgy. Salinas III", "Brgy. Salinas IV", "Brgy. San Nicolas I",
  "Brgy. San Nicolas II", "Brgy. San Nicolas III", "Brgy. Sineguelasan",
  "Brgy. Talaba I", "Brgy. Talaba II", "Brgy. Talaba III", "Brgy. Talaba IV",
  "Brgy. Talaba V", "Brgy. Talaba VI", "Brgy. Talaba VII", "Brgy. Zapote I",
  "Brgy. Zapote II", "Brgy. Zapote III", "Brgy. Zapote IV", "Brgy. Zapote V",
];

const PatrollerDashboard = () => {
  const token = () => localStorage.getItem("token");

  // ── Main state ─────────────────────────────────────────
  const [activeTable, setActiveTable] = useState("patrollers");
  const [patrollers, setPatrollers] = useState([]);
  const [mobileUnits, setMobileUnits] = useState([]);
  const [availablePatrollers, setAvailablePatrollers] = useState([]);
  const [stats, setStats] = useState({
    assigned_patrollers: 0,
    unassigned_patrollers: 0,
    mobile_units: 0,
    total_officers: 0,
  });

  // ── Patroller table search ─────────────────────────────
  const [patrollerSearch, setPatrollerSearch] = useState("");

  // ── Modal state ────────────────────────────────────────
  const [showModal, setShowModal]               = useState(false);
  const [modalMode, setModalMode]               = useState("add");
  const [selectedUnit, setSelectedUnit]         = useState(null);
  const [mobileUnitName, setMobileUnitName]     = useState("");

  // Barangay multi-select with search
  const [barangaySearch, setBarangaySearch]     = useState("");
  const [selectedBarangays, setSelectedBarangays] = useState([]);
  const [barangayOpen, setBarangayOpen]         = useState(false);
  const barangayRef                             = useRef(null);

  // Patroller checklist with search
  const [patrollerCheckSearch, setPatrollerCheckSearch] = useState("");
  const [selectedPatrollerIds, setSelectedPatrollerIds] = useState([]);

  // ── Close barangay dropdown on outside click ───────────
  useEffect(() => {
    const handler = (e) => {
      if (barangayRef.current && !barangayRef.current.contains(e.target)) {
        setBarangayOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── Fetchers ───────────────────────────────────────────
  const fetchPatrolStats = async () => {
    try {
      const res = await fetch(`${API_BASE}/patrol/stats`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      const data = await res.json();
      if (data.success) setStats(data.data);
    } catch (err) { console.error("Stats error:", err); }
  };

  const fetchPatrollers = async () => {
    try {
      const res = await fetch(`${API_BASE}/patrol/active`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      const data = await res.json();
      if (data.success) setPatrollers(data.data);
    } catch (err) { console.error("Patrollers error:", err); }
  };

  const fetchMobileUnits = async () => {
    try {
      const res = await fetch(`${API_BASE}/patrol/mobile-units`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      const data = await res.json();
      if (data.success) setMobileUnits(data.data);
    } catch (err) { console.error("Mobile units error:", err); }
  };

  const fetchAvailablePatrollers = async () => {
    try {
      const res = await fetch(`${API_BASE}/patrol/available-patrollers`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      const data = await res.json();
      if (data.success) setAvailablePatrollers(data.data);
    } catch (err) { console.error("Available patrollers error:", err); }
  };

  useEffect(() => {
    fetchPatrolStats();
    fetchPatrollers();
    fetchMobileUnits();
  }, []);

  // ── Modal open/close ───────────────────────────────────
  const openAddModal = () => {
    setModalMode("add");
    setSelectedUnit(null);
    setMobileUnitName("");
    setSelectedBarangays([]);
    setSelectedPatrollerIds([]);
    setBarangaySearch("");
    setPatrollerCheckSearch("");
    fetchAvailablePatrollers();
    setShowModal(true);
  };

  const openEditModal = (unit) => {
    setModalMode("edit");
    setSelectedUnit(unit);
    setMobileUnitName(unit.mobile_unit_name || "");
    // barangay_area may be stored as comma-separated string or array
    const brgys = Array.isArray(unit.barangay_area)
      ? unit.barangay_area
      : (unit.barangay_area ? unit.barangay_area.split(", ") : []);
    setSelectedBarangays(brgys);
    const existingIds = (unit.patrollers || []).map((p) => p.active_patroller_id);
    setSelectedPatrollerIds(existingIds);
    setBarangaySearch("");
    setPatrollerCheckSearch("");
    fetchAvailablePatrollers();
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedUnit(null);
    setSelectedPatrollerIds([]);
    setSelectedBarangays([]);
    setBarangaySearch("");
    setPatrollerCheckSearch("");
    setBarangayOpen(false);
  };

  // ── Barangay toggle ────────────────────────────────────
  const toggleBarangay = (brgy) => {
    setSelectedBarangays((prev) =>
      prev.includes(brgy) ? prev.filter((b) => b !== brgy) : [...prev, brgy]
    );
    setBarangaySearch(""); // clear search after selecting
  };

  const removeBarangay = (brgy) => {
    setSelectedBarangays((prev) => prev.filter((b) => b !== brgy));
  };

  // ── Patroller toggle ───────────────────────────────────
  const togglePatroller = (id) => {
    setSelectedPatrollerIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

   // ── Delete ─────────────────────────────────────────────
  const handleDelete = async (id) => {
  if (!confirm("Are you sure you want to delete this mobile unit?")) return;
  try {
    const res = await fetch(`${API_BASE}/patrol/mobile-units/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token()}` },
    });
    const data = await res.json();
    if (data.success) {
      fetchMobileUnits();
      fetchPatrolStats();
      fetchPatrollers();
    } else {
      alert(data.message || "Something went wrong.");
    }
  } catch (err) { console.error("Delete error:", err); }
};
  // ── Submit ─────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!mobileUnitName || selectedBarangays.length === 0) {
      alert("Please fill in the mobile unit name and select at least one barangay.");
      return;
    }
    try {
      const url = modalMode === "add"
        ? `${API_BASE}/patrol/mobile-units`
        : `${API_BASE}/patrol/mobile-units/${selectedUnit.mobile_unit_id}`;

      const res = await fetch(url, {
        method: modalMode === "add" ? "POST" : "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token()}`,
        },
        body: JSON.stringify({
          mobile_unit_name: mobileUnitName,
          barangay_area: selectedBarangays.join(", "),
          patroller_ids: selectedPatrollerIds,
        }),
      });

      const data = await res.json();
      if (data.success) {
        closeModal();
        fetchMobileUnits();
        fetchPatrolStats();
        fetchPatrollers();
      } else {
        alert(data.message || "Something went wrong.");
      }
    } catch (err) { console.error("Submit error:", err); }
  };

  // ── Helpers ────────────────────────────────────────────
  const getInitials = (name) => name ? name.substring(0, 2).toUpperCase() : "NA";
  const formatTime  = (ts)   => ts   ? new Date(ts).toLocaleString()       : "No Data";

  const getStatusClass = (status) => {
    if (!status) return "";
    const s = status.toLowerCase();
    if (s === "active")   return "badge-active";
    if (s === "off-duty") return "badge-offduty";
    if (s === "inactive") return "badge-inactive";
    return "";
  };

  // Filtered lists
  const filteredPatrollers = patrollers.filter((o) =>
    (o.officer_name || "").toLowerCase().includes(patrollerSearch.toLowerCase())
  );

  const filteredBarangays = BARANGAY_LIST.filter((b) =>
    b.toLowerCase().includes(barangaySearch.toLowerCase()) &&
    !selectedBarangays.includes(b)
  );

  const modalPatrollerList = (
    modalMode === "edit" && selectedUnit
      ? [
          ...availablePatrollers,
          ...(selectedUnit.patrollers || []).filter(
            (p) => !availablePatrollers.find((a) => a.active_patroller_id === p.active_patroller_id)
          ),
        ]
      : availablePatrollers
  ).filter((p) =>
    (p.officer_name || "").toLowerCase().includes(patrollerCheckSearch.toLowerCase())
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
            <div className="stat-card-icon icon-green">🛡️</div>
            <div className="stat-value">{stats.assigned_patrollers}</div>
            <div className="stat-label">Assigned Patrollers</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-icon icon-yellow">⚠️</div>
            <div className="stat-value">{stats.unassigned_patrollers}</div>
            <div className="stat-label">Unassigned Patrollers</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-icon icon-gray">🚓</div>
            <div className="stat-value">{stats.mobile_units}</div>
            <div className="stat-label">Total Mobile Units</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-icon icon-blue">👮</div>
            <div className="stat-value">{stats.total_officers}</div>
            <div className="stat-label">Total Officers</div>
          </div>
        </div>

        {/* TABLE CARD */}
        <div className="table-card">
          <div className="table-header">
            <div className="table-toggle">
              <button
                className={`toggle-btn ${activeTable === "patrollers" ? "toggle-active" : ""}`}
                onClick={() => setActiveTable("patrollers")}
              >
                👮 Active Patrollers
              </button>
              <button
                className={`toggle-btn ${activeTable === "mobile" ? "toggle-active" : ""}`}
                onClick={() => setActiveTable("mobile")}
              >
                🚓 Mobile Units
              </button>
            </div>

            <div className="table-header-right">
              {/* Search bar — only on patrollers tab */}
              {activeTable === "patrollers" && (
                <div className="search-box">
                  <span className="search-icon">🔍</span>
                  <input
                    type="text"
                    placeholder="Search officer..."
                    value={patrollerSearch}
                    onChange={(e) => setPatrollerSearch(e.target.value)}
                  />
                </div>
              )}
              {activeTable === "mobile" && (
                <button className="add-btn" onClick={openAddModal}>
                  + Add Mobile Unit
                </button>
              )}
            </div>
          </div>

          {/* PATROLLERS TABLE */}
          {activeTable === "patrollers" && (
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Officer</th>
                    <th>Mobile Unit Assigned</th>
                    <th>Status</th>
                    <th>Last Login</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPatrollers.length === 0 ? (
                    <tr><td colSpan={4} className="empty-row">No patrollers found.</td></tr>
                  ) : (
                    filteredPatrollers.map((officer, index) => (
                      <tr key={officer.officer_id || index}>
                        <td>
                          <div className="officer-info">
                            <div className="officer-avatar">{getInitials(officer.officer_name)}</div>
                            <div className="officer-name">{officer.officer_name || "Unknown"}</div>
                          </div>
                        </td>
                        <td>
                          {officer.mobile_unit_assigned
                            ? <span className="unit-badge">🚓 {officer.mobile_unit_assigned}</span>
                            : <span className="unassigned-badge">Unassigned</span>
                          }
                        </td>
                        <td>
                          <span className={`status-badge ${getStatusClass(officer.status)}`}>
                            {officer.status || "—"}
                          </span>
                        </td>
                        <td><span className="time-badge">{formatTime(officer.last_login)}</span></td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* MOBILE UNITS TABLE */}
          {activeTable === "mobile" && (
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Mobile Unit</th>
                    <th>Patrollers</th>
                    <th>Barangay Area</th>
                    <th>Created At</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {mobileUnits.length === 0 ? (
                    <tr><td colSpan={5} className="empty-row">No mobile units found.</td></tr>
                  ) : (
                    mobileUnits.map((unit, index) => (
                      <tr key={unit.mobile_unit_id || index}>
                        <td><span className="unit-badge">🚓 {unit.mobile_unit_name}</span></td>
                        <td>
                          {unit.patrollers && unit.patrollers.length > 0 ? (
                            <div className="patroller-stack">
                              {unit.patrollers.map((p) => (
                                <div key={p.active_patroller_id} className="patroller-row">
                                  <div className="officer-avatar sm">{getInitials(p.officer_name)}</div>
                                  <span className="officer-name">{p.officer_name}</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="unassigned-badge">No patrollers</span>
                          )}
                        </td>
                        <td>
                          {unit.barangay_area
                            ? <div className="barangay-cell">{unit.barangay_area}</div>
                            : "—"
                          }
                        </td>
                        <td><span className="time-badge">{formatTime(unit.created_at)}</span></td>
                        <td>
                          <button className="edit-btn" onClick={() => openEditModal(unit)}>
  ✏️ Edit
</button>
<button className="delete-btn" onClick={() => handleDelete(unit.mobile_unit_id)}>
  🗑️ Delete
</button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── MODAL ── */}
      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>

            <div className="modal-header">
              <h3>{modalMode === "add" ? "➕ Add Mobile Unit" : "✏️ Edit Mobile Unit"}</h3>
              <button className="modal-close" onClick={closeModal}>✕</button>
            </div>

            <div className="modal-body">

              {/* Mobile Unit Name */}
              <div className="form-group">
                <label>Mobile Unit Name <span className="required">*</span></label>
                <input
                  type="text"
                  value={mobileUnitName}
                  onChange={(e) => setMobileUnitName(e.target.value)}
                  placeholder="e.g. Mobile 1"
                />
              </div>

              {/* ── Barangay searchable multi-select ── */}
              <div className="form-group">
                <label>
                  Barangay Area <span className="required">*</span>
                  {selectedBarangays.length > 0 && (
                    <span className="selected-count"> ({selectedBarangays.length} selected)</span>
                  )}
                </label>

                {/* Selected barangay tags */}
                {selectedBarangays.length > 0 && (
                  <div className="tag-list">
                    {selectedBarangays.map((brgy) => (
                      <span key={brgy} className="tag">
                        {brgy}
                        <button className="tag-remove" onClick={() => removeBarangay(brgy)}>✕</button>
                      </span>
                    ))}
                  </div>
                )}

                {/* Search input + dropdown */}
                <div className="search-select" ref={barangayRef}>
                  <input
                    type="text"
                    placeholder="Search barangay..."
                    value={barangaySearch}
                    onChange={(e) => setBarangaySearch(e.target.value)}
                    onFocus={() => setBarangayOpen(true)}
                  />
                  {barangayOpen && filteredBarangays.length > 0 && (
                    <div className="search-dropdown">
                      {filteredBarangays.map((brgy) => (
                        <div
                          key={brgy}
                          className="search-dropdown-item"
                          onMouseDown={() => {
                            toggleBarangay(brgy);
                            setBarangayOpen(true);
                          }}
                        >
                          {brgy}
                        </div>
                      ))}
                    </div>
                  )}
                  {barangayOpen && filteredBarangays.length === 0 && barangaySearch && (
                    <div className="search-dropdown">
                      <div className="search-dropdown-empty">No results found</div>
                    </div>
                  )}
                </div>
              </div>

              {/* ── Patroller searchable checklist ── */}
              <div className="form-group">
                <label>
                  Assign Patrollers
                  {selectedPatrollerIds.length > 0 && (
                    <span className="selected-count"> ({selectedPatrollerIds.length} selected)</span>
                  )}
                </label>

                {/* Patroller search */}
                <div className="checklist-search">
                  <span className="search-icon">🔍</span>
                  <input
                    type="text"
                    placeholder="Search patroller..."
                    value={patrollerCheckSearch}
                    onChange={(e) => setPatrollerCheckSearch(e.target.value)}
                  />
                </div>

                {modalPatrollerList.length === 0 ? (
                  <div className="empty-patrollers">
                    {patrollerCheckSearch ? "No matching patrollers." : "No available patrollers."}
                  </div>
                ) : (
                  <div className="patroller-checklist">
                    {modalPatrollerList.map((p) => {
                      const isSelected = selectedPatrollerIds.includes(p.active_patroller_id);
                      return (
                        <div
                          key={p.active_patroller_id}
                          className={`patroller-check-item ${isSelected ? "checked" : ""}`}
                          onClick={() => togglePatroller(p.active_patroller_id)}
                        >
                          <div className="officer-avatar sm">{getInitials(p.officer_name)}</div>
                          <span className="officer-name">{p.officer_name}</span>
                          <div className={`check-indicator ${isSelected ? "check-on" : ""}`}>
                            {isSelected ? "✓" : ""}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
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
    </div>
  );
};

export default PatrollerDashboard;