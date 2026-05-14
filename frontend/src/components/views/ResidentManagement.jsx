import React, { useState, useEffect, useCallback } from "react";
import "./ResidentManagement.css";
import ImportResidentModal from "../modals/ImportResidentModal";
import LoadingModal from "../modals/LoadingModal";

const API_URL = `${import.meta.env.VITE_API_URL}/residents`;
const ITEMS_PER_PAGE = 15;

// ── Icons ──────────────────────────────────────────────────────────────────────
const SearchIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const DeleteIcon = () => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6M14 11v6" />
    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
  </svg>
);

const UserIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="white"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const formatDate = (d) => {
  if (!d) return "—";
  const date = new Date(d);
  if (isNaN(date)) return "—";
  return date.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const getInitials = (first, last) => {
  return `${(first || "?")[0]}${(last || "?")[0]}`.toUpperCase();
};

const getAvatarColor = (name) => {
  const colors = [
    "#1e3a5f",
    "#2d5a8e",
    "#c1272d",
    "#16a34a",
    "#d97706",
    "#7c3aed",
    "#0891b2",
    "#be185d",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++)
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
};

function ResidentManagement() {
  const [residents, setResidents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [showImport, setShowImport] = useState(false);
  const [barangayName, setBarangayName] = useState("Your Barangay");
  const [confirmDelete, setConfirmDelete] = useState({
    show: false,
    id: null,
    name: "",
  });
  const [toast, setToast] = useState({
    show: false,
    message: "",
    type: "success",
  });

  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(
      () => setToast({ show: false, message: "", type: "success" }),
      3000,
    );
  };

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  // Fetch barangay name from profile
  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL}/users/profile`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
    })
      .then((r) => r.json())
      .then((data) => {
        const code =
          data?.user?.barangay_code || data?.user?.assigned_barangay_code;
        if (code) {
          if (!/^\d+$/.test(code)) {
            setBarangayName(code);
          } else {
            fetch(`https://psgc.gitlab.io/api/barangays/${code}.json`)
              .then((r) => r.json())
              .then((b) => b?.name && setBarangayName(b.name))
              .catch(() => {});
          }
        }
      })
      .catch(() => {});
  }, []);

  const fetchResidents = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (debouncedSearch) params.append("q", debouncedSearch);
      const res = await fetch(`${API_URL}?${params}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      const data = await res.json();
      if (data.success) {
        setResidents(data.data);
        setCurrentPage(1);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch]);

  useEffect(() => {
    fetchResidents();
  }, [fetchResidents]);

  const handleDelete = async () => {
    try {
      const res = await fetch(`${API_URL}/${confirmDelete.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      const data = await res.json();
      if (data.success) {
        showToast(`${confirmDelete.name} removed from records.`);
        fetchResidents();
      }
    } catch (err) {
      showToast("Failed to remove resident.", "error");
    } finally {
      setConfirmDelete({ show: false, id: null, name: "" });
    }
  };

  const totalPages = Math.ceil(residents.length / ITEMS_PER_PAGE);
  const paginated = residents.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE,
  );

  return (
    <div className="rm-wrapper">
      <LoadingModal isOpen={loading} message="Loading residents..." />

      {/* ── PAGE HEADER ── */}
      <div className="rm-page-header">
        <div className="rm-page-header-left">
          <div className="rm-header-icon">
            <UserIcon />
          </div>
          <div>
            <h1 className="rm-page-title">Residents</h1>
            <p className="rm-page-subtitle">
              Barangay citizen database — {barangayName}
            </p>
          </div>
        </div>
        <div className="rm-page-header-right">
          <button
            className="rm-btn rm-btn-secondary"
            onClick={() => setShowImport(true)}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            Import Residents
          </button>
        </div>
      </div>

      {/* ── STATS ROW ── */}
      <div className="rm-stats-row">
        <div className="rm-stat-card">
          <div
            className="rm-stat-icon"
            style={{ background: "linear-gradient(135deg,#1e3a5f,#2d5a8e)" }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </div>
          <div>
            <div className="rm-stat-num">{residents.length}</div>
            <div className="rm-stat-label">Total Residents</div>
          </div>
        </div>
        <div className="rm-stat-card">
          <div
            className="rm-stat-icon"
            style={{ background: "linear-gradient(135deg,#16a34a,#15803d)" }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </div>
          <div>
            <div className="rm-stat-num">
              {residents.filter((r) => r.gender === "Male").length}
            </div>
            <div className="rm-stat-label">Male</div>
          </div>
        </div>
        <div className="rm-stat-card">
          <div
            className="rm-stat-icon"
            style={{ background: "linear-gradient(135deg,#be185d,#9d174d)" }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </div>
          <div>
            <div className="rm-stat-num">
              {residents.filter((r) => r.gender === "Female").length}
            </div>
            <div className="rm-stat-label">Female</div>
          </div>
        </div>
        <div className="rm-stat-card">
          <div
            className="rm-stat-icon"
            style={{ background: "linear-gradient(135deg,#d97706,#b45309)" }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
          </div>
          <div>
            <div className="rm-stat-num">
              {residents.filter((r) => r.voter_status === "Registered").length}
            </div>
            <div className="rm-stat-label">Registered Voters</div>
          </div>
        </div>
      </div>

      {/* ── FILTER BAR ── */}
      <div className="rm-filter-bar">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            marginBottom: "8px",
          }}
        >
          <svg
            width="14"
            height="14"
            fill="none"
            stroke="var(--navy-primary)"
            strokeWidth="2.5"
            viewBox="0 0 24 24"
          >
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
          </svg>
          <span className="rm-filter-label-heading">Search & Filter</span>
        </div>
        <div className="rm-filter-row">
          <div className="rm-search-wrap">
            <SearchIcon />
            <input
              type="text"
              className="rm-search-input"
              placeholder="Search by name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button className="rm-search-clear" onClick={() => setSearch("")}>
                &times;
              </button>
            )}
          </div>
          <button
            className="rm-btn rm-btn-clear"
            onClick={() => setSearch("")}
            title="Clear"
          >
            <span style={{ fontSize: "16px" }}>↻</span>
          </button>
        </div>
      </div>

      {/* ── TABLE ── */}
      <div className="rm-table-card">
        <div className="rm-table-container">
          <table className="rm-data-table">
            <thead>
              <tr>
                <th>Resident</th>
                <th>Gender</th>
                <th>Date of Birth</th>
                <th>Contact</th>
                <th>Address</th>
                <th>Civil Status</th>
                <th>Voter Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? null : paginated.length === 0 ? (
                <tr>
                  <td colSpan="8">
                    <div className="rm-empty-state">
                      <div className="rm-empty-icon">
                        <svg
                          width="28"
                          height="28"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="#d1d5db"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                          <circle cx="9" cy="7" r="4" />
                          <line x1="23" y1="11" x2="17" y2="11" />
                        </svg>
                      </div>
                      <div className="rm-empty-title">
                        {search
                          ? "No residents found"
                          : "No residents imported yet"}
                      </div>
                      <div className="rm-empty-sub">
                        {search
                          ? `No results for "${search}"`
                          : "Click Import Residents to add your barangay database"}
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                paginated.map((r) => {
                  const fullName = `${r.first_name} ${r.last_name}`;
                  const avatarColor = getAvatarColor(fullName);
                  return (
                    <tr key={r.resident_id}>
                      <td>
                        <div className="rm-resident-cell">
                          <div
                            className="rm-avatar"
                            style={{ background: avatarColor }}
                          >
                            {getInitials(r.first_name, r.last_name)}
                          </div>
                          <div>
                            <div className="rm-resident-name">
                              {r.last_name}, {r.first_name}
                              {r.middle_name ? ` ${r.middle_name[0]}.` : ""}
                              {r.qualifier ? ` ${r.qualifier}` : ""}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>
                        {r.gender ? (
                          <span
                            className={`rm-gender-badge ${r.gender === "Male" ? "male" : "female"}`}
                          >
                            {r.gender}
                          </span>
                        ) : (
                          <span className="rm-na">—</span>
                        )}
                      </td>
                      <td style={{ color: "#6b7280", fontSize: "13px" }}>
                        {formatDate(r.date_of_birth)}
                      </td>
                      <td style={{ color: "#374151", fontSize: "13px" }}>
                        {r.contact_number || <span className="rm-na">—</span>}
                      </td>
                      <td
                        style={{
                          color: "#6b7280",
                          fontSize: "13px",
                          maxWidth: "180px",
                        }}
                      >
                        <div className="rm-address-cell">
                          {r.house_street || <span className="rm-na">—</span>}
                        </div>
                      </td>
                      <td style={{ fontSize: "13px", color: "#374151" }}>
                        {r.civil_status || <span className="rm-na">—</span>}
                      </td>
                      <td>
                        {r.voter_status ? (
                          <span
                            className={`rm-voter-badge ${r.voter_status === "Registered" ? "registered" : "not-registered"}`}
                          >
                            {r.voter_status}
                          </span>
                        ) : (
                          <span className="rm-na">—</span>
                        )}
                      </td>
                      <td>
                        <button
                          className="rm-action-btn rm-action-danger"
                          onClick={() =>
                            setConfirmDelete({
                              show: true,
                              id: r.resident_id,
                              name: `${r.first_name} ${r.last_name}`,
                            })
                          }
                        >
                          <DeleteIcon /> Remove
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* ── PAGINATION ── */}
        <div className="rm-pagination">
          <div className="rm-pagination-info">
            Showing{" "}
            {residents.length === 0
              ? 0
              : (currentPage - 1) * ITEMS_PER_PAGE + 1}
            –{Math.min(currentPage * ITEMS_PER_PAGE, residents.length)} of{" "}
            {residents.length} residents
          </div>
          <div className="rm-pagination-controls">
            <button
              className="rm-pagination-btn"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((p) => p - 1)}
            >
              Previous
            </button>
            <span className="rm-pagination-current">
              Page {currentPage} of {totalPages || 1}
            </span>
            <button
              className="rm-pagination-btn"
              disabled={currentPage === totalPages || totalPages === 0}
              onClick={() => setCurrentPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* ── IMPORT MODAL ── */}
      {showImport && (
        <ImportResidentModal
          onClose={() => setShowImport(false)}
          onSuccess={() => {
            fetchResidents();
            setShowImport(false);
            showToast("Residents imported successfully!");
          }}
        />
      )}

      {/* ── CONFIRM DELETE MODAL ── */}
      {confirmDelete.show && (
        <div className="rm-modal-overlay">
          <div className="rm-confirm-modal">
            <div className="rm-confirm-header">
              <div className="rm-confirm-icon">
                <DeleteIcon />
              </div>
              <div>
                <h3 className="rm-confirm-title">Remove Resident</h3>
                <p className="rm-confirm-sub">This action cannot be undone</p>
              </div>
              <span
                className="rm-confirm-close"
                onClick={() =>
                  setConfirmDelete({ show: false, id: null, name: "" })
                }
              >
                &times;
              </span>
            </div>
            <div className="rm-confirm-body">
              <p>
                Are you sure you want to remove{" "}
                <strong>{confirmDelete.name}</strong> from the resident
                database?
              </p>
            </div>
            <div className="rm-confirm-footer">
              <button
                className="rm-btn rm-btn-secondary"
                onClick={() =>
                  setConfirmDelete({ show: false, id: null, name: "" })
                }
              >
                Cancel
              </button>
              <button
                className="rm-btn"
                style={{ background: "#dc2626", color: "white" }}
                onClick={handleDelete}
              >
                Yes, Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── TOAST ── */}
      {toast.show && (
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
            <span>{toast.message}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default ResidentManagement;
