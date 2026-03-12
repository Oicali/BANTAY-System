// components/LoadingOverlay.jsx
export default function LoadingModal({ message = "Loading..." }) {
  return (
    <div style={{
      position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.45)",
      zIndex: 9999, display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", gap: 16,
    }}>
      <div style={{
        backgroundColor: "#fff", borderRadius: 14, padding: "28px 40px",
        display: "flex", flexDirection: "column", alignItems: "center", gap: 14,
        boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
      }}>
        <div style={{
          width: 40, height: 40, border: "4px solid #e9ecef",
          borderTop: "4px solid #0a1628", borderRadius: "50%",
          animation: "ps-spin 0.8s linear infinite",
        }} />
        <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "#0a1628" }}>
          {message}
        </p>
      </div>
      <style>{`@keyframes ps-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}