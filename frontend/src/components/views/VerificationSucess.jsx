// ================================================================================
// FILE: src/pages/VerificationSuccess.jsx
// ================================================================================
// Place this page at the /verification-success route in your React router.
// The backend redirects here after verifyAccount() runs, with a ?status= param.
// ================================================================================

import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

const STATUS_CONFIG = {
  success: {
    icon: "✅",
    title: "Account Verified!",
    message:
      "Your account has been successfully verified and activated. Check your email for your login credentials (username and password).",
    color: "#28a745",
    bg: "#d4edda",
    border: "#28a745",
    showLogin: true,
  },
  expired: {
    icon: "⏰",
    title: "Link Expired",
    message:
      "This verification link has expired (valid for 24 hours). Please contact your administrator to resend the verification email.",
    color: "#856404",
    bg: "#fff3cd",
    border: "#ffc107",
    showLogin: false,
  },
  used: {
    icon: "🔁",
    title: "Already Used",
    message:
      "This verification link has already been used. If your account is active, you can log in directly.",
    color: "#0c5460",
    bg: "#d1ecf1",
    border: "#17a2b8",
    showLogin: true,
  },
  already_verified: {
    icon: "ℹ️",
    title: "Already Verified",
    message:
      "This account is already verified and active. You can log in with your credentials.",
    color: "#0c5460",
    bg: "#d1ecf1",
    border: "#17a2b8",
    showLogin: true,
  },
  invalid: {
    icon: "❌",
    title: "Invalid Link",
    message:
      "This verification link is invalid or does not exist. Please contact your administrator.",
    color: "#721c24",
    bg: "#f8d7da",
    border: "#f5c6cb",
    showLogin: false,
  },
  error: {
    icon: "⚠️",
    title: "Something Went Wrong",
    message:
      "An unexpected error occurred during verification. Please try again or contact your administrator.",
    color: "#721c24",
    bg: "#f8d7da",
    border: "#f5c6cb",
    showLogin: false,
  },
};

const VerificationSuccess = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [countdown, setCountdown] = useState(10);

  const status = searchParams.get("status") || "invalid";
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.invalid;

  // Auto-redirect to login after 10s on success
  useEffect(() => {
    if (status !== "success") return;

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          const newTab = window.open("/login", "_blank");
          if (!newTab) {
            navigate("/login"); // fallback to same tab if blocked
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [status, navigate]);

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        {/* Header */}
        <div style={styles.header}>
          <h1 style={styles.headerTitle}>🛡️ BANTAY System</h1>
          <p style={styles.headerSub}>Crime Monitoring and Management System</p>
        </div>

        {/* Content */}
        <div style={styles.content}>
          <div style={styles.iconWrapper}>
            <span style={styles.icon}>{config.icon}</span>
          </div>

          <h2 style={{ ...styles.title, color: config.color }}>
            {config.title}
          </h2>

          <div
            style={{
              ...styles.messageBox,
              background: config.bg,
              borderColor: config.border,
              color: config.color,
            }}
          >
            <p style={styles.messageText}>{config.message}</p>
          </div>

          {status === "success" && (
            <p style={styles.countdown}>
              Redirecting to login in <strong>{countdown}</strong> second
              {countdown !== 1 ? "s" : ""}...
            </p>
          )}

          {config.showLogin && (
            <button
              style={styles.loginButton}
              onClick={() => {
                const newTab = window.open("/login", "_blank");
                if (!newTab) navigate("/login");
              }}
            >
              Go to Login
            </button>
          )}
        </div>

        {/* Footer */}
        <div style={styles.footer}>
          <p>
            <strong>BANTAY Crime Monitoring System</strong>
            <br />© {new Date().getFullYear()} BANTAY System. All rights
            reserved.
          </p>
        </div>
      </div>
    </div>
  );
};

const styles = {
  page: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#f0f2f5",
    padding: "20px",
    fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
  },
  card: {
    width: "100%",
    maxWidth: "520px",
    borderRadius: "12px",
    boxShadow: "0 4px 24px rgba(0,0,0,0.12)",
    overflow: "hidden",
    background: "#fff",
  },
  header: {
    background: "linear-gradient(135deg, #1e3a5f 0%, #0a1628 100%)",
    color: "white",
    padding: "30px",
    textAlign: "center",
  },
  headerTitle: {
    margin: 0,
    fontSize: "26px",
    fontWeight: "700",
  },
  headerSub: {
    margin: "8px 0 0 0",
    opacity: 0.85,
    fontSize: "14px",
  },
  content: {
    padding: "36px 32px",
    textAlign: "center",
  },
  iconWrapper: {
    marginBottom: "16px",
  },
  icon: {
    fontSize: "56px",
    lineHeight: 1,
  },
  title: {
    fontSize: "24px",
    fontWeight: "700",
    margin: "0 0 20px 0",
  },
  messageBox: {
    border: "1px solid",
    borderRadius: "8px",
    padding: "16px 20px",
    marginBottom: "24px",
    textAlign: "left",
  },
  messageText: {
    margin: 0,
    fontSize: "15px",
    lineHeight: "1.6",
  },
  countdown: {
    fontSize: "14px",
    color: "#6c757d",
    marginBottom: "20px",
  },
  loginButton: {
    background: "#1e3a5f",
    color: "white",
    border: "none",
    borderRadius: "6px",
    padding: "12px 32px",
    fontSize: "15px",
    fontWeight: "600",
    cursor: "pointer",
    transition: "background 0.2s",
  },
  footer: {
    textAlign: "center",
    color: "#6c757d",
    fontSize: "12px",
    padding: "16px 32px 24px",
    borderTop: "1px solid #dee2e6",
  },
};

export default VerificationSuccess;
