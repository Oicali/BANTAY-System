import React, { useState, useEffect } from "react";
import "./ModusManagement.css";

const API_URL = "http://localhost:5000/modus-management";
const INDEX_CRIMES = [
  "MURDER", "HOMICIDE", "PHYSICAL INJURIES", "RAPE",
  "ROBBERY", "THEFT", "CARNAPPING - MC", "CARNAPPING - MV", "SPECIAL COMPLEX CRIME"
];

const emptyForm = { crime_type: "", modus_name: "", description: "", is_active: true };
const EditIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2.2"
    strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>
);

const ToggleIcon = ({ active }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2.2"
    strokeLinecap="round" strokeLinejoin="round">
    {active
      ? <><rect x="1" y="5" width="22" height="14" rx="7"/><circle cx="16" cy="12" r="3" fill="currentColor"/></>
      : <><rect x="1" y="5" width="22" height="14" rx="7"/><circle cx="8" cy="12" r="3" fill="currentColor"/></>
    }
  </svg>
);

const DeleteIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2.2"
    strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/>
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
    <path d="M10 11v6M14 11v6"/>
    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
  </svg>
);
function ModusManagement() {
  const [modusList, setModusList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState({});
  const [filterCrime, setFilterCrime] = useState("");
  const [toast, setToast] = useState(null);

  const token = () => localStorage.getItem("token");

  useEffect(() => { fetchModus(); }, []);

  const fetchModus = async () => {
    try {
      setLoading(true);
      const res = await fetch(API_URL, { headers: { Authorization: `Bearer ${token()}` } });
      const data = await res.json();
      if (data.success) setModusList(data.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const openAdd = () => {
    setForm(emptyForm);
    setErrors({});
    setEditingId(null);
    setShowModal(true);
  };

  const openEdit = (m) => {
    setForm({ crime_type: m.crime_type, modus_name: m.modus_name, description: m.description || "", is_active: m.is_active });
    setErrors({});
    setEditingId(m.id);
    setShowModal(true);
  };

  const validate = () => {
    const e = {};
    if (!form.crime_type) e.crime_type = "Required";
    if (!form.modus_name || form.modus_name.trim().length === 0) e.modus_name = "Required";
    else if (form.modus_name.trim().length < 2) e.modus_name = "At least 2 characters";
    return e;
  };

  const handleSubmit = async () => {
    const e = validate();
    if (Object.keys(e).length > 0) { setErrors(e); return; }

    try {
      const url = editingId ? `${API_URL}/${editingId}` : API_URL;
      const method = editingId ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.success) {
        showToast(editingId ? "Modus updated!" : "Modus added!");
        setShowModal(false);
        fetchModus();
      } else {
        showToast(data.message || "Error", "error");
      }
    } catch (err) {
      showToast("Request failed", "error");
    }
  };

  const handleToggle = async (m) => {
    try {
      const res = await fetch(`${API_URL}/${m.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ is_active: !m.is_active }),
      });
      const data = await res.json();
      if (data.success) { showToast(`Modus ${!m.is_active ? "enabled" : "disabled"}!`); fetchModus(); }
    } catch (err) { showToast("Request failed", "error"); }
  };

  const handleDelete = async (m) => {
    if (!window.confirm(`Delete "${m.modus_name}"?`)) return;
    try {
      const res = await fetch(`${API_URL}/${m.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token()}` },
      });
      const data = await res.json();
      if (data.success) { showToast("Modus deleted!"); fetchModus(); }
      else showToast(data.message || "Cannot delete", "error");
    } catch (err) { showToast("Request failed", "error"); }
  };

  const filtered = filterCrime ? modusList.filter(m => m.crime_type === filterCrime) : modusList;

  return (
    <div className="mm-container">
      {toast && <div className={`mm-toast ${toast.type}`}>{toast.msg}</div>}

      <div className="mm-header">
        <div>
          <h1>Modus Management</h1>
          <p>Manage modus operandi classifications for index crimes</p>
        </div>
        <button className="mm-btn-primary" onClick={openAdd}>+ Add Modus</button>
      </div>

      <div className="mm-filter-bar">
        <select className="mm-filter-select" value={filterCrime} onChange={e => setFilterCrime(e.target.value)}>
          <option value="">All Crime Types</option>
          {INDEX_CRIMES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <span className="mm-count">{filtered.length} record(s)</span>
      </div>

      <div className="mm-table-card">
        <table className="mm-table">
          <thead>
            <tr>
              <th>Crime Type</th>
              <th>Modus Name</th>
              <th>Description</th>
              <th>Status</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="6" className="mm-center">Loading...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan="6" className="mm-center">No records found</td></tr>
            ) : filtered.map(m => (
              <tr key={m.id}>
                <td><span className="mm-crime-badge">{m.crime_type}</span></td>
                <td><strong>{m.modus_name}</strong></td>
                <td className="mm-desc">{m.description || "—"}</td>
                <td>
                  <span className={`mm-status ${m.is_active ? "active" : "inactive"}`}>
                    {m.is_active ? "Active" : "Disabled"}
                  </span>
                </td>
                <td>{m.created_at ? new Date(m.created_at).toLocaleDateString() : "—"}</td>
                <td>
                  <div className="mm-actions">
                  <button className="mm-action-btn mm-action-btn-edit" onClick={() => openEdit(m)}>
                    <EditIcon /> Edit
                  </button>
                  <button className="mm-action-btn mm-action-btn-delete" onClick={() => handleDelete(m)}>
                    <DeleteIcon /> Delete
                  </button>
                </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="mm-modal-overlay">
          <div className="mm-modal">
            <div className="mm-modal-header">
              <h2>{editingId ? "Edit Modus" : "Add New Modus"}</h2>
              <span className="mm-modal-close" onClick={() => setShowModal(false)}>&times;</span>
            </div>
            <div className="mm-modal-body">
              <div className="mm-form-group">
                <label>Crime Type *</label>
                <select
                  className={`mm-input ${errors.crime_type ? "error" : ""}`}
                  value={form.crime_type}
                  onChange={e => { setForm(p => ({...p, crime_type: e.target.value})); setErrors(p => ({...p, crime_type: ""})); }}
                >
                  <option value="">Select Crime Type</option>
                  {INDEX_CRIMES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                {errors.crime_type && <span className="mm-error">{errors.crime_type}</span>}
              </div>

              <div className="mm-form-group">
                <label>Modus Name *</label>
                <input
                  type="text"
                  className={`mm-input ${errors.modus_name ? "error" : ""}`}
                  placeholder="e.g., Akyat Bahay"
                  value={form.modus_name}
                  maxLength="100"
                  onChange={e => { setForm(p => ({...p, modus_name: e.target.value})); setErrors(p => ({...p, modus_name: ""})); }}
                />
                {errors.modus_name && <span className="mm-error">{errors.modus_name}</span>}
              </div>

              <div className="mm-form-group">
                <label>Description</label>
                <textarea
                  className="mm-input"
                  rows="3"
                  placeholder="Brief description of this modus..."
                  value={form.description}
                  maxLength="500"
                  onChange={e => setForm(p => ({...p, description: e.target.value}))}
                />
              </div>

              <div className="mm-form-group">
                <label>Status</label>
                <div className="mm-toggle-group">
                  <button type="button" className={`mm-toggle-btn ${form.is_active ? "active" : ""}`} onClick={() => setForm(p => ({...p, is_active: true}))}>Active</button>
                  <button type="button" className={`mm-toggle-btn ${!form.is_active ? "active" : ""}`} onClick={() => setForm(p => ({...p, is_active: false}))}>Disabled</button>
                </div>
              </div>
            </div>
            <div className="mm-modal-footer">
              <button className="mm-btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="mm-btn-primary" onClick={handleSubmit}>{editingId ? "Update" : "Add Modus"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ModusManagement;