import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { API_URL, getToken } from "../utils/auth";

const WATCH_MS = 2000;
const SKIP_PATHS = ["/login", "/verification-success"];

export default function SessionWatcher() {
  const navigate = useNavigate();
  const location = useLocation();
  const pathRef = useRef(location.pathname);
  const inFlight = useRef(false);
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    pathRef.current = location.pathname;
  }, [location.pathname]);

  useEffect(() => {
    const ping = async () => {
      if (inFlight.current) return;
      if (SKIP_PATHS.includes(pathRef.current)) return;

      const token = getToken();
      if (!token) return;

      inFlight.current = true;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      try {
        const res = await fetch(`${API_URL}/auth/session-check`, {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
          signal: controller.signal,
        });

        if (res.status !== 401) return;

        // Token changed or was cleared while the request was in flight
        // (user logged out or logged in again) — not a remote logout.
        if (getToken() !== token) return;

        let data = {};
        try {
          data = await res.json();
        } catch {}
        const code = data?.code || "SESSION_REVOKED";

        localStorage.removeItem("token");
        sessionStorage.removeItem("token");

        setMessage(
          code === "SESSION_REVOKED"
            ? "This device was logged out from another device."
            : "Your session has expired. Please log in again.",
        );
        setVisible(true);
        navigate("/login", { replace: true });
      } catch {
        // Network error or timeout: never log the user out, retry next tick.
      } finally {
        clearTimeout(timeout);
        inFlight.current = false;
      }
    };

    ping();
    const id = setInterval(ping, WATCH_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") ping();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", ping);

    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", ping);
    };
  }, [navigate]);

  if (!visible) return null;

  return (
    <div
      className="eb-modal"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="session-dead-title"
      style={{
        zIndex: 10002,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        className="eb-modal-content"
        style={{ maxWidth: "420px", padding: 0 }}
      >
        <div
          style={{
            padding: "20px 24px",
            background: "linear-gradient(135deg, #0B2447 0%, #19376D 100%)",
            borderBottom: "3px solid #dc2626",
            borderRadius: "8px 8px 0 0",
            display: "flex",
            alignItems: "center",
            gap: "12px",
          }}
        >
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "8px",
              background: "rgba(255,255,255,0.15)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
              <polyline points="16,17 21,12 16,7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </div>
          <div>
            <h3
              id="session-dead-title"
              style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "white" }}
            >
              Logged out
            </h3>
            <p
              style={{
                margin: 0,
                fontSize: "12px",
                color: "rgba(255,255,255,0.6)",
                marginTop: "2px",
              }}
            >
              Your session has ended
            </p>
          </div>
        </div>

        <div style={{ padding: "24px" }}>
          <p
            style={{
              margin: 0,
              fontSize: "14px",
              color: "#374151",
              lineHeight: "1.6",
            }}
          >
            {message}
          </p>
        </div>

        <div
          style={{
            padding: "16px 24px",
            borderTop: "1px solid #e5e7eb",
            display: "flex",
            justifyContent: "flex-end",
            background: "#f9fafb",
            borderRadius: "0 0 8px 8px",
          }}
        >
          <button
            autoFocus
            className="eb-btn eb-btn-primary"
            onClick={() => setVisible(false)}
            style={{ minWidth: "80px" }}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}

