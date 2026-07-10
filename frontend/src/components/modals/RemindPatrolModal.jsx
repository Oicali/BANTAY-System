// frontend\src\components\modals\RemindPatrolModal.jsx

import React, { useState, useEffect } from "react";
import "./RemindPatrolModal.css";

const RemindPatrolModal = ({ isOpen, onClose, blotterId, blotterNumber, onRemind }) => {
  const [patrols, setPatrols] = useState([]);
  const [selectedPatrols, setSelectedPatrols] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectAll, setSelectAll] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchPatrols();
    }
  }, [isOpen]);

 const fetchPatrols = async () => {
  setLoading(true);
  try {
    const response = await fetch(`${import.meta.env.VITE_API_URL}/blotters/patrols`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem("token")}`,
      },
    });
    const data = await response.json();
    if (data.success) {
      setPatrols(data.data);
    }
  } catch (error) {
    console.error("Error fetching patrols:", error);
  } finally {
    setLoading(false);
  }
};

  const handleSelectAll = () => {
    if (selectAll) {
      setSelectedPatrols([]);
    } else {
      setSelectedPatrols(patrols.map(p => p.user_id));
    }
    setSelectAll(!selectAll);
  };

  const handleTogglePatrol = (userId) => {
    setSelectedPatrols(prev =>
      prev.includes(userId)
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const handleSubmit = async () => {
    if (selectedPatrols.length === 0) {
      alert("Please select at least one patrol to remind");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/blotters/${blotterId}/remind`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify({ patrol_ids: selectedPatrols }),
      });
      const data = await response.json();
      if (data.success) {
        onRemind?.(selectedPatrols.length);
        onClose();
      } else {
        alert(data.message || "Failed to send reminders");
      }
    } catch (error) {
      console.error("Error sending reminders:", error);
      alert("Error sending reminders");
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container remind-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-header-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </svg>
          </div>
          <div className="modal-header-text">
            <h3>Remind Patrol Officers</h3>
            <p>Select patrol officers to remind about referral #{blotterNumber}</p>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          {loading ? (
            <div className="remind-loading">Loading patrol officers...</div>
          ) : patrols.length === 0 ? (
            <div className="remind-empty">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              <p>No patrol officers found</p>
            </div>
          ) : (
            <>
              <div className="remind-select-all">
                <label className="remind-checkbox-label">
                  <input
                    type="checkbox"
                    checked={selectAll}
                    onChange={handleSelectAll}
                  />
                  <span>Select All Patrol Officers</span>
                </label>
                <span className="remind-count">{selectedPatrols.length} selected</span>
              </div>

              <div className="remind-patrol-list">
                {patrols.map(patrol => (
                  <label key={patrol.user_id} className="remind-patrol-item">
                    <input
                      type="checkbox"
                      checked={selectedPatrols.includes(patrol.user_id)}
                      onChange={() => handleTogglePatrol(patrol.user_id)}
                    />
                    <div className="remind-patrol-avatar">
                      {patrol.profile_picture ? (
                        <img src={patrol.profile_picture} alt="" />
                      ) : (
                        <span>{patrol.first_name?.[0]}{patrol.last_name?.[0]}</span>
                      )}
                    </div>
                    <div className="remind-patrol-info">
                      <div className="remind-patrol-name">
                        {patrol.rank_abbreviation && `${patrol.rank_abbreviation}. `}
                        {patrol.first_name} {patrol.last_name}
                      </div>
                      <div className="remind-patrol-email">{patrol.email}</div>
                    </div>
                  </label>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="modal-footer">
          <button className="modal-btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="modal-btn-primary"
            onClick={handleSubmit}
            disabled={submitting || selectedPatrols.length === 0}
          >
            {submitting ? "Sending..." : `Send Reminder (${selectedPatrols.length})`}
          </button>
        </div>
      </div>
    </div>
  );
};

export default RemindPatrolModal;