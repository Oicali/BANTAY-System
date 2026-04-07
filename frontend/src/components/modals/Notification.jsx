import { useEffect, useState } from "react";

const Notification = ({ message, type = "success", onClose, duration = 3000 }) => {
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const showTimer  = setTimeout(() => setVisible(true), 10);
    const leaveTimer = setTimeout(() => setLeaving(true), duration - 300);
    const closeTimer = setTimeout(() => onClose?.(), duration);
    return () => { clearTimeout(showTimer); clearTimeout(leaveTimer); clearTimeout(closeTimer); };
  }, [duration, onClose]);

  const colors = {
    success: { bg: "#16a34a", border: "#15803d", icon: "✓" },
    error:   { bg: "#dc2626", border: "#b91c1c", icon: "✕" },
    warning: { bg: "#d97706", border: "#b45309", icon: "!" },
    info:    { bg: "#1e3a5f", border: "#0a1628", icon: "i" },
  };

  const { bg, border, icon } = colors[type] || colors.success;

  return (
    <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 99999, transform: visible && !leaving ? "translateY(0)" : "translateY(20px)", opacity: visible && !leaving ? 1 : 0, transition: "transform 0.25s ease, opacity 0.25s ease" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, backgroundColor: bg, border: `1px solid ${border}`, borderRadius: 10, padding: "12px 18px", minWidth: 240, maxWidth: 360, boxShadow: "0 4px 20px rgba(0,0,0,0.18)" }}>
        <div style={{ width: 24, height: 24, borderRadius: "50%", backgroundColor: "rgba(255,255,255,0.25)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "#fff", flexShrink: 0 }}>{icon}</div>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#fff", flex: 1, lineHeight: 1.4 }}>{message}</p>
        <button onClick={() => { setLeaving(true); setTimeout(() => onClose?.(), 300); }} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.75)", fontSize: 16, cursor: "pointer", padding: 0, lineHeight: 1, flexShrink: 0 }}>✕</button>
      </div>
    </div>
  );
};

export default Notification;