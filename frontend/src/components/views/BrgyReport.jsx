import React, { useState, useEffect } from "react";
import "./BrgyReport.css";
import LoadingModal from "../modals/LoadingModal";

const API_URL = `${import.meta.env.VITE_API_URL}/blotters`;
const ITEMS_PER_PAGE = 15;

const formatDate = (d) => {
  if (!d) return "N/A";
  return new Date(d).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const getStatusClass = (status) => {
  if (status === "Pending") return "br-status-pending";
  if (status === "Under Investigation") return "br-status-investigating";
  if (status === "Solved" || status === "Cleared") return "br-status-solved";
  return "br-status-pending";
};

function BrgyReport() {
  const [form, setForm] = useState({
    incident_type: "",
    date_time_commission: "",
    date_time_reported: "",
    place_barangay: "",
    place_street: "",
    narrative: "",
    victim_first_name: "",
    victim_last_name: "",
    victim_gender: "Male",
    victim_contact: "",
  });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [reports, setReports] = useState([]);
  const [loadingReports, setLoadingReports] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [barangayName, setBarangayName] = useState("Loading...");

  useEffect(() => {
    fetchMyReports();
    fetch(`${import.meta.env.VITE_API_URL}/users/profile`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data?.user?.barangay_code) {
          const code = data.user.barangay_code;
          if (!/^\d+$/.test(code)) {
            setForm((prev) => ({ ...prev, place_barangay: code }));
            setBarangayName(code);
            return null;
          }
          return fetch(`https://psgc.gitlab.io/api/barangays/${code}.json`);
        }
      })
      .then((res) => res?.json())
      .then((brgyData) => {
        if (brgyData?.name) {
          setBarangayName(brgyData.name);
          setForm((prev) => ({ ...prev, place_barangay: brgyData.name }));
        }
      })
      .catch(() => setBarangayName("Your assigned barangay"));
  }, []);

  const fetchMyReports = async () => {
    try {
      setLoadingReports(true);
      const res = await fetch(`${API_URL}/brgy-reports/mine`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      const data = await res.json();
      if (data.success) setReports(data.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingReports(false);
    }
  };

  const update = (field, value) => {
    setForm((p) => ({ ...p, [field]: value }));
    if (errors[field])
      setErrors((p) => {
        const e = { ...p };
        delete e[field];
        return e;
      });
  };

  const validate = () => {
    const e = {};
    if (!form.incident_type) e.incident_type = "Required";
    if (!form.date_time_commission) {
      e.date_time_commission = "Required";
    } else if (new Date(form.date_time_commission) > new Date()) {
      e.date_time_commission = "Cannot be in the future";
    }
    if (!form.date_time_reported) {
      e.date_time_reported = "Required";
    } else if (new Date(form.date_time_reported) > new Date()) {
      e.date_time_reported = "Cannot be in the future";
    } else if (
      form.date_time_commission &&
      new Date(form.date_time_commission) > new Date(form.date_time_reported)
    ) {
      e.date_time_reported = "Cannot be before incident date";
    }
    if (!form.place_barangay) e.place_barangay = "Required";
    if (!form.place_street) e.place_street = "Required";
    if (!form.narrative || form.narrative.trim().length < 20)
      e.narrative = "At least 20 characters";
    if (!form.victim_first_name) e.victim_first_name = "Required";
    if (!form.victim_last_name) e.victim_last_name = "Required";
    return e;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      setTimeout(() => {
        const firstError = document.querySelector(".br-input.error");
        if (firstError) {
          firstError.scrollIntoView({ behavior: "smooth", block: "center" });
          firstError.focus();
        }
      }, 100);
      return;
    }
    try {
      setSubmitting(true);
      const res = await fetch(`${API_URL}/brgy-report`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMsg(
          `Report submitted successfully! Reference No.: ${data.data.blotter_entry_number}`,
        );
        setForm({
          incident_type: "",
          date_time_commission: "",
          date_time_reported: "",
          place_barangay: form.place_barangay,
          place_street: "",
          narrative: "",
          victim_first_name: "",
          victim_last_name: "",
          victim_gender: "Male",
          victim_contact: "",
        });
        fetchMyReports();
        setTimeout(() => setSuccessMsg(""), 7000);
      } else {
        const msg = data.errors ? data.errors.join("\n") : data.message;
        alert("Submission failed:\n" + msg);
      }
    } catch (err) {
      alert("Failed to submit. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const totalPages = Math.ceil(reports.length / ITEMS_PER_PAGE);
  const paginated = reports.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE,
  );

  return (
    <div className="br-wrapper">
      <LoadingModal isOpen={submitting} message="Submitting report..." />

      {/* ── PAGE HEADER ── */}
      <div className="br-page-header">
        <div className="br-page-header-icon">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
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
        <div>
          <h1 className="br-page-title">Submit Incident Report</h1>
          <p className="br-page-subtitle">
            Report an incident for PNP Bacoor review
          </p>
        </div>
        <div className="br-brgy-pill">
          <div className="br-brgy-pill-dot" />
          {barangayName}
        </div>
      </div>

      {/* ── SUCCESS ── */}
      {successMsg && (
        <div className="br-success">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
          {successMsg}
        </div>
      )}

      {/* ── ALERT ── */}
      <div className="br-alert">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#c1272d"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <span>
          This report will be forwarded directly to <strong>PNP Bacoor</strong>{" "}
          for review and action. Please ensure all information is accurate and
          truthful. Filing a false report is punishable by law.
        </span>
      </div>

      <form onSubmit={handleSubmit} noValidate>
        {/* ── INCIDENT DETAILS CARD ── */}
        <div className="br-card">
          <div className="br-card-header">
            <div className="br-card-header-icon">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <h2 className="br-card-title">Incident Details</h2>
          </div>
          <div className="br-card-body">
            <div className="br-form-grid">
              <div className="br-form-group">
                <label className="br-label">
                  Crime Type <span>*</span>
                </label>
                <select
                  className={`br-input ${errors.incident_type ? "error" : ""}`}
                  value={form.incident_type}
                  onChange={(e) => update("incident_type", e.target.value)}
                >
                  <option value="">Select Crime Type</option>
                  <option>Murder</option>
                  <option>Homicide</option>
                  <option>Physical Injury</option>
                  <option>Rape</option>
                  <option>Robbery</option>
                  <option>Theft</option>
                  <option value="Carnapping - MC">Carnapping - MC</option>
                  <option value="Carnapping - MV">Carnapping - MV</option>
                  <option>Special Complex Crime</option>
                </select>
                {errors.incident_type && (
                  <span className="br-error">{errors.incident_type}</span>
                )}
              </div>

              <div className="br-form-group">
                <label className="br-label">
                  Barangay <span>*</span>
                </label>
                <div className="br-input-locked">
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  {barangayName}
                </div>
              </div>

              <div className="br-form-group">
                <label className="br-label">
                  Date & Time of Incident <span>*</span>
                </label>
                <input
                  type="datetime-local"
                  className={`br-input ${errors.date_time_commission ? "error" : ""}`}
                  value={form.date_time_commission}
                  max={new Date(new Date().getTime() + 24 * 60 * 60 * 1000)
                    .toISOString()
                    .slice(0, 16)}
                  onKeyDown={(e) => e.preventDefault()}
                  onChange={(e) =>
                    update("date_time_commission", e.target.value)
                  }
                />
                {errors.date_time_commission && (
                  <span className="br-error">
                    {errors.date_time_commission}
                  </span>
                )}
              </div>

              <div className="br-form-group">
                <label className="br-label">
                  Date & Time Reported <span>*</span>
                </label>
                <input
                  type="datetime-local"
                  className={`br-input ${errors.date_time_reported ? "error" : ""}`}
                  value={form.date_time_reported}
                  max={new Date(new Date().getTime() + 24 * 60 * 60 * 1000)
                    .toISOString()
                    .slice(0, 16)}
                  onKeyDown={(e) => e.preventDefault()}
                  onChange={(e) => update("date_time_reported", e.target.value)}
                />
                {errors.date_time_reported && (
                  <span className="br-error">{errors.date_time_reported}</span>
                )}
              </div>

              <div
                className={`br-form-group ${""}`}
                style={{ gridColumn: "span 2" }}
              >
                <label className="br-label">
                  Street / Location <span>*</span>
                </label>
                <input
                  type="text"
                  className={`br-input ${errors.place_street ? "error" : ""}`}
                  value={form.place_street}
                  placeholder="e.g. Rizal St., near corner Mabini"
                  onChange={(e) =>
                    update(
                      "place_street",
                      e.target.value.replace(/[^A-Za-z0-9ÑñĆ.,\s-]/g, ""),
                    )
                  }
                />
                {errors.place_street && (
                  <span className="br-error">{errors.place_street}</span>
                )}
              </div>

              <div className="br-form-group" style={{ gridColumn: "span 2" }}>
                <label className="br-label">
                  Narrative <span>*</span>
                </label>
                <textarea
                  className={`br-input ${errors.narrative ? "error" : ""}`}
                  style={{ resize: "vertical", minHeight: "120px" }}
                  rows={5}
                  value={form.narrative}
                  maxLength={3000}
                  placeholder="Describe what happened in detail — include time, location, persons involved, and sequence of events (minimum 20 characters)"
                  onChange={(e) => update("narrative", e.target.value)}
                />
                {errors.narrative && (
                  <span className="br-error">{errors.narrative}</span>
                )}
                <span
                  style={{
                    fontSize: "11px",
                    color: "#9ca3af",
                    marginTop: "2px",
                  }}
                >
                  {form.narrative.length}/3000 characters
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── VICTIM INFO CARD ── */}
        <div className="br-card">
          <div className="br-card-header">
            <div className="br-card-header-icon">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </div>
            <h2 className="br-card-title">Victim Information</h2>
          </div>
          <div className="br-card-body">
            <div className="br-form-grid">
              <div className="br-form-group">
                <label className="br-label">
                  First Name <span>*</span>
                </label>
                <input
                  type="text"
                  className={`br-input ${errors.victim_first_name ? "error" : ""}`}
                  value={form.victim_first_name}
                  placeholder="First Name"
                  maxLength={50}
                  onChange={(e) =>
                    update(
                      "victim_first_name",
                      e.target.value.replace(/[^A-Za-zÑñ\s'-]/g, ""),
                    )
                  }
                />
                {errors.victim_first_name && (
                  <span className="br-error">{errors.victim_first_name}</span>
                )}
              </div>

              <div className="br-form-group">
                <label className="br-label">
                  Last Name <span>*</span>
                </label>
                <input
                  type="text"
                  className={`br-input ${errors.victim_last_name ? "error" : ""}`}
                  value={form.victim_last_name}
                  placeholder="Last Name"
                  maxLength={50}
                  onChange={(e) =>
                    update(
                      "victim_last_name",
                      e.target.value.replace(/[^A-Za-zÑñ\s'-]/g, ""),
                    )
                  }
                />
                {errors.victim_last_name && (
                  <span className="br-error">{errors.victim_last_name}</span>
                )}
              </div>

              <div className="br-form-group">
                <label className="br-label">Gender</label>
                <div className="br-gender-row">
                  {["Male", "Female"].map((g) => (
                    <button
                      key={g}
                      type="button"
                      className={`br-gender-btn ${form.victim_gender === g ? "active" : ""}`}
                      onClick={() => update("victim_gender", g)}
                    >
                      <svg
                        width="13"
                        height="13"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        {g === "Male" ? (
                          <>
                            <circle cx="10" cy="7" r="4" />
                            <path d="M21 2l-5.5 5.5" />
                            <path d="M15 2h6v6" />
                            <path d="M10 11v10" />
                            <path d="M7 19h6" />
                          </>
                        ) : (
                          <>
                            <circle cx="12" cy="7" r="4" />
                            <path d="M12 11v10" />
                            <path d="M9 18h6" />
                          </>
                        )}
                      </svg>
                      {g}
                    </button>
                  ))}
                </div>
              </div>

              <div className="br-form-group">
                <label className="br-label">Contact Number</label>
                <input
                  type="text"
                  className="br-input"
                  value={form.victim_contact}
                  placeholder="09XXXXXXXXX"
                  maxLength={11}
                  onChange={(e) =>
                    update("victim_contact", e.target.value.replace(/\D/g, ""))
                  }
                />
              </div>
            </div>

            <button
              type="submit"
              className="br-submit-btn"
              disabled={submitting}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
              {submitting ? "Submitting..." : "Submit Incident Report"}
            </button>
          </div>
        </div>
      </form>

      {/* ── MY SUBMITTED REPORTS ── */}
      <div className="br-card">
        <div className="br-reports-header">
          <div className="br-reports-header-icon">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
          </div>
          <h2 className="br-card-title">My Submitted Reports</h2>
          <span className="br-reports-count">{reports.length} total</span>
        </div>

        {loadingReports ? (
          <div className="br-loading">Loading submitted reports...</div>
        ) : reports.length === 0 ? (
          <div className="br-empty">
            <div className="br-empty-icon">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#9ca3af"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="8" y1="13" x2="16" y2="13" />
                <line x1="8" y1="17" x2="16" y2="17" />
              </svg>
            </div>
            <div className="br-empty-title">No reports submitted yet</div>
            <div className="br-empty-sub">
              Your submitted incident reports will appear here
            </div>
          </div>
        ) : (
          <>
            <table className="br-table">
              <thead>
                <tr>
                  <th>Reference No.</th>
                  <th>Crime Type</th>
                  <th>Street / Location</th>
                  <th>Date Reported</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((r) => (
                  <tr key={r.blotter_id}>
                    <td>
                      <span className="br-ref-num">
                        {r.blotter_entry_number}
                      </span>
                    </td>
                    <td style={{ fontWeight: 500, color: "#374151" }}>
                      {r.incident_type}
                    </td>
                    <td style={{ color: "#6b7280" }}>{r.place_street}</td>
                    <td style={{ color: "#6b7280" }}>
                      {formatDate(r.date_time_reported)}
                    </td>
                    <td>
                      <span
                        className={`br-status-badge ${getStatusClass(r.status)}`}
                      >
                        <span className="br-status-dot" />
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {totalPages > 1 && (
              <div className="br-pagination">
                <span className="br-pagination-info">
                  Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1}–
                  {Math.min(currentPage * ITEMS_PER_PAGE, reports.length)} of{" "}
                  {reports.length}
                </span>
                <div className="br-pagination-controls">
                  <button
                    className="br-pagination-btn"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage((p) => p - 1)}
                  >
                    Previous
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                    (p) => (
                      <button
                        key={p}
                        className={`br-pagination-page ${currentPage === p ? "active" : ""}`}
                        onClick={() => setCurrentPage(p)}
                      >
                        {p}
                      </button>
                    ),
                  )}
                  <button
                    className="br-pagination-btn"
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage((p) => p + 1)}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default BrgyReport;
