import React, { useState, useEffect } from 'react';
import './CaseManagement.css';

const API_URL = `${import.meta.env.VITE_API_URL}/cases`;
const BLOTTER_URL = `${import.meta.env.VITE_API_URL}/blotters`;

const getToken = () => localStorage.getItem('token');
const getUser = () => ({
  role: localStorage.getItem('role'),
  user_id: localStorage.getItem('userId'),
  username: localStorage.getItem('username'),
});

function CaseManagement() {
  const [cases, setCases] = useState([]);
  const [stats, setStats] = useState({ total_cases: 0, active_cases: 0, solved_cases: 0, cleared_cases: 0, referred_cases: 0, unassigned_cases: 0, high_priority_cases: 0 });
  const [loading, setLoading] = useState(false);
const [activeTab, setActiveTab] = useState('all');
  const [filters, setFilters] = useState({ status: '', priority: '' });

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);

  // Data
  const [blotters, setBlotters] = useState([]);
  const [investigators, setInvestigators] = useState([]);
  const [selectedCase, setSelectedCase] = useState(null);
  const [selectedBlotterId, setSelectedBlotterId] = useState('');
  const [selectedInvestigatorId, setSelectedInvestigatorId] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [noteText, setNoteText] = useState('');
  const [modalLoading, setModalLoading] = useState(false);
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });
const [errorModal, setErrorModal] = useState({ show: false, message: '' });
const showError = (message) => {
  setErrorModal({ show: true, message });
};
  const [showPriorityModal, setShowPriorityModal] = useState(false);
  const [selectedPriority, setSelectedPriority] = useState('');
  const user = getUser();
  const isAdmin = user.role === 'Administrator';
  const isInvestigator = user.role === 'Investigator';
const [currentPage, setCurrentPage] = useState(1);
const ITEMS_PER_PAGE = 10;
  useEffect(() => {
  if (isInvestigator) {
    setActiveTab('my');
    fetchCases('my');
  } else {
    fetchCases('all');
    fetchStats();
  }
}, []);

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000);
  };

  const fetchCases = async (tabOverride = null, filterOverride = null) => {
    try {
      setLoading(true);
      const tab = tabOverride !== null ? tabOverride : activeTab;
      const f = filterOverride !== null ? filterOverride : filters;
      const params = new URLSearchParams();
      if (f.status) params.append('status', f.status);
      if (f.priority) params.append('priority', f.priority);

      const res = await fetch(`${API_URL}?${params}`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      const data = await res.json();
      if (data.success) {
        let result = data.data;
        if (tab === 'my') result = result.filter(c => c.assigned_io_id === user.user_id || c.assigned_io_name?.includes(user.first_name));
        if (tab === 'high') result = result.filter(c => c.priority === 'High');
        if (tab === 'unassigned') result = result.filter(c => !c.assigned_io_id || c.assigned_io_id === null || c.assigned_io_id === '');
        if (f.search) result = result.filter(c => c.case_number?.toLowerCase().includes(f.search.toLowerCase()));
        
        setCases(result);
        setCurrentPage(1);
      }
      
    } catch (err) {
      console.error('Fetch cases error:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await fetch(`${API_URL}/statistics`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      const data = await res.json();
      if (data.success) setStats(data.data);
    } catch (err) { console.error(err); }
  };

  const fetchBlotters = async () => {
  try {
    const res = await fetch(BLOTTER_URL, {
      headers: { Authorization: `Bearer ${getToken()}` }
    });
    const data = await res.json();
    if (data.success) {
      // Filter out blotters that already have a case
      const caseRes = await fetch(API_URL, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      const caseData = await caseRes.json();
      const usedBlotterIds = caseData.success 
        ? caseData.data.map(c => c.blotter_id) 
        : [];
      setBlotters(data.data.filter(b => !usedBlotterIds.includes(b.blotter_id)));
    }
  } catch (err) { console.error(err); }
};

  const fetchInvestigators = async () => {
  try {
    const res = await fetch(`${import.meta.env.VITE_API_URL}/user-management/users?userType=police&role=Investigator&limit=100`, {
      headers: { Authorization: `Bearer ${getToken()}` }
    });
    const data = await res.json();
    if (data.users) {
      setInvestigators(data.users.filter(u => u.status === 'active'));
    }
  } catch (err) { console.error(err); }
};

  const fetchCaseDetail = async (caseId) => {
    try {
      const res = await fetch(`${API_URL}/${caseId}`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      const data = await res.json();
      if (data.success) setSelectedCase(data.data);
    } catch (err) { console.error(err); }
  };

  // Handlers
  const handleCreateCase = async () => {
    if (!selectedBlotterId) return showError('Please select a blotter entry to continue.');
    try {
      setModalLoading(true);
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ blotter_id: parseInt(selectedBlotterId) })
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Case ${data.data.case_number} created successfully!`);
        setShowCreateModal(false);
        setSelectedBlotterId('');
        fetchCases();
        fetchStats();
      } else {
        showError(data.message);
      }
    } catch (err) { showError('Failed to create case. Please try again.'); }
    finally { setModalLoading(false); }
  };

  const handleAssign = async () => {
    try {
      setModalLoading(true);
      const res = await fetch(`${API_URL}/${selectedCase.id}/assign`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ assigned_io_id: selectedInvestigatorId })
      });
      const data = await res.json();
      if (data.success) {
        showToast(selectedInvestigatorId ? 'Investigator assigned successfully!' : 'Investigator unassigned successfully!');
        setShowAssignModal(false);
        fetchCases();
        fetchStats();
      } else { showError(data.message); }
    } catch (err) { showError('Failed to assign investigator. Please try again.'); }
    finally { setModalLoading(false); }
  };

  const handleUpdatePriority = async () => {
  if (!selectedPriority) return showError('Please select a priority to continue.');
  try {
    setModalLoading(true);
    const res = await fetch(`${API_URL}/${selectedCase.id}/priority`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ priority: selectedPriority })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Priority updated successfully!');
      setShowPriorityModal(false);
      fetchCases();
      fetchStats();
    } else { showError(data.message); }
  } catch (err) { showError('Failed to update priority. Please try again.'); }
  finally { setModalLoading(false); }
};

const openPriorityModal = (c) => {
  setSelectedCase(c);
  setSelectedPriority(c.priority);
  setShowPriorityModal(true);
};

  const handleUpdateStatus = async () => {
    if (!selectedStatus) return showError('Please select a status to continue.');
    try {
      setModalLoading(true);
      const res = await fetch(`${API_URL}/${selectedCase.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ status: selectedStatus })
      });
      const data = await res.json();
      if (data.success) {
        showToast('Status updated successfully!');
        setShowStatusModal(false);
        fetchCases();
        fetchStats();
      } else { showError(data.message); }
    } catch (err) { showError('Failed to update status. Please try again.'); }
    finally { setModalLoading(false); }
  };

  const handleAddNote = async () => {
    if (!noteText.trim() || noteText.trim().length < 3) return showError('Note must be at least 3 characters long.');
    try {
      setModalLoading(true);
      const res = await fetch(`${API_URL}/${selectedCase.id}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ note: noteText.trim() })
      });
      const data = await res.json();
      if (data.success) {
        showToast('Note added successfully!');
        setNoteText('');
        setShowNoteModal(false);
        if (showDetailModal) fetchCaseDetail(selectedCase.id);
      } else { showError(data.message); }
    } catch (err) { showError('Failed to add note. Please try again.'); }
    finally { setModalLoading(false); }
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    fetchCases(tab);
  };

  const handleFilterChange = (e) => {
    const newFilters = { ...filters, [e.target.name]: e.target.value };
    setFilters(newFilters);
    fetchCases(null, newFilters);
  };

  const openViewDetail = async (c) => {
    setSelectedCase(c);
    setShowDetailModal(true);
    await fetchCaseDetail(c.id);
  };

  const openStatusModal = (c) => {
    setSelectedCase(c);
    setSelectedStatus(c.status);
    setShowStatusModal(true);
  };

  const openAssignModal = (c) => {
    setSelectedCase(c);
    setSelectedInvestigatorId(c.assigned_io_id || '');
    setShowAssignModal(true);
    fetchInvestigators();
  };

  const openNoteModal = (c) => {
    setSelectedCase(c);
    setNoteText('');
    setShowNoteModal(true);
  };

  const openCreateModal = () => {
    setSelectedBlotterId('');
    setShowCreateModal(true);
    fetchBlotters();
  };

  // Helpers
  const formatDate = (d) => {
    if (!d) return 'N/A';
    return new Date(d).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const getPriorityClass = (p) => ({ High: 'cm-priority-high', Medium: 'cm-priority-medium', Low: 'cm-priority-low' }[p] || 'cm-priority-low');
  const getStatusClass = (s) => ({ 'Under Investigation': 'cm-status-active', Solved: 'cm-status-solved', Cleared: 'cm-status-cleared', Referred: 'cm-status-referred' }[s] || 'cm-status-active');
const totalPages = Math.ceil(cases.length / ITEMS_PER_PAGE);
const paginatedCases = cases.slice(
  (currentPage - 1) * ITEMS_PER_PAGE,
  currentPage * ITEMS_PER_PAGE
);
  return (
    <div className="cm-content-area">

     

      {/* HEADER */}
      <div className="cm-page-header">
        <div className="cm-page-header-left">
          <h1>Case Management</h1>
          <p>Track and manage investigation cases</p>
        </div>
        {isAdmin && (
          <button className="cm-btn cm-btn-primary" onClick={openCreateModal}>
            + Create New Case
          </button>
        )}
      </div>

      {/* STATS CARDS — Admin only */}
      {isAdmin && (
        <div className="cm-status-cards-grid">
          <div className="cm-status-card">
            <div className="cm-status-card-label">Total Cases</div>
            <div className="cm-status-card-value">{stats.total_cases}</div>
            <span className="cm-status-card-badge cm-badge-blue">Total</span>
          </div>
          <div className="cm-status-card">
            <div className="cm-status-card-label">Under Investigation</div>
            <div className="cm-status-card-value">{stats.active_cases}</div>
            <span className="cm-status-card-badge cm-badge-yellow">Active</span>
          </div>
          <div className="cm-status-card">
            <div className="cm-status-card-label">Solved</div>
            <div className="cm-status-card-value">{stats.solved_cases}</div>
            <span className="cm-status-card-badge cm-badge-green">Solved</span>
          </div>
          <div className="cm-status-card">
            <div className="cm-status-card-label">Unassigned</div>
            <div className="cm-status-card-value">{stats.unassigned_cases}</div>
            <span className="cm-status-card-badge cm-badge-red">Unassigned</span>
          </div>
        </div>
      )}

      {/* FILTERS */}
      <div className="cm-filter-bar">
      <input
        type="text"
        className="cm-filter-input"
        placeholder="Search by Case No."
        name="search"
        value={filters.search || ''}
        onChange={handleFilterChange}
      />
      <select className="cm-filter-input" name="status" value={filters.status} onChange={handleFilterChange}>
        <option value="">All Status</option>
        <option>Under Investigation</option>
        <option>Solved</option>
        <option>Cleared</option>
        <option>Referred</option>
      </select>
      <select className="cm-filter-input" name="priority" value={filters.priority} onChange={handleFilterChange}>
        <option value="">All Priority</option>
        <option>High</option>
        <option>Medium</option>
        <option>Low</option>
      </select>
    </div>

      {/* TABS */}
      <div className="cm-tab-navigation">
        {(isInvestigator 
  ? ['my', 'high'] 
  : ['all', 'high', 'unassigned']
).map(tab => (
        <button key={tab} className={`cm-tab-btn ${activeTab === tab ? 'cm-active' : ''}`} onClick={() => handleTabChange(tab)}>
          {tab === 'all' ? 'All Cases' : tab === 'my' ? 'My Cases' : tab === 'high' ? 'High Priority' : 'Unassigned'}
        </button>
      ))}
      </div>

      {/* CASES LIST */}
      <div className="cm-cases-grid">
        {loading ? (
          <div className="cm-empty-state">Loading cases...</div>
        ) : cases.length === 0 ? (
          <div className="cm-empty-state">No cases found.</div>
        ) : paginatedCases.map(c => (
          <div className="cm-case-card" key={c.id}>
            <div className="cm-case-header">
              <div>
                <div className="cm-case-id">{c.case_number}</div>
                <div className="cm-case-title">{c.incident_type} — {c.barangay}</div>
              </div>
              <span className={`cm-priority-badge ${getPriorityClass(c.priority)}`}>{c.priority} Priority</span>
            </div>
            <div className="cm-case-meta">
              <div className="cm-case-meta-item">
                <span className="cm-case-meta-label">Assigned To:</span>
                <span>{c.assigned_io_name || 'Unassigned'}</span>
              </div>
              <div className="cm-case-meta-item">
                <span className="cm-case-meta-label">Location:</span>
                <span>{c.location || c.barangay}</span>
              </div>
              <div className="cm-case-meta-item">
                <span className="cm-case-meta-label">Date Opened:</span>
                <span>{formatDate(c.created_at)}</span>
              </div>
            </div>
            <div className="cm-case-footer">
              <span className={`cm-status-badge ${getStatusClass(c.status)}`}>{c.status}</span>
             <div className="cm-case-actions">
                <button className="cm-action-btn cm-action-btn-view" onClick={() => openViewDetail(c)}>View Details</button>
                {isAdmin && (
                  <>
                    <button className="cm-action-btn cm-action-btn-edit" onClick={() => openPriorityModal(c)}>Set Priority</button>
                    <button className="cm-action-btn cm-action-btn-edit" onClick={() => openAssignModal(c)}>Assign IO</button>
                    <button className="cm-action-btn cm-action-btn-edit" onClick={() => openStatusModal(c)}>Update Status</button>
                  </>
                )}
                {(isAdmin || isInvestigator) && (
                  <button className="cm-action-btn cm-action-btn-success" onClick={() => openNoteModal(c)}>Add Notes</button>
                )}
              </div>
            </div>
          </div>
        ))}
        {/* PAGINATION */}
          {!loading && cases.length > 0 && (
            <div className="cm-pagination">
              <div className="cm-pagination-info">
                Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, cases.length)} of {cases.length} cases
              </div>
              <div className="cm-pagination-controls">
                <button
                  className="cm-pagination-btn"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(p => p - 1)}
                >Previous</button>

                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(page => page === 1 || page === totalPages || Math.abs(page - currentPage) <= 1)
                  .reduce((acc, page, idx, arr) => {
                    if (idx > 0 && page - arr[idx - 1] > 1) acc.push('...');
                    acc.push(page);
                    return acc;
                  }, [])
                  .map((item, idx) =>
                    item === '...' ? (
                      <span key={`ellipsis-${idx}`} style={{ padding: '0 6px', color: '#6b7280' }}>...</span>
                    ) : (
                      <button
                        key={item}
                        className={`cm-pagination-btn ${currentPage === item ? 'cm-active' : ''}`}
                        onClick={() => setCurrentPage(item)}
                      >{item}</button>
                    )
                  )}

                <button
                  className="cm-pagination-btn"
                  disabled={currentPage === totalPages || totalPages === 0}
                  onClick={() => setCurrentPage(p => p + 1)}
                >Next</button>
              </div>
            </div>
          )}
      </div>

      {/* ── CREATE CASE MODAL ── */}
      {showCreateModal && (
        <div className="cm-modal">
          <div className="cm-modal-content">
            <div className="cm-modal-header">
              <h2>Create New Case</h2>
              <span className="cm-modal-close" onClick={() => setShowCreateModal(false)}>&times;</span>
            </div>
            <div className="cm-modal-body">
              <p style={{ color: '#6b7280', marginBottom: '16px', fontSize: '14px' }}>
                Select a blotter entry to convert into a case.
              </p>
              <label className="cm-modal-label">Select Blotter *</label>
              <select className="cm-modal-input" value={selectedBlotterId} onChange={e => setSelectedBlotterId(e.target.value)}>
                <option value="">-- Select a Blotter --</option>
                {blotters.map(b => (
                  <option key={b.blotter_id} value={b.blotter_id}>
                    {b.blotter_entry_number} — {b.incident_type} ({b.place_barangay})
                  </option>
                ))}
              </select>
            </div>
            <div className="cm-modal-footer">
              <button className="cm-btn cm-btn-secondary" onClick={() => setShowCreateModal(false)}>Cancel</button>
              <button className="cm-btn cm-btn-primary" onClick={handleCreateCase} disabled={modalLoading}>
                {modalLoading ? 'Creating...' : 'Create Case'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── ASSIGN INVESTIGATOR MODAL ── */}
      {showAssignModal && (
        <div className="cm-modal">
          <div className="cm-modal-content">
            <div className="cm-modal-header">
              <h2>Assign Investigator</h2>
              <span className="cm-modal-close" onClick={() => setShowAssignModal(false)}>&times;</span>
            </div>
            <div className="cm-modal-body">
              <p style={{ color: '#6b7280', marginBottom: '16px', fontSize: '14px' }}>
                Case: <strong>{selectedCase?.case_number}</strong>
              </p>
              <label className="cm-modal-label">Select Investigator *</label>
              {selectedCase?.assigned_io_name && (
                <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '8px' }}>
                  Currently assigned: <strong style={{ color: '#1e3a5f' }}>{selectedCase.assigned_io_name}</strong>
                </p>
              )}
              <select className="cm-modal-input" value={selectedInvestigatorId} onChange={e => setSelectedInvestigatorId(e.target.value)}>
              <option value="">-- Remove / Unassign IO --</option>
              {investigators.map(i => (
                <option key={i.user_id} value={i.user_id}>
                  {i.first_name} {i.last_name}
                </option>
              ))}
            </select>
            </div>
            <div className="cm-modal-footer">
              <button className="cm-btn cm-btn-secondary" onClick={() => setShowAssignModal(false)}>Cancel</button>
              <button className="cm-btn cm-btn-primary" onClick={handleAssign} disabled={modalLoading}>
                {modalLoading ? 'Saving...' : selectedInvestigatorId ? 'Assign Investigator' : 'Unassign IO'}
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
              <span className="cm-modal-close" onClick={() => setShowStatusModal(false)}>&times;</span>
            </div>
            <div className="cm-modal-body">
              <p style={{ color: '#6b7280', marginBottom: '16px', fontSize: '14px' }}>
                Case: <strong>{selectedCase?.case_number}</strong>
              </p>
              <label className="cm-modal-label">Status *</label>
              <select className="cm-modal-input" value={selectedStatus} onChange={e => setSelectedStatus(e.target.value)}>
                <option value="">-- Select Status --</option>
                <option>Under Investigation</option>
                <option>Solved</option>
                <option>Cleared</option>
                <option>Referred</option>
              </select>
            </div>
            <div className="cm-modal-footer">
              <button className="cm-btn cm-btn-secondary" onClick={() => setShowStatusModal(false)}>Cancel</button>
              <button className="cm-btn cm-btn-primary" onClick={handleUpdateStatus} disabled={modalLoading}>
                {modalLoading ? 'Updating...' : 'Update Status'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── ADD NOTE MODAL ── */}
      {showNoteModal && (
        <div className="cm-modal">
          <div className="cm-modal-content">
            <div className="cm-modal-header">
              <h2>Add Investigation Note</h2>
              <span className="cm-modal-close" onClick={() => setShowNoteModal(false)}>&times;</span>
            </div>
            <div className="cm-modal-body">
              <p style={{ color: '#6b7280', marginBottom: '16px', fontSize: '14px' }}>
                Case: <strong>{selectedCase?.case_number}</strong>
              </p>
              <label className="cm-modal-label">Note *</label>
              <textarea
                className="cm-modal-input"
                rows="5"
                placeholder="Write your investigation note here (minimum 3 characters)"
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
                maxLength={2000}
              />
              <small style={{ color: '#9ca3af', fontSize: '12px' }}>{noteText.length}/2000</small>
            </div>
            <div className="cm-modal-footer">
              <button className="cm-btn cm-btn-secondary" onClick={() => setShowNoteModal(false)}>Cancel</button>
              <button className="cm-btn cm-btn-primary" onClick={handleAddNote} disabled={modalLoading}>
                {modalLoading ? 'Saving...' : 'Save Note'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── VIEW DETAIL MODAL ── */}
      {showDetailModal && selectedCase && (
        <div className="cm-modal">
          <div className="cm-modal-content cm-modal-large">
            <div className="cm-modal-header">
              <h2>{selectedCase.case_number}</h2>
              <span className="cm-modal-close" onClick={() => { setShowDetailModal(false); setSelectedCase(null); }}>&times;</span>
            </div>
            <div className="cm-modal-body">
              <div className="cm-detail-grid">
                <div className="cm-detail-item"><span className="cm-detail-label">Incident Type</span><span>{selectedCase.incident_type}</span></div>
                <div className="cm-detail-item"><span className="cm-detail-label">Status</span><span className={`cm-status-badge ${getStatusClass(selectedCase.status)}`}>{selectedCase.status}</span></div>
                <div className="cm-detail-item"><span className="cm-detail-label">Priority</span><span className={`cm-priority-badge ${getPriorityClass(selectedCase.priority)}`}>{selectedCase.priority}</span></div>
                <div className="cm-detail-item"><span className="cm-detail-label">Assigned IO</span><span>{selectedCase.assigned_io_name || 'Unassigned'}</span></div>
                <div className="cm-detail-item"><span className="cm-detail-label">Barangay</span><span>{selectedCase.barangay}</span></div>
                <div className="cm-detail-item"><span className="cm-detail-label">Location</span><span>{selectedCase.location}</span></div>
                <div className="cm-detail-item"><span className="cm-detail-label">Date Opened</span><span>{formatDate(selectedCase.created_at)}</span></div>
                <div className="cm-detail-item"><span className="cm-detail-label">Last Updated</span><span>{formatDate(selectedCase.updated_at)}</span></div>
              </div>

              {selectedCase.narrative && (
                <div style={{ marginTop: '20px' }}>
                  <div className="cm-detail-label">Narrative</div>
                  <p style={{ marginTop: '8px', color: '#374151', lineHeight: '1.6', fontSize: '14px' }}>{selectedCase.narrative}</p>
                </div>
              )}

              {/* Notes Section */}
              <div style={{ marginTop: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <h4 style={{ color: '#1e3a5f', fontWeight: 700 }}>Investigation Notes ({selectedCase.notes?.length || 0})</h4>
                  {(isAdmin || isInvestigator) && (
                    <button className="cm-btn cm-btn-primary" style={{ padding: '8px 16px', fontSize: '13px' }}
                      onClick={() => { setShowDetailModal(false); openNoteModal(selectedCase); }}>
                      + Add Note
                    </button>
                  )}
                </div>
                {selectedCase.notes?.length === 0 ? (
                  <p style={{ color: '#9ca3af', fontSize: '14px' }}>No notes yet.</p>
                ) : (
                  selectedCase.notes?.map(n => (
                    <div key={n.id} className="cm-note-card">
                      <div className="cm-note-header">
                        <strong>{n.added_by_name}</strong>
                        <span>{formatDate(n.created_at)}</span>
                      </div>
                      <p>{n.note}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
            <div className="cm-modal-footer" style={{ display: 'none' }}></div>
          </div>
        </div>
      )}
      {showPriorityModal && (
  <div className="cm-modal">
    <div className="cm-modal-content">
      <div className="cm-modal-header">
        <h2>Update Priority</h2>
        <span className="cm-modal-close" onClick={() => setShowPriorityModal(false)}>&times;</span>
      </div>
      <div className="cm-modal-body">
        <p style={{ color: '#6b7280', marginBottom: '16px', fontSize: '14px' }}>
          Case: <strong>{selectedCase?.case_number}</strong>
        </p>
        <label className="cm-modal-label">Priority *</label>
        <select className="cm-modal-input" value={selectedPriority} onChange={e => setSelectedPriority(e.target.value)}>
          <option value="">-- Select Priority --</option>
          <option>Low</option>
          <option>Medium</option>
          <option>High</option>
        </select>
      </div>
      <div className="cm-modal-footer">
        <button className="cm-btn cm-btn-secondary" onClick={() => setShowPriorityModal(false)}>Cancel</button>
        <button className="cm-btn cm-btn-primary" onClick={handleUpdatePriority} disabled={modalLoading}>
          {modalLoading ? 'Updating...' : 'Update Priority'}
        </button>
      </div>
    </div>
  </div>
)}

{/* ERROR MODAL */}
{errorModal.show && (
  <div className="cm-modal">
    <div className="cm-modal-content" style={{ maxWidth: '420px' }}>
      <div className="cm-modal-header" style={{ background: '#c1272d', borderRadius: '8px 8px 0 0' }}>
        <h2 style={{ color: 'white', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
          Error
        </h2>
        <span className="cm-modal-close" style={{ color: 'white' }} onClick={() => setErrorModal({ show: false, message: '' })}>&times;</span>
      </div>
      <div className="cm-modal-body">
        <p style={{ color: '#374151', fontSize: '14px', lineHeight: '1.6' }}>{errorModal.message}</p>
      </div>
      <div className="cm-modal-footer">
        <button className="cm-btn cm-btn-primary" onClick={() => setErrorModal({ show: false, message: '' })}>OK</button>
      </div>
    </div>
  </div>
)}
 {/* TOAST */}
{toast.show && (
  <div className={`cm-toast cm-toast-${toast.type}`}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      {toast.type === 'success' ? (
        <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
        </svg>
      )}
      <span>{toast.message}</span>
    </div>
  </div>
)}
    </div>
  );
}

export default CaseManagement;