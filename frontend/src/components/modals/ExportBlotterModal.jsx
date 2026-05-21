import { useState } from "react";

const today = new Date();
const toIso = (d) => d.toISOString().slice(0, 10);
const oneYearAgo = new Date(today);
oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
oneYearAgo.setDate(oneYearAgo.getDate() + 1);

const ExportBlotterModal = ({ onClose, onExport, isExporting }) => {
  const [dateFrom, setDateFrom] = useState(toIso(oneYearAgo));
  const [dateTo, setDateTo] = useState(toIso(today));

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1400,
        background: "rgba(10,22,40,0.72)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 14,
          boxShadow: "0 24px 64px rgba(0,0,0,0.35)",
          width: 420,
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            background: "linear-gradient(135deg,#1e3a5f 0%,#0a1628 100%)",
            padding: "20px 24px",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 9,
              background: "rgba(255,255,255,0.15)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#fff"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
          </div>
          <div>
            <div
              style={{
                fontSize: 16,
                fontWeight: 700,
                color: "#fff",
                margin: 0,
              }}
            >
              Export Blotter Records
            </div>
            <div
              style={{
                fontSize: 12,
                color: "rgba(255,255,255,0.65)",
                marginTop: 2,
              }}
            >
              Select a date range to export
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              marginLeft: "auto",
              background: "rgba(255,255,255,0.12)",
              border: "none",
              borderRadius: 6,
              width: 28,
              height: 28,
              cursor: "pointer",
              color: "rgba(255,255,255,0.8)",
              fontSize: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "24px 24px 20px" }}>
          <p
            style={{
              margin: "0 0 20px",
              fontSize: 13,
              color: "#6b7280",
              background: "#f9fafb",
              border: "1px solid #e5e7eb",
              borderRadius: 8,
              padding: "10px 14px",
            }}
          >
            Defaults to last 1 year. You can change the range below.
          </p>

          <div style={{ marginBottom: 16 }}>
            <label
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "#374151",
                display: "block",
                marginBottom: 6,
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}
            >
              Date From
            </label>
            <input
              type="date"
              value={dateFrom}
              max={dateTo}
              onChange={(e) => setDateFrom(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 12px",
                border: "1.5px solid #d1d5db",
                colorScheme: "light",
                color: "#111827",
                borderRadius: 8,
                fontSize: 14,
                color: "#111827",
                background: "#fff",
                boxSizing: "border-box",
                outline: "none",
                fontFamily: "inherit",
                cursor: "pointer",
              }}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "#374151",
                display: "block",
                marginBottom: 6,
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}
            >
              Date To
            </label>
            <input
              type="date"
              value={dateTo}
              min={dateFrom}
              max={toIso(today)}
              onChange={(e) => setDateTo(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 12px",
                border: "1.5px solid #d1d5db",
                colorScheme: "light",
                color: "#111827",
                borderRadius: 8,
                fontSize: 14,
                color: "#111827",
                background: "#fff",
                boxSizing: "border-box",
                outline: "none",
                fontFamily: "inherit",
                cursor: "pointer",
              }}
            />
          </div>

          {/* Footer buttons */}
          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={onClose}
              style={{
                flex: 1,
                padding: "10px 0",
                border: "1.5px solid #d1d5db",
                borderRadius: 8,
                background: "#fff",
                color: "#374151",
                cursor: "pointer",
                fontSize: 14,
                fontWeight: 600,
                fontFamily: "inherit",
              }}
            >
              Cancel
            </button>
            <button
              onClick={() => onExport(dateFrom, dateTo)}
              disabled={isExporting}
              style={{
                flex: 2,
                padding: "10px 0",
                border: "none",
                borderRadius: 8,
                background: isExporting ? "#93a8c4" : "#1e3a5f",
                color: "#fff",
                cursor: isExporting ? "not-allowed" : "pointer",
                fontSize: 14,
                fontWeight: 600,
                fontFamily: "inherit",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              {isExporting ? (
                "Exporting…"
              ) : (
                <>
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  Export PDF
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
export default ExportBlotterModal;
