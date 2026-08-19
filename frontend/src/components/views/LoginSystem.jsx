import React, { useState, useRef, useEffect } from "react";
import {
  Lock,
  User,
  Mail,
  AlertCircle,
  ArrowLeft,
  Eye,
  EyeOff,
} from "lucide-react";
import "./LoginSystem.css";
import { jwtDecode } from "jwt-decode";
import { useNavigate } from "react-router-dom";

const API_URL = import.meta.env.VITE_API_URL;

// ── Countdown helper (same format as ChangePasswordModal) ─────────────────
function fmtCountdown(msLeft) {
  if (msLeft <= 0) return "0m 00s";
  const totalSecs = Math.ceil(msLeft / 1000);
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

// ── Persisted lock timestamps for forgot-password OTP flow ────────────────
const fpLockKey = (type, email) =>
  `fp_${type}_${(email || "").toLowerCase().trim()}`;

function readFpLock(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { until } = JSON.parse(raw);
    if (Date.now() < until) return until;
    localStorage.removeItem(key);
    return null;
  } catch {
    localStorage.removeItem(key);
    return null;
  }
}

function writeFpLock(key, until) {
  try {
    localStorage.setItem(key, JSON.stringify({ until }));
  } catch {}
}

const LoginSystem = () => {
  const [currentView, setCurrentView] = useState("login");
  const [formData, setFormData] = useState({
    username: "",
    password: "",
    email: "",
    verificationCode: ["", "", "", "", "", ""],
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [timer, setTimer] = useState(120); // 2 minutes
  const [canResend, setCanResend] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // ── OTP lockout state — now supports "blocked" (daily limit) and
  // "session-locked" (3x wrong OTP), same as ChangePasswordModal ────────────
  const [fpStep, setFpStep] = useState("active"); // "active" | "blocked" | "session-locked"
  const [blockedUntilTs, setBlockedUntilTs] = useState(null);
  const [blockedCountdown, setBlockedCountdown] = useState("");
  const [sessionLockedUntilTs, setSessionLockedUntilTs] = useState(null);
  const [sessionLockedCountdown, setSessionLockedCountdown] = useState("");
  const countdownTimerRef = useRef(null);

  // ── New: tracks wrong-code state and resend count within one OTP session ──
  const [otpState, setOtpState] = useState("active"); // "active" | "attempts-exceeded"
  const [resendsLeft, setResendsLeft] = useState(3);
  const resendsLeftRef = useRef(3); // synced ref so the timer interval can read the latest value

  const codeInputs = useRef([]);

  const navigate = useNavigate();

  // Timer for verification code
  // Timer for verification code
  useEffect(() => {
    let interval;
    if (currentView === "verify" && timer > 0 && fpStep === "active") {
      interval = setInterval(() => {
        setTimer((prev) => {
          if (prev <= 1) {
            setCanResend(true);
            // ── Timer expired — if no resends left, tell backend to lock ──
            if (resendsLeftRef.current <= 0) {
              fetch(`${API_URL}/auth/otp/force-lock`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: formData.email }),
              })
                .then((r) => r.json())
                .then((d) => {
                  if (d.locked) {
                    goSessionLocked(null, d.minutesLeft);
                  }
                })
                .catch(() => {});
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [currentView, timer, fpStep]);

  // Clear messages when changing views, but keep max attempts error
  useEffect(() => {
    if (!error.includes("Maximum OTP requests")) {
      setError("");
    }
    setSuccess("");
  }, [currentView]);

  // Cleanup lock timer on unmount
  useEffect(() => {
    return () => clearInterval(countdownTimerRef.current);
  }, []);

  useEffect(() => {
    resendsLeftRef.current = resendsLeft;
  }, [resendsLeft]);

  // ── Single ticker effect — mirrors ChangePasswordModal's pattern exactly.
  // Re-runs whenever fpStep changes, so it never gets stuck after navigation.
  useEffect(() => {
    clearInterval(countdownTimerRef.current);
    const hasBlock = fpStep === "blocked" && blockedUntilTs;
    const hasSession = fpStep === "session-locked" && sessionLockedUntilTs;
    if (!hasBlock && !hasSession) return;
    const tick = () => {
      const now = Date.now();
      if (hasBlock) setBlockedCountdown(fmtCountdown(blockedUntilTs - now));
      if (hasSession)
        setSessionLockedCountdown(fmtCountdown(sessionLockedUntilTs - now));
    };
    tick();
    countdownTimerRef.current = setInterval(tick, 1000);
    return () => clearInterval(countdownTimerRef.current);
  }, [fpStep, blockedUntilTs, sessionLockedUntilTs]);

  const goBlocked = (msLeft, hoursLeft) => {
    const until = Date.now() + (msLeft ?? (hoursLeft ?? 24) * 3_600_000);
    setBlockedUntilTs(until);
    setBlockedCountdown(fmtCountdown(until - Date.now()));
    writeFpLock(fpLockKey("blocked", formData.email), until);
    setFpStep("blocked");
  };

  const goSessionLocked = (msLeft, minsLeft) => {
    const mins = minsLeft || 15;
    const until = Date.now() + (msLeft ?? mins * 60_000);
    setSessionLockedUntilTs(until);
    setSessionLockedCountdown(fmtCountdown(until - Date.now()));
    writeFpLock(fpLockKey("session", formData.email), until);
    setFpStep("session-locked");
  };
  const resetFpLockState = () => {
    setFpStep("active");
    setBlockedUntilTs(null);
    setBlockedCountdown("");
    setSessionLockedUntilTs(null);
    setSessionLockedCountdown("");
    setOtpState("active");
    setResendsLeft(3);
    resendsLeftRef.current = 3;
    clearInterval(countdownTimerRef.current);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    const limitedValue = value.slice(0, 50);
    setFormData({
      ...formData,
      [name]: limitedValue,
    });
    setError("");
  };

  const handleCodeChange = (index, value) => {
    if (value.length > 1) value = value[0];
    if (!/^\d*$/.test(value)) return;

    const newCode = [...formData.verificationCode];
    newCode[index] = value;
    setFormData({ ...formData, verificationCode: newCode });
    setError("");

    if (value && index < 5) {
      codeInputs.current[index + 1]?.focus();
    }
  };

  const handleCodeKeyDown = (index, e) => {
    if (
      e.key === "Backspace" &&
      !formData.verificationCode[index] &&
      index > 0
    ) {
      codeInputs.current[index - 1]?.focus();
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

  const validateEmail = (email) => {
    if (!email) return "Email is required";
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) return "Please enter a valid email address";
    return null;
  };

  const validatePassword = (password) => {
    if (!password) return "Password is required";
    if (password.length < 8) return "Password must be at least 8 characters";
    if (!/(?=.*[a-z])/.test(password))
      return "Password must contain at least one lowercase letter";
    if (!/(?=.*[A-Z])/.test(password))
      return "Password must contain at least one uppercase letter";
    if (!/(?=.*\d)/.test(password))
      return "Password must contain at least one number";
    if (!/(?=.*[@$!%*?&#])/.test(password))
      return "Password must contain at least one special character (@$!%*?&#)";
    return null;
  };

  const checkPasswordRequirements = (password) => {
    return {
      length: password.length >= 8,
      lowercase: /(?=.*[a-z])/.test(password),
      uppercase: /(?=.*[A-Z])/.test(password),
      number: /(?=.*\d)/.test(password),
      special: /(?=.*[@$!%*?&#])/.test(password),
    };
  };

  const passwordChecks = checkPasswordRequirements(formData.newPassword);

  const handleLogin = async () => {
    setIsLoading(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: formData.username.trim(),
          password: formData.password.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(
          data.message || "Login failed! Please enter your credentials.",
        );
        setIsLoading(false);
        return;
      }

      localStorage.setItem("token", data.token);
      const decoded = jwtDecode(data.token);
      console.log("Decoded JWT:", decoded);
      localStorage.setItem("role", decoded.role);
      localStorage.setItem("userId", decoded.user_id);
      localStorage.setItem("username", decoded.username);
      localStorage.setItem("user", JSON.stringify(data.user));

      setSuccess("Login successful!");
      setFormData((prev) => ({
        ...prev,
        username: "",
        password: "",
      }));

      setTimeout(() => {
        navigate("/crime-dashboard");
      }, 800);
    } catch (error) {
      console.error("Login error:", error);
      setError("Server error. Check backend.");
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    const emailError = validateEmail(formData.email);
    if (emailError) {
      setError(emailError);
      return;
    }

    // ── Check persisted locks first — instant, no flash ──
    const savedBlocked = readFpLock(fpLockKey("blocked", formData.email));
    if (savedBlocked) {
      setBlockedUntilTs(savedBlocked);
      setBlockedCountdown(fmtCountdown(savedBlocked - Date.now()));
      setCurrentView("verify");
      setFpStep("blocked");
      return;
    }
    const savedSession = readFpLock(fpLockKey("session", formData.email));
    if (savedSession) {
      setSessionLockedUntilTs(savedSession);
      setSessionLockedCountdown(fmtCountdown(savedSession - Date.now()));
      setCurrentView("verify");
      setFpStep("session-locked");
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(`${API_URL}/auth/otp/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: formData.email }),
      });

      const data = await response.json();

      if (data.success) {
        setSuccess("Verification code sent!");
        setIsLoading(false);
        setTimeout(() => {
          setCurrentView("verify");
          setSuccess("");
          setTimer(120);
          setCanResend(false);
          resetFpLockState();
          const rl = data.resendsLeft ?? 3;
          setResendsLeft(rl);
          resendsLeftRef.current = rl;
          setOtpState("active");
        }, 1500);
      } else {
        // ── Locked out from a previous 3-strike verify failure ──
        if (data.locked) {
          setIsLoading(false);
          setTimeout(() => {
            setCurrentView("verify");
            setSuccess("");
            setTimer(120);
            setCanResend(false);
            goSessionLocked(data.msLeft, data.minutesLeft);
          }, 300);
          return;
        }

        // ── Blocked — too many OTP requests today ──
        if (
          data.blocked ||
          (data.message && data.message.includes("Maximum OTP requests"))
        ) {
          setIsLoading(false);
          setTimeout(() => {
            setCurrentView("verify");
            setSuccess("");
            goBlocked(data.msLeft, data.hoursLeft);
          }, 300);
          return;
        }

        setError(data.message || "Failed to send verification code");
        setIsLoading(false);
      }
    } catch (error) {
      setError("Failed to connect to server. Please try again.");
      console.error("Error:", error);
      setIsLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    const code = formData.verificationCode.join("");
    if (code.length !== 6) {
      setError("Please enter all 6 digits");
      return;
    }

    setIsVerifying(true);
    setError("");

    try {
      const response = await fetch(`${API_URL}/auth/otp/verify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: formData.email,
          code: code,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setError("");
        setSuccess("Code verified successfully!");
        setIsLoading(false);
        setIsVerifying(false);
        setTimeout(() => {
          setCurrentView("reset");
          setSuccess("");
        }, 1500);
        return;
      }

      // ── Locked out after 3 wrong attempts with 0 resends left ──
      if (data.locked) {
        setIsVerifying(false);
        setIsLoading(false);
        goSessionLocked(data.msLeft, data.minutesLeft);
        setError("");
        return;
      }

      // ── Too many wrong attempts on this code, but resends still available ──
      if (data.forceResend) {
        setIsVerifying(false);
        setIsLoading(false);
        setOtpState("attempts-exceeded");
        setFormData((prev) => ({
          ...prev,
          verificationCode: ["", "", "", "", "", ""],
        }));
        if (data.resendsLeft !== undefined) {
          setResendsLeft(data.resendsLeft);
          resendsLeftRef.current = data.resendsLeft;
        }
        setError(
          data.message ||
            "You have entered too many incorrect codes. For your security, please request a new one.",
        );
        return;
      }

      // ── Normal wrong-code case ──
      setError(data.message || "Invalid verification code");
      setFormData((prev) => ({
        ...prev,
        verificationCode: ["", "", "", "", "", ""],
      }));
      setTimeout(() => codeInputs.current[0]?.focus(), 60);
      setIsLoading(false);
      setIsVerifying(false);
    } catch (error) {
      setError("Failed to verify code. Please try again.");
      console.error("Error:", error);
      setIsVerifying(false);
    }
  };
  const handleResendCode = async () => {
    if (
      (!canResend && otpState !== "attempts-exceeded") ||
      isLoading ||
      fpStep !== "active"
    )
      return;
    setIsLoading(true);
    setError("");

    try {
      const response = await fetch(`${API_URL}/auth/otp/resend`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: formData.email }),
      });

      const data = await response.json();

      if (data.success) {
        setTimer(120);
        setCanResend(false);
        setOtpState("active");
        setFormData({
          ...formData,
          verificationCode: ["", "", "", "", "", ""],
        });
        const rl = data.resendsLeft ?? 0;
        setResendsLeft(rl);
        resendsLeftRef.current = rl;
        setSuccess(`New code sent! Check your email.`);
        setTimeout(() => {
          setSuccess("");
          setIsLoading(false);
        }, 2000);
      } else {
        if (data.locked) {
          setIsLoading(false);
          goSessionLocked(data.msLeft, data.minutesLeft);
          return;
        }
        if (data.resendLocked) {
          setIsLoading(false);
          setResendsLeft(0);
          resendsLeftRef.current = 0;
          setError(
            data.message || "No more resends available for this session.",
          );
          return;
        }
        if (
          data.blocked ||
          (data.message && data.message.includes("Maximum OTP requests"))
        ) {
          setIsLoading(false);
          goBlocked(data.msLeft, data.hoursLeft);
          return;
        }
        setError(data.message || "Failed to resend code");
        setIsLoading(false);
      }
    } catch (error) {
      setError("Failed to resend code. Please try again.");
      console.error("Error:", error);
      setIsLoading(false);
    }
  };

  const handleResetPassword = async () => {
    const newPasswordError = validatePassword(formData.newPassword);
    if (newPasswordError) {
      setError(newPasswordError);
      return;
    }

    if (!formData.confirmPassword) {
      setError("Please confirm your new password");
      return;
    }

    if (formData.newPassword !== formData.confirmPassword) {
      setError("New passwords do not match");
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(`${API_URL}/auth/password/reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: formData.email,
          newPassword: formData.newPassword,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.message || "Failed to reset password");
        setIsLoading(false);
        return;
      }

      setSuccess(data.message || "Password reset successfully!");
      setTimeout(() => {
        setCurrentView("login");
        setFormData({
          username: "",
          password: "",
          email: "",
          verificationCode: ["", "", "", "", "", ""],
          currentPassword: "",
          newPassword: "",
          confirmPassword: "",
        });
        setSuccess("");
        setIsLoading(false);
        resetFpLockState();
      }, 2000);
    } catch (error) {
      console.error("Reset password error:", error);
      setError("An unexpected error occurred");
      setIsLoading(false);
    }
  };

  const handleBackToLogin = () => {
    setCurrentView("login");
    setError("");
    setSuccess("");
    setFormData({
      username: "",
      password: "",
      email: "",
      verificationCode: ["", "", "", "", "", ""],
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    });
    resetFpLockState();
  };

  const handleKeyPress = (e, action) => {
    if (e.key === "Enter") {
      action();
    }
  };

  return (
    <div className="login-container">
      {/* Left Side - Branding */}
      <div className="branding-side">
        <div className="logo-container">
          <img
            src="/images/Bantay-logo.webp"
            alt="PNP Logo"
            className="logo-image"
            width="126"
            height="126"
          />
        </div>

        <div className="red-line"></div>

        <div className="bantay-logo-box">
          <img
            src="/images/Long-logo.webp"
            alt="BANTAY System"
            className="bantay-logo-image"
            width="455"
            height="155"
            fetchpriority="high"
          />
        </div>
        <div className="title-section">
          <h1 className="main-title">
            Bacoor Anti-criminality Network for Targeted Actions and Yields{" "}
          </h1>
        </div>

        <p className="tagline">
          Empowering Law Enforcement Through Intelligence
        </p>

        <div className="bottom-line"></div>
      </div>

      {/* Right Side - Forms */}
      <div className="forms-side">
        <div className="form-container">
          {currentView !== "login" &&
            !(
              currentView === "verify" &&
              (fpStep === "blocked" || fpStep === "session-locked")
            ) && (
              <button
                onClick={(e) => {
                  if (isLoading || isVerifying || success !== "") {
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                  }
                  handleBackToLogin();
                }}
                className={`back-button ${isLoading || isVerifying || success !== "" ? "disabled" : ""}`}
                disabled={isLoading || isVerifying || success !== ""}
                style={{
                  pointerEvents:
                    isLoading || isVerifying || success !== ""
                      ? "none"
                      : "auto",
                  opacity: isLoading || isVerifying || success !== "" ? 0.5 : 1,
                  cursor:
                    isLoading || isVerifying || success !== ""
                      ? "not-allowed"
                      : "pointer",
                }}
              >
                <ArrowLeft size={20} />
                <span>Back to Login</span>
              </button>
            )}

          {/* Login View */}
          {currentView === "login" && (
            <div>
              <h2 className="form-title">Secure Access</h2>
              <p className="form-subtitle">
                Enter your authorized credentials to access the system
              </p>

              {error && (
                <div className="alert alert-error">
                  <AlertCircle size={18} />
                  <span>{error}</span>
                </div>
              )}

              {success && <div className="alert alert-success">{success}</div>}

              <div className="form-group">
                <label className="form-label">Username</label>
                <div className="input-wrapper">
                  <input
                    type="text"
                    name="username"
                    value={formData.username}
                    onChange={handleInputChange}
                    onKeyPress={(e) => handleKeyPress(e, handleLogin)}
                    placeholder="Enter your username"
                    className="form-input"
                    maxLength="50"
                  />
                  <User className="input-icon" size={20} />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Password</label>
                <div className="input-wrapper">
                  <input
                    type={showPassword ? "text" : "password"}
                    name="password"
                    value={formData.password}
                    onChange={handleInputChange}
                    onKeyPress={(e) => handleKeyPress(e, handleLogin)}
                    onPaste={handlePasswordPaste}
                    onCopy={handlePasswordCopy}
                    onCut={handlePasswordCopy}
                    placeholder="Enter your password"
                    className="form-input"
                    maxLength="50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="eye-toggle"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <Eye size={20} />
                    ) : (
                      <EyeOff size={20} />
                    )}{" "}
                  </button>
                </div>
              </div>

              <div className="forgot-password-link">
                <button
                  onClick={() => {
                    setCurrentView("forgot");
                    setError("");
                    setSuccess("");
                  }}
                  className="link-button"
                  disabled={isLoading}
                >
                  Forgot Password?
                </button>
              </div>

              <button
                onClick={handleLogin}
                className="primary-button"
                disabled={isLoading || success !== ""}
              >
                {success ? "Success!" : "LOGIN"}
              </button>

              <div className="security-notice">
                <p>
                  <span className="notice-bold">Security Notice:</span> This
                  system is restricted to authorized personnel only. All access
                  attempts are logged and monitored for security purposes.
                </p>
              </div>
            </div>
          )}

          {/* Forgot Password View */}
          {currentView === "forgot" && (
            <div>
              <h2 className="form-title">Password Recovery</h2>
              <p className="form-subtitle">
                Enter your registered email address to receive a verification
                code
              </p>

              {error && (
                <div className="alert alert-error">
                  <AlertCircle size={18} />
                  <span>{error}</span>
                </div>
              )}

              {success && <div className="alert alert-success">{success}</div>}

              <div className="form-group">
                <label className="form-label">Email Address</label>
                <div className="input-wrapper">
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    onKeyPress={(e) => handleKeyPress(e, handleForgotPassword)}
                    placeholder="Enter your email"
                    className="form-input"
                    maxLength="50"
                  />
                  <Mail className="input-icon" size={20} />
                </div>
              </div>

              <button
                onClick={handleForgotPassword}
                className="primary-button"
                disabled={isLoading || success !== ""}
              >
                {isLoading ? "Sending..." : "Send Verification Code"}
              </button>
            </div>
          )}

          {/* Verification Code View — BLOCKED state (daily OTP request limit) */}
          {currentView === "verify" && fpStep === "blocked" && (
            <div style={{ textAlign: "center" }}>
              <div
                style={{
                  width: 100,
                  height: 100,
                  borderRadius: "50%",
                  background: "rgba(59, 130, 246, 0.1)",
                  border: "1px solid rgba(59, 130, 246, 0.3)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 24px",
                  boxShadow: "0 4px 20px rgba(59, 130, 246, 0.15)",
                  backdropFilter: "blur(10px)",
                }}
              >
                <div
                  style={{
                    width: 70,
                    height: 70,
                    borderRadius: "50%",
                    background: "rgba(59, 130, 246, 0.15)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <svg
                    width="30"
                    height="30"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#60a5fa"
                    strokeWidth="1.8"
                  >
                    <rect x="3" y="11" width="18" height="11" rx="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </div>
              </div>

              <h2 className="form-title" style={{ fontSize: 24 }}>
                Password Recovery Unavailable
              </h2>
              <p className="form-subtitle">
                You've already successfully recovered your password today. This
                limit protects your account from unauthorized access.
              </p>
              <p
                style={{
                  color: "#e2e8f0",
                  fontWeight: 600,
                  fontSize: 13,
                  marginBottom: 8,
                }}
              >
                Try again in:
              </p>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 10,
                  background: "rgba(30, 41, 59, 0.8)",
                  border: "2px solid rgba(59, 130, 246, 0.4)",
                  borderRadius: 12,
                  padding: "14px 32px",
                  margin: "0 0 24px",
                  fontSize: 22,
                  fontWeight: 700,
                  color: "#ffffff",
                  letterSpacing: 1,
                  backdropFilter: "blur(10px)",
                  boxShadow: "0 4px 16px rgba(0, 0, 0, 0.3)",
                }}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#60a5fa"
                  strokeWidth="2"
                >
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                {blockedCountdown || "Calculating…"}
              </div>
              <button className="primary-button" onClick={handleBackToLogin}>
                Got it, Back to Login
              </button>
            </div>
          )}

          {/* Verification Code View — SESSION-LOCKED state (3x wrong OTP) */}
          {currentView === "verify" && fpStep === "session-locked" && (
            <div style={{ textAlign: "center" }}>
              <div
                style={{
                  width: 100,
                  height: 100,
                  borderRadius: "50%",
                  background: "rgba(59, 130, 246, 0.1)",
                  border: "1px solid rgba(59, 130, 246, 0.3)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 24px",
                  boxShadow: "0 4px 20px rgba(59, 130, 246, 0.15)",
                  backdropFilter: "blur(10px)",
                }}
              >
                <div
                  style={{
                    width: 70,
                    height: 70,
                    borderRadius: "50%",
                    background: "rgba(59, 130, 246, 0.15)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <svg
                    width="30"
                    height="30"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#60a5fa"
                    strokeWidth="1.8"
                  >
                    <rect x="3" y="11" width="18" height="11" rx="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </div>
              </div>
              <h2 className="form-title" style={{ fontSize: 24 }}>
                Verification Locked
              </h2>
              <p className="form-subtitle">
                Too many incorrect attempts. For your security, this process has
                been temporarily locked.
              </p>
              <p
                style={{
                  color: "#e2e8f0",
                  fontWeight: 600,
                  fontSize: 13,
                  marginBottom: 8,
                }}
              >
                Try again in:
              </p>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 10,
                  background: "rgba(30, 41, 59, 0.8)",
                  border: "2px solid rgba(59, 130, 246, 0.4)",
                  borderRadius: 12,
                  padding: "14px 32px",
                  margin: "0 0 24px",
                  fontSize: 22,
                  fontWeight: 700,
                  color: "#ffffff",
                  letterSpacing: 1,
                  backdropFilter: "blur(10px)",
                  boxShadow: "0 4px 16px rgba(0, 0, 0, 0.3)",
                }}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#60a5fa"
                  strokeWidth="2"
                >
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                {sessionLockedCountdown || "Calculating…"}
              </div>
              <button className="primary-button" onClick={handleBackToLogin}>
                Back to Login
              </button>
            </div>
          )}

          {/* Verification Code View — ACTIVE state */}
          {currentView === "verify" && fpStep === "active" && (
            <div>
              <h2 className="form-title">Enter Verification Code</h2>
              <p className="form-subtitle-small">
                Please enter the 6-digit code sent to
              </p>
              <p className="email-display">{formData.email}</p>

              {error && (
                <div className="alert alert-error">
                  <AlertCircle size={18} />
                  <span>{error}</span>
                </div>
              )}

              {success && <div className="alert alert-success">{success}</div>}

              <div className="verification-section">
                <div className="code-inputs">
                  {[0, 1, 2, 3, 4, 5].map((index) => (
                    <input
                      key={index}
                      ref={(el) => (codeInputs.current[index] = el)}
                      type="text"
                      inputMode="numeric"
                      maxLength="1"
                      value={formData.verificationCode[index]}
                      onChange={(e) => handleCodeChange(index, e.target.value)}
                      onKeyDown={(e) => handleCodeKeyDown(index, e)}
                      className="code-input"
                      disabled={isVerifying || otpState === "attempts-exceeded"}
                    />
                  ))}
                </div>
              </div>

              {otpState === "active" && (
                <button
                  onClick={handleVerifyCode}
                  className="primary-button"
                  disabled={isVerifying || isLoading || success !== ""}
                >
                  {isVerifying ? "Verifying..." : "Verify Code"}
                </button>
              )}

              <button
                onClick={handleResendCode}
                disabled={
                  (!canResend && otpState !== "attempts-exceeded") ||
                  isLoading ||
                  isVerifying ||
                  resendsLeft <= 0
                }
                className={`secondary-button ${
                  (!canResend && otpState !== "attempts-exceeded") ||
                  isLoading ||
                  isVerifying ||
                  resendsLeft <= 0
                    ? "disabled"
                    : ""
                } ${otpState === "attempts-exceeded" && resendsLeft > 0 ? "urgent-resend" : ""}`}
              >
                {isLoading
                  ? "Sending..."
                  : resendsLeft <= 0
                    ? "No resends available"
                    : otpState === "attempts-exceeded"
                      ? `Request New Code (${resendsLeft} left)`
                      : canResend
                        ? `Resend Code (${resendsLeft} left)`
                        : `Resend in ${timer}s`}
              </button>
            </div>
          )}

          {/* Reset Password View */}
          {currentView === "reset" && (
            <div>
              <h2 className="form-title">Reset Password</h2>
              <p className="form-subtitle">Enter your new secure password</p>

              {error && (
                <div className="alert alert-error">
                  <AlertCircle size={18} />
                  <span>{error}</span>
                </div>
              )}

              {success && <div className="alert alert-success">{success}</div>}

              <div className="form-group">
                <label className="form-label">New Password</label>
                <div className="input-wrapper">
                  <input
                    type={showNewPassword ? "text" : "password"}
                    name="newPassword"
                    value={formData.newPassword}
                    onChange={handleInputChange}
                    onPaste={handlePasswordPaste}
                    onCopy={handlePasswordCopy}
                    onCut={handlePasswordCopy}
                    placeholder="Enter new password"
                    className="form-input"
                    maxLength="50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="eye-toggle"
                    aria-label={showNewPassword ? "Hide password" : "Show password"}
                  >
                    {showNewPassword ? (
                      <Eye size={20} />
                    ) : (
                      <EyeOff size={20} />
                    )}{" "}
                  </button>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Confirm New Password</label>
                <div className="input-wrapper">
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    name="confirmPassword"
                    value={formData.confirmPassword}
                    onChange={handleInputChange}
                    onKeyPress={(e) => handleKeyPress(e, handleResetPassword)}
                    onPaste={handlePasswordPaste}
                    onCopy={handlePasswordCopy}
                    onCut={handlePasswordCopy}
                    placeholder="Re-enter new password"
                    className="form-input"
                    maxLength="50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="eye-toggle"
                    aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                  >
                    {showConfirmPassword ? (
                      <Eye size={20} />
                    ) : (
                      <EyeOff size={20} />
                    )}
                  </button>
                </div>
              </div>

              <div className="password-requirements">
                <p className="requirements-title">Password Requirements:</p>
                <ul>
                  <li
                    className={passwordChecks.length ? "requirement-met" : ""}
                  >
                    {passwordChecks.length ? "✓" : "○"} At least 8 characters
                    long
                  </li>
                  <li
                    className={
                      passwordChecks.uppercase ? "requirement-met" : ""
                    }
                  >
                    {passwordChecks.uppercase ? "✓" : "○"} Contains uppercase
                    letter
                  </li>
                  <li
                    className={
                      passwordChecks.lowercase ? "requirement-met" : ""
                    }
                  >
                    {passwordChecks.lowercase ? "✓" : "○"} Contains lowercase
                    letter
                  </li>
                  <li
                    className={passwordChecks.number ? "requirement-met" : ""}
                  >
                    {passwordChecks.number ? "✓" : "○"} Contains at least one
                    number
                  </li>
                  <li
                    className={passwordChecks.special ? "requirement-met" : ""}
                  >
                    {passwordChecks.special ? "✓" : "○"} Contains special
                    character (@$!%*?&#)
                  </li>
                </ul>
              </div>

              <button
                onClick={handleResetPassword}
                className="primary-button"
                disabled={isLoading}
              >
                {isLoading ? "Resetting..." : "Reset Password"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LoginSystem;
