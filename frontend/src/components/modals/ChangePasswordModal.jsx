// ================================================================================
// FILE: frontend/src/components/modals/ChangePasswordModal.jsx
// ================================================================================
import React, { useState, useEffect, useRef, useCallback } from "react";
import { Eye, EyeOff } from "lucide-react";
import { logout } from "../../utils/auth";
import "./ChangePasswordModal.css";

const BASE_URL = "http://localhost:5000";

// ── Countdown helper — converts ms remaining into a readable string ───────────
// e.g. 82800000ms → "23h 00m"  |  3600000ms → "1h 00m"  |  180000ms → "3m 00s"
function fmtCountdown(msLeft) {
  if (msLeft <= 0) return "0m 00s";
  const totalSecs = Math.ceil(msLeft / 1000);
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

const ChangePasswordModal = ({ isOpen, onClose, onSuccess, onError }) => {
  const [step, setStep] = useState("checking");

  const [currentPw,             setCurrentPw]             = useState("");
  const [currentPwError,        setCurrentPwError]        = useState("");
  const [currentPwAttemptsLeft, setCurrentPwAttemptsLeft] = useState(null);
  const [isVerifying,           setIsVerifying]           = useState(false);
  const [currentPwLocked,       setCurrentPwLocked]       = useState(false);
  const [currentPwLockedMins,   setCurrentPwLockedMins]   = useState(0);
  const [showCurrent,           setShowCurrent]           = useState(false);

  const [passwordData,   setPasswordData]   = useState({ newPassword: "", confirmPassword: "" });
  const [passwordErrors, setPasswordErrors] = useState({});
  const [isSubmitting,   setIsSubmitting]   = useState(false);
  const [showNew,        setShowNew]        = useState(false);
  const [showConfirm,    setShowConfirm]    = useState(false);
  const [rateLimitMsg,   setRateLimitMsg]   = useState("");

  const [rateLimitHours,  setRateLimitHours]  = useState(null);

  // ── Exact expiry timestamps for live countdowns ──────────────────────────
  const [blockedUntilTs,       setBlockedUntilTs]       = useState(null);
  const [sessionLockedUntilTs, setSessionLockedUntilTs] = useState(null);
  const [pwLockedUntilTs,      setPwLockedUntilTs]      = useState(null);
  // ── Countdown display strings ────────────────────────────────────────────
  const [blockedCountdown,       setBlockedCountdown]       = useState("");
  const [sessionLockedCountdown, setSessionLockedCountdown] = useState("");
  const [pwLockedCountdown,      setPwLockedCountdown]      = useState("");

  const [sessionLockMins, setSessionLockMins] = useState(0);

  const [otpBoxes,    setOtpBoxes]    = useState(["","","","","",""]);
  const [otpError,    setOtpError]    = useState("");
  const [otpLoading,  setOtpLoading]  = useState(false);
  const [otpMasked,   setOtpMasked]   = useState("");
  const [otpTimer,    setOtpTimer]    = useState(0);
  const [resendsLeft, setResendsLeft] = useState(3);
  const [otpState,    setOtpState]    = useState("active");
  const [changesLeft, setChangesLeft] = useState(null);

  const otpRef       = useRef(null);
  const currentPwRef = useRef(null);
  const countdownRef = useRef(null);
  const otpRefs      = [useRef(), useRef(), useRef(), useRef(), useRef(), useRef()];

  // Refs that mirror state for interval callbacks
  const resendsLeftRef = useRef(3);
  const stepRef        = useRef("checking");

  useEffect(() => { resendsLeftRef.current = resendsLeft; }, [resendsLeft]);
  useEffect(() => { stepRef.current = step; }, [step]);

  // ── Live countdown ticker ────────────────────────────────────────────────
  useEffect(() => {
    clearInterval(countdownRef.current);
    const hasBlock   = step === "blocked"       && blockedUntilTs;
    const hasSession = step === "session-locked" && sessionLockedUntilTs;
    const hasPwLock  = step === "pw-locked"      && pwLockedUntilTs;
    if (!hasBlock && !hasSession && !hasPwLock) return;
    const tick = () => {
      const now = Date.now();
      if (hasBlock)   setBlockedCountdown(fmtCountdown(blockedUntilTs - now));
      if (hasSession) setSessionLockedCountdown(fmtCountdown(sessionLockedUntilTs - now));
      if (hasPwLock)  setPwLockedCountdown(fmtCountdown(pwLockedUntilTs - now));
    };
    tick();
    countdownRef.current = setInterval(tick, 1000);
    return () => clearInterval(countdownRef.current);
  }, [step, blockedUntilTs, sessionLockedUntilTs, pwLockedUntilTs]);

  const pw = passwordData.newPassword;
  const checks = {
    length:    pw.length >= 8,
    lowercase: /[a-z]/.test(pw),
    uppercase: /[A-Z]/.test(pw),
    number:    /\d/.test(pw),
    special:   /[@$!%*?&#]/.test(pw),
    match:     pw.length > 0 && pw === passwordData.confirmPassword,
  };
  const allPass = Object.values(checks).every(Boolean);

  const checkStatus = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${BASE_URL}/users/password/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await res.json();
      if (d.blocked) {
        setRateLimitHours(d.hoursLeft ?? null);
        // Use exact msLeft from backend for accurate countdown (not rounded hoursLeft)
        setBlockedUntilTs(Date.now() + (d.msLeft ?? (d.hoursLeft ?? 24) * 3_600_000));
        setStep("blocked");
      } else if (d.sessionLocked) {
        const mins = d.minsLeft ?? 15;
        setSessionLockMins(mins);
        setSessionLockedUntilTs(Date.now() + mins * 60_000);
        setStep("session-locked");
      } else if (d.pwLocked) {
        const mins = d.minsLeft ?? 15;
        setCurrentPwLocked(true);
        setCurrentPwLockedMins(mins);
        setPwLockedUntilTs(Date.now() + mins * 60_000);
        setStep("pw-locked");
      } else {
        setStep("verify-current");
        setTimeout(() => currentPwRef.current?.focus(), 120);
      }
    } catch {
      setStep("verify-current");
      setTimeout(() => currentPwRef.current?.focus(), 120);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      setStep("checking");
      setCurrentPw(""); setCurrentPwError(""); setCurrentPwAttemptsLeft(null);
      setCurrentPwLocked(false); setCurrentPwLockedMins(0); setIsVerifying(false); setShowCurrent(false);
      setPasswordData({ newPassword: "", confirmPassword: "" });
      setPasswordErrors({}); setRateLimitMsg(""); setRateLimitHours(null); setIsSubmitting(false);
      setShowNew(false); setShowConfirm(false);
      setOtpBoxes(["","","","","",""]); setOtpError(""); setOtpLoading(false);
      setOtpMasked(""); setOtpTimer(0); setOtpState("active");
      setChangesLeft(null); setSessionLockMins(0);
      setBlockedUntilTs(null); setSessionLockedUntilTs(null); setPwLockedUntilTs(null);
      setBlockedCountdown(""); setSessionLockedCountdown(""); setPwLockedCountdown("");
      resendsLeftRef.current = 3;
      stepRef.current = "checking";
      setResendsLeft(3);
      clearInterval(otpRef.current);
      clearInterval(countdownRef.current);
      checkStatus();
    }
    return () => { clearInterval(otpRef.current); clearInterval(countdownRef.current); };
  }, [isOpen, checkStatus]);

  const startOtpTimer = (expiresAt) => {
    clearInterval(otpRef.current);
    setOtpState("active");
    const update = () => {
      const secs = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
      setOtpTimer(secs);
      if (secs <= 0) {
        clearInterval(otpRef.current);
        const resendsRemaining = resendsLeftRef.current;
        const currentStep      = stepRef.current;
        if (resendsRemaining <= 0 && currentStep === "otp") {
          const lockMins  = 15;
          const lockUntil = Date.now() + lockMins * 60_000;
          localStorage.setItem("cpm_session_locked", JSON.stringify({ until: lockUntil }));
          const token = localStorage.getItem("token");
          fetch(`${BASE_URL}/users/password/force-lock`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({}),
          }).catch(() => {});
          setOtpError("");
          setSessionLockMins(lockMins);
          setSessionLockedUntilTs(lockUntil);
          setStep("session-locked");
          return;
        }
        setOtpState(prev => prev === "attempts-exceeded" ? "attempts-exceeded" : "expired");
      }
    };
    update();
    otpRef.current = setInterval(update, 1000);
  };

  const formatOtpTimer = (secs) => {
    const m = Math.floor(secs / 60).toString().padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const handleOtpKey = (e, idx) => {
    if (e.key === "Backspace") {
      setOtpBoxes(prev => { const n = [...prev]; n[idx] = ""; return n; });
      if (!otpBoxes[idx] && idx > 0) otpRefs[idx - 1].current?.focus();
    }
  };

  const handleOtpChange = (val, idx) => {
    const digits = val.replace(/\D/g, "");
    if (!digits) return;
    if (digits.length > 1) {
      const arr = digits.slice(0, 6).split("");
      setOtpBoxes(prev => {
        const n = [...prev];
        arr.forEach((d, i) => { if (i < 6) n[i] = d; });
        return n;
      });
      otpRefs[Math.min(5, arr.length - 1)].current?.focus();
      return;
    }
    setOtpBoxes(prev => { const n = [...prev]; n[idx] = digits; return n; });
    setOtpError("");
    if (idx < 5) otpRefs[idx + 1].current?.focus();
  };

  const handleVerifyCurrentPassword = async (e) => {
    e?.preventDefault();
    if (!currentPw.trim()) { setCurrentPwError("Please enter your current password"); return; }
    setIsVerifying(true); setCurrentPwError("");
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${BASE_URL}/users/password/verify-current`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: currentPw.trim() }),
      });
      const d = await res.json();
      if (!res.ok) {
        if (d.locked) {
          const mins = d.minutesLeft ?? 15;
          setCurrentPwLocked(true); setCurrentPwLockedMins(mins);
          setPwLockedUntilTs(Date.now() + mins * 60_000);
          setCurrentPw(""); setStep("pw-locked"); return;
        }
        if (d.rateLimited) {
          setRateLimitHours(d.hoursLeft ?? null);
          setBlockedUntilTs(Date.now() + (d.msLeft ?? (d.hoursLeft ?? 24) * 3_600_000));
          setStep("blocked"); return;
        }
        if (d.sessionLocked) {
          const mins = d.minutesLeft ?? 15;
          setSessionLockMins(mins);
          setSessionLockedUntilTs(Date.now() + mins * 60_000);
          setStep("session-locked"); return;
        }
        setCurrentPwAttemptsLeft(d.attemptsLeft ?? null);
        setCurrentPw("");
        setCurrentPwError(d.message || "Incorrect password");
        setTimeout(() => currentPwRef.current?.focus(), 60);
        return;
      }
      setStep("form");
    } catch { setCurrentPwError("Network error. Please try again."); }
    finally { setIsVerifying(false); }
  };

  const handleRequestOtp = async (e) => {
    e?.preventDefault();
    const errors = {};
    if (!passwordData.newPassword) errors.newPassword = "New password is required";
    else if (!allPass) errors.newPassword = "Password does not meet all requirements";
    if (!passwordData.confirmPassword) errors.confirmPassword = "Please confirm your new password";
    else if (!checks.match) errors.confirmPassword = "Passwords do not match";
    if (Object.keys(errors).length) { setPasswordErrors(errors); return; }

    setIsSubmitting(true); setPasswordErrors({}); setRateLimitMsg("");
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${BASE_URL}/users/password/request-otp`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: currentPw.trim(),
          newPassword: passwordData.newPassword,
          confirmPassword: passwordData.confirmPassword,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        if (d.rateLimited) {
          setRateLimitHours(d.hoursLeft ?? null);
          setBlockedUntilTs(Date.now() + (d.msLeft ?? (d.hoursLeft ?? 24) * 3_600_000));
          setStep("blocked");
        }
        else if (d.locked) { setRateLimitMsg(d.message); }
        else if (d.sessionLocked) {
          const mins = d.minutesLeft ?? 15;
          setSessionLockMins(mins);
          setSessionLockedUntilTs(Date.now() + mins * 60_000);
          setStep("session-locked");
        }
        else if (res.status === 401) {
          setCurrentPwError("Session expired. Please re-enter your current password.");
          setCurrentPw(""); setStep("verify-current");
          setTimeout(() => currentPwRef.current?.focus(), 120);
        }
        else if (d.errors) { setPasswordErrors(d.errors); }
        else { setPasswordErrors({ general: d.message || "Failed to send code" }); }
        return;
      }
      setOtpMasked(d.maskedEmail || "");
      const newResendsLeft = d.resendsLeft ?? 2;
      setResendsLeft(newResendsLeft);
      resendsLeftRef.current = newResendsLeft;
      setOtpBoxes(["","","","","",""]); setOtpState("active"); setOtpError("");
      setStep("otp");
      stepRef.current = "otp";
      if (d.otpExpiresAt) startOtpTimer(d.otpExpiresAt);
      setTimeout(() => otpRefs[0].current?.focus(), 120);
    } catch { setPasswordErrors({ general: "Network error. Please try again." }); }
    finally { setIsSubmitting(false); }
  };

  const handleVerifyOtp = async () => {
    const code = otpBoxes.join("");
    if (code.length !== 6) { setOtpError("Please enter all 6 digits"); return; }
    setOtpLoading(true); setOtpError("");
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${BASE_URL}/users/password/verify-otp`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ otp: code }),
      });
      const d = await res.json();
      if (!res.ok) {
        if (d.sessionLocked || d.autoClose) {
          clearInterval(otpRef.current);
          const lm = d.minutesLeft ?? 15;
          const lockUntil = Date.now() + lm * 60_000;
          setSessionLockMins(lm);
          setSessionLockedUntilTs(lockUntil);
          localStorage.setItem("cpm_session_locked", JSON.stringify({ until: lockUntil }));
          setOtpBoxes(["","","","","",""]);
          setOtpError("");
          setStep("session-locked");
        } else if (d.forceResend) {
          setOtpError("You have entered too many incorrect codes. For your security, please request a new one.");
          setOtpBoxes(["","","","","",""]);
          setOtpState("attempts-exceeded");
          clearInterval(otpRef.current);
          setOtpTimer(0);
          const newResendsLeft = d.resendsLeft ?? 0;
          setResendsLeft(newResendsLeft);
          resendsLeftRef.current = newResendsLeft;
        } else {
          setOtpError(d.message || "Incorrect code");
          setOtpBoxes(["","","","","",""]);
          setTimeout(() => otpRefs[0].current?.focus(), 60);
        }
        return;
      }
      clearInterval(otpRef.current);
      setChangesLeft(d.changesLeft ?? null);
      setStep("done");
    } catch { setOtpError("Network error. Please try again."); }
    finally { setOtpLoading(false); }
  };

  const canResend = resendsLeft > 0 && (otpTimer === 0 || otpState === "attempts-exceeded");

  const handleResend = async () => {
    if (!canResend || isSubmitting) return;
    setOtpError(""); setOtpBoxes(["","","","","",""]); setIsSubmitting(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${BASE_URL}/users/password/request-otp`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: currentPw.trim(),
          newPassword: passwordData.newPassword,
          confirmPassword: passwordData.confirmPassword,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        if (d.sessionLocked) {
          const lm = d.minutesLeft ?? 15;
          const lockUntil = Date.now() + lm * 60_000;
          setSessionLockMins(lm);
          setSessionLockedUntilTs(lockUntil);
          localStorage.setItem("cpm_session_locked", JSON.stringify({ until: lockUntil }));
          setStep("session-locked"); return;
        }
        if (d.resendsLeft === 0) {
          setResendsLeft(0); resendsLeftRef.current = 0;
          setOtpError("No more resends available for this session."); return;
        }
        setOtpError(d.message || "Failed to resend"); return;
      }
      const newResendsLeft = d.resendsLeft ?? 0;
      setResendsLeft(newResendsLeft);
      resendsLeftRef.current = newResendsLeft;
      setOtpState("active");
      if (d.otpExpiresAt) startOtpTimer(d.otpExpiresAt);
      setTimeout(() => otpRefs[0].current?.focus(), 120);
    } catch { setOtpError("Network error. Please try again."); }
    finally { setIsSubmitting(false); }
  };

  useEffect(() => {
    if (step === "done") {
      const t = setTimeout(() => { onClose(); logout(); }, 2500);
      return () => clearTimeout(t);
    }
  }, [step]);

  const handleClose = useCallback(() => {
    if (isSubmitting || otpLoading || isVerifying) return;
    onClose();
  }, [isSubmitting, otpLoading, isVerifying, onClose]);

  if (!isOpen) return null;

  const getStepNumber = () => {
    if (step === "verify-current") return 1;
    if (step === "form")           return 2;
    if (step === "otp")            return 3;
    if (step === "done")           return 3;
    return 0;
  };

  const otpInputDisabled = otpLoading || otpTimer === 0 || otpState === "attempts-exceeded";

  // ── Reusable countdown badge ─────────────────────────────────────────────
  const CountdownBadge = ({ countdown }) => (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 8,
      background: "#fef3c7", border: "1px solid #fcd34d",
      borderRadius: 8, padding: "8px 20px", margin: "12px 0",
      fontSize: 20, fontWeight: 700, color: "#92400e", letterSpacing: 1,
    }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#92400e" strokeWidth="2">
        <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
      </svg>
      {countdown || "Calculating…"}
    </div>
  );

  return (
    <div className="cpm-modal-overlay">
      <div className="cpm-modal-content">

        <div className="cpm-modal-header">
          <div className="cpm-header-icon">
            {step === "done"
              ? <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            }
          </div>
          <div className="cpm-header-text">
            <h2>
              {(step === "checking" || step === "verify-current" || step === "form") && "Change Password"}
              {step === "otp"            && "Verify Your Identity"}
              {step === "done"           && "Password Changed"}
              {step === "blocked"        && "Change Password Unavailable"}
              {step === "session-locked" && "Change Password Unavailable"}
              {step === "pw-locked"      && "Change Password Unavailable"}
            </h2>
            <p>
              {step === "checking"       && "Please wait…"}
              {step === "verify-current" && "Step 1 of 3 — Confirm your current password"}
              {step === "form"           && "Step 2 of 3 — Enter your new password"}
              {step === "otp"            && "Step 3 of 3 — Enter the code sent to your email"}
              {step === "done"           && "Logging out in a moment…"}
              {step === "blocked"        && "Daily limit reached"}
              {step === "session-locked" && "Temporarily locked for security"}
              {step === "pw-locked"      && "Too many incorrect attempts"}
            </p>
          </div>
          <button className="cpm-modal-close" onClick={handleClose}
            disabled={isSubmitting || otpLoading || isVerifying} aria-label="Close">✕</button>
        </div>

        {(step === "verify-current" || step === "form" || step === "otp" || step === "done") && (
          <div className="cpm-steps cpm-steps-3">
            <div className={`cpm-step-bar ${getStepNumber() >= 1 ? (getStepNumber() > 1 ? "cpm-step-done" : "cpm-step-active") : ""}`}/>
            <div className={`cpm-step-bar ${getStepNumber() >= 2 ? (getStepNumber() > 2 ? "cpm-step-done" : "cpm-step-active") : ""}`}/>
            <div className={`cpm-step-bar ${getStepNumber() >= 3 ? "cpm-step-done" : ""}`}/>
          </div>
        )}

        {/* CHECKING */}
        {step === "checking" && (
          <div className="cpm-modal-body cpm-blocked-body">
            <div className="cpm-checking-spinner"/>
            <p style={{color:"#6c757d", fontSize:"14px", margin:"16px 0 0"}}>Checking availability…</p>
          </div>
        )}

        {/* BLOCKED — 24h daily limit with live countdown */}
        {step === "blocked" && (
          <div className="cpm-modal-body cpm-blocked-body">
            <div className="cpm-blocked-icon">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
            </div>
            <h3 className="cpm-blocked-title">Password Change Unavailable</h3>
            <p className="cpm-blocked-msg">
              You've already changed your password <strong>twice</strong> in the last 24 hours.
            </p>
            <p className="cpm-blocked-msg" style={{color:"#6b7280", fontSize:"13px", marginTop:4}}>
              This limit protects your account from unauthorized changes.
             
            </p>
            <p className="cpm-blocked-msg" style={{marginTop:12, marginBottom:4, fontWeight:600, fontSize:13}}>
              You can change your password again in:
            </p>
            <CountdownBadge countdown={blockedCountdown} />
            <button className="cpm-btn cpm-btn-secondary cpm-btn-full" onClick={handleClose} style={{marginTop:"20px"}}>
              Got it, Close
            </button>
          </div>
        )}

        {/* SESSION-LOCKED — OTP exhausted with live countdown */}
        {step === "session-locked" && (
          <div className="cpm-modal-body cpm-blocked-body">
            <div className="cpm-blocked-icon" style={{background:"#fff3cd"}}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#c2410c" strokeWidth="1.5">
                <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
            </div>
            <h3 className="cpm-blocked-title">Change Password Unavailable</h3>
            <p className="cpm-blocked-msg">
              Too many failed verification attempts. For your security, this process has been temporarily locked.
            </p>
            <p className="cpm-blocked-msg" style={{color:"#6b7280", fontSize:"13px", marginTop:4}}>
              This is automatic protection against unauthorized access.
              Please wait for the timer below before trying again.
            </p>
            <p className="cpm-blocked-msg" style={{marginTop:12, marginBottom:4, fontWeight:600, fontSize:13}}>
              Try again in:
            </p>
            <CountdownBadge countdown={sessionLockedCountdown} />
            <button className="cpm-btn cpm-btn-secondary cpm-btn-full" onClick={handleClose} style={{marginTop:"20px"}}>
              Got it, Close
            </button>
          </div>
        )}

        {/* PW-LOCKED — wrong password too many times with live countdown */}
        {step === "pw-locked" && (
          <div className="cpm-modal-body cpm-blocked-body">
            <div className="cpm-blocked-icon" style={{background:"#fff3cd"}}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#c2410c" strokeWidth="1.5">
                <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
            </div>
            <h3 className="cpm-blocked-title">Change Password Unavailable</h3>
            <p className="cpm-blocked-msg">
              Too many incorrect password attempts. Your access has been temporarily paused to protect your account.
            </p>
            <p className="cpm-blocked-msg" style={{color:"#6b7280", fontSize:"13px", marginTop:4}}>
              If this wasn't you, your password may be at risk. Consider changing it from a trusted device once this lock expires.
            </p>
            <p className="cpm-blocked-msg" style={{marginTop:12, marginBottom:4, fontWeight:600, fontSize:13}}>
              Try again in:
            </p>
            <CountdownBadge countdown={pwLockedCountdown} />
            <button className="cpm-btn cpm-btn-secondary cpm-btn-full" onClick={handleClose} style={{marginTop:"20px"}}>
              Got it, Close
            </button>
          </div>
        )}

        {/* STEP 1 — Verify current password */}
        {step === "verify-current" && (
          <form onSubmit={handleVerifyCurrentPassword} autoComplete="off">
            <input type="text" name="fake_user" style={{display:"none"}} autoComplete="username" readOnly />
            <input type="password" name="fake_pass" style={{display:"none"}} autoComplete="new-password" readOnly />
            <div className="cpm-modal-body">
              <div className="cpm-step-intro">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1e3a5f" strokeWidth="2" style={{flexShrink:0, marginTop:"1px"}}>
                  <circle cx="12" cy="12" r="10"/><path d="M12 16v-4m0-4h.01"/>
                </svg>
                <p>To protect your account, please confirm your current password before making any changes.</p>
              </div>
              {currentPwLocked ? (
                <div className="cpm-alert cpm-alert-lockout">
                  🔒 Too many incorrect attempts. Please try again in <strong>{currentPwLockedMins} minute{currentPwLockedMins !== 1 ? "s" : ""}</strong>.
                </div>
              ) : (
                <div className="cpm-form-group">
                  <label className="cpm-form-label">Current Password *</label>
                  <div className="cpm-pw-wrap">
                    <input
                      ref={currentPwRef}
                      type={showCurrent ? "text" : "password"}
                      name="cpm-current-pw"
                      autoComplete="off"
                      className={`cpm-form-input ${currentPwError ? "cpm-input-error" : ""}`}
                      value={currentPw}
                      onChange={e => { setCurrentPw(e.target.value); setCurrentPwError(""); setCurrentPwAttemptsLeft(null); }}
                      placeholder="Enter your current password"
                      disabled={isVerifying}
                      autoFocus
                    />
                    <button type="button" className="cpm-eye-btn" onClick={() => setShowCurrent(v => !v)} disabled={isVerifying} tabIndex={-1}>
                      {showCurrent ? <Eye size={17}/> : <EyeOff size={17}/>}
                    </button>
                  </div>
                  {currentPwError && (
                    <span className={`cpm-error-text ${currentPwAttemptsLeft !== null && currentPwAttemptsLeft <= 2 ? "cpm-error-warning" : ""}`}>
                      {currentPwError}
                    </span>
                  )}
                </div>
              )}
            </div>
            <div className="cpm-modal-footer">
              <button type="button" className="cpm-btn cpm-btn-secondary" onClick={handleClose} disabled={isVerifying}>Cancel</button>
              <button type="submit" className="cpm-btn cpm-btn-primary" disabled={isVerifying || !currentPw.trim() || currentPwLocked}>
                {isVerifying ? <><span className="cpm-spinner"/>Verifying…</> : "Verify & Continue →"}
              </button>
            </div>
          </form>
        )}

        {/* STEP 2 — New password form */}
        {step === "form" && (
          <form onSubmit={handleRequestOtp} autoComplete="off">
            <input type="text" name="fake_user2" style={{display:"none"}} autoComplete="username" readOnly />
            <div className="cpm-modal-body">
              {(rateLimitMsg || passwordErrors.general) && (
                <div className="cpm-alert cpm-alert-danger">{rateLimitMsg || passwordErrors.general}</div>
              )}
              <div className="cpm-form-group">
                <label className="cpm-form-label">New Password *</label>
                <div className="cpm-pw-wrap">
                  <input
                    type={showNew ? "text" : "password"}
                    name="cpm-new-pw"
                    autoComplete="new-password"
                    className={`cpm-form-input ${passwordErrors.newPassword ? "cpm-input-error" : ""}`}
                    value={passwordData.newPassword}
                    onChange={e => { setPasswordData(p => ({...p, newPassword: e.target.value})); setPasswordErrors(p => { const n = {...p}; delete n.newPassword; return n; }); }}
                    onPaste={e => e.preventDefault()}
                    onCopy={e => e.preventDefault()}
                    placeholder="Create a strong new password"
                    disabled={isSubmitting}
                    autoFocus
                  />
                  <button type="button" className="cpm-eye-btn" onClick={() => setShowNew(v => !v)} disabled={isSubmitting} tabIndex={-1}>
                    {showNew ? <Eye size={17}/> : <EyeOff size={17}/>}
                  </button>
                </div>
                {passwordErrors.newPassword && <span className="cpm-error-text">{passwordErrors.newPassword}</span>}
              </div>
              <div className="cpm-form-group">
                <label className="cpm-form-label">Confirm New Password *</label>
                <div className="cpm-pw-wrap">
                  <input
                    type={showConfirm ? "text" : "password"}
                    name="cpm-confirm-pw"
                    autoComplete="new-password"
                    className={`cpm-form-input ${passwordErrors.confirmPassword ? "cpm-input-error" : ""}`}
                    value={passwordData.confirmPassword}
                    onChange={e => { setPasswordData(p => ({...p, confirmPassword: e.target.value})); setPasswordErrors(p => { const n = {...p}; delete n.confirmPassword; return n; }); }}
                    onPaste={e => e.preventDefault()}
                    onCopy={e => e.preventDefault()}
                    placeholder="Re-enter your new password"
                    disabled={isSubmitting}
                  />
                  <button type="button" className="cpm-eye-btn" onClick={() => setShowConfirm(v => !v)} disabled={isSubmitting} tabIndex={-1}>
                    {showConfirm ? <Eye size={17}/> : <EyeOff size={17}/>}
                  </button>
                </div>
                {passwordErrors.confirmPassword && <span className="cpm-error-text">{passwordErrors.confirmPassword}</span>}
              </div>
              <div className="cpm-requirements">
                <p className="cpm-req-title">Password Requirements</p>
                <div className="cpm-req-grid">
                  {[
                    [checks.length,    "At least 8 characters"],
                    [checks.uppercase, "Uppercase letter (A–Z)"],
                    [checks.lowercase, "Lowercase letter (a–z)"],
                    [checks.number,    "Number (0–9)"],
                    [checks.special,   "Special character (@$!%*?&#)"],
                    [checks.match,     "Passwords match"],
                  ].map(([ok, label]) => (
                    <div key={label} className={`cpm-req-item ${ok ? "cpm-req-ok" : ""}`}>
                      <span className="cpm-req-dot">{ok ? "✓" : "○"}</span>{label}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="cpm-modal-footer">
              <button type="submit" className="cpm-btn cpm-btn-primary cpm-btn-full" disabled={isSubmitting || !allPass}>
                {isSubmitting ? <><span className="cpm-spinner"/>Sending Code…</> : "Send Verification Code →"}
              </button>
            </div>
          </form>
        )}

        {/* STEP 3 — OTP */}
        {step === "otp" && (
          <div className="cpm-modal-body cpm-otp-body">
            <div className="cpm-otp-info-box">
              <div className="cpm-otp-info-icon">✉</div>
              <div>
                <p className="cpm-otp-info-title">Code sent to <strong>{otpMasked}</strong></p>
                <p className="cpm-otp-info-sub">This code expires in <strong>2 minutes</strong>. Do not share it with anyone.</p>
              </div>
            </div>
            {otpState !== "attempts-exceeded" && (
              <div className={`cpm-otp-timer ${otpTimer <= 60 && otpTimer > 0 ? "cpm-otp-timer-warn" : ""} ${otpTimer === 0 ? "cpm-otp-timer-expired" : ""}`}>
                {otpTimer > 0
                  ? <>⏱ Expires in <strong>{formatOtpTimer(otpTimer)}</strong></>
                  : "⏱ This code is no longer valid. Please request a new one to continue."
                }
              </div>
            )}
            {otpError && (
              <div className={`cpm-alert ${otpState === "attempts-exceeded" ? "cpm-alert-lockout" : "cpm-alert-danger"}`}>
                {otpError}
              </div>
            )}
            <div className="cpm-otp-boxes">
              {otpBoxes.map((v, i) => (
                <input key={i} ref={otpRefs[i]}
                  className={`cpm-otp-box ${otpInputDisabled ? "cpm-otp-box-locked" : ""}`}
                  type="text" inputMode="numeric" maxLength={6} value={v}
                  autoComplete="one-time-code"
                  onChange={e => handleOtpChange(e.target.value, i)}
                  onKeyDown={e => handleOtpKey(e, i)}
                  disabled={otpInputDisabled}
                />
              ))}
            </div>
            {otpState === "active" && (
              <button className="cpm-btn cpm-btn-primary cpm-btn-full"
                onClick={handleVerifyOtp}
                disabled={otpLoading || otpBoxes.join("").length !== 6}>
                {otpLoading ? <><span className="cpm-spinner"/>Verifying…</> : "Confirm Password Change"}
              </button>
            )}
            <div className="cpm-otp-resend">
              {resendsLeft <= 0 ? (
                <span className="cpm-resend-exhausted">No more resends available for this session</span>
              ) : canResend ? (
                <button className="cpm-link-btn" onClick={handleResend} disabled={isSubmitting}>
                  {isSubmitting ? "Sending…" : `Resend Code (${resendsLeft} left)`}
                </button>
              ) : null}
            </div>
          </div>
        )}

        {/* DONE */}
        {step === "done" && (
          <div className="cpm-modal-body cpm-done-body">
            <div className="cpm-done-icon">✓</div>
            <h3 className="cpm-done-title">Password Changed!</h3>
            <p className="cpm-done-sub">
              Your password has been updated and all sessions revoked.<br/>
              A security notification has been sent to your email.
            </p>
            <p className="cpm-done-logout">Logging you out automatically…</p>
          </div>
        )}

      </div>
    </div>
  );
};

export default ChangePasswordModal;