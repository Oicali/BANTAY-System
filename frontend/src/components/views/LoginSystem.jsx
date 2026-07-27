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

  // ── OTP lockout state (mirrors ProfileSettings' session-locked pattern) ──
  const [otpLocked, setOtpLocked] = useState(false);
  const [otpLockMins, setOtpLockMins] = useState(0);
  const [otpLockCountdown, setOtpLockCountdown] = useState("");
  const otpLockTimerRef = useRef(null);
  const otpLockedUntilRef = useRef(null);

  const codeInputs = useRef([]);

  const navigate = useNavigate();

  // Timer for verification code
  useEffect(() => {
    let interval;
    if (currentView === "verify" && timer > 0 && !otpLocked) {
      interval = setInterval(() => {
        setTimer((prev) => {
          if (prev <= 1) {
            setCanResend(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [currentView, timer, otpLocked]);

  // Clear messages when changing views, but keep max attempts error
  useEffect(() => {
    if (!error.includes("Maximum OTP requests")) {
      setError("");
    }
    setSuccess("");
  }, [currentView]);

  // Cleanup lock timer on unmount
  useEffect(() => {
    return () => clearInterval(otpLockTimerRef.current);
  }, []);

  // ── Countdown for OTP lockout — target-timestamp based, same as ProfileSettings ──
  const startOtpLockCountdown = (minsLeft) => {
    clearInterval(otpLockTimerRef.current);
    const until = Date.now() + minsLeft * 60_000;
    otpLockedUntilRef.current = until;
    const tick = () => {
      const msLeft = until - Date.now();
      if (msLeft <= 0) {
        setOtpLockCountdown("0m 00s");
        clearInterval(otpLockTimerRef.current);
        setOtpLocked(false); // auto-unlock UI when countdown reaches 0
        return;
      }
      const totalSecs = Math.ceil(msLeft / 1000);
      const m = Math.floor(totalSecs / 60);
      const s = totalSecs % 60;
      setOtpLockCountdown(`${m}m ${String(s).padStart(2, "0")}s`);
    };
    tick();
    otpLockTimerRef.current = setInterval(tick, 1000);
  };

  const resetOtpLockState = () => {
    setOtpLocked(false);
    setOtpLockMins(0);
    setOtpLockCountdown("");
    clearInterval(otpLockTimerRef.current);
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
          resetOtpLockState();
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
            const minsLeft = data.minutesLeft || 15;
            setOtpLockMins(minsLeft);
            startOtpLockCountdown(minsLeft);
            setOtpLocked(true);
          }, 300);
          return;
        }

        if (data.message && data.message.includes("Maximum OTP requests")) {
          setCurrentView("login");
          setTimeout(() => setError(data.message), 0);
          setFormData((prev) => ({ ...prev, email: "" }));
        } else {
          setError(data.message || "Failed to send verification code");
        }
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

      // ── Locked out after 3 wrong attempts (mirrors ProfileSettings' d.sessionLocked branch) ──
      if (data.locked) {
        setIsVerifying(false);
        setIsLoading(false);
        const minsLeft = data.minutesLeft || 15;
        setOtpLockMins(minsLeft);
        startOtpLockCountdown(minsLeft);
        setOtpLocked(true);
        setError("");
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
    if (!canResend || isLoading || otpLocked) return;

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
        setFormData({
          ...formData,
          verificationCode: ["", "", "", "", "", ""],
        });
        setSuccess(`New code sent! Check your email.`);
        setTimeout(() => {
          setSuccess("");
          setIsLoading(false);
        }, 2000);
      } else {
        // ── Locked out (resend blocked because of a prior 3-strike verify failure) ──
        if (data.locked) {
          setIsLoading(false);
          const minsLeft = data.minutesLeft || 15;
          setOtpLockMins(minsLeft);
          startOtpLockCountdown(minsLeft);
          setOtpLocked(true);
          return;
        }

        if (data.message && data.message.includes("Maximum OTP requests")) {
          setCurrentView("login");
          setTimeout(() => setError(data.message), 0);
          setFormData((prev) => ({ ...prev, email: "" }));
        } else {
          setError(data.message || "Failed to resend code");
        }
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
        resetOtpLockState();
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
    resetOtpLockState();
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
          <img src="/images/Bantay-logo.png" alt="PNP Logo" className="logo-image" />
        </div>

        <div className="red-line"></div>

        <div className="bantay-logo-box">
          <img
            src="/images/Long-logo.png"
            alt="BANTAY System"
            className="bantay-logo-image"
          />
        </div>
        <div className="title-section">
          <h1 className="main-title">Bacoor Anti-Criminality Network for Targeted Actions and Yields </h1>
        </div>

        <p className="tagline">
          Empowering Law Enforcement Through Intelligence
        </p>

        <div className="bottom-line"></div>
      </div>

      {/* Right Side - Forms */}
      <div className="forms-side">
        <div className="form-container">
          {currentView !== "login" && (
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
                  isLoading || isVerifying || success !== "" ? "none" : "auto",
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

          {/* Verification Code View — LOCKED state */}
          {currentView === "verify" && otpLocked && (
            <div style={{ textAlign: "center" }}>
              <h2 className="form-title">Verification Locked</h2>
              <p className="form-subtitle">
                Too many incorrect attempts. For your security, this process
                is temporarily locked.
              </p>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  background: "#fef3c7",
                  border: "1px solid #fcd34d",
                  borderRadius: 8,
                  padding: "8px 20px",
                  margin: "16px 0",
                  fontSize: 20,
                  fontWeight: 700,
                  color: "#92400e",
                  letterSpacing: 1,
                }}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#92400e"
                  strokeWidth="2"
                >
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                {otpLockCountdown || `${otpLockMins}m 00s`}
              </div>
              <button
                className="primary-button"
                onClick={handleBackToLogin}
                style={{ marginTop: "8px" }}
              >
                Back to Login
              </button>
            </div>
          )}

          {/* Verification Code View — ACTIVE state */}
          {currentView === "verify" && !otpLocked && (
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
                      disabled={isVerifying}
                    />
                  ))}
                </div>
              </div>

              <button
                onClick={handleVerifyCode}
                className="primary-button"
                disabled={isVerifying || isLoading || success !== ""}
              >
                {isVerifying ? "Verifying..." : "Verify Code"}
              </button>

              <button
                onClick={handleResendCode}
                disabled={!canResend || isLoading || isVerifying}
                className={`secondary-button ${!canResend || isLoading || isVerifying ? "disabled" : ""}`}
              >
                {isLoading
                  ? "Sending..."
                  : canResend
                    ? "Resend Code"
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