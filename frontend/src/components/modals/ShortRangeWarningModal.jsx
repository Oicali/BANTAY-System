// frontend/src/components/modals/ShortRangeWarningModal.jsx

import React from "react";

const ShortRangeWarningModal = ({ dayCount, onConfirm, onCancel }) => (
  <div className="cd-ai-error-overlay">
    <div className="cd-ai-error-modal">
      <div className="cd-ai-error-icon" style={{ color: "#f59e0b" }}>
        <svg
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      </div>

      <h3>Short Date Range</h3>

      <p>
        Your selected range is only <strong>{dayCount} days</strong>.
        <br />
        <br />
        Short ranges may result in low forecast confidence for some crime types.
        A minimum of <strong>180 days</strong> is recommended for reliable
        trend analysis.
      </p>

      <div
        style={{
          display: "flex",
          gap: "10px",
          justifyContent: "center",
          marginTop: "4px",
        }}
      >
        <button
          onClick={onCancel}
          style={{
            padding: "8px 20px",
            borderRadius: "6px",
            border: "1px solid #d1d5db",
            background: "#fff",
            color: "#374151",
            cursor: "pointer",
            fontWeight: 500,
          }}
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          style={{
            padding: "8px 20px",
            borderRadius: "6px",
            border: "none",
            background: "#1e3a5f",
            color: "#fff",
            cursor: "pointer",
            fontWeight: 500,
          }}
        >
          Continue Anyway
        </button>
      </div>
    </div>
  </div>
);

export default ShortRangeWarningModal;