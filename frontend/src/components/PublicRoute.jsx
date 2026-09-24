import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { getToken } from "../utils/auth";

const API_URL = import.meta.env.VITE_API_URL;

export default function PublicRoute({ children }) {
  const [status, setStatus] = useState(() =>
    getToken() ? "checking" : "guest",
  );

  useEffect(() => {
    if (status !== "checking") return;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`${API_URL}/users/profile`, {
          headers: { Authorization: `Bearer ${getToken()}` },
          signal: controller.signal,
        });
        if (cancelled) return;

        if (res.ok) {
          setStatus("authed");
          return;
        }
        // Server says the token is dead (revoked/expired/locked/deactivated)
        if (res.status === 401) {
          localStorage.removeItem("token");
          sessionStorage.removeItem("token");
          localStorage.removeItem("cachedProfile");
        }
        setStatus("guest");
      } catch {
        // Server unreachable or slow: show login, keep the token
        if (!cancelled) setStatus("guest");
      } finally {
        clearTimeout(timer);
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [status]);

  if (status === "checking") {
    return <div style={{ minHeight: "100vh", background: "#0f172a" }} />;
  }
  if (status === "authed") {
    return <Navigate to="/crime-dashboard" replace />;
  }
  return children;
}
