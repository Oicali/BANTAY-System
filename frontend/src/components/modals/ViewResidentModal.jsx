import React from "react";
import ReactDOM from "react-dom";
import "./ViewResidentModal.css";

const formatDate = (d) => {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-PH", {
    year: "numeric", month: "long", day: "numeric",
  });
};

const Field = ({ label, value }) => (
  <div className="vrm-field">
    <span className="vrm-label">{label}</span>
    <span className="vrm-value">{value || "—"}</span>
  </div>
);

function ViewResidentModal({ resident, onClose }) {
  if (!resident) return null;

  const fullName = [
    resident.last_name,
    resident.first_name,
    resident.middle_name ? `${resident.middle_name[0]}.` : "",
    resident.qualifier || "",
  ].filter(Boolean).join(" ");

  return ReactDOM.createPortal(
    <div className="vrm-overlay">
      <div className="vrm-modal">
        {/* Header */}
        <div className="vrm-header">
          <div>
            <h2 className="vrm-title">Resident Information</h2>
            <p className="vrm-subtitle">View-only — contact your Councilor to make changes</p>
          </div>
          <button className="vrm-close" onClick={onClose}>&times;</button>
        </div>

        <div className="vrm-body">
          {/* Avatar + name */}
          <div className="vrm-profile-row">
            <div className="vrm-avatar">
              {resident.profile_picture ? (
                <img src={resident.profile_picture} alt={resident.first_name}
                  className="vrm-avatar-img" />
              ) : (
                <span className="vrm-avatar-initials">
                  {((resident.first_name?.[0] || "") + (resident.last_name?.[0] || "")).toUpperCase()}
                </span>
              )}
            </div>
            <div>
              <div className="vrm-full-name">{fullName}</div>
              <div className="vrm-meta">
                {resident.gender || "—"} · {resident.civil_status || "—"}
              </div>
            </div>
          </div>

          {/* Personal Info */}
          <div className="vrm-section">
            <h3 className="vrm-section-title">Personal Information</h3>
            <div className="vrm-grid">
              <Field label="First Name" value={resident.first_name} />
              <Field label="Middle Name" value={resident.middle_name} />
              <Field label="Last Name" value={resident.last_name} />
              <Field label="Qualifier" value={resident.qualifier} />
              <Field label="Gender" value={resident.gender} />
              <Field label="Date of Birth" value={formatDate(resident.date_of_birth)} />
            </div>
          </div>

          {/* Contact & Status */}
          <div className="vrm-section">
            <h3 className="vrm-section-title">Contact & Status</h3>
            <div className="vrm-grid">
              <Field label="Contact Number" value={resident.contact_number} />
              <Field label="Civil Status" value={resident.civil_status} />
              <Field label="Voter Status" value={resident.voter_status} />
            </div>
            <div className="vrm-field" style={{ marginTop: 8 }}>
              <span className="vrm-label">Address</span>
              <span className="vrm-value">{resident.house_street || "—"}</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="vrm-footer">
          <button className="vrm-btn-close" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default ViewResidentModal;