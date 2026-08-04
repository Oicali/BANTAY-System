import React, { useState, useRef } from "react";
import { Eye, EyeOff } from "lucide-react";
import "./DeleteUserModal.css";
import LoadingModal from "../modals/LoadingModal";

const API_URL = import.meta.env.VITE_API_URL; // ← add here
function fmtCountdown(msLeft) {
  if (msLeft <= 0) return "0m 00s";
  const totalSecs = Math.ceil(msLeft / 1000);
  const m = Math.floor(totalSecs / 60);
  const s = totalSecs % 60;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

function startLockCountdown(
  msLeft,
  setCountdown,
  timerRef,
  untilRef,
  onExpire,
) {
  clearInterval(timerRef.current);
  untilRef.current = Date.now() + msLeft;
  const tick = () => {
    const left = untilRef.current - Date.now();
    if (left <= 0) {
      setCountdown("0m 00s");
      clearInterval(timerRef.current);
      onExpire();
      return;
    }
    setCountdown(fmtCountdown(left));
  };
  tick();
  timerRef.current = setInterval(tick, 1000);
}
const DeleteUserModal = ({ isOpen, onClose, user, onUserDeleted }) => {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [attemptsLeft, setAttemptsLeft] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [locked, setLocked] = useState(false);
  const [lockCountdown, setLockCountdown] = useState("");
  const lockTimerRef = useRef(null);
  const lockUntilRef = useRef(null);
  const modalContentRef = useRef(null);

  const handleClose = () => {
    setPassword("");
    setShowPassword(false);
    setError("");
    setAttemptsLeft(null);
    setLocked(false);
    clearInterval(lockTimerRef.current);
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
    setAttemptsLeft(null);

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
        },
      );

      const data = await response.json();

      if (!response.ok) {
        if (data.locked) {
          setLocked(true);
          setPassword("");
          startLockCountdown(
            data.msLeft ?? (data.minutesLeft || 15) * 60_000,
            setLockCountdown,
            lockTimerRef,
            lockUntilRef,
            () => setLocked(false),
          );
          setIsDeleting(false);
          return;
        }
        setError(data.message || "Failed to deactivate user");
        if (data.attemptsLeft !== undefined) setAttemptsLeft(data.attemptsLeft);
        setIsDeleting(false);
        return;
      }

      if (data.success) {
        onUserDeleted(
          `User ${user.username} has been deactivated successfully`,
        );
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
          {locked ? (
            <div className="dum-modal-form" style={{ textAlign: "center" }}>
              <div
                className="dum-warning-box"
                style={{ flexDirection: "column", alignItems: "center" }}
              >
                <h3>Too Many Incorrect Attempts ⚠️</h3>
                <p>
                  For your security, this action has been temporarily locked.
                </p>
                <p style={{ fontWeight: 700, fontSize: 20, marginTop: 8 }}>
                  Try again in: {lockCountdown || "Calculating…"}
                </p>
              </div>
              <button
                type="button"
                className="dum-btn dum-btn-secondary"
                onClick={handleClose}
                style={{ marginTop: 16 }}
              >
                Close
              </button>
            </div>
          ) : (
            
          <form onSubmit={handleSubmit} className="dum-modal-form">
            {/* Warning Box */}
            <div className="dum-warning-box">
              <div className="dum-warning-content">
                <h3> You are about to deactivate this user ⚠️</h3>
                <p>
                  <strong>{getFullName()}</strong> ({user.email})
                </p>
                <p className="dum-warning-description">
                  This user account will be deactivated and no longer be able to
                  access the system. This action can be reversed by reactivating
                  the user account.
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
                <label className="dum-form-label">
                  Administrator Password *
                </label>
                <div className="dum-password-input-wrapper">
                  <input
                    type={showPassword ? "text" : "password"}
                    name="password"
                    style={{ fontSize: "16px" }}
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
                {error && (
                  <span className="dum-error-text">
                    {error}
                    {attemptsLeft !== null &&
                      ` — ${attemptsLeft} attempt${attemptsLeft === 1 ? "" : "s"} left`}
                  </span>
                )}
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
          )}
        </div>
      </div>
    </>
  );
};

export default DeleteUserModal;