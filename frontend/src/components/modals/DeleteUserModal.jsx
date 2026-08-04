import React, { useState, useEffect, useRef } from "react";
import { Eye, EyeOff } from "lucide-react";
import "./DeleteUserModal.css";
import LoadingModal from "../modals/LoadingModal";

const API_URL = import.meta.env.VITE_API_URL;
// Shared with RestoreUserModal — both check the same admin password lock
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

const DeleteUserModal = ({ isOpen, onClose, user, onUserDeleted }) => {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [attemptsLeft, setAttemptsLeft] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [locked, setLocked] = useState(false);
  const [lockCountdown, setLockCountdown] = useState("");
  const [checkingLock, setCheckingLock] = useState(true);
  const lockTimerRef = useRef(null);
  const lockUntilRef = useRef(null);

  // Every time the modal opens, re-check the shared lock immediately —
  // this is what makes the lock screen appear right away on reopen,
  // instead of only after a failed submit.
  useEffect(() => {
    if (!isOpen) return;
    setPassword("");
    setShowPassword(false);
    setError("");
    setAttemptsLeft(null);
    setCheckingLock(true);
    clearInterval(lockTimerRef.current);

    let fastPathLocked = false;
    try {
      const raw = localStorage.getItem(REAUTH_LOCK_KEY);
      if (raw) {
        const { until } = JSON.parse(raw);
        if (until && until > Date.now()) {
          fastPathLocked = true;
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
    if (!fastPathLocked) setLocked(false);

    (async () => {
      try {
        const token = localStorage.getItem("token");
        const res = await fetch(`${API_URL}/user-management/reauth-status`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();

        if (data.locked) {
          const until =
            Date.now() + (data.msLeft ?? (data.minutesLeft || 15) * 60_000);
          localStorage.setItem(REAUTH_LOCK_KEY, JSON.stringify({ until }));
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
        } else if (fastPathLocked) {
          setLocked(false);
          clearInterval(lockTimerRef.current);
          localStorage.removeItem(REAUTH_LOCK_KEY);
        }
      } catch {
        // network hiccup — leave whatever the fast path already decided
      } finally {
        setCheckingLock(false);
      }
    })();
  }, [isOpen]);
  const handleClose = () => {
    setPassword("");
    setShowPassword(false);
    setError("");
    setAttemptsLeft(null);
    clearInterval(lockTimerRef.current);
    onClose();
  };

  const handlePasswordChange = (e) => {
    setPassword(e.target.value);
    if (error) setError("");
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
          const msLeft = data.msLeft ?? (data.minutesLeft || 15) * 60_000;
          try {
            localStorage.setItem(
              REAUTH_LOCK_KEY,
              JSON.stringify({ until: Date.now() + msLeft }),
            );
          } catch {}
          setLocked(true);
          setPassword("");
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
          setIsDeleting(false);
          return;
        }
        // Wrong password (not locked yet) — clear the field so the user
        // isn't left staring at their incorrect attempt.
        setPassword("");
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
        setPassword("");
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

  if (checkingLock) {
    return (
      <div className="dum-modal-overlay">
        <div
          className="dum-modal-container"
          style={{ padding: 40, textAlign: "center" }}
        >
          <p style={{ color: "#6b7280", fontSize: 14 }}>
            Checking account status…
          </p>
        </div>
      </div>
    );
  }
  const getFullName = () => {
    const firstName = user.first_name || "";
    const middleName = user.middle_name || "";
    const lastName = user.last_name || "";
    const suffix = user.suffix || "";

    if (firstName && lastName) {
      const parts = [firstName, middleName, lastName, suffix].filter(Boolean);
      const fullName = parts.join(" ");
      if (fullName.length > 30) {
        return fullName.substring(0, 27) + "...";
      }
      return fullName;
    }
    return user.username;
  };

  const LockIcon = ({ size = 30, color = "#0B2D6B", strokeWidth = 1.8 }) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
    >
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );

  return (
    <>
      <LoadingModal isOpen={isDeleting} message="Deactivating user..." />
      {/* Overlay is decorative only now — clicking it will NOT close the
          modal, so an accidental click outside won't interrupt this
          security-sensitive flow. Use the × or the buttons instead. */}
      <div className="dum-modal-overlay">
        <div
          className="dum-modal-container"
          style={{ overflow: "hidden" }}
          onClick={(e) => e.stopPropagation()}
        >
          {locked ? (
            <>
              {/* Dark header — mirrors the ChangePasswordModal lock header */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  background: "#0B1E3D",
                  padding: "18px 22px",
                  color: "#fff",
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    background: "rgba(255,255,255,0.12)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <LockIcon size={18} color="#fff" strokeWidth={2} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h2
                    style={{
                      margin: 0,
                      fontSize: 16,
                      fontWeight: 700,
                      color: "#fff",
                    }}
                  >
                    Deactivate User Unavailable
                  </h2>
                  <p
                    style={{
                      margin: 0,
                      fontSize: 12.5,
                      color: "rgba(255,255,255,0.65)",
                    }}
                  >
                    Too many incorrect attempts
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleClose}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "rgba(255,255,255,0.8)",
                    fontSize: 20,
                    lineHeight: 1,
                    cursor: "pointer",
                    padding: 4,
                  }}
                >
                  ×
                </button>
              </div>

              <div
                className="dum-modal-form"
                style={{ textAlign: "center", padding: "28px 24px" }}
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
                    margin: "0 auto 18px",
                  }}
                >
                  <LockIcon />
                </div>
                <h3
                  style={{
                    fontSize: 16,
                    fontWeight: 700,
                    color: "#212529",
                    margin: "0 0 10px",
                  }}
                >
                  Deactivate User Unavailable
                </h3>
                <p
                  style={{
                    color: "#4b5563",
                    fontSize: 13.5,
                    margin: "0 0 8px",
                    lineHeight: 1.55,
                  }}
                >
                  Too many incorrect password attempts. This action has been
                  temporarily paused to protect your account.
                </p>
                <p
                  style={{
                    color: "#6b7280",
                    fontSize: 13.5,
                    margin: "0 0 4px",
                    lineHeight: 1.55,
                  }}
                >
                  This is automatic protection against unauthorized access.
                  Please wait for the timer below before trying again.
                </p>
                <p
                  style={{
                    fontWeight: 600,
                    fontSize: 13,
                    color: "#212529",
                    margin: "18px 0 6px",
                  }}
                >
                  Try again in:
                </p>
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    background: "#EEF3FF",
                    border: "1px solid #DCE6FB",
                    borderRadius: 999,
                    padding: "10px 22px",
                    fontWeight: 700,
                    fontSize: 18,
                    color: "#1F3A66",
                  }}
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#1F3A66"
                    strokeWidth="2"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                  {lockCountdown || "Calculating…"}
                </div>
                <button
                  type="button"
                  className="dum-btn dum-btn-secondary"
                  onClick={handleClose}
                  style={{ marginTop: 26, width: "100%" }}
                >
                  Got it, Close
                </button>
              </div>
            </>
          ) : (
            <>
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

              <form onSubmit={handleSubmit} className="dum-modal-form">
                <div className="dum-warning-box">
                  <div className="dum-warning-content">
                    <h3>You are about to deactivate this user</h3>
                    <p>
                      <strong>{getFullName()}</strong> ({user.email})
                    </p>
                    <p className="dum-warning-description">
                      This user account will be deactivated and no longer be
                      able to access the system. This action can be reversed by
                      reactivating the user account.
                    </p>
                  </div>
                </div>

                <div className="dum-form-section">
                  <h3 className="dum-form-section-title">
                    Confirm Your Identity
                  </h3>
                  <p className="dum-form-section-description">
                    Please enter your administrator password to confirm this
                    action.
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
                        {showPassword ? (
                          <Eye size={20} />
                        ) : (
                          <EyeOff size={20} />
                        )}
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
            </>
          )}
        </div>
      </div>
    </>
  );
};

export default DeleteUserModal;
