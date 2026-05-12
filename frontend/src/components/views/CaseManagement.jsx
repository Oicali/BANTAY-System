// frontend\src\components\views\CaseManagement.jsx

import React, { useState, useEffect } from "react";
import "./CaseManagement.css";
import LoadingModal from "../modals/LoadingModal";

const API_URL = `${import.meta.env.VITE_API_URL}/cases`;

const getToken = () => localStorage.getItem("token");
const getUser = () => ({
  role: localStorage.getItem("role"),
  user_id: localStorage.getItem("userId"),
  username: localStorage.getItem("username"),
});

function CaseManagement() {
  const [cases, setCases] = useState([]);
  const [stats, setStats] = useState({
    total_cases: 0,
    active_cases: 0,
    solved_cases: 0,
    cleared_cases: 0,
    referred_cases: 0,
    unassigned_cases: 0,
    high_priority_cases: 0,
  });
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("all");

  // Applied filters (used for actual fetching)
  const [filters, setFilters] = useState({
    status: "",
    priority: "",
    search: "",
    sort_updated: "",
  });
  const [draftFilters, setDraftFilters] = useState({
    status: "",
    priority: "",
    search: "",
    sort_updated: "",
  });

  // Modals
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [editingNote, setEditingNote] = useState(null);
  const [showDeletedNotes, setShowDeletedNotes] = useState(false);

  // Data
  const [investigators, setInvestigators] = useState([]);
  const [selectedCase, setSelectedCase] = useState(null);
  const [selectedInvestigatorId, setSelectedInvestigatorId] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");
  const [noteForm, setNoteForm] = useState({
    note: "",
    note_date: new Date().toISOString().split("T")[0],
  });
  const [modalLoading, setModalLoading] = useState(false);
  const [toast, setToast] = useState({
    show: false,
    message: "",
    type: "success",
  });
  const [errorModal, setErrorModal] = useState({ show: false, message: "" });
  const showError = (message) => {
    setErrorModal({ show: true, message });
  };
  const [showPriorityModal, setShowPriorityModal] = useState(false);
  const [showActionConfirm, setShowActionConfirm] = useState({
    show: false,
    type: "",
    label: "",
    onConfirm: null,
  });
  const [selectedPriority, setSelectedPriority] = useState("");
  const user = getUser();
  const isAdmin = user.role === "Administrator";
  const isInvestigator = user.role === "Investigator";
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  useEffect(() => {
    if (isInvestigator) {
      setActiveTab("my");
      fetchCases("my");
    } else {
      fetchCases("all");
      fetchStats();
    }
  }, []);

  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(
      () => setToast({ show: false, message: "", type: "success" }),
      3000,
    );
  };

  const fetchCases = async (tabOverride = null, filterOverride = null) => {
    try {
      setLoading(true);
      const tab = tabOverride !== null ? tabOverride : activeTab;
      const f = filterOverride !== null ? filterOverride : filters;
      const params = new URLSearchParams();
      if (f.status) params.append("status", f.status);
      if (f.priority) params.append("priority", f.priority);

      const res = await fetch(`${API_URL}?${params}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (data.success) {
        let result = data.data;
        if (tab === "my")
          result = result.filter(
            (c) =>
              c.assigned_io_id === user.user_id ||
              c.assigned_io_name?.includes(user.first_name),
          );
        if (tab === "high")
          result = result.filter((c) => c.priority === "High");
        if (tab === "unassigned")
          result = result.filter(
            (c) =>
              !c.assigned_io_id ||
              c.assigned_io_id === null ||
              c.assigned_io_id === "",
          );
        if (f.search && f.search.trim().length > 0) {
          const searchTerm = f.search.trim().toUpperCase();
          result = result.filter((c) => {
            const displayNum = (
              c.blotter_entry_number ||
              c.case_number ||
              ""
            ).toUpperCase();
            return displayNum.includes(searchTerm);
          });
        }
        if (f.sort_updated === "newest") {
          result = [...result].sort(
            (a, b) => new Date(b.updated_at) - new Date(a.updated_at),
          );
        } else if (f.sort_updated === "oldest") {
          result = [...result].sort(
            (a, b) => new Date(a.updated_at) - new Date(b.updated_at),
          );
        }
        setCases(result);
        setCurrentPage(1);
      }
    } catch (err) {
      console.error("Fetch cases error:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await fetch(`${API_URL}/statistics`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      console.log("STATS RESPONSE:", data);
      if (data.success) setStats(data.data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchInvestigators = async () => {
    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/user-management/users?userType=police&role=Investigator&limit=100`,
        {
          headers: { Authorization: `Bearer ${getToken()}` },
        },
      );
      const data = await res.json();
      if (data.users) {
        setInvestigators(data.users.filter((u) => u.status === "verified"));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchCaseDetail = async (caseId) => {
    try {
      const res = await fetch(`${API_URL}/${caseId}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (data.success) setSelectedCase(data.data);
    } catch (err) {
      console.error(err);
    }
  };

  // Handlers

  const handleAssign = async () => {
    try {
      setModalLoading(true);
      const res = await fetch(`${API_URL}/${selectedCase.id}/assign`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ assigned_io_id: selectedInvestigatorId }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(
          selectedInvestigatorId
            ? "Investigator assigned successfully!"
            : "Investigator unassigned successfully!",
        );
        setShowAssignModal(false);
        fetchCases();
        fetchStats();
      } else {
        showError(data.message);
      }
    } catch (err) {
      showError("Failed to assign investigator. Please try again.");
    } finally {
      setModalLoading(false);
    }
  };

  const handleUpdatePriority = async () => {
    if (!selectedPriority)
      return showError("Please select a priority to continue.");
    try {
      setModalLoading(true);
      const res = await fetch(`${API_URL}/${selectedCase.id}/priority`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ priority: selectedPriority }),
      });
      const data = await res.json();
      if (data.success) {
        showToast("Priority updated successfully!");
        setShowPriorityModal(false);
        fetchCases();
        fetchStats();
      } else {
        showError(data.message);
      }
    } catch (err) {
      showError("Failed to update priority. Please try again.");
    } finally {
      setModalLoading(false);
    }
  };

  const openPriorityModal = (c) => {
    setSelectedCase(c);
    setSelectedPriority(c.priority);
    setShowPriorityModal(true);
  };

  const handleUpdateStatus = async () => {
    if (!selectedStatus)
      return showError("Please select a status to continue.");
    try {
      setModalLoading(true);
      const res = await fetch(`${API_URL}/${selectedCase.id}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ status: selectedStatus }),
      });
      const data = await res.json();
      if (data.success) {
        showToast("Status updated successfully!");
        setShowStatusModal(false);
        fetchCases();
        fetchStats();
      } else {
        showError(data.message);
      }
    } catch (err) {
      showError("Failed to update status. Please try again.");
    } finally {
      setModalLoading(false);
    }
  };

  const handleAddNote = async () => {
    if (!noteForm.note.trim() || noteForm.note.trim().length < 3)
      return showError("Note must be at least 3 characters.");
    try {
      setModalLoading(true);
      const res = await fetch(`${API_URL}/${selectedCase.id}/notes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          note: noteForm.note.trim(),
          note_date: noteForm.note_date,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast("Note added!");
        setNoteForm({
          note: "",
          note_date: new Date().toISOString().split("T")[0],
        });
        setShowNoteModal(false);
        if (showDetailModal) fetchCaseDetail(selectedCase.id);
      } else showError(data.message);
    } catch {
      showError("Failed to add note.");
    } finally {
      setModalLoading(false);
    }
  };
  const handleEditNote = async () => {
    if (!editingNote?.note?.trim() || editingNote.note.trim().length < 3)
      return showError("Note must be at least 3 characters.");
    try {
      setModalLoading(true);
      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/cases/notes/${editingNote.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${getToken()}`,
          },
          body: JSON.stringify({ note: editingNote.note.trim() }),
        },
      );
      const data = await res.json();
      if (data.success) {
        showToast("Note updated!");
        setEditingNote(null);
        fetchCaseDetail(selectedCase.id);
      } else showError(data.message);
    } catch {
      showError("Failed to edit note.");
    } finally {
      setModalLoading(false);
    }
  };

  const handleDeleteNote = async (noteId) => {
    try {
      setModalLoading(true);
      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/cases/notes/${noteId}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${getToken()}` },
        },
      );
      const data = await res.json();
      if (data.success) {
        showToast("Note deleted!");
        fetchCaseDetail(selectedCase.id);
      } else showError(data.message);
    } catch {
      showError("Failed to delete note.");
    } finally {
      setModalLoading(false);
    }
  };

  const handleRestoreNote = async (noteId) => {
    try {
      setModalLoading(true);
      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/cases/notes/${noteId}/restore`,
        {
          method: "PATCH",
          headers: { Authorization: `Bearer ${getToken()}` },
        },
      );
      const data = await res.json();
      if (data.success) {
        showToast("Note restored!");
        fetchCaseDetail(selectedCase.id);
      } else showError(data.message);
    } catch {
      showError("Failed to restore note.");
    } finally {
      setModalLoading(false);
    }
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    fetchCases(tab);
  };

  // Draft filter change — updates UI only, does NOT fetch
  const handleFilterChange = (e) => {
    setDraftFilters((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  // Apply filters — syncs draft to applied and fetches
  const handleApplyFilters = () => {
    setFilters(draftFilters);
    fetchCases(null, draftFilters);
  };

  // Reset filters — clears both draft and applied, fetches clean
  const handleResetFilters = () => {
    const reset = { status: "", priority: "", search: "", sort_updated: "" };
    setDraftFilters(reset);
    setFilters(reset);
    fetchCases(null, reset);
  };

  const openViewDetail = async (c) => {
    setSelectedCase(c);
    setModalLoading(true);
    setShowDetailModal(true);
    await fetchCaseDetail(c.id);
    setModalLoading(false);
  };

  const openStatusModal = (c) => {
    setSelectedCase(c);
    setSelectedStatus(c.status);
    setShowStatusModal(true);
  };

  const openAssignModal = (c) => {
    setSelectedCase(c);
    setSelectedInvestigatorId(c.assigned_io_id || "");
    setShowAssignModal(true);
    fetchInvestigators();
  };

  const openNoteModal = (c) => {
    setSelectedCase(c);
    setNoteForm({
      note: "",
      note_date: new Date().toISOString().split("T")[0],
    });
    setShowNoteModal(true);
  };

  // Helpers
  const formatDate = (d) => {
    if (!d) return "N/A";
    return new Date(d).toLocaleDateString("en-PH", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const getPriorityClass = (p) =>
    ({
      High: "cm-priority-high",
      Medium: "cm-priority-medium",
      Low: "cm-priority-low",
    })[p] || "cm-priority-low";

  const getStatusClass = (s) =>
    ({
      "Under Investigation": "cm-status-active",
      Solved: "cm-status-solved",
      Cleared: "cm-status-cleared",
      Referred: "cm-status-referred",
    })[s] || "cm-status-active";

  const totalPages = Math.ceil(cases.length / ITEMS_PER_PAGE);
  const paginatedCases = cases.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE,
  );

  const isDirty =
    draftFilters.status !== filters.status ||
    draftFilters.priority !== filters.priority ||
    draftFilters.search !== filters.search ||
    draftFilters.sort_updated !== filters.sort_updated;

  return (
    <div className="cm-content-area">
      {/* HEADER */}
      <div className="cm-page-header">
        <div className="cm-page-header-left">
          <h1>Case Management</h1>
          <p>Track and manage investigation cases</p>
        </div>
      </div>

      {/* STATS CARDS — Admin only */}
      {isAdmin && (
        <div className="cm-status-cards-grid">
          <div
            className="cm-status-card"
            style={{ borderLeft: "4px solid #3b82f6" }}
          >
            <div className="cm-status-card-label">Total Cases</div>
            <div className="cm-status-card-value">{stats.total_cases}</div>
            <span className="cm-status-card-badge cm-badge-blue">Total</span>
          </div>
          <div
            className="cm-status-card"
            style={{ borderLeft: "4px solid #f59e0b" }}
          >
            <div className="cm-status-card-label">Under Investigation</div>
            <div className="cm-status-card-value">{stats.active_cases}</div>
            <span className="cm-status-card-badge cm-badge-yellow">Active</span>
          </div>
          <div
            className="cm-status-card"
            style={{ borderLeft: "4px solid #16a34a" }}
          >
            <div className="cm-status-card-label">Solved</div>
            <div className="cm-status-card-value">{stats.solved_cases}</div>
            <span className="cm-status-card-badge cm-badge-green">Solved</span>
          </div>
          <div
            className="cm-status-card"
            style={{ borderLeft: "4px solid #4f46e5" }}
          >
            <div className="cm-status-card-label">Cleared</div>
            <div className="cm-status-card-value">{stats.cleared_cases}</div>
            <span className="cm-status-card-badge cm-badge-purple">
              Cleared
            </span>
          </div>
          <div
            className="cm-status-card"
            style={{ borderLeft: "4px solid #dc2626" }}
          >
            <div className="cm-status-card-label">Unassigned</div>
            <div className="cm-status-card-value">{stats.unassigned_cases}</div>
            <span className="cm-status-card-badge cm-badge-red">
              Unassigned
            </span>
          </div>
        </div>
      )}

      {/* FILTERS */}
      <div className="cm-filter-bar">
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
        <input
          type="text"
          className="cm-filter-input"
          placeholder="Search by Case No."
          name="search"
          value={draftFilters.search || ""}
          onChange={handleFilterChange}
          autoComplete="off"
          onKeyDown={(e) => e.key === "Enter" && handleApplyFilters()}
        />
        <select
          className="cm-filter-input"
          name="status"
          value={draftFilters.status}
          onChange={handleFilterChange}
        >
          <option value="">All Status</option>
          <option>Under Investigation</option>
          <option>Solved</option>
          <option>Cleared</option>
        </select>
        <select
          className="cm-filter-input"
          name="priority"
          value={draftFilters.priority}
          onChange={handleFilterChange}
        >
          <option value="">All Priority</option>
          <option>High</option>
          <option>Medium</option>
          <option>Low</option>
        </select>
        <select
          className="cm-filter-input"
          name="sort_updated"
          value={draftFilters.sort_updated || ""}
          onChange={handleFilterChange}
        >
          <option value="">Last Updated: Default</option>
          <option value="newest">Last Updated: Newest</option>
          <option value="oldest">Last Updated: Oldest</option>
        </select>
        <button
          className="cm-btn cm-btn-primary"
          onClick={handleApplyFilters}
          style={{
            height: "40px",
            padding: "0 18px",
            fontSize: "13px",
            whiteSpace: "nowrap",
            boxShadow: isDirty ? "0 0 0 3px rgba(193,39,45,0.22)" : "none",
          }}
        >
          Apply Filters
        </button>
        <button
          className="cm-btn cm-btn-secondary"
          onClick={handleResetFilters}
          title="Reset filters"
          style={{
            height: "40px",
            padding: "0 14px",
            fontSize: "16px",
            flexShrink: 0,
          }}
        >
          ↺
        </button>
      </div>

      {/* TABS */}
      <div className="cm-tab-navigation">
        {(isInvestigator ? ["my", "high"] : ["all", "high", "unassigned"]).map(
          (tab) => (
            <button
              key={tab}
              className={`cm-tab-btn ${activeTab === tab ? "cm-active" : ""}`}
              onClick={() => handleTabChange(tab)}
            >
              {tab === "all"
                ? "All Cases"
                : tab === "my"
                  ? "My Cases"
                  : tab === "high"
                    ? "High Priority"
                    : "Unassigned"}
            </button>
          ),
        )}
      </div>

      {/* CASES LIST */}
      <div className="cm-cases-grid">
        {loading ? (
          <LoadingModal isOpen={true} message={"Loading cases..."} />
        ) : cases.length === 0 ? (
          <div className="cm-empty-state">No cases found.</div>
        ) : (
          paginatedCases.map((c) => (
            <div
              className={`cm-case-card priority-${(c.priority || "low").toLowerCase()}`}
              key={c.id}
            >
              <div className="cm-case-header">
                <div>
                  <div className="cm-case-id">
                    <span
                      style={{
                        fontFamily: "monospace",
                        fontWeight: "700",
                        color: "var(--navy-primary)",
                        fontSize: "13px",
                        background: "rgba(30,58,95,0.07)",
                        padding: "4px 10px",
                        borderRadius: "6px",
                      }}
                    >
                      {c.blotter_entry_number || c.case_number}
                    </span>
                  </div>
                  <div className="cm-case-title">
                    {c.incident_type} — {c.barangay}
                  </div>
                </div>
                <span
                  className={`cm-priority-badge ${getPriorityClass(c.priority)}`}
                >
                  {c.priority} Priority
                </span>
              </div>
              <div className="cm-case-meta">
                <div className="cm-case-meta-item">
                  <span className="cm-case-meta-label">Assigned To:</span>
                  <span>{c.assigned_io_name?.trim() || "N/A"}</span>
                </div>
                <div className="cm-case-meta-item">
                  <span className="cm-case-meta-label">Location:</span>
                  <span>{c.location || c.barangay}</span>
                </div>
                <div className="cm-case-meta-item">
                  <span className="cm-case-meta-label">Date Created:</span>
                  <span>{formatDate(c.created_at)}</span>
                </div>
                <div className="cm-case-meta-item">
                  <span className="cm-case-meta-label">Last Updated:</span>
                  <span>{formatDate(c.updated_at)}</span>
                </div>
              </div>
              <div className="cm-case-footer">
                <span className={`cm-status-badge ${getStatusClass(c.status)}`}>
                  {c.status}
                </span>
                <div className="cm-case-actions">
                  <button
                    className="cm-action-btn cm-action-btn-view"
                    onClick={() => openViewDetail(c)}
                  >
                    View Details
                  </button>
                  {isAdmin && (
                    <button
                      className="cm-action-btn cm-action-btn-edit"
                      onClick={() => openAssignModal(c)}
                    >
                      Assign IO
                    </button>
                  )}
                  {(isAdmin || isInvestigator) && (
                    <>
                      {c.status === "Under Investigation" && (
                        <button
                          className="cm-action-btn cm-action-btn-edit"
                          onClick={() => openPriorityModal(c)}
                        >
                          Set Priority
                        </button>
                      )}
                      <button
                        className="cm-action-btn cm-action-btn-edit"
                        onClick={() => openStatusModal(c)}
                      >
                        Update Status
                      </button>
                    </>
                  )}
                  {(isAdmin || isInvestigator) && (
                    <button
                      className="cm-action-btn cm-action-btn-success"
                      onClick={() => openNoteModal(c)}
                    >
                      Add Notes
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
        {/* PAGINATION */}
        {!loading && cases.length > 0 && (
          <div className="cm-pagination">
            <div className="cm-pagination-info">
              Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1}–
              {Math.min(currentPage * ITEMS_PER_PAGE, cases.length)} of{" "}
              {cases.length} cases
            </div>
            <div className="cm-pagination-controls">
              <button
                className="cm-pagination-btn"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => p - 1)}
              >
                Previous
              </button>
              <span className="cm-pagination-current">
                Page {currentPage} of {totalPages || 1}
              </span>
              <button
                className="cm-pagination-btn"
                disabled={currentPage === totalPages || totalPages === 0}
                onClick={() => setCurrentPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── ASSIGN INVESTIGATOR MODAL ── */}
      {showAssignModal && (
        <div className="cm-modal">
          <div
            className="cm-modal-content"
            style={{ maxWidth: "700px", width: "95vw" }}
          >
            <div className="cm-modal-header">
              <h2>Assign Investigator</h2>
              <span
                className="cm-modal-close"
                onClick={() => setShowAssignModal(false)}
              >
                &times;
              </span>
            </div>
            <div className="cm-modal-body" style={{ padding: "20px 24px" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  marginBottom: "16px",
                  padding: "10px 14px",
                  background: "rgba(30,58,95,0.05)",
                  borderRadius: "8px",
                  border: "1px solid rgba(30,58,95,0.1)",
                }}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--navy-primary)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="2" y="7" width="20" height="14" rx="2" />
                  <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                </svg>
                <span style={{ fontSize: "13px", color: "#374151" }}>
                  Case:{" "}
                  {selectedCase?.blotter_entry_number ||
                    selectedCase?.case_number}
                </span>
              </div>

              {/* Unassign Card */}
              <div
                className={`cm-io-card cm-io-unassign ${selectedInvestigatorId === "" ? "cm-io-selected" : ""}`}
                onClick={() => setSelectedInvestigatorId("")}
              >
                <div className="cm-io-avatar cm-io-avatar-danger">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <line x1="8" y1="12" x2="16" y2="12" />
                  </svg>
                </div>
                <div className="cm-io-info">
                  <div className="cm-io-name">Remove / Unassign IO</div>
                  <div className="cm-io-sub">
                    Clear current assignment from this case
                  </div>
                </div>
                {selectedInvestigatorId === "" && (
                  <div className="cm-io-check">✓</div>
                )}
              </div>

              <div className="cm-io-section-label">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                </svg>
                Available Investigators ({investigators.length})
              </div>

              <div className="cm-io-list">
                {investigators.length === 0 ? (
                  <div
                    style={{
                      textAlign: "center",
                      padding: "24px",
                      color: "#9ca3af",
                      fontSize: "13px",
                    }}
                  >
                    Loading investigators...
                  </div>
                ) : (
                  investigators.map((inv) => {
                    const initials =
                      `${inv.first_name?.[0] || ""}${inv.last_name?.[0] || ""}`.toUpperCase();
                    const isSelected =
                      selectedInvestigatorId === String(inv.user_id);
                    const isCurrent =
                      String(selectedCase?.assigned_io_id) ===
                      String(inv.user_id);
                    const colors = [
                      "#1e3a5f",
                      "#c1272d",
                      "#0369a1",
                      "#059669",
                      "#7c3aed",
                      "#d97706",
                    ];
                    const color =
                      colors[
                        (inv.first_name?.charCodeAt(0) || 0) % colors.length
                      ];
                    return (
                      <div
                        key={inv.user_id}
                        className={`cm-io-card ${isSelected ? "cm-io-selected" : ""}`}
                        onClick={() =>
                          setSelectedInvestigatorId(String(inv.user_id))
                        }
                      >
                        <div
                          className="cm-io-avatar"
                          style={{
                            background: color,
                            overflow: "hidden",
                            padding: 0,
                          }}
                        >
                          {inv.profile_picture ? (
                            <img
                              src={inv.profile_picture}
                              alt={initials}
                              style={{
                                width: "100%",
                                height: "100%",
                                objectFit: "cover",
                              }}
                            />
                          ) : (
                            initials
                          )}
                        </div>
                        <div className="cm-io-info">
                          <div className="cm-io-name">
                            {inv.first_name} {inv.last_name}
                            {isCurrent && (
                              <span
                                style={{
                                  marginLeft: "8px",
                                  fontSize: "10px",
                                  fontWeight: 700,
                                  padding: "2px 8px",
                                  borderRadius: "20px",
                                  background: "rgba(217,119,6,0.1)",
                                  color: "#d97706",
                                }}
                              >
                                CURRENT
                              </span>
                            )}
                          </div>
                          <div className="cm-io-sub">
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                              }}
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="10"
                                height="10"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <circle cx="12" cy="12" r="10" />
                              </svg>
                              Investigator · Active
                            </span>
                          </div>
                        </div>
                        {isSelected && <div className="cm-io-check">✓</div>}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
            <div className="cm-modal-footer">
              <button
                className="cm-btn cm-btn-secondary"
                onClick={() => setShowAssignModal(false)}
              >
                Cancel
              </button>
              <button
                className="cm-btn cm-btn-primary"
                onClick={handleAssign}
                disabled={modalLoading}
              >
                {modalLoading
                  ? "Saving..."
                  : selectedInvestigatorId
                    ? "Assign Investigator"
                    : "Unassign IO"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── UPDATE STATUS MODAL ── */}
      {showStatusModal && (
        <div className="cm-modal">
          <div className="cm-modal-content">
            <div className="cm-modal-header">
              <h2>Update Case Status</h2>
              <span
                className="cm-modal-close"
                onClick={() => setShowStatusModal(false)}
              >
                &times;
              </span>
            </div>
            <div className="cm-modal-body">
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  marginBottom: "20px",
                  padding: "10px 14px",
                  background: "rgba(30,58,95,0.05)",
                  borderRadius: "8px",
                  border: "1px solid rgba(30,58,95,0.1)",
                }}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--navy-primary)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="2" y="7" width="20" height="14" rx="2" />
                  <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                </svg>
                <span style={{ fontSize: "13px", color: "#374151" }}>
                  Case:{" "}
                  {selectedCase?.blotter_entry_number ||
                    selectedCase?.case_number}
                </span>
              </div>
              <label
                className="cm-modal-label"
                style={{ marginBottom: "10px", display: "block" }}
              >
                Select New Status *
              </label>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                }}
              >
                {[
                  {
                    value: "Under Investigation",
                    color: "#f59e0b",
                    bg: "rgba(245,158,11,0.08)",
                    icon: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z",
                    desc: "Case is actively being worked on",
                  },
                  {
                    value: "Solved",
                    color: "#16a34a",
                    bg: "rgba(34,197,94,0.08)",
                    icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
                    desc: "Case has been resolved with suspect identified",
                  },
                  {
                    value: "Cleared",
                    color: "#4f46e5",
                    bg: "rgba(99,102,241,0.08)",
                    icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2",
                    desc: "Case cleared — no further action needed",
                  },
                ].map((s) => (
                  <div
                    key={s.value}
                    onClick={() => setSelectedStatus(s.value)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "14px",
                      padding: "14px 16px",
                      borderRadius: "10px",
                      border: `2px solid ${selectedStatus === s.value ? s.color : "#e5e7eb"}`,
                      background: selectedStatus === s.value ? s.bg : "white",
                      cursor: "pointer",
                      transition: "all 0.18s ease",
                    }}
                  >
                    <div
                      style={{
                        width: "40px",
                        height: "40px",
                        borderRadius: "50%",
                        background: s.bg,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke={s.color}
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d={s.icon} />
                      </svg>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          fontWeight: 700,
                          fontSize: "14px",
                          color:
                            selectedStatus === s.value ? s.color : "#111827",
                        }}
                      >
                        {s.value}
                      </div>
                      <div
                        style={{
                          fontSize: "12px",
                          color: "#6b7280",
                          marginTop: "2px",
                        }}
                      >
                        {s.desc}
                      </div>
                    </div>
                    {selectedStatus === s.value && (
                      <div
                        style={{
                          width: "24px",
                          height: "24px",
                          borderRadius: "50%",
                          background: s.color,
                          color: "white",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "12px",
                          fontWeight: 700,
                          flexShrink: 0,
                        }}
                      >
                        ✓
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <div className="cm-modal-footer">
              <button
                className="cm-btn cm-btn-secondary"
                onClick={() => setShowStatusModal(false)}
              >
                Cancel
              </button>
              <button
                className="cm-btn cm-btn-primary"
                onClick={() =>
                  setShowActionConfirm({
                    show: true,
                    type: "status",
                    label: `Set status to "${selectedStatus}"?`,
                    onConfirm: handleUpdateStatus,
                  })
                }
                disabled={modalLoading}
              >
                {modalLoading ? "Updating..." : "Update Status"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── ADD NOTE MODAL ── */}
      {showNoteModal && (
        <div className="cm-modal">
          <div
            className="cm-modal-content"
            style={{ maxWidth: "700px", width: "95vw" }}
          >
            <div className="cm-modal-header">
              <h2>Add Investigation Note</h2>
              <span
                className="cm-modal-close"
                onClick={() => setShowNoteModal(false)}
              >
                &times;
              </span>
            </div>
            <div className="cm-modal-body">
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  marginBottom: "16px",
                  padding: "10px 14px",
                  background: "rgba(30,58,95,0.05)",
                  borderRadius: "8px",
                  border: "1px solid rgba(30,58,95,0.1)",
                }}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--navy-primary)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="2" y="7" width="20" height="14" rx="2" />
                  <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                </svg>
                <span style={{ fontSize: "13px", color: "#374151" }}>
                  Case:{" "}
                  {selectedCase?.blotter_entry_number ||
                    selectedCase?.case_number}
                </span>
              </div>

              <div
                style={{
                  background: "rgba(30,58,95,0.03)",
                  border: "1px solid rgba(30,58,95,0.08)",
                  borderRadius: "8px",
                  padding: "10px 14px",
                  marginBottom: "14px",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#6b7280"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                <span style={{ fontSize: "12px", color: "#6b7280" }}>
                  Will be logged as:{" "}
                  <strong style={{ color: "#374151" }}>
                    {new Date().toLocaleTimeString("en-PH", {
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: true,
                    })}{" "}
                    · {user.username || "Officer"}
                  </strong>
                </span>
              </div>

              <label className="cm-modal-label">Investigation Note *</label>
              <textarea
                className="cm-modal-input"
                rows="6"
                placeholder="Write your investigation note here (minimum 3 characters)..."
                value={noteForm.note}
                onChange={(e) =>
                  setNoteForm((p) => ({ ...p, note: e.target.value }))
                }
                maxLength={2000}
                style={{ resize: "vertical", marginBottom: "8px" }}
              />
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "4px",
                }}
              >
                <small
                  style={{
                    color: noteForm.note.length > 1800 ? "#dc2626" : "#9ca3af",
                    fontSize: "12px",
                  }}
                >
                  {noteForm.note.length}/2000 characters
                </small>
                {noteForm.note.length >= 3 && (
                  <small
                    style={{
                      color: "#16a34a",
                      fontSize: "12px",
                      fontWeight: 600,
                    }}
                  >
                    ✓ Ready to save
                  </small>
                )}
              </div>
              <div
                style={{
                  height: "4px",
                  background: "#e5e7eb",
                  borderRadius: "4px",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${(noteForm.note.length / 2000) * 100}%`,
                    background:
                      noteForm.note.length > 1800
                        ? "#dc2626"
                        : noteForm.note.length >= 3
                          ? "#16a34a"
                          : "var(--navy-primary)",
                    borderRadius: "4px",
                    transition: "all 0.2s",
                  }}
                />
              </div>
            </div>
            <div className="cm-modal-footer">
              <button
                className="cm-btn cm-btn-secondary"
                onClick={() => setShowNoteModal(false)}
              >
                Cancel
              </button>
              <button
                className="cm-btn cm-btn-primary"
                onClick={handleAddNote}
                disabled={modalLoading}
              >
                {modalLoading ? "Saving..." : "Save Note"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── VIEW DETAIL MODAL ── */}
      {showDetailModal && selectedCase && (
        <div className="cm-modal">
          <div
            className="cm-modal-content cm-modal-large"
            style={{
              maxWidth: "1100px",
              width: "96vw",
              maxHeight: "92vh",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div className="cm-modal-header">
              <h2>
                {selectedCase.blotter_entry_number || selectedCase.case_number}
              </h2>
              <span
                className="cm-modal-close"
                onClick={() => {
                  setShowDetailModal(false);
                  setSelectedCase(null);
                }}
              >
                &times;
              </span>
            </div>
            <div
              className="cm-modal-body"
              style={{ overflowY: "auto", flex: 1 }}
            >
              <div
                className="cm-detail-grid"
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "0",
                  border: "1px solid #e5e7eb",
                  borderRadius: "10px",
                  overflow: "hidden",
                  marginBottom: "20px",
                }}
              >
                <div
                  className="cm-detail-item"
                  style={{
                    padding: "14px 18px",
                    borderBottom: "1px solid #f3f4f6",
                    borderRight: "1px solid #f3f4f6",
                  }}
                >
                  <span className="cm-detail-label">Crime Type</span>
                  <span>{selectedCase.incident_type}</span>
                </div>
                <div
                  className="cm-detail-item"
                  style={{
                    padding: "14px 18px",
                    borderBottom: "1px solid #f3f4f6",
                    borderRight: "1px solid #f3f4f6",
                  }}
                >
                  <span className="cm-detail-label">Status</span>
                  <span
                    className={`cm-status-badge ${getStatusClass(selectedCase.status)}`}
                    style={{ width: "fit-content" }}
                  >
                    {selectedCase.status}
                  </span>
                </div>
                <div
                  className="cm-detail-item"
                  style={{
                    padding: "14px 18px",
                    borderBottom: "1px solid #f3f4f6",
                    borderRight: "1px solid #f3f4f6",
                  }}
                >
                  <span className="cm-detail-label">Priority</span>
                  <span
                    className={`cm-priority-badge ${getPriorityClass(selectedCase.priority)}`}
                    style={{ width: "fit-content" }}
                  >
                    {selectedCase.priority}
                  </span>
                </div>
                <div
                  className="cm-detail-item"
                  style={{
                    padding: "14px 18px",
                    borderBottom: "1px solid #f3f4f6",
                    borderRight: "1px solid #f3f4f6",
                  }}
                >
                  <span className="cm-detail-label">Assigned IO</span>
                  <span
                    style={{
                      color: selectedCase.assigned_io_name?.trim()
                        ? "#111827"
                        : "#9ca3af",
                      fontStyle: selectedCase.assigned_io_name?.trim()
                        ? "normal"
                        : "italic",
                    }}
                  >
                    {selectedCase.assigned_io_name?.trim() || "N/A"}
                  </span>
                </div>
                <div
                  className="cm-detail-item"
                  style={{
                    padding: "14px 18px",
                    borderBottom: "1px solid #f3f4f6",
                    borderRight: "1px solid #f3f4f6",
                  }}
                >
                  <span className="cm-detail-label">Barangay</span>
                  <span>{selectedCase.barangay}</span>
                </div>
                <div
                  className="cm-detail-item"
                  style={{
                    padding: "14px 18px",
                    borderBottom: "1px solid #f3f4f6",
                    borderRight: "1px solid #f3f4f6",
                  }}
                >
                  <span className="cm-detail-label">Location</span>
                  <span>{selectedCase.location}</span>
                </div>
                <div
                  className="cm-detail-item"
                  style={{
                    padding: "14px 18px",
                    borderBottom: "1px solid #f3f4f6",
                    borderRight: "1px solid #f3f4f6",
                  }}
                >
                  <span className="cm-detail-label">Date Opened</span>
                  <span>{formatDate(selectedCase.created_at)}</span>
                </div>
                <div
                  className="cm-detail-item"
                  style={{
                    padding: "14px 18px",
                    borderBottom: "1px solid #f3f4f6",
                    borderRight: "1px solid #f3f4f6",
                  }}
                >
                  <span className="cm-detail-label">Last Updated</span>
                  <span>{formatDate(selectedCase.updated_at)}</span>
                </div>
              </div>

              {selectedCase.narrative && (
                <div style={{ marginTop: "20px" }}>
                  <div
                    style={{
                      fontSize: "11px",
                      fontWeight: 700,
                      color: "#9ca3af",
                      textTransform: "uppercase",
                      letterSpacing: "0.6px",
                      marginBottom: "8px",
                    }}
                  >
                    Narrative
                  </div>
                  <div
                    style={{
                      background: "rgba(30,58,95,0.04)",
                      borderLeft: "4px solid var(--navy-primary)",
                      borderRadius: "0 8px 8px 0",
                      padding: "14px 18px",
                      color: "#374151",
                      lineHeight: "1.7",
                      fontSize: "14px",
                      fontStyle: "italic",
                    }}
                  >
                    {selectedCase.narrative}
                  </div>
                </div>
              )}

              {/* Notes Section */}
              <div style={{ marginTop: "24px" }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "12px",
                  }}
                >
                  <h4 style={{ color: "#1e3a5f", fontWeight: 700 }}>
                    Investigation Notes (
                    {selectedCase.notes?.filter((n) => !n.deleted_at).length ||
                      0}
                    )
                  </h4>
                  <div style={{ display: "flex", gap: "8px" }}>
                    {isAdmin && (
                      <div
                        style={{
                          display: "flex",
                          background: "#f3f4f6",
                          borderRadius: "8px",
                          padding: "3px",
                          gap: "2px",
                        }}
                      >
                        <button
                          style={{
                            padding: "5px 12px",
                            fontSize: "12px",
                            fontWeight: 600,
                            border: "none",
                            borderRadius: "6px",
                            cursor: "pointer",
                            background: !showDeletedNotes
                              ? "white"
                              : "transparent",
                            color: !showDeletedNotes ? "#1e3a5f" : "#6b7280",
                            boxShadow: !showDeletedNotes
                              ? "0 1px 3px rgba(0,0,0,0.1)"
                              : "none",
                            transition: "all 0.15s",
                          }}
                          onClick={() => setShowDeletedNotes(false)}
                        >
                          Active
                        </button>
                        <button
                          style={{
                            padding: "5px 12px",
                            fontSize: "12px",
                            fontWeight: 600,
                            border: "none",
                            borderRadius: "6px",
                            cursor: "pointer",
                            background: showDeletedNotes
                              ? "white"
                              : "transparent",
                            color: showDeletedNotes ? "#dc2626" : "#6b7280",
                            boxShadow: showDeletedNotes
                              ? "0 1px 3px rgba(0,0,0,0.1)"
                              : "none",
                            transition: "all 0.15s",
                          }}
                          onClick={() => setShowDeletedNotes(true)}
                        >
                          Deleted
                        </button>
                      </div>
                    )}
                    {(isAdmin || isInvestigator) && (
                      <button
                        className="cm-btn cm-btn-primary"
                        style={{ padding: "8px 16px", fontSize: "13px" }}
                        onClick={() => {
                          setShowDetailModal(false);
                          openNoteModal(selectedCase);
                        }}
                      >
                        + Add Note
                      </button>
                    )}
                  </div>
                </div>
                {selectedCase.notes?.filter((n) =>
                  showDeletedNotes ? n.deleted_at : !n.deleted_at,
                ).length === 0 ? (
                  <p style={{ color: "#9ca3af", fontSize: "14px" }}>
                    No notes yet.
                  </p>
                ) : (
                  selectedCase.notes
                    ?.filter((n) =>
                      showDeletedNotes ? n.deleted_at : !n.deleted_at,
                    )
                    .map((n) => (
                      <div
                        key={n.id}
                        className="cm-note-card"
                        style={{
                          opacity: n.deleted_at ? 0.6 : 1,
                          border: n.deleted_at
                            ? "1px dashed #e5e7eb"
                            : undefined,
                        }}
                      >
                        {editingNote?.id === n.id ? (
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: "8px",
                            }}
                          >
                            <div
                              style={{
                                fontSize: "12px",
                                color: "#6b7280",
                                padding: "6px 10px",
                                background: "#f3f4f6",
                                borderRadius: "6px",
                              }}
                            >
                              Editing as of:{" "}
                              <strong style={{ color: "#374151" }}>
                                {new Date().toLocaleDateString("en-PH", {
                                  year: "numeric",
                                  month: "short",
                                  day: "numeric",
                                  timeZone: "Asia/Manila",
                                })}{" "}
                                {new Date().toLocaleTimeString("en-PH", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                  hour12: true,
                                  timeZone: "Asia/Manila",
                                })}
                              </strong>
                            </div>
                            <textarea
                              className="cm-modal-input"
                              rows="3"
                              value={editingNote.note}
                              onChange={(e) =>
                                setEditingNote((p) => ({
                                  ...p,
                                  note: e.target.value,
                                }))
                              }
                              maxLength={2000}
                            />
                            <div style={{ display: "flex", gap: "8px" }}>
                              <button
                                className="cm-btn cm-btn-primary"
                                style={{
                                  padding: "6px 14px",
                                  fontSize: "12px",
                                }}
                                onClick={handleEditNote}
                              >
                                Save
                              </button>
                              <button
                                className="cm-btn cm-btn-secondary"
                                style={{
                                  padding: "6px 14px",
                                  fontSize: "12px",
                                }}
                                onClick={() => setEditingNote(null)}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="cm-note-header">
                              <div>
                                <strong>{n.added_by_name}</strong>
                                {n.edited_at && (
                                  <span
                                    style={{
                                      fontSize: "11px",
                                      color: "#9ca3af",
                                      marginLeft: "8px",
                                    }}
                                  >
                                    (edited)
                                  </span>
                                )}
                                {n.deleted_at && (
                                  <span
                                    style={{
                                      fontSize: "11px",
                                      color: "#dc2626",
                                      marginLeft: "8px",
                                    }}
                                  >
                                    (deleted)
                                  </span>
                                )}
                              </div>
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "8px",
                                }}
                              >
                                <span
                                  style={{ fontSize: "12px", color: "#6b7280" }}
                                >
                                  {n.edited_at
                                    ? new Date(n.edited_at).toLocaleDateString(
                                        "en-PH",
                                        {
                                          year: "numeric",
                                          month: "short",
                                          day: "numeric",
                                          timeZone: "Asia/Manila",
                                        },
                                      )
                                    : new Date(n.created_at).toLocaleDateString(
                                        "en-PH",
                                        {
                                          year: "numeric",
                                          month: "short",
                                          day: "numeric",
                                          timeZone: "Asia/Manila",
                                        },
                                      )}
                                  {" · "}
                                  {n.edited_at
                                    ? new Date(n.edited_at).toLocaleTimeString(
                                        "en-PH",
                                        {
                                          hour: "2-digit",
                                          minute: "2-digit",
                                          hour12: true,
                                          timeZone: "Asia/Manila",
                                        },
                                      )
                                    : new Date(n.created_at).toLocaleTimeString(
                                        "en-PH",
                                        {
                                          hour: "2-digit",
                                          minute: "2-digit",
                                          hour12: true,
                                          timeZone: "Asia/Manila",
                                        },
                                      )}
                                </span>
                                {!n.deleted_at &&
                                  (isAdmin ||
                                    n.added_by_id === user.user_id) && (
                                    <button
                                      onClick={() =>
                                        setEditingNote({
                                          id: n.id,
                                          note: n.note,
                                        })
                                      }
                                      style={{
                                        background: "none",
                                        border: "none",
                                        cursor: "pointer",
                                        color: "#6b7280",
                                      }}
                                    >
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
                                    </button>
                                  )}
                                {!n.deleted_at &&
                                  (isAdmin ||
                                    n.added_by_id === user.user_id) && (
                                    <button
                                      onClick={() => handleDeleteNote(n.id)}
                                      style={{
                                        background: "none",
                                        border: "none",
                                        cursor: "pointer",
                                        color: "#dc2626",
                                      }}
                                    >
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
                                        <polyline points="3 6 5 6 21 6" />
                                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                                        <path d="M10 11v6M14 11v6" />
                                        <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                                      </svg>
                                    </button>
                                  )}
                                {n.deleted_at && isAdmin && (
                                  <button
                                    onClick={() => handleRestoreNote(n.id)}
                                    style={{
                                      background: "none",
                                      border: "none",
                                      cursor: "pointer",
                                      color: "#16a34a",
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: "4px",
                                    }}
                                  >
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
                                      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                                      <path d="M3 3v5h5" />
                                    </svg>
                                    Restore
                                  </button>
                                )}
                              </div>
                            </div>
                            <p
                              style={{
                                margin: "6px 0 0",
                                whiteSpace: "pre-wrap",
                              }}
                            >
                              {n.note}
                            </p>
                          </>
                        )}
                      </div>
                    ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      {showPriorityModal && (
        <div className="cm-modal">
          <div className="cm-modal-content">
            <div className="cm-modal-header">
              <h2>Update Priority</h2>
              <span
                className="cm-modal-close"
                onClick={() => setShowPriorityModal(false)}
              >
                &times;
              </span>
            </div>
            <div className="cm-modal-body">
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  marginBottom: "20px",
                  padding: "10px 14px",
                  background: "rgba(30,58,95,0.05)",
                  borderRadius: "8px",
                  border: "1px solid rgba(30,58,95,0.1)",
                }}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--navy-primary)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="2" y="7" width="20" height="14" rx="2" />
                  <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                </svg>
                <span style={{ fontSize: "13px", color: "#374151" }}>
                  Case:{" "}
                  <strong
                    style={{
                      color: "var(--navy-primary)",
                      fontFamily: "monospace",
                    }}
                  >
                    {selectedCase?.blotter_entry_number ||
                      selectedCase?.case_number}
                  </strong>
                </span>
              </div>
              <label
                className="cm-modal-label"
                style={{ marginBottom: "10px", display: "block" }}
              >
                Set Priority Level *
              </label>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                }}
              >
                {[
                  {
                    value: "High",
                    color: "#dc2626",
                    bg: "rgba(239,68,68,0.08)",
                    desc: "Requires immediate attention and resources",
                  },
                  {
                    value: "Medium",
                    color: "#d97706",
                    bg: "rgba(251,191,36,0.08)",
                    desc: "Important but not immediately critical",
                  },
                  {
                    value: "Low",
                    color: "#16a34a",
                    bg: "rgba(34,197,94,0.08)",
                    desc: "Routine — can be handled in normal course",
                  },
                ].map((p) => (
                  <div
                    key={p.value}
                    onClick={() => setSelectedPriority(p.value)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "14px",
                      padding: "14px 16px",
                      borderRadius: "10px",
                      border: `2px solid ${selectedPriority === p.value ? p.color : "#e5e7eb"}`,
                      background: selectedPriority === p.value ? p.bg : "white",
                      cursor: "pointer",
                      transition: "all 0.18s ease",
                    }}
                  >
                    <div
                      style={{
                        width: "40px",
                        height: "40px",
                        borderRadius: "50%",
                        background: p.bg,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      <div
                        style={{
                          width: "14px",
                          height: "14px",
                          borderRadius: "50%",
                          background: p.color,
                        }}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          fontWeight: 700,
                          fontSize: "14px",
                          color:
                            selectedPriority === p.value ? p.color : "#111827",
                        }}
                      >
                        {p.value} Priority
                      </div>
                      <div
                        style={{
                          fontSize: "12px",
                          color: "#6b7280",
                          marginTop: "2px",
                        }}
                      >
                        {p.desc}
                      </div>
                    </div>
                    {selectedPriority === p.value && (
                      <div
                        style={{
                          width: "24px",
                          height: "24px",
                          borderRadius: "50%",
                          background: p.color,
                          color: "white",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "12px",
                          fontWeight: 700,
                          flexShrink: 0,
                        }}
                      >
                        ✓
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <div className="cm-modal-footer">
              <button
                className="cm-btn cm-btn-secondary"
                onClick={() => setShowPriorityModal(false)}
              >
                Cancel
              </button>
              <button
                className="cm-btn cm-btn-primary"
                onClick={() =>
                  setShowActionConfirm({
                    show: true,
                    type: "priority",
                    label: `Set priority to "${selectedPriority}"?`,
                    onConfirm: handleUpdatePriority,
                  })
                }
                disabled={modalLoading}
              >
                {modalLoading ? "Updating..." : "Update Priority"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── CONFIRM ACTION MODAL ── */}
      {showActionConfirm.show && (
        <div className="cm-modal" style={{ zIndex: 1100 }}>
          <div
            className="cm-modal-content"
            style={{ maxWidth: "420px", padding: 0 }}
          >
            <div
              style={{
                padding: "20px 24px",
                background:
                  "linear-gradient(135deg, var(--navy-dark) 0%, var(--navy-primary) 100%)",
                borderBottom: "3px solid var(--red-primary)",
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
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </div>
              <div style={{ flex: 1 }}>
                <h3
                  style={{
                    margin: 0,
                    fontSize: "16px",
                    fontWeight: 700,
                    color: "white",
                  }}
                >
                  Confirm Update
                </h3>
                <p
                  style={{
                    margin: 0,
                    fontSize: "12px",
                    color: "rgba(255,255,255,0.6)",
                    marginTop: "2px",
                  }}
                >
                  Please review before saving
                </p>
              </div>
              <span
                onClick={() =>
                  setShowActionConfirm({
                    show: false,
                    type: "",
                    label: "",
                    onConfirm: null,
                  })
                }
                style={{
                  color: "rgba(255,255,255,0.7)",
                  fontSize: "22px",
                  cursor: "pointer",
                  lineHeight: 1,
                }}
              >
                &times;
              </span>
            </div>
            <div style={{ padding: "24px" }}>
              <p
                style={{
                  margin: 0,
                  fontSize: "14px",
                  color: "#374151",
                  lineHeight: "1.6",
                }}
              >
                {showActionConfirm.label} This will update the record
                immediately.
              </p>
            </div>
            <div
              style={{
                padding: "16px 24px",
                borderTop: "1px solid #e5e7eb",
                display: "flex",
                gap: "12px",
                justifyContent: "flex-end",
                background: "var(--gray-50)",
                borderRadius: "0 0 8px 8px",
              }}
            >
              <button
                className="cm-btn cm-btn-secondary"
                onClick={() =>
                  setShowActionConfirm({
                    show: false,
                    type: "",
                    label: "",
                    onConfirm: null,
                  })
                }
              >
                Cancel
              </button>
              <button
                className="cm-btn cm-btn-primary"
                onClick={() => {
                  showActionConfirm.onConfirm();
                  setShowActionConfirm({
                    show: false,
                    type: "",
                    label: "",
                    onConfirm: null,
                  });
                }}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── ERROR MODAL ── */}
      {errorModal.show && (
        <div className="cm-modal">
          <div className="cm-modal-content" style={{ maxWidth: "420px" }}>
            <div
              className="cm-modal-header"
              style={{ background: "#c1272d", borderRadius: "8px 8px 0 0" }}
            >
              <h2
                style={{
                  color: "white",
                  fontSize: "16px",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                    clipRule="evenodd"
                  />
                </svg>
                Error
              </h2>
              <span
                className="cm-modal-close"
                style={{ color: "white" }}
                onClick={() => setErrorModal({ show: false, message: "" })}
              >
                &times;
              </span>
            </div>
            <div className="cm-modal-body">
              <p
                style={{
                  color: "#374151",
                  fontSize: "14px",
                  lineHeight: "1.6",
                }}
              >
                {errorModal.message}
              </p>
            </div>
            <div className="cm-modal-footer">
              <button
                className="cm-btn cm-btn-primary"
                onClick={() => setErrorModal({ show: false, message: "" })}
              >
                OK
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

      {/* ── ACTION LOADING MODAL ── */}
      <LoadingModal
        isOpen={modalLoading || loading}
        message={loading ? "Loading cases..." : "Processing, please wait..."}
      />
    </div>
  );
}

export default CaseManagement;
