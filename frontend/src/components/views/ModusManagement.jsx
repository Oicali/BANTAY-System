import React, { useState, useEffect } from "react";
import "./ModusManagement.css";
import LoadingModal from "../modals/LoadingModal";

const ITEMS_PER_PAGE = 15;
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

const DisableIcon = () => (
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
    <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
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
  const [filterStatus, setFilterStatus] = useState("active"); // default: active only
  const [toast, setToast] = useState(null);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    limit: ITEMS_PER_PAGE,
    totalPages: 1,
  });

  // ── Confirm modal state ───────────────────────────────────────────────────
  const [confirm, setConfirm] = useState({
    visible: false,
    title: "",
    message: "",
    onConfirm: null,
    confirmText: "",
    confirmColor: "",
  });

  const showConfirm = (title, message, onConfirm, confirmText, confirmColor) =>
    setConfirm({
      visible: true,
      title,
      message,
      onConfirm,
      confirmText,
      confirmColor,
    });
  const hideConfirm = () =>
    setConfirm({
      visible: false,
      title: "",
      message: "",
      onConfirm: null,
      confirmText: "",
      confirmColor: "",
    });

  const token = () => localStorage.getItem("token");

  useEffect(() => {
    fetchModus(1);
  }, []);
  useEffect(() => {
    fetchModus(1);
  }, [filterCrime, filterStatus]);

  const fetchModus = async (targetPage = page) => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: targetPage,
        limit: ITEMS_PER_PAGE,
        ...(filterCrime && { crime_type: filterCrime }),
        ...(filterStatus !== "all" && {
          is_active: filterStatus === "active" ? "true" : "false",
        }),
      });
      const res = await fetch(`${API_URL}?${params}`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      const data = await res.json();
      if (data.success) {
        setModusList(data.data);
        setPage(data.pagination.page);
        setPagination(data.pagination);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const goToPage = (p) => {
    if (p < 1 || p > pagination.totalPages) return;
    fetchModus(p);
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
        showToast(editingId ? "Modus updated!" : "Modus added!");
        setShowModal(false);
        fetchModus(page);
      } else {
        showToast(data.message || "Error", "error");
      }
    } catch {
      showToast("Request failed", "error");
    }
  };

  // ── Toggle with confirm modal ─────────────────────────────────────────────
  const handleToggleClick = (m) => {
    if (m.is_active) {
      showConfirm(
        "Disable Modus",
        `Are you sure you want to disable "${m.modus_name}"? It will no longer appear in reports.`,
        () => {
          hideConfirm();
          doToggle(m);
        },
        "Yes, Disable",
        "#c1272d",
      );
    } else {
      showConfirm(
        "Restore Modus",
        `Are you sure you want to restore "${m.modus_name}"? It will be available again in reports.`,
        () => {
          hideConfirm();
          doToggle(m);
        },
        "Yes, Restore",
        "#16a34a",
      );
    }
  };

  const doToggle = async (m) => {
    try {
      const res = await fetch(`${API_URL}/${m.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token()}`,
        },
        body: JSON.stringify({ is_active: !m.is_active }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Modus ${!m.is_active ? "restored!" : "disabled!"}`);
        fetchModus(page);
      } else {
        showToast(data.message || "Error", "error");
      }
    } catch {
      showToast("Request failed", "error");
    }
  };

  return (
    <div className="mm-container">
      {toast && <div className={`mm-toast ${toast.type}`}>{toast.msg}</div>}

      {/* ── Confirm Modal ── */}
      {confirm.visible && (
        <div className="mm-modal-overlay">
          <div className="mm-confirm-modal">
            {/* Icon */}
            <div
              className="mm-confirm-icon-wrap"
              style={{ background: confirm.confirmColor + "18" }}
            >
              <div
                className="mm-confirm-icon"
                style={{
                  background: confirm.confirmColor + "22",
                  color: confirm.confirmColor,
                }}
              >
                {confirm.confirmColor === "#c1272d" ? (
                  <svg
                    width="28"
                    height="28"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                  </svg>
                ) : (
                  <svg
                    width="28"
                    height="28"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="1 4 1 10 7 10" />
                    <path d="M3.51 15a9 9 0 1 0 .49-3.24" />
                  </svg>
                )}
              </div>
            </div>

            {/* Content */}
            <div className="mm-confirm-content">
              <h3 className="mm-confirm-title">{confirm.title}</h3>
              <p className="mm-confirm-message">{confirm.message}</p>
            </div>

            {/* Actions */}
            <div className="mm-confirm-footer">
              <button className="mm-confirm-cancel" onClick={hideConfirm}>
                Cancel
              </button>
              <button
                className="mm-confirm-action"
                style={{ background: confirm.confirmColor }}
                onClick={confirm.onConfirm}
              >
                {confirm.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <div className="mm-header">
        <div>
          <h1>Modus Management</h1>
          <p>Manage modus operandi classifications for index crimes</p>
        </div>
        <button className="mm-btn-primary" onClick={openAdd}>
          + Add Modus
        </button>
      </div>

      {/* ── Filter Bar ── */}
      <div className="mm-filter-bar">
        {/* Crime type filter */}
        <select
          className="mm-filter-select"
          value={filterCrime}
          onChange={(e) => {
            setFilterCrime(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All Crime Types</option>
          {INDEX_CRIMES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        {/* Status filter */}
        <select
          className="mm-filter-select"
          value={filterStatus}
          onChange={(e) => {
            setFilterStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="active">Active Only</option>
          <option value="disabled">Disabled Only</option>
          <option value="all">All Status</option>
        </select>

        <span className="mm-count">{pagination.total} record(s)</span>
      </div>

      {/* ── Table ── */}
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
              <LoadingModal isOpen={true} message={"Loading all modi..."} />
            ) : modusList.length === 0 ? (
              <tr>
                <td colSpan="6" className="mm-center">
                  No records found
                </td>
              </tr>
            ) : (
              modusList.map((m) => (
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
                      {m.is_active ? "Active" : "Disabled"}
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
                          className="mm-action-btn mm-action-btn-disable"
                          onClick={() => handleToggleClick(m)}
                        >
                          <DisableIcon /> Disable
                        </button>
                      ) : (
                        <button
                          className="mm-action-btn mm-action-btn-restore"
                          onClick={() => handleToggleClick(m)}
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

        {/* ── Pagination ── */}
        {pagination.total > 0 && (
          <div className="mm-pagination">
            <div className="mm-pagination-info">
              Showing {(page - 1) * ITEMS_PER_PAGE + 1}–
              {Math.min(page * ITEMS_PER_PAGE, pagination.total)} of{" "}
              {pagination.total} records
            </div>
            <div className="mm-pagination-controls">
              <button
                className="mm-pagination-btn"
                onClick={() => goToPage(page - 1)}
                disabled={page <= 1}
              >
                Previous
              </button>
              <span className="mm-pagination-current">
                Page {page} of {pagination.totalPages}
              </span>
              <button
                className="mm-pagination-btn"
                onClick={() => goToPage(page + 1)}
                disabled={page >= pagination.totalPages}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Add/Edit Modal ── */}
      {showModal && (
        <div className="mm-modal-overlay">
          <div className="mm-modal">
            <div className="mm-modal-header">
              <h2>{editingId ? "Edit Modus" : "Add New Modus"}</h2>
              <span
                className="mm-modal-close"
                onClick={() => setShowModal(false)}
              >
                &times;
              </span>
            </div>
            <div className="mm-modal-body">
              <div className="mm-form-group">
                <label>Crime Type *</label>
                <select
                  className={`mm-input ${errors.crime_type ? "error" : ""}`}
                  value={form.crime_type}
                  onChange={(e) => {
                    setForm((p) => ({ ...p, crime_type: e.target.value }));
                    setErrors((p) => ({ ...p, crime_type: "" }));
                  }}
                >
                  <option value="">Select Crime Type</option>
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

              <div className="mm-form-group">
                <label>Modus Name *</label>
                <input
                  type="text"
                  className={`mm-input ${errors.modus_name ? "error" : ""}`}
                  placeholder="e.g., Akyat Bahay"
                  value={form.modus_name}
                  maxLength="100"
                  onChange={(e) => {
                    setForm((p) => ({ ...p, modus_name: e.target.value }));
                    setErrors((p) => ({ ...p, modus_name: "" }));
                  }}
                />
                {errors.modus_name && (
                  <span className="mm-error">{errors.modus_name}</span>
                )}
              </div>

              <div className="mm-form-group">
                <label>Description</label>
                <textarea
                  className="mm-input"
                  rows="3"
                  placeholder="Brief description of this modus..."
                  value={form.description}
                  maxLength="500"
                  onChange={(e) =>
                    setForm((p) => ({ ...p, description: e.target.value }))
                  }
                />
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
    </div>
  );
}

export default ModusManagement;
