import React, { useState, useEffect, useRef } from "react";
import ReactDOM from "react-dom";
import "./EditResidentModal.css";
const CIVIL_STATUSES = [
  "Single",
  "Married",
  "Widowed",
  "Separated",
  "Annulled",
];
const VOTER_STATUSES = ["Registered", "Not Registered"];
const GENDERS = ["Male", "Female"];

const CameraIcon = () => (
  <svg
    width="28"
    height="28"
    viewBox="0 0 24 24"
    fill="none"
    stroke="#9ca3af"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
    <circle cx="12" cy="13" r="4" />
  </svg>
);

const UploadIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ marginRight: 6 }}
  >
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);

function EditResidentModal({ resident, onClose, onSuccess }) {
  const [form, setForm] = useState({
    first_name: "",
    middle_name: "",
    last_name: "",
    qualifier: "",
    gender: "",
    date_of_birth: "",
    contact_number: "",
    house_street: "",
    civil_status: "",
    voter_status: "",
  });
  const [photo, setPhoto] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const fileRef = useRef();

  useEffect(() => {
    if (!resident) return;
    setForm({
      first_name: resident.first_name || "",
      middle_name: resident.middle_name || "",
      last_name: resident.last_name || "",
      qualifier: resident.qualifier || "",
      gender: resident.gender || "",
      date_of_birth: resident.date_of_birth
        ? resident.date_of_birth.split("T")[0]
        : "",
      contact_number: resident.contact_number || "",
      house_street: resident.house_street || "",
      civil_status: resident.civil_status || "",
      voter_status: resident.voter_status || "",
    });
    setPhotoPreview(resident.profile_picture || null);
    setErrors({});
    setPhoto(null);
  }, [resident]);

  const validate = () => {
    const e = {};
    if (!form.first_name.trim()) e.first_name = "First name is required";
    if (!form.last_name.trim()) e.last_name = "Last name is required";
    if (form.contact_number && !/^09\d{9}$/.test(form.contact_number.trim()))
      e.contact_number = "Must be 09XXXXXXXXX format (11 digits)";
    if (form.date_of_birth) {
      const age =
        (Date.now() - new Date(form.date_of_birth)) /
        (365.25 * 24 * 3600 * 1000);
      if (age < 0 || age > 150) e.date_of_birth = "Invalid date of birth";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === "contact_number") {
      const digits = value.replace(/\D/g, "").slice(0, 11);
      setForm((prev) => ({ ...prev, contact_number: digits }));
    } else {
      setForm((prev) => ({ ...prev, [name]: value }));
    }
    setErrors((prev) => ({ ...prev, [name]: "" }));
  };

  const handlePhoto = (f) => {
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      alert("Images only");
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      alert("Max 5MB");
      return;
    }
    setPhoto(f);
    setPhotoPreview(URL.createObjectURL(f));
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v ?? ""));
      if (photo) fd.append("profile_picture", photo);

      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/residents/${resident.resident_id}`,
        {
          method: "PUT",
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
          body: fd,
        },
      );
      const data = await res.json();
      if (data.success) {
        onSuccess && onSuccess();
        onClose();
      } else alert(data.message || "Update failed");
    } catch (err) {
      alert("Error: " + err.message);
    }
    setLoading(false);
  };

  if (!resident) return null;

  return ReactDOM.createPortal(
    <div className="erm-overlay">
      <div className="erm-modal">
        {/* Header */}
        <div className="erm-header">
          <div>
            <h2 className="erm-title">Edit Resident</h2>
            <p className="erm-subtitle">Update resident information</p>
          </div>
          <button className="erm-close" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="erm-body">
          {/* Photo Section */}
          <div className="erm-section">
            <h3 className="erm-section-title">Profile Photo</h3>
            <div className="erm-photo-row">
              <div
                className="erm-photo-circle"
                onClick={() => fileRef.current.click()}
              >
                {photoPreview ? (
                  <img
                    src={photoPreview}
                    alt="preview"
                    className="erm-photo-img"
                  />
                ) : (
                  <div className="erm-photo-placeholder">
                    <CameraIcon />
                    <span>Upload Photo</span>
                  </div>
                )}
              </div>
              <div className="erm-photo-actions">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={(e) => handlePhoto(e.target.files[0])}
                />
                <button
                  className="erm-btn-outline"
                  onClick={() => fileRef.current.click()}
                >
                  <UploadIcon /> Choose Photo (optional)
                </button>
                <p className="erm-hint">JPEG or PNG, max 5MB</p>
              </div>
            </div>
          </div>

          {/* Name Section */}
          <div className="erm-section">
            <h3 className="erm-section-title">Personal Information</h3>
            <div className="erm-grid-3">
              <div className="erm-field">
                <label className="erm-label">
                  First Name <span className="erm-required">*</span>
                </label>
                <input
                  name="first_name"
                  value={form.first_name}
                  onChange={handleChange}
                  className={`erm-input${errors.first_name ? " erm-input-err" : ""}`}
                  placeholder="First name"
                />
                {errors.first_name && (
                  <span className="erm-err">{errors.first_name}</span>
                )}
              </div>
              <div className="erm-field">
                <label className="erm-label">Middle Name</label>
                <input
                  name="middle_name"
                  value={form.middle_name}
                  onChange={handleChange}
                  className="erm-input"
                  placeholder="Middle name (optional)"
                />
              </div>
              <div className="erm-field">
                <label className="erm-label">
                  Last Name <span className="erm-required">*</span>
                </label>
                <input
                  name="last_name"
                  value={form.last_name}
                  onChange={handleChange}
                  className={`erm-input${errors.last_name ? " erm-input-err" : ""}`}
                  placeholder="Last name"
                />
                {errors.last_name && (
                  <span className="erm-err">{errors.last_name}</span>
                )}
              </div>
            </div>

            <div className="erm-grid-3">
              <div className="erm-field">
                <label className="erm-label">Qualifier</label>
                <input
                  name="qualifier"
                  value={form.qualifier}
                  onChange={handleChange}
                  className="erm-input"
                  placeholder="Jr., Sr., III"
                />
              </div>
              <div className="erm-field">
                <label className="erm-label">Gender</label>
                <select
                  name="gender"
                  value={form.gender}
                  onChange={handleChange}
                  className="erm-input"
                >
                  <option value="">Select gender</option>
                  {GENDERS.map((g) => (
                    <option key={g}>{g}</option>
                  ))}
                </select>
              </div>
              <div className="erm-field">
                <label className="erm-label">Date of Birth</label>
                <input
                  type="date"
                  name="date_of_birth"
                  value={form.date_of_birth}
                  onChange={handleChange}
                  className={`erm-input${errors.date_of_birth ? " erm-input-err" : ""}`}
                  max={new Date().toISOString().split("T")[0]}
                />
                {errors.date_of_birth && (
                  <span className="erm-err">{errors.date_of_birth}</span>
                )}
              </div>
            </div>
          </div>

          {/* Contact & Status Section */}
          <div className="erm-section">
            <h3 className="erm-section-title">Contact & Status</h3>
            <div className="erm-grid-3">
              <div className="erm-field">
                <label className="erm-label">Contact Number</label>
                <input
                  name="contact_number"
                  value={form.contact_number}
                  onChange={handleChange}
                  className={`erm-input${errors.contact_number ? " erm-input-err" : ""}`}
                  placeholder="09XXXXXXXXX"
                  maxLength={11}
                />
                {errors.contact_number && (
                  <span className="erm-err">{errors.contact_number}</span>
                )}
              </div>
              <div className="erm-field">
                <label className="erm-label">Civil Status</label>
                <select
                  name="civil_status"
                  value={form.civil_status}
                  onChange={handleChange}
                  className="erm-input"
                >
                  <option value="">Select status</option>
                  {CIVIL_STATUSES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div className="erm-field">
                <label className="erm-label">Voter Status</label>
                <select
                  name="voter_status"
                  value={form.voter_status}
                  onChange={handleChange}
                  className="erm-input"
                >
                  <option value="">Select status</option>
                  {VOTER_STATUSES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="erm-field">
              <label className="erm-label">House / Street Address</label>
              <input
                name="house_street"
                value={form.house_street}
                onChange={handleChange}
                className="erm-input"
                placeholder="e.g. 123 Rizal St., Brgy. Sineguelasan"
                maxLength={200}
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="erm-footer">
          <button
            className="erm-btn-cancel"
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </button>
          <button
            className="erm-btn-save"
            onClick={handleSubmit}
            disabled={loading}
          >
            {loading ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default EditResidentModal;
