import React, { useState, useRef } from "react";
import { Eye, EyeOff } from "lucide-react";
import "./DeleteUserModal.css";
import LoadingModal from "../modals/LoadingModal";

const API_URL = import.meta.env.VITE_API_URL; // ← add here

const DeleteUserModal = ({ isOpen, onClose, user, onUserDeleted }) => {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  const modalContentRef = useRef(null);

  const handleClose = () => {
    setPassword("");
    setShowPassword(false);
    setError("");
    onClose();
  };

  const handlePasswordChange = (e) => {
    setPassword(e.target.value);
    if (error) {
      setError("");
    }
  };

  const handlePasswordPaste = (e) => {
    e.preventDefault();
    return false;
  };

  const handlePasswordCopy = (e) => {
    e.preventDefault();
    return false;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!password.trim()) {
      setError("Password is required");
      return;
    }

    setIsDeleting(true);
    setError("");

    try {
      const token = localStorage.getItem("token");

      if (!token) {
        setError("Authentication token not found. Please login again.");
        setIsDeleting(false);
        return;
      }

      const response = await fetch(
        `${API_URL}/user-management/users/${user.user_id}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            adminPassword: password,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 401) {
          setError(data.message || "Incorrect password");
        } else {
          setError(data.message || "Failed to deactivate user");
        }
        setIsDeleting(false);
        return;
      }

      if (data.success) {
        onUserDeleted(`User ${user.username} has been deactivated successfully`);
        handleClose();
      } else {
        setError(data.message || "Failed to deactivate user");
      }
    } catch (error) {
      console.error("Deactivate user error:", error);
      setError("An error occurred while deactivating the user");
    } finally {
      setIsDeleting(false);
    }
  };

  if (!isOpen || !user) return null;

  const getFullName = () => {
    const firstName  = user.first_name  || "";
    const middleName = user.middle_name || "";
    const lastName   = user.last_name   || "";
    const suffix     = user.suffix      || "";

    if (firstName && lastName) {
      const parts    = [firstName, middleName, lastName, suffix].filter(Boolean);
      const fullName = parts.join(" ");
      if (fullName.length > 30) {
        return fullName.substring(0, 27) + "...";
      }
      return fullName;
    }
    return user.username;
  };

  return (
    <>
    <LoadingModal isOpen={isDeleting} message="Deactivating user..." />
    <div className="dum-modal-overlay" onClick={handleClose}>
      <div
        className="dum-modal-container"
        ref={modalContentRef}
        onClick={(e) => e.stopPropagation()}
      >
        {/* MODAL HEADER */}
        <div className="dum-modal-header">
          <h2>Deactivate User</h2>
          <button
            type="button"
            className="dum-modal-close"
            onClick={handleClose}
            disabled={isDeleting}
          >
            ×
          </button>
        </div>

        {/* MODAL FORM */}
        <form onSubmit={handleSubmit} className="dum-modal-form">
          {/* Warning Box */}
          <div className="dum-warning-box">
            <div className="dum-warning-content">
              <h3> You are about to deactivate this user ⚠️</h3>
              <p>
                <strong>{getFullName()}</strong> ({user.email})
              </p>
              <p className="dum-warning-description">
                This user account will be deactivated and no longer be able
                to access the system. This action can be reversed by
                reactivating the user account.
              </p>
            </div>
          </div>

          {/* Password Confirmation Section */}
          <div className="dum-form-section">
            <h3 className="dum-form-section-title">Confirm Your Identity</h3>
            <p className="dum-form-section-description">
              Please enter your administrator password to confirm this action.
            </p>

            <div className="dum-form-group">
              <label className="dum-form-label">Administrator Password *</label>
              <div className="dum-password-input-wrapper">
                <input
                  type={showPassword ? "text" : "password"}
                  name="password"
                  className={`dum-form-input ${error ? "dum-error" : ""}`}
                  value={password}
                  onChange={handlePasswordChange}
                  onPaste={handlePasswordPaste}
                  onCopy={handlePasswordCopy}
                  onCut={handlePasswordCopy}
                  placeholder="Enter your password"
                  disabled={isDeleting}
                  autoFocus
                />
                <button
                  type="button"
                  className="dum-password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                  disabled={isDeleting}
                  tabIndex="-1"
                >
                  {showPassword ? <Eye size={20} /> : <EyeOff size={20} />}
                </button>
              </div>
              {error && <span className="dum-error-text">{error}</span>}
            </div>
          </div>

          {/* Modal Actions */}
          <div className="dum-modal-actions">
            <button
              type="button"
              className="dum-btn dum-btn-secondary"
              onClick={handleClose}
              disabled={isDeleting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="dum-btn dum-btn-danger"
              disabled={isDeleting}
            >
              {isDeleting ? "Deactivating..." : "Deactivate User"}
            </button>
          </div>
        </form>
      </div>
    </div>
    </>
  );
};

export default DeleteUserModal;