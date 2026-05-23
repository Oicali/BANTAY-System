// frontend\src\components\layout\Topbar.jsx
import React, { useState, useEffect, useRef } from "react";
import { getUserFromToken } from "../../utils/auth";

const API_URL = import.meta.env.VITE_API_URL;

const timeAgo = (dateStr) => {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

const LINK_MAP = {
  "/e-blotter": "/e-blotter",
  "/brgy-report": "/brgy-report",
  "/case-management": "/case-management",
  "/patrol-scheduling": "/patrol-scheduling",
  "/crime-dashboard": "/crime-dashboard",
};

// ── Notification Toast ──────────────────────────────────────────────────────
const NotifToast = ({ notif, onDone }) => {
  const [phase, setPhase] = useState("enter"); // enter → stay → exit

  useEffect(() => {
    if (!notif) return;
    setPhase("enter");
    const stayTimer = setTimeout(() => setPhase("exit"), 4000);
    const doneTimer = setTimeout(() => onDone(), 4600);
    return () => {
      clearTimeout(stayTimer);
      clearTimeout(doneTimer);
    };
  }, [notif]);

  if (!notif) return null;

  const isExiting = phase === "exit";

  return (
    <div
      style={{
        position: "fixed",
        top: "24px",
        left: "50%",
        transform: isExiting
          ? "translateX(-50%) translateY(-20px)"
          : "translateX(-50%) translateY(0px)",
        opacity: isExiting ? 0 : 1,
        transition:
          "transform 0.4s cubic-bezier(0.34,1.56,0.64,1), opacity 0.4s ease",
        zIndex: 99999,
        pointerEvents: "none",
        animation:
          phase === "enter"
            ? "notifSlideDown 0.4s cubic-bezier(0.34,1.56,0.64,1) forwards"
            : "none",
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: "12px",
          boxShadow: "0 8px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.08)",
          border: "1px solid #e5e7eb",
          padding: "14px 20px",
          display: "flex",
          alignItems: "center",
          gap: "12px",
          minWidth: "280px",
          maxWidth: "400px",
        }}
      >
        {/* Left accent bar */}
        <div
          style={{
            width: "4px",
            height: "40px",
            borderRadius: "4px",
            background: "#1e3a5f",
            flexShrink: 0,
          }}
        />
        {/* Bell icon */}
        <div
          style={{
            width: "36px",
            height: "36px",
            borderRadius: "50%",
            background: "#eff6ff",
            border: "2px solid #bfdbfe",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#3b82f6"
            strokeWidth="2.5"
          >
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
        </div>
        {/* Text */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: "13px",
              fontWeight: "700",
              color: "#111827",
              marginBottom: "2px",
            }}
          >
            {notif.title}
          </div>
          <div
            style={{
              fontSize: "12px",
              color: "#6b7280",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {notif.message}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes notifSlideDown {
          from { opacity: 0; transform: translateX(-50%) translateY(-20px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0px); }
        }
      `}</style>
    </div>
  );
};

const formatBarangayLabel = (name) => {
  if (!name) return "";
  const ROMAN = new Set([
    "I",
    "II",
    "III",
    "IV",
    "V",
    "VI",
    "VII",
    "VIII",
    "IX",
    "X",
    "XI",
    "XII",
  ]);
  return name.toLowerCase().replace(/\b\w+/g, (word) => {
    const upper = word.toUpperCase();
    if (ROMAN.has(upper)) return upper;
    if (upper === "P" || upper === "F") return upper;
    return word.charAt(0).toUpperCase() + word.slice(1);
  });
};

// ────────────────────────────────────────────────────────────────────────────

const TopBar = ({ onMenuClick }) => {
  const [user, setUser] = useState(null);
  const [profileData, setProfileData] = useState(() => {
    const cached = localStorage.getItem("cachedProfile");
    return cached ? JSON.parse(cached) : null;
  });
  const [profilePicture, setProfilePicture] = useState(() => {
    const cached = localStorage.getItem("cachedProfile");
    if (cached) {
      const parsed = JSON.parse(cached);
      return parsed.profile_picture || null;
    }
    return null;
  });

  const [notifs, setNotifs] = useState([]);
  const [unread, setUnread] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef(null);
  const pollRef = useRef(null);
  const prevUnreadRef = useRef(0);
  // ── Toast state ──
  const [toastNotif, setToastNotif] = useState(null);
  const prevNotifIdsRef = useRef(null); // null = first load, Set after first load

  useEffect(() => {
    const userData = getUserFromToken();
    setUser(userData);
    fetchProfileData();
    fetchNotifications();

    pollRef.current = setInterval(fetchNotifications, 8000);

    const handleProfileUpdated = () => {
      localStorage.removeItem("cachedProfile");
      fetchProfileData();
    };
    window.addEventListener("profileUpdated", handleProfileUpdated);

    const handleClickOutside = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      window.removeEventListener("profileUpdated", handleProfileUpdated);
      document.removeEventListener("mousedown", handleClickOutside);
      clearInterval(pollRef.current);
    };
  }, []);

  useEffect(() => {
    const handleFocus = () => fetchProfileData();
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, []);

  const fetchProfileData = async () => {
    try {
      const token = localStorage.getItem("token");
      const cached = localStorage.getItem("cachedProfile");
      if (cached) {
        const parsed = JSON.parse(cached);
        setProfileData(parsed);
        setProfilePicture(parsed.profile_picture || null);
      }
      const response = await fetch(`${API_URL}/users/profile`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        if (data.user) {
          setProfileData(data.user);
          setProfilePicture(data.user.profile_picture || null);
          localStorage.setItem("cachedProfile", JSON.stringify(data.user));
        }
      }
    } catch (error) {
      console.error("Error fetching profile data:", error);
    }
  };

  const fetchNotifications = async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) return;
      const res = await fetch(`${API_URL}/notifications`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const newUnread = data.unread || 0;

        // Play sound only when unread count increases
        if (newUnread > prevUnreadRef.current) {
          try {
            const ctx = new (
              window.AudioContext || window.webkitAudioContext
            )();
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            o.connect(g);
            g.connect(ctx.destination);
            o.frequency.setValueAtTime(880, ctx.currentTime);
            o.frequency.setValueAtTime(1100, ctx.currentTime + 0.1);
            g.gain.setValueAtTime(0.3, ctx.currentTime);
            g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
            o.start(ctx.currentTime);
            o.stop(ctx.currentTime + 0.4);
          } catch (_) {}
        }

        if (newUnread > prevUnreadRef.current && data.data?.length > 0) {
          const newest = data.data[0];
          if (
            prevNotifIdsRef.current !== null &&
            !prevNotifIdsRef.current.has(newest.id)
          ) {
            setToastNotif(newest);
          }
        }
        // Track seen IDs
        if (prevNotifIdsRef.current === null) {
          prevNotifIdsRef.current = new Set((data.data || []).map((n) => n.id));
        } else {
          (data.data || []).forEach((n) => prevNotifIdsRef.current.add(n.id));
        }

        prevUnreadRef.current = newUnread;
        setNotifs(data.data || []);
        setUnread(newUnread);
      }
    } catch (err) {
      console.error("Fetch notifications error:", err);
    }
  };

  const markAllRead = () => {
    // Instant UI update
    setNotifs((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnread(0);
    prevUnreadRef.current = 0;
    // API in background
    const token = localStorage.getItem("token");
    fetch(`${API_URL}/notifications/read-all`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
    }).catch(console.error);
  };

  const markOneRead = (notif) => {
    if (notif.is_read) return;
    // Instant UI update
    setNotifs((prev) =>
      prev.map((n) => (n.id === notif.id ? { ...n, is_read: true } : n)),
    );
    setUnread((prev) => Math.max(0, prev - 1));
    prevUnreadRef.current = Math.max(0, prevUnreadRef.current - 1);
    // API in background
    const token = localStorage.getItem("token");
    fetch(`${API_URL}/notifications/${notif.id}/read`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
    }).catch(console.error);
  };

  const handleNotifClick = (notif) => {
    markOneRead(notif);
    if (notif.link_to && LINK_MAP[notif.link_to]) {
      window.location.href = LINK_MAP[notif.link_to];
    }
    setNotifOpen(false);
  };

  const getInitials = () => {
    if (!profileData)
      return user?.username
        ? user.username.substring(0, 2).toUpperCase()
        : "JI";
    const first = profileData.first_name?.[0] || "";
    const last = profileData.last_name?.[0] || "";
    return (first + last).toUpperCase() || "?";
  };

  const getDisplayName = () => {
    if (!profileData) return "User";
    const rank = profileData.rank_abbreviation
      ? `${profileData.rank_abbreviation}. `
      : "";
    const firstName = profileData.first_name || "";
    const lastName = profileData.last_name || "";
    let displayFirstName =
      firstName.length > 15 ? firstName.substring(0, 9) + "..." : firstName;
    let displayLastName =
      lastName.length > 15 ? lastName.substring(0, 9) + "..." : lastName;
    let fullName = displayFirstName;
    if (displayLastName) fullName += " " + displayLastName;
    return (rank + fullName).trim() || user?.username || "User";
  };

  const NOTIF_ICONS = {
    NEW_REFERRAL: {
      color: "#ef4444",
      svg: (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#ef4444"
          strokeWidth="2.5"
        >
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      ),
    },
    REFERRAL_ACCEPTED: {
      color: "#22c55e",
      svg: (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#22c55e"
          strokeWidth="2.5"
        >
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
      ),
    },
    PATROL_ASSIGNED: {
      color: "#3b82f6",
      svg: (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#3b82f6"
          strokeWidth="2.5"
        >
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      ),
    },
    REFERRAL_RESPONDED: {
      color: "#2563eb",
      svg: (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#2563eb"
          strokeWidth="2.5"
        >
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      ),
    },
    CASE_ASSIGNED: {
      color: "#f59e0b",
      svg: (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#f59e0b"
          strokeWidth="2.5"
        >
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
      ),
    },
    REFERRAL_DELETED: {
      color: "#6b7280",
      svg: (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#6b7280"
          strokeWidth="2.5"
        >
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
          <path d="M10 11v6" />
          <path d="M14 11v6" />
          <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
        </svg>
      ),
    },
    USER_REGISTERED: {
      color: "#8b5cf6",
      svg: (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#8b5cf6"
          strokeWidth="2.5"
        >
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
          <line x1="19" y1="8" x2="19" y2="14" />
          <line x1="22" y1="11" x2="16" y2="11" />
        </svg>
      ),
    },
    ACCOUNT_LOCKED: {
      color: "#dc2626",
      svg: (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#dc2626"
          strokeWidth="2.5"
        >
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      ),
    },
  };

  const DEFAULT_ICON = {
    color: "#1e3a5f",
    svg: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#1e3a5f"
        strokeWidth="2.5"
      >
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
    ),
  };

  const getNotifIcon = (type) => NOTIF_ICONS[type] || DEFAULT_ICON;

  return (
    <>
      {/* ── Toast — rendered outside the header so it's truly centered ── */}
      <NotifToast notif={toastNotif} onDone={() => setToastNotif(null)} />

      <header className="top-bar">
        <div
          className="top-bar-left"
          style={{ display: "flex", alignItems: "center", gap: "12px" }}
        >
          <button
            className="hamburger-btn"
            onClick={onMenuClick}
            aria-label="Open menu"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
        </div>

        <div
          className="top-bar-right"
          style={{ display: "flex", alignItems: "center", gap: "12px" }}
        >
          {/* ── BELL ICON ── */}
          <div ref={notifRef} style={{ position: "relative" }}>
            <button
              onClick={() => setNotifOpen((v) => !v)}
              style={{
                position: "relative",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "6px",
                borderRadius: "8px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "background 0.2s",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = "#f1f5f9")
              }
              onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#374151"
                strokeWidth="2"
              >
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              {unread > 0 && (
                <span
                  style={{
                    position: "absolute",
                    top: "2px",
                    right: "2px",
                    background: "#ef4444",
                    color: "#fff",
                    fontSize: "10px",
                    fontWeight: "700",
                    borderRadius: "999px",
                    minWidth: "16px",
                    height: "16px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "0 4px",
                    lineHeight: 1,
                  }}
                >
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </button>

            {/* ── DROPDOWN ── */}
            {notifOpen && (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 8px)",
                  right: 0,
                  width: "360px",
                  maxHeight: "480px",
                  background: "#fff",
                  borderRadius: "12px",
                  boxShadow: "0 8px 32px rgba(0,0,0,0.15)",
                  border: "1px solid #e5e7eb",
                  zIndex: 9999,
                  display: "flex",
                  flexDirection: "column",
                  overflow: "hidden",
                }}
              >
                {/* Header */}
                <div
                  style={{
                    padding: "14px 16px",
                    borderBottom: "1px solid #f3f4f6",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <span
                      style={{
                        fontWeight: "700",
                        fontSize: "14px",
                        color: "#111827",
                      }}
                    >
                      Notifications
                    </span>
                    {unread > 0 && (
                      <span
                        style={{
                          background: "#ef4444",
                          color: "#fff",
                          fontSize: "10px",
                          fontWeight: "700",
                          borderRadius: "999px",
                          padding: "2px 6px",
                        }}
                      >
                        {unread}
                      </span>
                    )}
                  </div>
                  {unread > 0 && (
                    <button
                      onClick={markAllRead}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        fontSize: "12px",
                        color: "#1e3a5f",
                        fontWeight: "600",
                      }}
                    >
                      Mark all as read
                    </button>
                  )}
                </div>

                {/* List */}
                <div style={{ overflowY: "auto", flex: 1 }}>
                  {notifs.length === 0 ? (
                    <div
                      style={{
                        padding: "40px 20px",
                        textAlign: "center",
                        color: "#9ca3af",
                        fontSize: "13px",
                      }}
                    >
                      <div style={{ fontSize: "32px", marginBottom: "8px" }}>
                        🔔
                      </div>
                      No notifications yet
                    </div>
                  ) : (
                    notifs.map((notif) => {
                      const notifData = getNotifIcon(notif.type);
                      const color = notifData.color;
                      return (
                        <div
                          key={notif.id}
                          onClick={() => handleNotifClick(notif)}
                          style={{
                            padding: "12px 16px",
                            borderBottom: "1px solid #f9fafb",
                            display: "flex",
                            gap: "10px",
                            alignItems: "flex-start",
                            cursor: notif.link_to ? "pointer" : "default",
                            background: notif.is_read ? "#fff" : "#f0f4ff",
                            transition: "background 0.15s",
                          }}
                          onMouseEnter={(e) =>
                            (e.currentTarget.style.background = notif.is_read
                              ? "#f9fafb"
                              : "#e8eeff")
                          }
                          onMouseLeave={(e) =>
                            (e.currentTarget.style.background = notif.is_read
                              ? "#fff"
                              : "#f0f4ff")
                          }
                        >
                          <div
                            style={{
                              width: "36px",
                              height: "36px",
                              borderRadius: "50%",
                              background: color + "22",
                              border: `2px solid ${color}44`,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: "16px",
                              flexShrink: 0,
                            }}
                          >
                            {notif.sender_avatar ? (
                              <img
                                src={notif.sender_avatar}
                                alt=""
                                style={{
                                  width: "100%",
                                  height: "100%",
                                  borderRadius: "50%",
                                  objectFit: "cover",
                                }}
                              />
                            ) : (
                              notifData.svg
                            )}
                          </div>

                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div
                              style={{
                                fontSize: "13px",
                                fontWeight: notif.is_read ? "500" : "700",
                                color: "#111827",
                                marginBottom: "2px",
                              }}
                            >
                              {notif.title}
                            </div>
                            <div
                              style={{
                                fontSize: "12px",
                                color: "#6b7280",
                                lineHeight: "1.4",
                                marginBottom: "4px",
                              }}
                            >
                              {notif.message}
                            </div>
                            <div style={{ fontSize: "11px", color: "#9ca3af" }}>
                              {notif.sender_name && (
                                <span
                                  style={{
                                    fontWeight: "600",
                                    color: "#6b7280",
                                  }}
                                >
                                  {notif.sender_name} ·{" "}
                                </span>
                              )}
                              {timeAgo(notif.created_at)}
                            </div>
                          </div>

                          {!notif.is_read && (
                            <div
                              style={{
                                width: "8px",
                                height: "8px",
                                borderRadius: "50%",
                                background: "#3b82f6",
                                flexShrink: 0,
                                marginTop: "4px",
                              }}
                            />
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ── PROFILE ── */}
          <div className="user-profile">
            <div className="user-info">
              <div className="user-name">{getDisplayName()}</div>
              <div className="user-role">
                {profileData?.user_type === "barangay" &&
                profileData?.barangay_code
                  ? `${profileData?.role || user?.role } - ${formatBarangayLabel(profileData.barangay_code)}`
                  : profileData?.role || user?.role}
              </div>
            </div>
            <div className="user-avatar">
              {profilePicture ? (
                <img
                  src={profilePicture}
                  alt="Profile"
                  style={{
                    width: "100%",
                    height: "100%",
                    borderRadius: "50%",
                    objectFit: "cover",
                  }}
                />
              ) : (
                getInitials()
              )}
            </div>
          </div>
        </div>
      </header>
    </>
  );
};

export default TopBar;
