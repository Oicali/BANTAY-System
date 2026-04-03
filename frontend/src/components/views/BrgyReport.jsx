import React, { useState, useEffect } from "react";
import LoadingModal from "../modals/LoadingModal";
const autofillFix = `
  input:-webkit-autofill,
  input:-webkit-autofill:hover,
  input:-webkit-autofill:focus,
  input:-webkit-autofill:active {
    -webkit-box-shadow: 0 0 0 30px white inset !important;
    -webkit-text-fill-color: #111827 !important;
    caret-color: #111827;
  }
`;
const API_URL = `${import.meta.env.VITE_API_URL}/blotters`;
const ITEMS_PER_PAGE = 15;

const formatDate = (d) => {
  if (!d) return "N/A";
  const date = new Date(d);
  return date.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const statusColors = {
  Pending: { bg: "#fef3c7", color: "#92400e" },
  "Under Investigation": { bg: "#dbeafe", color: "#1e40af" },
  Solved: { bg: "#d1fae5", color: "#065f46" },
  Cleared: { bg: "#d1fae5", color: "#065f46" },
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
          // If it's already a name string (not a numeric PSGC code), use directly
          if (!/^\d+$/.test(code)) {
            setForm((prev) => ({ ...prev, place_barangay: code }));
            setBarangayName(code);
            return null;
          }
          // Otherwise it's a PSGC number — resolve to name
          return fetch(`https://psgc.gitlab.io/api/barangays/${code}.json`);
        }
      })
      .then((res) => res?.json())
      .then((brgyData) => {
        if (brgyData?.name) {
          setBarangayName(brgyData.name);
          // Also store resolved name (not numeric code) in form
          setForm((prev) => ({ ...prev, place_barangay: brgyData.name }));
        }
      })
      .catch(() => {
        setBarangayName("Your assigned barangay");
      });
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
          `Report submitted! Reference: ${data.data.blotter_entry_number}`,
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
        setTimeout(() => setSuccessMsg(""), 6000);
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

  const inputStyle = (field) => ({
    width: "100%",
    padding: "10px 12px",
    borderRadius: "6px",
    fontSize: "14px",
    border: `1px solid ${errors[field] ? "#ef4444" : "#d1d5db"}`,
    outline: "none",
    boxSizing: "border-box",
    background: "white",
    color: "#111827",
    colorScheme: "light",
  });

  const labelStyle = {
    display: "block",
    fontSize: "13px",
    fontWeight: 600,
    color: "#374151",
    marginBottom: "5px",
  };

  const errStyle = {
    fontSize: "12px",
    color: "#ef4444",
    marginTop: "3px",
    display: "block",
  };

  return (
    <div style={{ padding: "28px 32px", maxWidth: "900px", margin: "0 auto" }}>
      <LoadingModal isOpen={submitting} message="Submitting report..." />
      <style>{autofillFix}</style>
      {/* Header */}
      <div style={{ marginBottom: "28px" }}>
        <h1
          style={{
            fontSize: "22px",
            fontWeight: 700,
            color: "#1e3a5f",
            margin: 0,
          }}
        >
          Submit Incident Report
        </h1>
        <p style={{ color: "#6b7280", fontSize: "14px", marginTop: "4px" }}>
          Report an incident in your barangay for police review
        </p>
      </div>

      {/* Success Banner */}
      {successMsg && (
        <div
          style={{
            background: "#d1fae5",
            border: "1px solid #6ee7b7",
            borderRadius: "8px",
            padding: "14px 18px",
            marginBottom: "24px",
            color: "#065f46",
            fontSize: "14px",
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: "10px",
          }}
        >
          ✓ {successMsg}
        </div>
      )}

      {/* Form */}
      <div
        style={{
          background: "white",
          borderRadius: "10px",
          border: "1px solid #e5e7eb",
          padding: "28px",
          marginBottom: "32px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
        }}
      >
        <h2
          style={{
            fontSize: "15px",
            fontWeight: 700,
            color: "#1e3a5f",
            marginBottom: "20px",
            paddingBottom: "12px",
            borderBottom: "1px solid #f3f4f6",
          }}
        >
          Incident Details
        </h2>

        <form onSubmit={handleSubmit}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "16px",
            }}
          >
            {/* Incident Type */}
            <div>
              <label style={labelStyle}>Incident Type *</label>
              <select
                style={inputStyle("incident_type")}
                value={form.incident_type}
                onChange={(e) => update("incident_type", e.target.value)}
              >
                <option value="">Select Type</option>
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
                <span style={errStyle}>{errors.incident_type}</span>
              )}
            </div>

            {/* Barangay */}
            <div>
              <label style={labelStyle}>Barangay *</label>
              <input
                style={{
                  ...inputStyle("place_barangay"),
                  background: "#f9fafb",
                }}
                value={barangayName}
                readOnly
                placeholder="Auto-filled from your account"
              />
              {errors.place_barangay && (
                <span style={errStyle}>{errors.place_barangay}</span>
              )}
            </div>

            {/* Date Commission */}
            <div>
              <label style={labelStyle}>Date & Time of Incident *</label>
              <input
                type="datetime-local"
                style={inputStyle("date_time_commission")}
                value={form.date_time_commission}
                max={new Date().toISOString().slice(0, 16)}
                onKeyDown={(e) => e.preventDefault()}
                onChange={(e) => update("date_time_commission", e.target.value)}
              />
              {errors.date_time_commission && (
                <span style={errStyle}>{errors.date_time_commission}</span>
              )}
            </div>

            {/* Date Reported */}
            <div>
              <label style={labelStyle}>Date & Time Reported *</label>
              <input
                type="datetime-local"
                style={inputStyle("date_time_reported")}
                value={form.date_time_reported}
                max={new Date().toISOString().slice(0, 16)}
                onKeyDown={(e) => e.preventDefault()}
                onChange={(e) => update("date_time_reported", e.target.value)}
              />
              {errors.date_time_reported && (
                <span style={errStyle}>{errors.date_time_reported}</span>
              )}
            </div>

            {/* Street */}
            <div style={{ gridColumn: "span 2" }}>
              <label style={labelStyle}>Street / Location *</label>
              <input
                type="text"
                style={inputStyle("place_street")}
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
                <span style={errStyle}>{errors.place_street}</span>
              )}
            </div>

            {/* Narrative */}
            <div style={{ gridColumn: "span 2" }}>
              <label style={labelStyle}>Narrative *</label>
              <textarea
                style={{ ...inputStyle("narrative"), resize: "vertical" }}
                rows={5}
                value={form.narrative}
                maxLength={3000}
                placeholder="Describe what happened in detail (minimum 20 characters)"
                onChange={(e) => update("narrative", e.target.value)}
              />
              {errors.narrative && (
                <span style={errStyle}>{errors.narrative}</span>
              )}
              <span style={{ fontSize: "11px", color: "#9ca3af" }}>
                {form.narrative.length}/3000
              </span>
            </div>
          </div>

          {/* Victim Section */}
          <h2
            style={{
              fontSize: "15px",
              fontWeight: 700,
              color: "#1e3a5f",
              margin: "24px 0 16px",
              paddingTop: "16px",
              borderTop: "1px solid #f3f4f6",
            }}
          >
            Victim Information
          </h2>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "16px",
            }}
          >
            <div>
              <label style={labelStyle}>First Name *</label>
              <input
                type="text"
                style={inputStyle("victim_first_name")}
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
                <span style={errStyle}>{errors.victim_first_name}</span>
              )}
            </div>
            <div>
              <label style={labelStyle}>Last Name *</label>
              <input
                type="text"
                style={inputStyle("victim_last_name")}
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
                <span style={errStyle}>{errors.victim_last_name}</span>
              )}
            </div>
            <div>
              <label style={labelStyle}>Gender</label>
              <div style={{ display: "flex", gap: "8px" }}>
                {["Male", "Female"].map((g) => (
                  <button
                    key={g}
                    type="button"
                    style={{
                      flex: 1,
                      padding: "10px",
                      borderRadius: "6px",
                      cursor: "pointer",
                      border: `1px solid ${form.victim_gender === g ? "#1e3a5f" : "#d1d5db"}`,
                      background:
                        form.victim_gender === g ? "#1e3a5f" : "white",
                      color: form.victim_gender === g ? "white" : "#374151",
                      fontSize: "13px",
                      fontWeight: 600,
                    }}
                    onClick={() => update("victim_gender", g)}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label style={labelStyle}>Contact Number</label>
              <input
                type="text"
                style={inputStyle("victim_contact")}
                value={form.victim_contact}
                placeholder="09XXXXXXXXX"
                maxLength={11}
                onChange={(e) =>
                  update("victim_contact", e.target.value.replace(/\D/g, ""))
                }
              />
            </div>
          </div>

          {/* Submit */}
          <div
            style={{
              marginTop: "24px",
              display: "flex",
              justifyContent: "flex-end",
            }}
          >
            <button
              type="submit"
              disabled={submitting}
              style={{
                padding: "12px 32px",
                background: submitting ? "#9ca3af" : "#1e3a5f",
                color: "white",
                border: "none",
                borderRadius: "8px",
                fontSize: "14px",
                fontWeight: 700,
                cursor: submitting ? "not-allowed" : "pointer",
              }}
            >
              {submitting ? "Submitting..." : "Submit Report"}
            </button>
          </div>
        </form>
      </div>

      {/* My Submissions */}
      <div
        style={{
          background: "white",
          borderRadius: "10px",
          border: "1px solid #e5e7eb",
          padding: "28px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
        }}
      >
        <h2
          style={{
            fontSize: "15px",
            fontWeight: 700,
            color: "#1e3a5f",
            marginBottom: "16px",
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          My Submitted Reports
          <span style={{ fontSize: "13px", fontWeight: 400, color: "#6b7280" }}>
            {reports.length} total
          </span>
        </h2>

        {loadingReports ? (
          <p
            style={{
              color: "#9ca3af",
              fontSize: "14px",
              textAlign: "center",
              padding: "32px",
            }}
          >
            Loading...
          </p>
        ) : reports.length === 0 ? (
          <p
            style={{
              color: "#9ca3af",
              fontSize: "14px",
              textAlign: "center",
              padding: "32px",
            }}
          >
            No reports submitted yet.
          </p>
        ) : (
          <>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "13px",
              }}
            >
              <thead>
                <tr style={{ borderBottom: "2px solid #f3f4f6" }}>
                  {[
                    "Reference No.",
                    "Incident Type",
                    "Street",
                    "Date Reported",
                    "Status",
                  ].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "10px 12px",
                        textAlign: "left",
                        color: "#6b7280",
                        fontWeight: 600,
                        fontSize: "12px",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginated.map((r) => {
                  const sc = statusColors[r.status] || {
                    bg: "#f3f4f6",
                    color: "#374151",
                  };
                  return (
                    <tr
                      key={r.blotter_id}
                      style={{ borderBottom: "1px solid #f9fafb" }}
                    >
                      <td
                        style={{
                          padding: "12px",
                          fontFamily: "monospace",
                          fontWeight: 700,
                          color: "#1e3a5f",
                          fontSize: "12px",
                        }}
                      >
                        {r.blotter_entry_number}
                      </td>
                      <td style={{ padding: "12px", color: "#374151" }}>
                        {r.incident_type}
                      </td>
                      <td style={{ padding: "12px", color: "#6b7280" }}>
                        {r.place_street}
                      </td>
                      <td style={{ padding: "12px", color: "#6b7280" }}>
                        {formatDate(r.date_time_reported)}
                      </td>
                      <td style={{ padding: "12px" }}>
                        <span
                          style={{
                            padding: "3px 10px",
                            borderRadius: "20px",
                            fontSize: "11px",
                            fontWeight: 700,
                            background: sc.bg,
                            color: sc.color,
                          }}
                        >
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Pagination */}
            {totalPages > 1 && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginTop: "16px",
                  paddingTop: "16px",
                  borderTop: "1px solid #f3f4f6",
                }}
              >
                <span style={{ fontSize: "13px", color: "#6b7280" }}>
                  Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1}–
                  {Math.min(currentPage * ITEMS_PER_PAGE, reports.length)} of{" "}
                  {reports.length}
                </span>
                <div style={{ display: "flex", gap: "6px" }}>
                  <button
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage((p) => p - 1)}
                    style={{
                      padding: "6px 14px",
                      borderRadius: "6px",
                      border: "1px solid #d1d5db",
                      background: currentPage === 1 ? "#f9fafb" : "white",
                      cursor: currentPage === 1 ? "not-allowed" : "pointer",
                      fontSize: "13px",
                      color: "#374151",
                    }}
                  >
                    Previous
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                    (p) => (
                      <button
                        key={p}
                        onClick={() => setCurrentPage(p)}
                        style={{
                          padding: "6px 12px",
                          borderRadius: "6px",
                          fontSize: "13px",
                          border: "1px solid #d1d5db",
                          background: currentPage === p ? "#1e3a5f" : "white",
                          color: currentPage === p ? "white" : "#374151",
                          cursor: "pointer",
                        }}
                      >
                        {p}
                      </button>
                    ),
                  )}
                  <button
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage((p) => p + 1)}
                    style={{
                      padding: "6px 14px",
                      borderRadius: "6px",
                      border: "1px solid #d1d5db",
                      background:
                        currentPage === totalPages ? "#f9fafb" : "white",
                      cursor:
                        currentPage === totalPages ? "not-allowed" : "pointer",
                      fontSize: "13px",
                      color: "#374151",
                    }}
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
