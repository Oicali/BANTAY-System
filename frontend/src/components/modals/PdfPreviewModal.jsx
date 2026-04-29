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
    const handler = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1400,
        background: "rgba(10,22,40,0.72)",
        backdropFilter: "blur(4px)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
      }}
      onClick={onClose}
    >
      {/* Modal shell — restore full borderRadius */}
      <div
        style={{
          background: "#fff",
          borderRadius: "14px", // ← was "0 0 14px 14px"
          boxShadow: "0 24px 64px rgba(0,0,0,0.35)",
          display: "flex",
          flexDirection: "column",
          width: "min(1100px, 96vw)",
          height: "min(94vh, 1000px)",
          overflow: "hidden", // this clips the toolbar corners correctly
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Toolbar  */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: "12px",
            padding: "20px 20px 16px",
            background: "linear-gradient(135deg, #1e3a5f 0%, #0a1628 100%)",
            borderRadius: 0, // ← remove the "14px 14px 0 0"
            color: "#fff",
            flexShrink: 0,
          }}
        >
          {/* Icon badge */}
          <div
            style={{
              width: "38px",
              height: "38px",
              background: "rgba(255,255,255,0.15)",
              borderRadius: "9px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <svg
              width="20"
              height="20"
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
              <polyline points="10 9 9 9 8 9" />
            </svg>
          </div>

          {/* Title + subtitle */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                margin: "0 0 3px",
                fontSize: "17px",
                fontWeight: 700,
                color: "#fff",
                lineHeight: 1.3,
              }}
            >
              PDF Preview
            </div>
            <div
              style={{
                margin: 0,
                fontSize: "12.5px",
                color: "rgba(255,255,255,0.72)",
                lineHeight: 1.4,
              }}
            >
              Review before downloading
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <button
              onClick={onDownload}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "9px 20px",
                background: "rgba(255,255,255,0.15)",
                color: "#fff",
                border: "1.5px solid rgba(255,255,255,0.3)",
                borderRadius: "8px",
                fontSize: "13.5px",
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
                transition: "background 0.15s",
                whiteSpace: "nowrap",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = "rgba(255,255,255,0.25)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = "rgba(255,255,255,0.15)")
              }
            >
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
              Download
            </button>

            <button
              onClick={onClose}
              style={{
                width: "30px",
                height: "30px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "rgba(255,255,255,0.12)",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                color: "rgba(255,255,255,0.85)",
                fontSize: "14px",
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = "rgba(255,255,255,0.22)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = "rgba(255,255,255,0.12)")
              }
              title="Close preview"
            >
              ✕
            </button>
          </div>
        </div>

        {/* PDF iframe */}
        <div
          style={{
            flex: 1,
            background: "#e9ecef",
            overflow: "auto", // ← was "hidden"
            position: "relative",
          }}
        >
          <iframe
            src={`${blobUrl}#toolbar=0`}
            title="PDF Preview"
            style={{
              width: "100%", // ← was "calc(100% + 17px)"
              height: "100%", // ← was "calc(100% + 40px)"
              border: "none",
              display: "block",
            }}
          />
        </div>
      </div>

      {/* Dismiss hint */}
      <p
        style={{
          marginTop: "14px",
          color: "rgba(255,255,255,0.55)",
          fontSize: "12px",
        }}
      >
        Click outside or press Esc to close
      </p>
    </div>,
    document.body,
  );
};

export default PdfPreviewModal;
