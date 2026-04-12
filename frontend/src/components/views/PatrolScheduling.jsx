import { useState, useEffect } from "react";
import "./PatrolScheduling.css";
import BeatCard from "../modals/BeatCard";
import AddPatrolModal from "../modals/AddPatrolModal";
import EditPatrolModal from "../modals/EditPatrolModal";
import Notification from "../modals/Notification";

const API_BASE = import.meta.env.VITE_API_URL;

const parseLocalDate = (d) => {
  if (!d) return null;
  const dt = new Date(d);
  return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
};

const PatrolScheduling = () => {
  const token = () => localStorage.getItem("token");

  const [patrols, setPatrols]                         = useState([]);
  const [mobileUnits, setMobileUnits]                 = useState([]);
  const [availablePatrollers, setAvailablePatrollers] = useState([]);
  const [geoJSONData, setGeoJSONData]                 = useState(null);
  const [loading, setLoading]                         = useState(false);
  const [notif, setNotif]                             = useState(null);
  const [search, setSearch]                           = useState("");

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

  const fetchAvailablePatrollers = async () => {
    try {
      const res  = await fetch(`${API_BASE}/patrol/available-patrollers`, { headers: { Authorization: `Bearer ${token()}` } });
      const data = await res.json();
      if (data.success) setAvailablePatrollers(data.data);
    } catch (err) { console.error("Patrollers error:", err); }
  };

  useEffect(() => { fetchPatrols(); fetchMobileUnits(); }, []);

  const openAddModal = () => {
    fetchAvailablePatrollers();
    setShowAddModal(true);
  };

  const openEditModal = (patrol) => {
    setEditingPatrol(patrol);
    fetchAvailablePatrollers();
    setShowEditModal(true);
  };

  const handleAddSave = async (formData) => {
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
        setNotif({ message: data.message || "Something went wrong.", type: "error" });
      }
    } catch (err) {
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
    if (!confirm("Are you sure you want to delete this patrol?")) return;
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

  const getInitials    = (name) => name ? name.substring(0, 2).toUpperCase() : "NA";
  const getAreaSummary = (routes) => routes?.length
    ? [...new Set(routes.filter((r) => (r.stop_order || 0) <= 0 && r.barangay).map((r) => r.barangay).filter(Boolean))].join(", ") || "—"
    : "—";

  const filteredPatrols = patrols.filter((p) =>
    search
      ? (p.patrol_name || "").toLowerCase().includes(search.toLowerCase()) ||
        (p.mobile_unit_name || "").toLowerCase().includes(search.toLowerCase())
      : true
  );

  return (
    <div className="dash">
      <div className="psch-content-area">

        <div className="psch-page-header">
          <div className="psch-page-header-left">
            <h1>Patrol Scheduling</h1>
            <p>Manage patrol officer schedules and assignments</p>
          </div>
          <button className="psch-btn psch-btn-primary" onClick={openAddModal}>+ Add Patrol</button>
        </div>

        <div className="psch-filters">
          <div className="psch-search-box">
            <input type="text" placeholder="Search patrol name or mobile unit..."
              value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>

        <div className="psch-table-card">
          <div className="psch-table-container">
            <table className="psch-data-table">
              <thead>
                <tr>
                  <th>Patrol Name</th>
                  <th>Mobile Unit</th>
                  <th>Duration</th>
                  <th>Assigned Patrollers</th>
                  <th>Area of Responsibility</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredPatrols.length === 0 ? (
                  <tr><td colSpan={6} className="psch-empty-row">No patrols found.</td></tr>
                ) : filteredPatrols.map((patrol) => (
                  <tr key={patrol.patrol_id}>
                    <td><span className="psch-patrol-name">{patrol.patrol_name}</span></td>
                    <td><span className="psch-unit-text">{patrol.mobile_unit_name || "—"}</span></td>
                    <td><span className="psch-duration-text">{formatDate(patrol.start_date)} — {formatDate(patrol.end_date)}</span></td>
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
                    <td>
                      {getAreaSummary(patrol.routes) !== "—"
                        ? <span className="psch-area-summary">{getAreaSummary(patrol.routes)}</span>
                        : <span className="psch-none-text">No area set</span>}
                    </td>
                    <td>
                      <button className="psch-view-btn"
                        onClick={() => { setBeatCardPatrol(patrol); setShowBeatCard(true); }}>
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showAddModal && (
        <AddPatrolModal
          mobileUnits={mobileUnits}
          availablePatrollers={availablePatrollers}
          geoJSONData={geoJSONData}
          onClose={() => setShowAddModal(false)}
          onSave={handleAddSave}
        />
      )}

      {showEditModal && editingPatrol && (
        <EditPatrolModal
          patrol={editingPatrol}
          mobileUnits={mobileUnits}
          availablePatrollers={availablePatrollers}
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