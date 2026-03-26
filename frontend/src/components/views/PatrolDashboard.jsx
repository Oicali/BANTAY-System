import { useState, useEffect } from "react";
import "./PatrolDashboard.css";
import {
  ShieldCheck,
  AlertTriangle,
  Car,
  Users,
  Search,
  Pencil,
  Trash2,
  User,
  Truck
} from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL;

const VEHICLE_TYPES = ["Car/Sedan", "SUV/Van"];

const PatrollerDashboard = () => {
  const token = () => localStorage.getItem("token");

  // ── Main state ─────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [activeTable, setActiveTable]   = useState("patrollers");
  const [patrollers, setPatrollers]     = useState([]);
  const [mobileUnits, setMobileUnits]   = useState([]);
  const [stats, setStats]               = useState({
    active_patrols_today:  0,
    unassigned_patrollers: 0,
    mobile_units:          0,
    total_officers:        0,
  });

  // ── Search ─────────────────────────────────────────────
  const [patrollerSearch, setPatrollerSearch] = useState("");

  // ── Modal state ────────────────────────────────────────
  const [showModal, setShowModal]       = useState(false);
  const [modalMode, setModalMode]       = useState("add");
  const [selectedUnit, setSelectedUnit] = useState(null);
  const [form, setForm]                 = useState({
    mobile_unit_name: "",
    vehicle_type:     "",
    plate_number:     "",
  });

  // ── Fetchers ───────────────────────────────────────────
  const fetchPatrolStats = async () => {
    try {
      const res  = await fetch(`${API_BASE}/patrol/stats`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      const data = await res.json();
      if (data.success) setStats(data.data);
    } catch (err) { console.error("Stats error:", err); }
  };

  const fetchPatrollers = async () => {
    try {
      const res  = await fetch(`${API_BASE}/patrol/active`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      const data = await res.json();
      if (data.success) setPatrollers(data.data);
    } catch (err) { console.error("Patrollers error:", err); }
  };

  const fetchMobileUnits = async () => {
    try {
      const res  = await fetch(`${API_BASE}/patrol/mobile-units`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      const data = await res.json();
      if (data.success) setMobileUnits(data.data);
    } catch (err) { console.error("Mobile units error:", err); }
  };

  useEffect(() => {
  const loadData = async () => {
    setLoading(true);
    await Promise.all([
      fetchPatrolStats(),
      fetchPatrollers(),
      fetchMobileUnits()
    ]);
    setLoading(false);
  };

  loadData();

  // ✅ Auto refresh every 10 seconds
  const interval = setInterval(loadData, 10000);
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

  const handleFormChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async () => {
    if (!form.mobile_unit_name || !form.vehicle_type || !form.plate_number) {
      alert("Please fill in all required fields.");
      return;
    }
    try {
      const url = modalMode === "add"
        ? `${API_BASE}/patrol/mobile-units`
        : `${API_BASE}/patrol/mobile-units/${selectedUnit.mobile_unit_id}`;

      const res  = await fetch(url, {
        method: modalMode === "add" ? "POST" : "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization:  `Bearer ${token()}`,
        },
        body: JSON.stringify(form),
      });
      const data = await res.json();

      if (data.success) {
        closeModal();
        fetchMobileUnits();
        fetchPatrolStats();
      } else {
        alert(data.message || "Something went wrong.");
      }
    } catch (err) { console.error("Submit error:", err); }
  };

  const handleDelete = async (id) => {
    if (!confirm("Are you sure you want to delete this mobile unit?")) return;
    try {
      const res  = await fetch(`${API_BASE}/patrol/mobile-units/${id}`, {
        method:  "DELETE",
        headers: { Authorization: `Bearer ${token()}` },
      });
      const data = await res.json();
      if (data.success) {
        fetchMobileUnits();
        fetchPatrolStats();
      } else {
        alert(data.message || "Something went wrong.");
      }
    } catch (err) { console.error("Delete error:", err); }
  };

  // ── Helpers ────────────────────────────────────────────
  const getInitials    = (name) => name ? name.substring(0, 2).toUpperCase() : "NA";
  const formatTime     = (ts)   => ts   ? new Date(ts).toLocaleString()       : "No Data";
  const formatDateTime = (ts)   => ts   ? new Date(ts).toLocaleDateString()   : "No Data";

  const getStatusClass = (status) => {
    if (!status) return "";
    const s = status.toLowerCase();
    if (s === "active")   return "badge-active";
    if (s === "off-duty") return "badge-offduty";
    if (s === "inactive") return "badge-inactive";
    return "";
  };

  const filteredPatrollers = patrollers.filter((o) =>
    (o.officer_name || "").toLowerCase().includes(patrollerSearch.toLowerCase())
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
      <div className="stat-icon green">
        <ShieldCheck size={20} />
      </div>
    </div>
    <div className="stat-value">{stats.active_patrols_today}</div>
    <div className="stat-label">Active Patrols Today</div>
  </div>

  <div className="stat-card">
    <div className="stat-card-header">
      <div className="stat-icon yellow">
        <AlertTriangle size={20} />
      </div>
    </div>
    <div className="stat-value">{stats.unassigned_patrollers}</div>
    <div className="stat-label">Unassigned Patrollers</div>
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
          <div className="table-header">
            <div className="table-toggle">
              <button
                className={`toggle-btn ${activeTable === "patrollers" ? "toggle-active" : ""}`}
                onClick={() => setActiveTable("patrollers")}
              >
                Active Patrollers
              </button>
              <button
                className={`toggle-btn ${activeTable === "mobile" ? "toggle-active" : ""}`}
                onClick={() => setActiveTable("mobile")}
              >
                Mobile Units
              </button>
            </div>

            <div className="table-header-right">
              {activeTable === "patrollers" && (
                <div className="search-box">
                 <Search size={16} />
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

          {/* ── PATROLLERS TABLE ── */}
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
                            ? <span className="unit-badge">{officer.mobile_unit_assigned}</span>
                            : <span className="unassigned-badge">Unassigned</span>
                          }
                        </td>
                        <td>
                          <span className={`status-badge ${getStatusClass(officer.status)}`}>
                            {officer.status || "—"}
                          </span>
                        </td>
                        <td>
                          <span className="time-badge">{formatTime(officer.last_login)}</span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* ── MOBILE UNITS TABLE ── */}
          {activeTable === "mobile" && (
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
                  {mobileUnits.length === 0 ? (
                    <tr><td colSpan={5} className="empty-row">No mobile units found.</td></tr>
                  ) : (
                    mobileUnits.map((unit, index) => (
                      <tr key={unit.mobile_unit_id || index}>
                        <td>
                          <span className="unit-badge">{unit.mobile_unit_name}</span>
                        </td>
                        <td>
                          <span className={`vehicle-badge ${unit.vehicle_type === "Car/Sedan" ? "vehicle-car" : "vehicle-suv"}`}>
                            {unit.vehicle_type === "Car/Sedan" ? "" : ""} {unit.vehicle_type}
                          </span>
                        </td>
                        <td>
                          <span className="plate-number">{unit.plate_number}</span>
                        </td>
                        <td>
                          <span className="time-badge">{formatDateTime(unit.created_at)}</span>
                        </td>
                        <td>
                          <div className="action-btns">
                            <button className="edit-btn" onClick={() => openEditModal(unit)}>
                               Edit
                            </button>
                            <button className="delete-btn" onClick={() => handleDelete(unit.mobile_unit_id)}>
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
          )}
        </div>
      </div>

      {/* ── MODAL ── */}
      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>

            <div className="modal-header">
              <h3>{modalMode === "add" ? "Add Mobile Unit" : "Edit Mobile Unit"}</h3>
              <button className="modal-close" onClick={closeModal}>✕</button>
            </div>

            <div className="modal-body">

              {/* Mobile Unit Name */}
              <div className="form-group">
                <label>Mobile Unit Name <span className="required">*</span></label>
                <input
                  type="text"
                  name="mobile_unit_name"
                  value={form.mobile_unit_name}
                  onChange={handleFormChange}
                  placeholder="e.g. Mobile 1"
                />
              </div>

              {/* Vehicle Type */}
              <div className="form-group">
                <label>Vehicle Type <span className="required">*</span></label>
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

              {/* Plate Number */}
              <div className="form-group">
                <label>Plate Number <span className="required">*</span></label>
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
    </div>
  );
};

export default PatrollerDashboard;