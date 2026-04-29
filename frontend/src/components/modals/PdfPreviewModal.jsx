// src/components/modals/PdfPreviewModal.jsx
// Reusable PDF preview modal.
// Props:
//   blobUrl    {string}   — object URL from URL.createObjectURL(blob)
//   onDownload {function} — called when user clicks Download
//   onClose    {function} — called when user closes the modal
//
// Usage:
//   import PdfPreviewModal from "../modals/PdfPreviewModal";
//   {pdfPreview && (
//     <PdfPreviewModal
//       blobUrl={pdfPreview.blobUrl}
//       onDownload={() => { pdfPreview.download(); closePreview(); }}
//       onClose={closePreview}
//     />
//   )}

import { useEffect } from "react";
import { createPortal } from "react-dom";

const PdfPreviewModal = ({ blobUrl, onDownload, onClose }) => {
  // Keyboard dismiss
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return createPortal(
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 1400,
        background: "rgba(10,22,40,0.72)",
        backdropFilter: "blur(4px)",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        padding: "24px",
      }}
      onClick={onClose}
    >
      {/* Modal shell */}
      <div
        style={{
          background: "#fff", borderRadius: "14px",
          boxShadow: "0 24px 64px rgba(0,0,0,0.35)",
          display: "flex", flexDirection: "column",
          width: "min(1100px, 96vw)", height: "min(94vh, 1000px)",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Toolbar */}
        <div
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "14px 20px",
            borderBottom: "1px solid #e9ecef",
            background: "#f8f9fa",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            {/* PDF icon badge */}
            <div style={{
              width: "32px", height: "32px", borderRadius: "8px",
              background: "#1e3a5f", display: "flex", alignItems: "center",
              justifyContent: "center", flexShrink: 0,
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
                <polyline points="10 9 9 9 8 9"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize: "14px", fontWeight: 700, color: "#0a1628", lineHeight: 1.2 }}>
                PDF Preview
              </div>
              <div style={{ fontSize: "11px", color: "#6c757d", lineHeight: 1 }}>
                Review before downloading
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <button
              onClick={onDownload}
              style={{
                display: "flex", alignItems: "center", gap: "6px",
                padding: "8px 18px",
                background: "#1e3a5f", color: "#fff",
                border: "none", borderRadius: "8px",
                fontSize: "13px", fontWeight: 700,
                cursor: "pointer", fontFamily: "inherit",
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = "#162d4a"}
              onMouseLeave={(e) => e.currentTarget.style.background = "#1e3a5f"}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Download
            </button>
            <button
              onClick={onClose}
              style={{
                width: "34px", height: "34px",
                display: "flex", alignItems: "center", justifyContent: "center",
                background: "transparent", border: "1px solid #dee2e6",
                borderRadius: "8px", cursor: "pointer",
                color: "#6c757d", fontSize: "16px",
                transition: "background 0.15s, color 0.15s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "#f1f3f5"; e.currentTarget.style.color = "#0a1628"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#6c757d"; }}
              title="Close preview"
            >
              ✕
            </button>
          </div>
        </div>

        {/* PDF iframe */}
        <div style={{ flex: 1, background: "#e9ecef", overflow: "hidden", position: "relative" }}>
          <iframe
            src={blobUrl}
            title="PDF Preview"
            style={{ width: "100%", height: "100%", border: "none", display: "block" }}
          />
        </div>
      </div>

      {/* Dismiss hint */}
      <p style={{ marginTop: "14px", color: "rgba(255,255,255,0.55)", fontSize: "12px" }}>
        Click outside or press Esc to close
      </p>
    </div>,
    document.body
  );
};

export default PdfPreviewModal;