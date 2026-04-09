import React, { useState, useRef } from "react";
import "./ImportBlotterModal.css";
import ReactDOM from "react-dom";

function ImportBlotterModal({ onClose, onSuccess }) {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const fileRef = useRef();

  const handleFile = (f) => {
    if (!f) return;
    if (!f.name.match(/\.(xlsx|csv)$/i)) {
      alert("Only .xlsx or .csv files allowed");
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
    setProgress({ current: 0, total: 0 });

    let totalRows = 0;
    try {
      const XLSX = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
      totalRows = rows.length;
    } catch (_) {
      totalRows = 0;
    }

    setProgress({ current: 0, total: totalRows });
    setLoading(true);
    let simCount = 0;
    const interval =
      totalRows > 0
        ? setInterval(
            () => {
              simCount = Math.min(simCount + 1, totalRows - 1);
              setProgress((p) => ({ ...p, current: simCount }));
            },
            Math.max(30, 3000 / totalRows),
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

      await new Promise((resolve) => {
        let cur = simCount;
        const remaining = totalRows - cur;
        if (remaining <= 0) {
          setTimeout(resolve, 300);
          return;
        }
        const stepDelay = Math.max(10, Math.floor(500 / remaining));
        const fill = setInterval(() => {
          cur++;
          setProgress({ current: cur, total: totalRows });
          if (cur >= totalRows) {
            clearInterval(fill);
            setTimeout(resolve, 150);
          }
        }, stepDelay);
      });

      if (data.success) {
        setResult(data.summary);
        onSuccess && onSuccess();
      } else {
        alert(data.message || "Import failed");
      }
    } catch (err) {
      if (interval) clearInterval(interval);
      alert("Import failed: " + err.message);
    }
    setLoading(false);
  };

  const downloadErrors = () => {
    if (!result?.errors?.length) return;
    const csv = ["Row,Field,Value"]
      .concat(result.errors.map((e) => `${e.row},${e.field},"${e.value}"`))
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
    <div className="im-overlay">
      <div className="im-modal">
        {/* PROGRESS OVERLAY — shown when loading */}
        {loading && (
          <div className="im-progress-overlay">
            <div className="im-progress-box">
              <div className="im-progress-title">Importing Records...</div>
              <div className="im-progress-sub">
                {progress.total > 0
                  ? `${progress.current} / ${progress.total} records processed`
                  : "Reading file..."}
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

        {/* NORMAL MODAL — hidden when loading */}
        {!loading && (
          <>
            <div className="im-header">
              <div>
                <h2 className="im-title">Import CIRAS Data</h2>
                <p className="im-subtitle">
                  Upload .xlsx or .csv exported from CIRAS
                </p>
              </div>
              <span className="im-close" onClick={onClose}>
                &times;
              </span>
            </div>

            <div className="im-body">
              {!result ? (
                <>
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
                      accept=".xlsx,.csv"
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
                          or click to browse — .xlsx, .csv only
                        </p>
                      </>
                    )}
                  </div>
                </>
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
                            <th>Value</th>
                          </tr>
                        </thead>
                        <tbody>
                          {result.errors.slice(0, 10).map((e, i) => (
                            <tr key={i}>
                              <td>{e.row}</td>
                              <td>{e.field}</td>
                              <td>{e.value}</td>
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
    </div>,
    document.body,
  );
}

export default ImportBlotterModal;
