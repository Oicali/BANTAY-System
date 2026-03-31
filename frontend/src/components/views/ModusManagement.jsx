import React, { useState, useEffect } from "react";
import "./ModusManagement.css";
import LoadingModal from "../modals/LoadingModal";

const API_URL = `${import.meta.env.VITE_API_URL}/modus-management`;
const INDEX_CRIMES = [
  "MURDER",
  "HOMICIDE",
  "PHYSICAL INJURIES",
  "RAPE",
  "ROBBERY",
  "THEFT",
  "CARNAPPING - MC",
  "CARNAPPING - MV",
  "SPECIAL COMPLEX CRIME",
];

const ITEMS_PER_PAGE = 15;

const emptyForm = { crime_type: "", modus_name: "", description: "" };

const EditIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);

const RemoveIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="10" />
    <line x1="8" y1="12" x2="16" y2="12" />
  </svg>
);

const RestoreIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="1 4 1 10 7 10" />
    <path d="M3.51 15a9 9 0 1 0 .49-3.24" />
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
  const [filterStatus, setFilterStatus] = useState("active");
  const [sortBy, setSortBy] = useState("");
  const [toast, setToast] = useState(null);
  const [confirmModal, setConfirmModal] = useState({
    show: false,
    id: null,
    name: "",
    action: null,
  });
  const [currentPage, setCurrentPage] = useState(1);

  const token = () => localStorage.getItem("token");

  useEffect(() => {
    fetchModus();
  }, [sortBy]);

  const fetchModus = async () => {
    try {
      setLoading(true);
      const url = sortBy ? `${API_URL}?sort_by=${sortBy}` : API_URL;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token()}` },
      });
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
    setForm({
      crime_type: m.crime_type,
      modus_name: m.modus_name,
      description: m.description || "",
    });
    setErrors({});
    setEditingId(m.id);
    setShowModal(true);
  };

  const validate = () => {
    const e = {};
    if (!form.crime_type) e.crime_type = "Required";
    if (!form.modus_name || form.modus_name.trim().length === 0)
      e.modus_name = "Required";
    else if (form.modus_name.trim().length < 2)
      e.modus_name = "At least 2 characters";
    return e;
  };

  const handleSubmit = async () => {
    const e = validate();
    if (Object.keys(e).length > 0) {
      setErrors(e);
      return;
    }
    try {
      const url = editingId ? `${API_URL}/${editingId}` : API_URL;
      const method = editingId ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token()}`,
        },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.success) {
        showToast(
          editingId
            ? "Modus updated successfully!"
            : "Modus added successfully!",
        );
        setShowModal(false);
        fetchModus();
      } else {
        showToast(data.message || "Error", "error");
      }
    } catch (err) {
      showToast("Request failed", "error");
    }
  };

  const handleRemove = (m) => {
    setConfirmModal({
      show: true,
      id: m.id,
      name: m.modus_name,
      action: "remove",
    });
  };

  const handleRestore = (m) => {
    setConfirmModal({
      show: true,
      id: m.id,
      name: m.modus_name,
      action: "restore",
    });
  };

  const confirmAction = async () => {
    const { id, action } = confirmModal;
    setConfirmModal({ show: false, id: null, name: "", action: null });
    try {
      const res = await fetch(`${API_URL}/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token()}`,
        },
        body: JSON.stringify({ is_active: action === "restore" }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(
          action === "restore"
            ? "Modus restored successfully!"
            : "Modus removed successfully!",
        );
        fetchModus();
      } else {
        showToast(data.message || "Error", "error");
      }
    } catch (err) {
      showToast("Request failed", "error");
    }
  };

  const filtered = modusList.filter((m) => {
    const crimeMatch = filterCrime ? m.crime_type === filterCrime : true;
    const statusMatch =
      filterStatus === "active"
        ? m.is_active
        : filterStatus === "removed"
          ? !m.is_active
          : true;
    return crimeMatch && statusMatch;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const paginated = filtered.slice(
    (safePage - 1) * ITEMS_PER_PAGE,
    safePage * ITEMS_PER_PAGE,
  );

  const handleFilterChange = (setter) => (e) => {
    setter(e.target.value);
    setCurrentPage(1);
  };

  const handlePageChange = (page) => {
    if (page < 1 || page > totalPages) return;
    setCurrentPage(page);
  };

  return (
    <div className="mm-container">
      {/* TOAST */}
      {toast && (
        <div
          className={`um-toast ${toast.type === "success" ? "um-toast-success" : "um-toast-error"}`}
          style={{ zIndex: 99999 }}
        >
          <div className="um-toast-content">
            <svg
              className="um-toast-icon"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              {toast.type === "success" ? (
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              ) : (
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              )}
            </svg>
            <span>{toast.msg}</span>
          </div>
        </div>
      )}

      <div className="mm-header">
        <div>
          <h1>Modus Management</h1>
          <p>Manage modus operandi classifications for index crimes</p>
        </div>
        <button className="mm-btn-primary" onClick={openAdd}>
          + Add Modus
        </button>
      </div>

      <div className="mm-filter-bar">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            marginRight: "4px",
            whiteSpace: "nowrap",
          }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="13"
            height="13"
            fill="none"
            stroke="var(--navy-primary)"
            strokeWidth="2.5"
            viewBox="0 0 24 24"
          >
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
          </svg>
          <span
            style={{
              fontSize: "11px",
              fontWeight: "700",
              color: "var(--navy-primary)",
              textTransform: "uppercase",
              letterSpacing: "1px",
            }}
          >
            Filter
          </span>
        </div>
        <select
          className="mm-filter-select"
          value={filterCrime}
          onChange={handleFilterChange(setFilterCrime)}
        >
          <option value="">All Crime Types</option>
          {INDEX_CRIMES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <select
          className="mm-filter-select"
          value={sortBy}
          onChange={handleFilterChange(setSortBy)}
        >
          <option value="">Sort: Default</option>
          <option value="created_at">Sort: Newest First</option>
          <option value="created_at_asc">Sort: Oldest First</option>
        </select>

        <select
          className="mm-filter-select"
          value={filterStatus}
          onChange={handleFilterChange(setFilterStatus)}
        >
          <option value="active">Status: Active</option>
          <option value="removed">Status: Removed</option>
          <option value="all">Status: All</option>
        </select>
      </div>

      <div className="mm-table-card">
        <div className="mm-table-wrapper">
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
                <LoadingModal isOpen={true} message={"Loading all modi..."} />
              ) : paginated.length === 0 ? (
                <tr>
                  <td colSpan="6" className="mm-center">
                    No records found
                  </td>
                </tr>
              ) : (
                paginated.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <span className="mm-crime-badge">{m.crime_type}</span>
                    </td>
                    <td>
                      <strong>{m.modus_name}</strong>
                    </td>
                    <td className="mm-desc">{m.description || "—"}</td>
                    <td>
                      <span
                        className={`mm-status ${m.is_active ? "active" : "inactive"}`}
                      >
                        {m.is_active ? "Active" : "Removed"}
                      </span>
                    </td>
                    <td>
                      {m.created_at
                        ? new Date(m.created_at).toLocaleDateString()
                        : "—"}
                    </td>
                    <td>
                      <div className="mm-actions">
                        <button
                          className="mm-action-btn mm-action-btn-edit"
                          onClick={() => openEdit(m)}
                        >
                          <EditIcon /> Edit
                        </button>
                        {m.is_active ? (
                          <button
                            className="mm-action-btn mm-action-btn-remove"
                            onClick={() => handleRemove(m)}
                          >
                            <RemoveIcon /> Remove
                          </button>
                        ) : (
                          <button
                            className="mm-action-btn mm-action-btn-restore"
                            onClick={() => handleRestore(m)}
                          >
                            <RestoreIcon /> Restore
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {filtered.length > 0 && (
          <div className="mm-pagination">
            <div className="mm-pagination-info">
              Showing{" "}
              {Math.min((safePage - 1) * ITEMS_PER_PAGE + 1, filtered.length)}–
              {Math.min(safePage * ITEMS_PER_PAGE, filtered.length)} of{" "}
              {filtered.length} record(s)
            </div>
            <div className="mm-pagination-controls">
              <button
                className="mm-pagination-btn"
                onClick={() => handlePageChange(safePage - 1)}
                disabled={safePage === 1}
              >
                Previous
              </button>
              <span className="mm-pagination-current">
                Page {safePage} of {totalPages || 1}
              </span>
              <button
                className="mm-pagination-btn"
                onClick={() => handlePageChange(safePage + 1)}
                disabled={safePage === totalPages}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="mm-modal-overlay">
          <div
            className="mm-modal"
            style={{ maxWidth: "620px", width: "92vw" }}
          >
            <div className="mm-modal-header">
              <div
                style={{ display: "flex", alignItems: "center", gap: "14px" }}
              >
                <div
                  style={{
                    width: "42px",
                    height: "42px",
                    borderRadius: "10px",
                    background: "rgba(255,255,255,0.15)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    border: "1px solid rgba(255,255,255,0.2)",
                  }}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="white"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    {editingId ? (
                      <>
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </>
                    ) : (
                      <>
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                      </>
                    )}
                  </svg>
                </div>
                <div>
                  <h2
                    style={{
                      margin: 0,
                      fontSize: "18px",
                      fontWeight: 700,
                      color: "white",
                    }}
                  >
                    {editingId
                      ? "Edit Modus Operandi"
                      : "Add New Modus Operandi"}
                  </h2>
                  <p
                    style={{
                      margin: 0,
                      fontSize: "12px",
                      color: "rgba(255,255,255,0.6)",
                      marginTop: "3px",
                    }}
                  >
                    {editingId
                      ? "Modify existing modus operandi record"
                      : "Register a new modus operandi classification"}
                  </p>
                </div>
              </div>
              <span
                className="mm-modal-close"
                onClick={() => setShowModal(false)}
              >
                &times;
              </span>
            </div>
            <div
              className="mm-modal-body"
              style={{ padding: "28px 32px", gap: "24px" }}
            >
              {/* Crime Type */}
              <div className="mm-form-group">
                <label
                  style={{
                    fontSize: "12px",
                    fontWeight: 700,
                    color: "#374151",
                    textTransform: "uppercase",
                    letterSpacing: "0.6px",
                  }}
                >
                  Crime Type{" "}
                  <span style={{ color: "var(--red-primary)" }}>*</span>
                </label>
                <p
                  style={{
                    margin: "0 0 8px",
                    fontSize: "12px",
                    color: "#9ca3af",
                  }}
                >
                  Select the index crime this modus falls under
                </p>
                <select
                  className={`mm-input ${errors.crime_type ? "error" : ""}`}
                  value={form.crime_type}
                  style={{ height: "44px", fontSize: "14px" }}
                  onChange={(e) => {
                    setForm((p) => ({ ...p, crime_type: e.target.value }));
                    setErrors((p) => ({ ...p, crime_type: "" }));
                  }}
                >
                  <option value="">— Select Crime Type —</option>
                  {INDEX_CRIMES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>

                {errors.crime_type && (
                  <span className="mm-error">{errors.crime_type}</span>
                )}
              </div>

              {/* Modus Name */}
              <div className="mm-form-group">
                <label
                  style={{
                    fontSize: "12px",
                    fontWeight: 700,
                    color: "#374151",
                    textTransform: "uppercase",
                    letterSpacing: "0.6px",
                  }}
                >
                  Modus Name{" "}
                  <span style={{ color: "var(--red-primary)" }}>*</span>
                </label>
                <p
                  style={{
                    margin: "0 0 8px",
                    fontSize: "12px",
                    color: "#9ca3af",
                  }}
                >
                  Common name or terminology used (e.g., Akyat Bahay,
                  Budol-Budol)
                </p>
                <input
                  type="text"
                  className={`mm-input ${errors.modus_name ? "error" : ""}`}
                  placeholder="e.g., Akyat Bahay"
                  value={form.modus_name}
                  maxLength="100"
                  style={{ height: "44px", fontSize: "14px" }}
                  onChange={(e) => {
                    setForm((p) => ({ ...p, modus_name: e.target.value }));
                    setErrors((p) => ({ ...p, modus_name: "" }));
                  }}
                />
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginTop: "5px",
                  }}
                >
                  {errors.modus_name ? (
                    <span className="mm-error">{errors.modus_name}</span>
                  ) : (
                    <span />
                  )}
                  <span style={{ fontSize: "11px", color: "#9ca3af" }}>
                    {form.modus_name.length}/100
                  </span>
                </div>
              </div>

              {/* Description */}
              <div className="mm-form-group">
                <label
                  style={{
                    fontSize: "12px",
                    fontWeight: 700,
                    color: "#374151",
                    textTransform: "uppercase",
                    letterSpacing: "0.6px",
                  }}
                >
                  Description{" "}
                  <span
                    style={{
                      color: "#9ca3af",
                      fontWeight: 400,
                      textTransform: "none",
                    }}
                  >
                    (optional)
                  </span>
                </label>
                <p
                  style={{
                    margin: "0 0 8px",
                    fontSize: "12px",
                    color: "#9ca3af",
                  }}
                >
                  Brief explanation of how this modus is typically carried out
                </p>
                <textarea
                  className="mm-input"
                  rows="4"
                  placeholder="Describe how this modus operandi is typically carried out..."
                  value={form.description}
                  maxLength="500"
                  style={{
                    fontSize: "14px",
                    resize: "vertical",
                    minHeight: "100px",
                  }}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, description: e.target.value }))
                  }
                />
                <div
                  style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    marginTop: "5px",
                  }}
                >
                  <span
                    style={{
                      fontSize: "11px",
                      color:
                        form.description.length > 450 ? "#dc2626" : "#9ca3af",
                    }}
                  >
                    {form.description.length}/500
                  </span>
                </div>
              </div>
            </div>
            <div className="mm-modal-footer">
              <button
                className="mm-btn-secondary"
                onClick={() => setShowModal(false)}
              >
                Cancel
              </button>
              <button className="mm-btn-primary" onClick={handleSubmit}>
                {editingId ? "Update" : "Add Modus"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Remove / Restore Confirm Modal */}
      {confirmModal.show && (
        <div className="mm-modal-overlay" style={{ zIndex: 10000 }}>
          <div className="mm-modal" style={{ maxWidth: "440px", padding: 0 }}>
            {/* Header */}
            <div
              style={{
                padding: "20px 24px",
                background:
                  confirmModal.action === "remove"
                    ? "linear-gradient(135deg, #7f1d1d 0%, #dc2626 100%)"
                    : "linear-gradient(135deg, #064e3b 0%, #059669 100%)",
                borderRadius: "8px 8px 0 0",
                display: "flex",
                alignItems: "center",
                gap: "12px",
              }}
            >
              <div
                style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "8px",
                  background: "rgba(255,255,255,0.15)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                {confirmModal.action === "remove" ? (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="white"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <line x1="8" y1="12" x2="16" y2="12" />
                  </svg>
                ) : (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="white"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="1 4 1 10 7 10" />
                    <path d="M3.51 15a9 9 0 1 0 .49-3.24" />
                  </svg>
                )}
              </div>
              <div>
                <h3
                  style={{
                    margin: 0,
                    fontSize: "16px",
                    fontWeight: 700,
                    color: "white",
                  }}
                >
                  {confirmModal.action === "remove"
                    ? "Remove Modus"
                    : "Restore Modus"}
                </h3>
                <p
                  style={{
                    margin: 0,
                    fontSize: "12px",
                    color: "rgba(255,255,255,0.7)",
                    marginTop: "2px",
                  }}
                >
                  {confirmModal.action === "remove"
                    ? "This will disable the modus from use"
                    : "This will re-enable the modus for use"}
                </p>
              </div>
              <span
                onClick={() =>
                  setConfirmModal({
                    show: false,
                    id: null,
                    name: "",
                    action: null,
                  })
                }
                style={{
                  marginLeft: "auto",
                  color: "white",
                  fontSize: "24px",
                  cursor: "pointer",
                  opacity: 0.8,
                  lineHeight: 1,
                }}
              >
                &times;
              </span>
            </div>

            {/* Body */}
            <div style={{ padding: "24px" }}>
              {confirmModal.action === "remove" ? (
                <p
                  style={{
                    margin: 0,
                    fontSize: "14px",
                    color: "#374151",
                    lineHeight: "1.7",
                  }}
                >
                  Are you sure you want to remove{" "}
                  <strong style={{ color: "#b91c1c" }}>
                    {confirmModal.name}
                  </strong>
                  ?<br />
                  <span style={{ color: "#6b7280", fontSize: "13px" }}>
                    It will be marked as <em>Removed</em> and hidden from active
                    use. You can restore it anytime.
                  </span>
                </p>
              ) : (
                <p
                  style={{
                    margin: 0,
                    fontSize: "14px",
                    color: "#374151",
                    lineHeight: "1.7",
                  }}
                >
                  Are you sure you want to restore{" "}
                  <strong style={{ color: "#047857" }}>
                    {confirmModal.name}
                  </strong>
                  ?<br />
                  <span style={{ color: "#6b7280", fontSize: "13px" }}>
                    It will be marked as <em>Active</em> and available for use
                    in reports.
                  </span>
                </p>
              )}
            </div>

            {/* Footer */}
            <div
              style={{
                padding: "16px 24px",
                borderTop: "1px solid #e5e7eb",
                display: "flex",
                gap: "12px",
                justifyContent: "flex-end",
                background: "#f9fafb",
                borderRadius: "0 0 8px 8px",
              }}
            >
              <button
                className="mm-btn-secondary"
                onClick={() =>
                  setConfirmModal({
                    show: false,
                    id: null,
                    name: "",
                    action: null,
                  })
                }
              >
                Cancel
              </button>
              <button
                className={
                  confirmModal.action === "remove"
                    ? "mm-btn-danger"
                    : "mm-btn-success"
                }
                onClick={confirmAction}
              >
                {confirmModal.action === "remove"
                  ? "Yes, Remove"
                  : "Yes, Restore"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ModusManagement;
