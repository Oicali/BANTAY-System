import React, { useState, useRef } from "react";
import "./ImportBlotterModal.css";
import ReactDOM from "react-dom";

// ── Toast types ──────────────────────────────────────────────
const TOAST_TYPES = {
  success: { bg: "#166534", border: "#16a34a", icon: "✅" },
  warn: { bg: "#92400e", border: "#f59e0b", icon: "⚠️" },
  error: { bg: "#7f1d1d", border: "#c1272d", icon: "❌" },
  info: { bg: "#1e3a5f", border: "#3b82f6", icon: "ℹ️" },
};

function Toast({ toasts }) {
  return ReactDOM.createPortal(
    <div
      style={{
        position: "fixed",
        bottom: "32px",
        left: "50%",
        transform: "translateX(-50%)",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        zIndex: 99999,
        alignItems: "center",
        minWidth: "340px",
        maxWidth: "600px",
      }}
    >
      {toasts.map((t) => {
        const style = TOAST_TYPES[t.type] || TOAST_TYPES.info;
        return (
          <div
            key={t.id}
            style={{
              background: style.bg,
              color: "white",
              padding: "14px 20px",
              borderRadius: "10px",
              fontSize: "13px",
              fontWeight: 600,
              boxShadow: "0 4px 24px rgba(0,0,0,0.35)",
              borderLeft: `5px solid ${style.border}`,
              width: "100%",
              lineHeight: "1.6",
              animation: "fadeInUp 0.25s ease",
            }}
          >
            <div
              style={{
                fontSize: "14px",
                marginBottom: t.lines?.length ? "6px" : 0,
              }}
            >
              {style.icon} {t.title}
            </div>
            {t.lines?.map((l, i) => (
              <div
                key={i}
                style={{ fontWeight: 400, fontSize: "12px", opacity: 0.92 }}
              >
                {l}
              </div>
            ))}
          </div>
        );
      })}
    </div>,
    document.body,
  );
}

// ── Helpers ──────────────────────────────────────────────────
let _toastId = 0;
function useToasts() {
  const [toasts, setToasts] = useState([]);

  const push = (type, title, lines = [], duration = 6000) => {
    const id = ++_toastId;
    setToasts((prev) => [...prev, { id, type, title, lines }]);
    setTimeout(
      () => setToasts((prev) => prev.filter((t) => t.id !== id)),
      duration,
    );
  };

  return { toasts, push };
}

// ── Group errors into summary lines ─────────────────────────
function summarizeErrors(errors = [], duplicates = []) {
  const lines = [];

  // group by message category
  const missingId = errors.filter(
    (e) => e.field === "BLOTTER_ENTRY_NUMBER" && e.message?.includes("Missing"),
  );
  const dupInFile = errors.filter(
    (e) =>
      e.field === "BLOTTER_ENTRY_NUMBER" && e.message?.includes("Duplicate"),
  );
  const badCrime = errors.filter((e) => e.field === "INCIDENT_TYPE");
  const badBarangay = errors.filter(
    (e) =>
      e.field === "PLACE_BARANGAY" && e.message?.includes("not a recognized"),
  );
  const missingBrgy = errors.filter(
    (e) => e.field === "PLACE_BARANGAY" && e.message?.includes("Missing"),
  );
  const badDate = errors.filter((e) => e.field === "DATE_COMMITTED");
  const other = errors.filter(
    (e) =>
      ![
        "BLOTTER_ENTRY_NUMBER",
        "INCIDENT_TYPE",
        "PLACE_BARANGAY",
        "DATE_COMMITTED",
      ].includes(e.field),
  );

  if (duplicates.length > 0) {
    const ids = duplicates
      .slice(0, 3)
      .map((d) => d.blotter_entry_number)
      .join(", ");
    const more = duplicates.length > 3 ? ` +${duplicates.length - 3} more` : "";
    lines.push(`• ${duplicates.length} already in DB (skipped): ${ids}${more}`);
  }
  if (dupInFile.length > 0) {
    const rows = dupInFile
      .slice(0, 3)
      .map((e) => `Row ${e.row}`)
      .join(", ");
    const more = dupInFile.length > 3 ? ` +${dupInFile.length - 3} more` : "";
    lines.push(
      `• ${dupInFile.length} duplicate ID in file (skipped): ${rows}${more}`,
    );
  }
  if (missingId.length > 0) {
    lines.push(`• ${missingId.length} row(s) missing Report ID — skipped`);
  }
  if (badCrime.length > 0) {
    const rows = badCrime
      .slice(0, 3)
      .map((e) => `Row ${e.row}`)
      .join(", ");
    const more = badCrime.length > 3 ? ` +${badCrime.length - 3} more` : "";
    lines.push(
      `• ${badCrime.length} invalid/missing Crime Type — rejected: ${rows}${more}`,
    );
  }
  if (badBarangay.length > 0) {
    const rows = badBarangay
      .slice(0, 3)
      .map((e) => `Row ${e.row}`)
      .join(", ");
    const more =
      badBarangay.length > 3 ? ` +${badBarangay.length - 3} more` : "";
    lines.push(
      `• ${badBarangay.length} unrecognized Barangay — rejected: ${rows}${more}`,
    );
  }
  if (missingBrgy.length > 0) {
    lines.push(`• ${missingBrgy.length} row(s) missing Barangay — skipped`);
  }
  if (badDate.length > 0) {
    lines.push(
      `• ${badDate.length} row(s) invalid/missing Date Committed — skipped`,
    );
  }
  if (other.length > 0) {
    lines.push(`• ${other.length} other field error(s) — skipped`);
  }
  return lines;
}

// ── Main component ───────────────────────────────────────────
function ImportBlotterModal({ onClose, onSuccess }) {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const fileRef = useRef();
  const { toasts, push } = useToasts();

  const handleFile = (f) => {
    if (!f) return;
    if (!f.name.match(/\.xlsx$/i)) {
      push("error", "Wrong file type — only .xlsx allowed", [
        `• You uploaded: ${f.name}`,
        "• Please export from CIRAS as .xlsx and try again.",
      ]);
      return;
    }
    setFile(f);
    setResult(null);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    handleFile(e.dataTransfer.files[0]);
  };

  const handleSubmit = async () => {
    if (!file) return;

    let totalRows = 0;
    try {
      const XLSX = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
      totalRows = rows.length;

      // Empty file check
      if (rows.length === 0) {
        push("info", "No records found to import", [
          "• The file contains headers only with no data rows.",
          "• Please populate the template and try again.",
        ]);
        return;
      }

      // Wrong headers check
      const firstRow = rows[0];
      const hasRequiredColumns =
        "BLOTTER_ENTRY_NUMBER" in firstRow &&
        "DATE_COMMITTED" in firstRow &&
        "PLACE_BARANGAY" in firstRow &&
        "INCIDENT_TYPE" in firstRow;

      if (!hasRequiredColumns) {
        push("error", "Invalid template — wrong or missing column headers", [
          "• Required columns not found: BLOTTER_ENTRY_NUMBER, DATE_COMMITTED, PLACE_BARANGAY, INCIDENT_TYPE",
          "• Please use the official CIRAS import file.",
        ]);
        return;
      }
    } catch (_) {
      totalRows = 0;
    }

    setProgress({ current: 0, total: totalRows });
    setLoading(true);

    let simCount = 0;
    const cap = Math.floor(totalRows * 0.9);
    const interval =
      totalRows > 0
        ? setInterval(
            () => {
              if (simCount < cap) {
                simCount++;
                setProgress({ current: simCount, total: totalRows });
              }
            },
            Math.max(20, Math.floor(5000 / totalRows)),
          )
        : null;

    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/blotters/import`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
          body: formData,
        },
      );
      const data = await res.json();
      if (interval) clearInterval(interval);

      setProgress({ current: totalRows, total: totalRows });
      await new Promise((r) => setTimeout(r, 400));

      if (data.success) {
        const s = data.summary;
        setResult(s);
        onSuccess && onSuccess();

        const totalSkipped =
          (s.skipped_duplicates || 0) + (s.skipped_errors || 0);
        const errLines = summarizeErrors(s.errors || [], s.duplicates || []);

        if (s.inserted > 0 && totalSkipped === 0) {
          // Pure success
          push(
            "success",
            `Imported ${s.inserted} record${s.inserted !== 1 ? "s" : ""} successfully`,
            [
              `• All ${s.inserted} records from the file were saved to the system.`,
            ],
            7000,
          );
        } else if (s.inserted > 0 && totalSkipped > 0) {
          // Partial success
          push(
            "warn",
            `Imported ${s.inserted} record${s.inserted !== 1 ? "s" : ""} — ${totalSkipped} skipped/rejected`,
            errLines,
            10000,
          );
        } else if (s.inserted === 0 && totalSkipped > 0) {
          // Nothing imported, all rejected
          push(
            "error",
            `0 records imported — ${totalSkipped} skipped/rejected`,
            errLines,
            10000,
          );
        } else {
          push("info", "Import complete — no records were inserted.", [], 5000);
        }
      } else {
        // Server returned success: false
        if (
          data.message?.toLowerCase().includes("empty") ||
          data.message?.toLowerCase().includes("no records")
        ) {
          push(
            "info",
            "No records found to import",
            ["• The file contains headers only with no data rows."],
            6000,
          );
        } else if (
          data.message?.toLowerCase().includes("invalid file") ||
          data.message?.toLowerCase().includes("template")
        ) {
          push(
            "error",
            "Invalid template — wrong or missing column headers",
            [
              "• Required columns not found.",
              "• Please use the official CIRAS import file.",
            ],
            7000,
          );
        } else {
          push(
            "error",
            "Import failed",
            [`• ${data.message || "Unknown server error. Please try again."}`],
            7000,
          );
        }
      }
    } catch (err) {
      if (interval) clearInterval(interval);
      push(
        "error",
        "Import failed — connection error",
        [`• ${err.message}`, "• Check your connection and try again."],
        7000,
      );
    }

    setLoading(false);
  };

  const downloadErrors = () => {
    if (!result?.errors?.length) return;
    const csv = ["Row,Field,Message"]
      .concat(
        result.errors.map(
          (e) => `${e.row},${e.field},"${e.message || e.value || ""}"`,
        ),
      )
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "import_errors.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return ReactDOM.createPortal(
    <>
      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div className="im-overlay">
        <div className="im-modal">
          {/* PROGRESS OVERLAY */}
          {loading && (
            <div className="im-progress-overlay">
              <div className="im-progress-box">
                <div className="im-progress-title">Importing Records...</div>
                <div className="im-progress-sub">
                  {progress.total > 0
                    ? `${progress.current} / ${progress.total} records processed`
                    : "Uploading and processing, please wait..."}
                </div>
                <div className="im-progress-bar-bg">
                  <div
                    className="im-progress-bar-fill"
                    style={{
                      width:
                        progress.total > 0
                          ? `${Math.round((progress.current / progress.total) * 100)}%`
                          : "10%",
                    }}
                  />
                </div>
                <div className="im-progress-pct">
                  {progress.total > 0
                    ? `${Math.round((progress.current / progress.total) * 100)}%`
                    : ""}
                </div>
              </div>
            </div>
          )}

          {/* MAIN MODAL */}
          {!loading && (
            <>
              <div className="im-header">
                <div>
                  <h2 className="im-title">Import CIRAS Data</h2>
                  <p className="im-subtitle">
                    Upload .xlsx exported from CIRAS
                  </p>
                </div>
                <span className="im-close" onClick={onClose}>
                  &times;
                </span>
              </div>

              <div className="im-body">
                {!result ? (
                  <div
                    className={`im-dropzone ${dragOver ? "dragover" : ""} ${file ? "has-file" : ""}`}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOver(true);
                    }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleDrop}
                    onClick={() => fileRef.current.click()}
                  >
                    <input
                      ref={fileRef}
                      type="file"
                      accept=".xlsx"
                      style={{ display: "none" }}
                      onChange={(e) => handleFile(e.target.files[0])}
                    />
                    {file ? (
                      <>
                        <div className="im-file-icon">
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="36"
                            height="36"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="#16a34a"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                            <line x1="12" y1="18" x2="12" y2="12" />
                            <line x1="9" y1="15" x2="15" y2="15" />
                          </svg>
                        </div>
                        <p className="im-file-name">{file.name}</p>
                        <p className="im-file-hint">Click to change file</p>
                      </>
                    ) : (
                      <>
                        <div className="im-file-icon">
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="36"
                            height="36"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="#6b7280"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="17 8 12 3 7 8" />
                            <line x1="12" y1="3" x2="12" y2="15" />
                          </svg>
                        </div>
                        <p className="im-drop-text">
                          Drag & drop your file here
                        </p>
                        <p className="im-file-hint">
                          or click to browse — .xlsx only
                        </p>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="im-results">
                    <div className="im-result-row">
                      <div className="im-result-card success">
                        <span className="im-result-num">{result.inserted}</span>
                        <span className="im-result-label">Imported</span>
                      </div>
                      <div className="im-result-card warn">
                        <span className="im-result-num">
                          {result.skipped_duplicates}
                        </span>
                        <span className="im-result-label">
                          Duplicates Skipped
                        </span>
                      </div>
                      <div className="im-result-card error">
                        <span className="im-result-num">
                          {result.skipped_errors}
                        </span>
                        <span className="im-result-label">Errors</span>
                      </div>
                    </div>

                    {result.errors?.length > 0 && (
                      <div className="im-error-table-wrap">
                        <table className="im-error-table">
                          <thead>
                            <tr>
                              <th>Row</th>
                              <th>Field</th>
                              <th>Reason</th>
                            </tr>
                          </thead>
                          <tbody>
                            {result.errors.slice(0, 10).map((e, i) => (
                              <tr key={i}>
                                <td>{e.row}</td>
                                <td>{e.field}</td>
                                <td>{e.message || e.value}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {result.errors.length > 10 && (
                          <p className="im-more-errors">
                            +{result.errors.length - 10} more — download CSV to
                            see all
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="im-footer">
                {!result ? (
                  <>
                    <button
                      className="im-btn-secondary"
                      onClick={onClose}
                      disabled={loading}
                    >
                      Cancel
                    </button>
                    <button
                      className="im-btn-primary"
                      onClick={handleSubmit}
                      disabled={!file || loading}
                    >
                      Upload & Import
                    </button>
                  </>
                ) : (
                  <>
                    {result.errors?.length > 0 && (
                      <button
                        className="im-btn-secondary"
                        onClick={downloadErrors}
                      >
                        Download Error Report
                      </button>
                    )}
                    <button className="im-btn-primary" onClick={onClose}>
                      Done
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <Toast toasts={toasts} />
    </>,
    document.body,
  );
}

export default ImportBlotterModal;
