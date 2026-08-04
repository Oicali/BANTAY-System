import React, { useState, useEffect, useRef } from "react";
import "./RestoreUserModal.css";
import { Eye, EyeOff } from "lucide-react";
import LoadingModal from "../modals/LoadingModal";

const API_URL = import.meta.env.VITE_API_URL;
// Shared with DeleteUserModal — both check the same admin password lock
// on the backend, so both should reflect the same lock state instantly.
const REAUTH_LOCK_KEY = "admin_reauth_locked_until";

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

const RestoreUserModal = ({ isOpen, onClose, user, onUserRestored }) => {
  const [adminPassword, setAdminPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [attemptsLeft, setAttemptsLeft] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [locked, setLocked] = useState(false);
  const [lockCountdown, setLockCountdown] = useState("");
  const lockTimerRef = useRef(null);
  const lockUntilRef = useRef(null);

  // Every time the modal opens, re-check the shared lock immediately —
  // this is what makes the lock screen appear right away on reopen,
  // instead of only after a failed submit.
  useEffect(() => {
    if (!isOpen) return;
    setAdminPassword("");
    setShowPassword(false);
    setError("");
    setAttemptsLeft(null);
    clearInterval(lockTimerRef.current);

    let stillLocked = false;
    try {
      const raw = localStorage.getItem(REAUTH_LOCK_KEY);
      if (raw) {
        const { until } = JSON.parse(raw);
        if (until && until > Date.now()) {
          stillLocked = true;
          setLocked(true);
          startLockCountdown(
            until - Date.now(),
            setLockCountdown,
            lockTimerRef,
            lockUntilRef,
            () => {
              setLocked(false);
              localStorage.removeItem(REAUTH_LOCK_KEY);
            },
          );
        } else {
          localStorage.removeItem(REAUTH_LOCK_KEY);
        }
      }
    } catch {
      localStorage.removeItem(REAUTH_LOCK_KEY);
    }
    if (!stillLocked) setLocked(false);
  }, [isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setAttemptsLeft(null);

    if (!adminPassword.trim()) {
      setError("Administrator password is required");
      return;
    }

    setIsSubmitting(true);

    try {
      const token = localStorage.getItem("token");

      const response = await fetch(
        `${API_URL}/user-management/users/${user.user_id}/restore`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            adminPassword: adminPassword,
          }),
        },
      );

      const data = await response.json();

      if (response.ok) {
        onUserRestored(data.message || "User restored successfully!");
        onClose();
        return;
      }

      if (data.locked) {
        const msLeft = data.msLeft ?? (data.minutesLeft || 15) * 60_000;
        try {
          localStorage.setItem(
            REAUTH_LOCK_KEY,
            JSON.stringify({ until: Date.now() + msLeft }),
          );
        } catch {}
        setLocked(true);
        setAdminPassword("");
        startLockCountdown(
          msLeft,
          setLockCountdown,
          lockTimerRef,
          lockUntilRef,
          () => {
            setLocked(false);
            localStorage.removeItem(REAUTH_LOCK_KEY);
          },
        );
        setIsSubmitting(false);
        return;
      }

      setError(data.message || "Failed to restore user");
      if (data.attemptsLeft !== undefined) setAttemptsLeft(data.attemptsLeft);
    } catch (err) {
      console.error("Restore user error:", err);
      setError("Error connecting to server");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen || !user) return null;

  const displayName =
    user.first_name && user.last_name
      ? `${user.first_name} ${user.last_name}`
      : user.username;

  return (
    <>
      <LoadingModal isOpen={isSubmitting} message="Restoring account..." />
      <div className="rum-modal-overlay" onClick={onClose}>
        <div
          className="rum-modal-container"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="rum-modal-header">
            <h2>Restore User Account</h2>
            <button
              className="rum-modal-close"
              onClick={onClose}
              disabled={isSubmitting}
            >
              ×
            </button>
          </div>

          {locked ? (
            <div
              className="rum-modal-form"
              style={{ textAlign: "center", padding: "8px 4px" }}
            >
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: "50%",
                  background: "#EAF1FB",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 16px",
                }}
              >
                <svg
                  width="30"
                  height="30"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#0B2D6B"
                  strokeWidth="1.8"
                >
                  <rect x="3" y="11" width="18" height="11" rx="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div>
              <h3
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  color: "#212529",
                  margin: "0 0 8px",
                }}
              >
                Too Many Incorrect Attempts
              </h3>
              <p
                style={{
                  color: "#6b7280",
                  fontSize: 13,
                  margin: "0 0 4px",
                  lineHeight: 1.5,
                }}
              >
                For your security, this action has been temporarily locked.
              </p>
              <p
                style={{
                  fontWeight: 600,
                  fontSize: 13,
                  color: "#212529",
                  margin: "16px 0 4px",
                }}
              >
                Try again in:
              </p>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  background: "#F3F4F6",
                  borderRadius: 8,
                  padding: "8px 16px",
                  fontWeight: 700,
                  fontSize: 18,
                  color: "#212529",
                }}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#94A3B8"
                  strokeWidth="2"
                >
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                {lockCountdown || "Calculating…"}
              </div>
              <button
                type="button"
                className="rum-btn rum-btn-secondary"
                onClick={onClose}
                style={{ marginTop: 24, width: "100%" }}
              >
                Close
              </button>
            </div>
          ) : (
            <form className="rum-modal-form" onSubmit={handleSubmit}>
              <div className="rum-info-box">
                <div className="rum-info-content">
                  <h3>Restore Account Confirmation</h3>
                  <p>
                    You are about to restore the account for{" "}
                    <strong>{displayName}</strong>.
                  </p>
                  <p>
                    This will re-activate the user's account and allow them to
                    log in again.
                  </p>
                  <p className="rum-info-description">
                    To confirm this action, please enter your administrator
                    password below.
                  </p>
                </div>
              </div>

              <div className="rum-form-section">
                <div className="rum-form-section-title">
                  Administrator Verification
                </div>
                <div className="rum-form-section-description">
                  For security purposes, we need to verify your identity before
                  restoring this account.
                </div>

                <div className="rum-form-group">
                  <label className="rum-form-label">Your Password</label>
                  <div className="rum-password-input-wrapper">
                    <input
                      type={showPassword ? "text" : "password"}
                      className={`rum-form-input ${error ? "rum-error" : ""}`}
                      placeholder="Enter your administrator password"
                      value={adminPassword}
                      onChange={(e) => {
                        setAdminPassword(e.target.value);
                        setError("");
                      }}
                      disabled={isSubmitting}
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      className="rum-password-toggle"
                      onClick={() => setShowPassword(!showPassword)}
                      disabled={isSubmitting}
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                    </button>
                  </div>
                  {error && (
                    <div className="rum-error-text">
                      {error}
                      {attemptsLeft !== null &&
                        ` — ${attemptsLeft} attempt${attemptsLeft === 1 ? "" : "s"} left`}
                    </div>
                  )}
                </div>
              </div>

              <div className="rum-modal-actions">
                <button
                  type="button"
                  className="rum-btn rum-btn-secondary"
                  onClick={onClose}
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rum-btn rum-btn-success"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Restoring..." : "Restore Account"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </>
  );
};

export default RestoreUserModal;
