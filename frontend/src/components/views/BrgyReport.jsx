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
  if (status === "Solved") return "br-status-solved";
  if (status === "Cleared") return "br-status-cleared";
  return "br-status-pending";
};

const toLocalDateTimeString = () => {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
};

function BrgyReport() {
  const [victims, setVictims] = useState([
    {
      first_name: "",
      middle_name: "",
      last_name: "",
      gender: "Male",
      contact_number: "",
      role: "Victim",
      nationality: "FILIPINO",
      house_street: "",
      relationship_to_victim: "",
      witness_statement: "",
      from_resident_db: false,
    },
  ]);
  const [form, setForm] = useState({
    incident_type: "",
    date_time_commission: "",
    date_time_reported: "",
    place_barangay: "",
    place_street: "",
    narrative: "",
    nationality: "FILIPINO",
  });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [reports, setReports] = useState([]);
  const [loadingReports, setLoadingReports] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [barangayName, setBarangayName] = useState("Loading...");
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [toast, setToast] = useState({
    show: false,
    message: "",
    type: "success",
  });
  const [showResidentSearch, setShowResidentSearch] = useState(false);
  const [residentSearchQuery, setResidentSearchQuery] = useState("");
  const [residents, setResidents] = useState([]);
  const [loadingResidents, setLoadingResidents] = useState(false);
  const [activePersonIndex, setActivePersonIndex] = useState(null);
  const [detectingCrime, setDetectingCrime] = useState(false);
  const [crimeAutoDetected, setCrimeAutoDetected] = useState(false);
  const [crimeDetectFailed, setCrimeDetectFailed] = useState(false);
  const [pendingFiles, setPendingFiles] = useState([]);
  const [pendingCaption, setPendingCaption] = useState("");
  const [lightboxImage, setLightboxImage] = useState(null);
  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(
      () => setToast({ show: false, message: "", type: "success" }),
      3000,
    );
  };
  useEffect(() => {
    fetchMyReports();
    setLoadingProfile(true);
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
            setLoadingProfile(false);
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
      .catch(() => setBarangayName("Your assigned barangay"))
      .finally(() => setLoadingProfile(false));
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
  const fetchResidents = async (q = "") => {
    setLoadingResidents(true);
    try {
      const params = new URLSearchParams();
      if (q) params.append("q", q);
      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/residents?${params}`,
        {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        },
      );
      const data = await res.json();
      if (data.success) setResidents(data.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingResidents(false);
    }
  };

  const openResidentSearch = (index) => {
    setActivePersonIndex(index);
    setResidentSearchQuery("");
    setResidents([]);
    setShowResidentSearch(true);
    fetchResidents();
  };

  const selectResident = (resident) => {
    setVictims((prev) =>
      prev.map((v, idx) =>
        idx === activePersonIndex
          ? {
              ...v,
              first_name: resident.first_name || "",
              middle_name: resident.middle_name || "",
              last_name: resident.last_name || "",
              gender: resident.gender || "Male",
              contact_number: resident.contact_number || "",
              nationality: "FILIPINO",
              house_street: resident.house_street || "",
              from_resident_db: true,
            }
          : v,
      ),
    );
    setShowResidentSearch(false);
  };
  const addPendingFile = (file, caption) => {
    if (pendingFiles.length >= 5) return;
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.type)) {
      showToast("Only JPG, PNG, WEBP allowed", "error");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast("Max 5MB per photo", "error");
      return;
    }
    const preview = URL.createObjectURL(file);
    setPendingFiles((prev) => [...prev, { file, caption, preview }]);
    setPendingCaption("");
  };

  const removePendingFile = (index) => {
    setPendingFiles((prev) => {
      URL.revokeObjectURL(prev[index].preview);
      return prev.filter((_, i) => i !== index);
    });
  };

  const uploadPendingFiles = async (blotterId) => {
    for (const item of pendingFiles) {
      try {
        const formData = new FormData();
        formData.append("file", item.file);
        if (item.caption) formData.append("caption", item.caption);
        await fetch(
          `${import.meta.env.VITE_API_URL}/blotters/${blotterId}/attachments`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${localStorage.getItem("token")}`,
            },
            body: formData,
          },
        );
      } catch (err) {
        console.error("Failed to upload attachment:", err);
      }
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
  const updateVictim = (i, field, value) => {
    setVictims((prev) =>
      prev.map((v, idx) => (idx === i ? { ...v, [field]: value } : v)),
    );
  };
  const detectCrimeFromNarrative = async (narrativeText) => {
    if (!narrativeText || narrativeText.trim().length < 20) return;
    if (form.incident_type) return;

    try {
      setDetectingCrime(true);
      setCrimeAutoDetected(false);
      setCrimeDetectFailed(false);

      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/blotters/detect-crime-type`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
          body: JSON.stringify({ narrative: narrativeText }),
        },
      );

      const data = await res.json();
      if (data.success && data.crime_type) {
        setForm((prev) => ({ ...prev, incident_type: data.crime_type }));

        if (data.rate_limited) {
          showToast(
            "⚠ AI detection unavailable — daily request limit reached. Please select the crime type manually.",
            "error",
          );
          setCrimeAutoDetected(false);
        } else if (data.fallback) {
          setCrimeAutoDetected(true);
          setCrimeDetectFailed(true);
        } else {
          setCrimeAutoDetected(true);
          setCrimeDetectFailed(!data.confident);
        }
      }
    } catch (err) {
      console.error("Crime detection failed:", err);
      showToast(
        "AI detection failed. Please select the crime type manually.",
        "error",
      );
    } finally {
      setDetectingCrime(false);
    }
  };

  const addPerson = (role = "Victim") =>
    setVictims((prev) => [
      ...prev,
      {
        first_name: "",
        middle_name: "",
        last_name: "",
        gender: "Male",
        contact_number: "",
        role,
        nationality: "FILIPINO",
        house_street: "",
        relationship_to_victim: "",
        witness_statement: "",
        from_resident_db: false,
      },
    ]);
  const removeVictim = (i) =>
    setVictims((prev) => prev.filter((_, idx) => idx !== i));
  const validate = () => {
    const e = {};
    // if (!form.incident_type) e.incident_type = "Required";
    if (!form.date_time_commission) {
      e.date_time_commission = "Required";
    } else {
      const commission = new Date(form.date_time_commission);
      const now = new Date();
      if (commission > now) e.date_time_commission = "Cannot be future date";
      else if (
        form.date_time_reported &&
        commission > new Date(form.date_time_reported)
      )
        e.date_time_commission = "Must be before report date";
    }
    if (!form.date_time_reported) {
      e.date_time_reported = "Required";
    } else {
      const reported = new Date(form.date_time_reported);
      const now = new Date();
      if (reported > now) e.date_time_reported = "Cannot be future date";
      else if (
        form.date_time_commission &&
        reported < new Date(form.date_time_commission)
      )
        e.date_time_reported = "Cannot be before commission";
    }
    if (!form.place_barangay) e.place_barangay = "Required";
    if (!form.place_street || form.place_street.trim().length === 0) {
      e.place_street = "Required";
    } else if (form.place_street.trim().length < 2) {
      e.place_street = "At least 2 characters";
    }
    if (!form.narrative || form.narrative.trim().length < 20)
      e.narrative = "At least 20 characters";
    victims.forEach((v, i) => {
      if (!v.first_name) e[`victim_${i}_first_name`] = "Required";
      if (!v.last_name) e[`victim_${i}_last_name`] = "Required";
      if (
        v.contact_number &&
        v.contact_number.length > 0 &&
        v.contact_number.length !== 11
      )
        e[`victim_${i}_contact_number`] = "Must be 11 digits";
    });
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
      const resolvedIncidentType =
        form.incident_type || "Special Complex Crime";

      setSubmitting(true);
      const res = await fetch(`${API_URL}/brgy-report`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify({
          ...form,
          incident_type: resolvedIncidentType,
          victims: victims.map((v) => ({
            ...v,
            contact: v.contact_number,
          })),
        }),
      });
      const data = await res.json();
      if (data.success) {
        if (pendingFiles.length > 0) {
          await uploadPendingFiles(data.data.blotter_id);
        }
        showToast(
          `Report submitted! Reference No.: ${data.data.blotter_entry_number}`,
        );
        setPendingFiles([]);
        setPendingCaption("");
        setForm({
          incident_type: "",
          date_time_commission: "",
          date_time_reported: "",
          place_barangay: form.place_barangay,
          place_street: "",
          narrative: "",
        });
        setCrimeAutoDetected(false);
        setCrimeDetectFailed(false);
        setVictims([
          {
            first_name: "",
            middle_name: "",
            last_name: "",
            gender: "Male",
            contact_number: "",
            role: "Victim",
            nationality: "FILIPINO",
            house_street: "",
            relationship_to_victim: "",
            witness_statement: "",
            from_resident_db: false,
          },
        ]);
        fetchMyReports();
        document
          .querySelector(".content-wrapper")
          ?.scrollTo({ top: 0, behavior: "smooth" });
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
      <LoadingModal
        isOpen={loadingReports || loadingProfile}
        message="Loading..."
      />

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
                  Crime Type
                  {detectingCrime && (
                    <span
                      style={{
                        marginLeft: "8px",
                        fontSize: "10px",
                        fontWeight: 700,
                        background: "#dbeafe",
                        color: "#1e40af",
                        padding: "2px 8px",
                        borderRadius: "20px",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                      }}
                    >
                      <span
                        style={{
                          width: "6px",
                          height: "6px",
                          borderRadius: "50%",
                          background: "#3b82f6",
                          display: "inline-block",
                          animation: "pulse 1s infinite",
                        }}
                      />
                      Detecting...
                    </span>
                  )}
                  {crimeAutoDetected && !detectingCrime && (
                    <span
                      style={{
                        marginLeft: "8px",
                        fontSize: "10px",
                        fontWeight: 700,
                        background: crimeDetectFailed ? "#fef3c7" : "#d1fae5",
                        color: crimeDetectFailed ? "#92400e" : "#065f46",
                        padding: "2px 8px",
                        borderRadius: "20px",
                      }}
                    >
                      {crimeDetectFailed
                        ? "⚠ AI best guess — please verify"
                        : "✓ Auto-detected by AI"}
                    </span>
                  )}
                </label>
                <select
                  className={`br-input ${errors.incident_type ? "error" : ""}`}
                  value={form.incident_type}
                  onChange={(e) => {
                    update("incident_type", e.target.value);
                    setCrimeAutoDetected(false);
                    setCrimeDetectFailed(false);
                  }}
                >
                  <option value="">Auto-detect with AI</option>
                  <option value="Carnapping - MC">Carnapping - MC</option>
                  <option value="Carnapping - MV">Carnapping - MV</option>
                  <option>Homicide</option>
                  <option>Murder</option>
                  <option>Physical Injury</option>
                  <option>Rape</option>
                  <option>Robbery</option>
                  <option>Special Complex Crime</option>
                  <option>Theft</option>
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
                  max={toLocalDateTimeString()}
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
                  min={form.date_time_commission || undefined}
                  max={toLocalDateTimeString()}
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
                  onBlur={(e) => detectCrimeFromNarrative(e.target.value)} // ← add this
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

        {/* ── PERSONS INVOLVED CARD ── */}
        <div className="br-card">
          <div className="br-card-header">
            <div
              className="br-card-header-icon"
              style={{ background: "#c1272d" }}
            >
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
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
            <h2 className="br-card-title">Persons Involved</h2>
          </div>
          <div className="br-card-body">
            {/* ── RESIDENT HINT — no button, just info ── */}
            <div className="br-resident-hint">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#1e3a5f"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
              </svg>
              <span>
                Use <strong>Search Resident</strong> on each person entry to
                auto-fill details from the {barangayName} resident database.
              </span>
            </div>

            {/* ── PERSON ENTRIES ── */}
            {victims.map((v, i) => (
              <div key={i} className="br-person-entry">
                {/* Entry header with role selector */}
                <div className="br-person-entry-header">
                  <div className="br-person-role-row">
                    <span className="br-person-num">Person #{i + 1}</span>
                    <div className="br-role-btns">
                      {["Victim", "Complainant", "Witness", "Respondent"].map(
                        (r) => (
                          <button
                            key={r}
                            type="button"
                            className={`br-role-btn ${v.role === r ? "active" : ""}`}
                            onClick={() => updateVictim(i, "role", r)}
                          >
                            {r}
                          </button>
                        ),
                      )}
                    </div>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      gap: "8px",
                      alignItems: "center",
                    }}
                  >
                    <button
                      type="button"
                      className="br-resident-search-btn"
                      style={{ fontSize: "11px", padding: "4px 10px" }}
                      onClick={() => openResidentSearch(i)}
                    >
                      Search Resident
                    </button>
                    {victims.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          setVictims((prev) =>
                            prev.filter((_, idx) => idx !== i),
                          )
                        }
                        className="br-remove-btn"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>

                {/* Fields */}
                <div className="br-form-grid">
                  <div className="br-form-group">
                    <label className="br-label">
                      First Name <span>*</span>
                    </label>
                    <input
                      type="text"
                      className={`br-input ${errors[`victim_${i}_first_name`] ? "error" : ""}`}
                      value={v.first_name}
                      placeholder="First Name"
                      maxLength={50}
                      onChange={(e) =>
                        updateVictim(
                          i,
                          "first_name",
                          e.target.value.replace(/[^A-Za-zÑñ\s'-]/g, ""),
                        )
                      }
                    />
                    {errors[`victim_${i}_first_name`] && (
                      <span className="br-error">
                        {errors[`victim_${i}_first_name`]}
                      </span>
                    )}
                  </div>

                  <div className="br-form-group">
                    <label className="br-label">Middle Name</label>
                    <input
                      type="text"
                      className="br-input"
                      value={v.middle_name}
                      placeholder="Middle Name"
                      maxLength={50}
                      onChange={(e) =>
                        updateVictim(
                          i,
                          "middle_name",
                          e.target.value.replace(/[^A-Za-zÑñ\s'-]/g, ""),
                        )
                      }
                    />
                  </div>

                  <div className="br-form-group">
                    <label className="br-label">
                      Last Name <span>*</span>
                    </label>
                    <input
                      type="text"
                      className={`br-input ${errors[`victim_${i}_last_name`] ? "error" : ""}`}
                      value={v.last_name}
                      placeholder="Last Name"
                      maxLength={50}
                      onChange={(e) =>
                        updateVictim(
                          i,
                          "last_name",
                          e.target.value.replace(/[^A-Za-zÑñ\s'-]/g, ""),
                        )
                      }
                    />
                    {errors[`victim_${i}_last_name`] && (
                      <span className="br-error">
                        {errors[`victim_${i}_last_name`]}
                      </span>
                    )}
                  </div>

                  <div className="br-form-group">
                    <label className="br-label">Contact Number</label>
                    <input
                      type="text"
                      className={`br-input ${errors[`victim_${i}_contact_number`] ? "error" : ""}`}
                      value={v.contact_number}
                      placeholder="09XXXXXXXXX"
                      maxLength={11}
                      onChange={(e) =>
                        updateVictim(
                          i,
                          "contact_number",
                          e.target.value.replace(/\D/g, ""),
                        )
                      }
                    />
                    {errors[`victim_${i}_contact_number`] && (
                      <span className="br-error">
                        {errors[`victim_${i}_contact_number`]}
                      </span>
                    )}
                  </div>
                  <div className="br-form-group">
                    <label className="br-label">Nationality</label>
                    <select
                      className="br-input"
                      value={v.nationality || "FILIPINO"}
                      onChange={(e) =>
                        updateVictim(i, "nationality", e.target.value)
                      }
                    >
                      <option>FILIPINO</option>
                      <option>AMERICAN</option>
                      <option>CHINESE</option>
                      <option>JAPANESE</option>
                      <option>KOREAN</option>
                      <option>INDIAN</option>
                      <option>BRITISH</option>
                      <option>AUSTRALIAN</option>
                      <option>CANADIAN</option>
                      <option>GERMAN</option>
                      <option>FRENCH</option>
                      <option>SPANISH</option>
                      <option>INDONESIAN</option>
                      <option>MALAYSIAN</option>
                      <option>SINGAPOREAN</option>
                      <option>THAI</option>
                      <option>VIETNAMESE</option>
                      <option>Other</option>
                    </select>
                  </div>
                  <div
                    className="br-form-group"
                    style={{ gridColumn: "span 2" }}
                  >
                    <label className="br-label">
                      House / Street Address
                      {v.from_resident_db && (
                        <span
                          style={{
                            marginLeft: "8px",
                            fontSize: "10px",
                            fontWeight: 700,
                            background: "#d1fae5",
                            color: "#065f46",
                            padding: "2px 7px",
                            borderRadius: "20px",
                          }}
                        >
                          Auto-filled from resident record
                        </span>
                      )}
                    </label>
                    <input
                      type="text"
                      className="br-input"
                      value={v.house_street || ""}
                      placeholder="House No. / Street (optional)"
                      maxLength={200}
                      onChange={(e) =>
                        updateVictim(i, "house_street", e.target.value)
                      }
                    />
                  </div>
                  <div
                    className="br-form-group"
                    style={{ gridColumn: "span 2" }}
                  >
                    <label className="br-label">Gender</label>
                    <div className="br-gender-row">
                      {["Male", "Female"].map((g) => (
                        <button
                          key={g}
                          type="button"
                          className={`br-gender-btn ${v.gender === g ? "active" : ""}`}
                          onClick={() => updateVictim(i, "gender", g)}
                        >
                          {g}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Complainant extra field */}
                  {v.role === "Complainant" && (
                    <div
                      className="br-form-group"
                      style={{ gridColumn: "span 2" }}
                    >
                      <label className="br-label">Relationship to Victim</label>
                      <select
                        className="br-input"
                        value={v.relationship_to_victim || ""}
                        onChange={(e) =>
                          updateVictim(
                            i,
                            "relationship_to_victim",
                            e.target.value,
                          )
                        }
                      >
                        <option value="">Select...</option>
                        <option>Self</option>
                        <option>Parent</option>
                        <option>Spouse</option>
                        <option>Guardian</option>
                        <option>Sibling</option>
                        <option>Child</option>
                        <option>Relative</option>
                        <option>Other</option>
                      </select>
                    </div>
                  )}

                  {/* Witness extra field */}
                  {v.role === "Witness" && (
                    <div
                      className="br-form-group"
                      style={{ gridColumn: "span 2" }}
                    >
                      <label className="br-label">
                        Witness Statement (optional)
                      </label>
                      <textarea
                        className="br-input"
                        rows={3}
                        maxLength={500}
                        placeholder="Brief statement of what was witnessed..."
                        value={v.witness_statement || ""}
                        onChange={(e) =>
                          updateVictim(i, "witness_statement", e.target.value)
                        }
                      />
                      <small style={{ color: "#9ca3af", fontSize: "11px" }}>
                        {v.witness_statement.length}/500
                      </small>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* ── ADD BUTTONS ── */}
            <div className="br-add-person-row">
              {["Victim", "Complainant", "Witness", "Respondent"].map((r) => (
                <button
                  key={r}
                  type="button"
                  className="br-add-person-btn"
                  onClick={() => addPerson(r)}
                >
                  + Add {r}
                </button>
              ))}
            </div>
            {/* ── EVIDENCE UPLOAD CARD ── */}
            <div className="br-card">
              <div
                className="br-card-header"
                style={{ borderLeft: "4px solid #f59e0b" }}
              >
                <div
                  className="br-card-header-icon"
                  style={{ background: "#d97706" }}
                >
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
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                    <circle cx="12" cy="13" r="4" />
                  </svg>
                </div>
                <h2 className="br-card-title">Attach CCTV / Evidence Photos</h2>
                <span
                  style={{
                    marginLeft: "auto",
                    fontSize: "12px",
                    color: "#6b7280",
                    background: "#f3f4f6",
                    padding: "3px 10px",
                    borderRadius: "20px",
                  }}
                >
                  Optional · Max 5 photos
                </span>
              </div>
              <div className="br-card-body">
                <div
                  style={{
                    background: "#fffbeb",
                    border: "1px solid #fde68a",
                    borderRadius: "8px",
                    padding: "12px 16px",
                    marginBottom: "20px",
                    display: "flex",
                    gap: "10px",
                    alignItems: "flex-start",
                    fontSize: "13px",
                    color: "#92400e",
                  }}
                >
                  <span>
                    Attach CCTV snapshots or scene photos. These will be
                    submitted with your report.{" "}
                    <strong>JPG, PNG only · Max 5MB per photo.</strong>
                  </span>
                </div>

                {/* Preview grid */}
                {pendingFiles.length > 0 && (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fill, minmax(150px, 1fr))",
                      gap: "12px",
                      marginBottom: "20px",
                    }}
                  >
                    {pendingFiles.map((item, index) => (
                      <div
                        key={index}
                        style={{
                          position: "relative",
                          borderRadius: "8px",
                          overflow: "hidden",
                          border: "1px solid #e5e7eb",
                          background: "#f9fafb",
                        }}
                      >
                        <img
                          src={item.preview}
                          alt={item.caption || "Evidence"}
                          style={{
                            width: "100%",
                            height: "120px",
                            objectFit: "cover",
                            display: "block",
                            cursor: "zoom-in",
                          }}
                          onClick={() =>
                            setLightboxImage({
                              url: item.preview,
                              caption: item.caption,
                            })
                          }
                        />

                        <button
                          onClick={() => removePendingFile(index)}
                          type="button"
                          style={{
                            position: "absolute",
                            top: "6px",
                            right: "6px",
                            background: "rgba(0,0,0,0.6)",
                            border: "none",
                            borderRadius: "50%",
                            width: "24px",
                            height: "24px",
                            cursor: "pointer",
                            color: "white",
                            fontSize: "14px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Upload area */}
                {pendingFiles.length < 5 && (
                  <div>
                    <label
                      htmlFor="evidence-upload"
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "10px",
                        border: "2px dashed #d1d5db",
                        borderRadius: "10px",
                        padding: "32px 20px",
                        cursor: "pointer",
                        background: "white",
                        transition: "all 0.2s",
                        textAlign: "center",
                      }}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const file = e.dataTransfer.files[0];
                        if (file) addPendingFile(file, pendingCaption);
                      }}
                    >
                      <div
                        style={{
                          fontSize: "14px",
                          fontWeight: 600,
                          color: "#374151",
                        }}
                      >
                        Click to upload or drag & drop
                      </div>
                      <div style={{ fontSize: "12px", color: "#9ca3af" }}>
                        CCTV snapshot, scene photo — JPG or PNG, max 5MB
                      </div>
                      <input
                        id="evidence-upload"
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        style={{ display: "none" }}
                        onChange={(e) => {
                          const file = e.target.files[0];
                          if (file) {
                            addPendingFile(file, pendingCaption);
                            e.target.value = "";
                          }
                        }}
                      />
                    </label>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginTop: "8px",
                        fontSize: "12px",
                        color: "#9ca3af",
                      }}
                    >
                      <span>{pendingFiles.length}/5 photos added</span>
                      <span>Photos will upload when you submit the report</span>
                    </div>
                  </div>
                )}

                {pendingFiles.length >= 5 && (
                  <div
                    style={{
                      textAlign: "center",
                      padding: "16px",
                      background: "#f0fdf4",
                      borderRadius: "8px",
                      border: "1px solid #bbf7d0",
                      color: "#065f46",
                      fontSize: "13px",
                      fontWeight: 600,
                    }}
                  >
                    ✓ Maximum 5 photos added. They will upload with your report.
                  </div>
                )}
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

        {reports.length === 0 && !loadingReports ? (
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
                    <td></td>
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
      {toast.show && (
        <div
          className={`um-toast ${toast.type === "error" ? "um-toast-error" : "um-toast-success"}`}
          style={{ zIndex: 99999 }}
        >
          <div className="um-toast-content">
            <svg
              className="um-toast-icon"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
            <span>{toast.message}</span>
          </div>
        </div>
      )}
      {/* ── RESIDENT SEARCH POPUP ── */}
      {showResidentSearch && (
        <div
          className="br-modal-overlay"
          onClick={() => setShowResidentSearch(false)}
        >
          <div
            className="br-resident-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="br-resident-modal-header">
              <div>
                <h3 className="br-resident-modal-title">Search Resident</h3>
                <p className="br-resident-modal-sub">
                  Select a resident to auto-fill Person #
                  {(activePersonIndex ?? 0) + 1}
                </p>
              </div>
              <span
                className="br-resident-modal-close"
                onClick={() => setShowResidentSearch(false)}
              >
                &times;
              </span>
            </div>

            <div className="br-resident-modal-search">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#9ca3af"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{
                  position: "absolute",
                  left: "30px",
                  top: "50%",
                  transform: "translateY(-50%)",
                }}
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                className="br-resident-search-input"
                placeholder="Type name to search..."
                value={residentSearchQuery}
                autoFocus
                onChange={(e) => {
                  setResidentSearchQuery(e.target.value);
                  fetchResidents(e.target.value);
                }}
              />
            </div>

            <div className="br-resident-list">
              {loadingResidents ? (
                <div className="br-resident-loading">Searching...</div>
              ) : residents.length === 0 ? (
                <div className="br-resident-empty">
                  {residentSearchQuery
                    ? `No residents found for "${residentSearchQuery}"`
                    : "Start typing to search residents"}
                </div>
              ) : (
                residents.map((r) => (
                  <div
                    key={r.resident_id}
                    className="br-resident-row"
                    onClick={() => selectResident(r)}
                  >
                    <div className="br-resident-row-avatar">
                      {r.first_name[0]}
                      {r.last_name[0]}
                    </div>
                    <div className="br-resident-row-info">
                      <div className="br-resident-row-name">
                        {r.last_name}, {r.first_name}
                        {r.middle_name ? ` ${r.middle_name[0]}.` : ""}
                      </div>
                      <div className="br-resident-row-sub">
                        {r.gender || "—"} ·{" "}
                        {r.house_street || "No address on file"}
                      </div>
                    </div>
                    <div className="br-resident-row-select">Select →</div>
                  </div>
                ))
              )}
            </div>

            <div className="br-resident-modal-footer">
              <span style={{ fontSize: "12px", color: "#9ca3af" }}>
                Person not found? Just fill in the fields manually.
              </span>
              <button
                type="button"
                className="br-pagination-btn"
                onClick={() => setShowResidentSearch(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      {lightboxImage && (
        <div
          onClick={() => setLightboxImage(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 99999,
            background: "rgba(0,0,0,0.85)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ position: "relative" }}
          >
            <img
              src={lightboxImage.url}
              alt={lightboxImage.caption || "Evidence"}
              style={{
                maxWidth: "90vw",
                maxHeight: "80vh",
                objectFit: "contain",
                borderRadius: "8px",
                display: "block",
              }}
            />
            <button
              onClick={() => setLightboxImage(null)}
              style={{
                position: "absolute",
                top: "-12px",
                right: "-12px",
                background: "#dc2626",
                border: "none",
                borderRadius: "50%",
                width: "32px",
                height: "32px",
                cursor: "pointer",
                color: "white",
                fontSize: "18px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 700,
              }}
            >
              ×
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default BrgyReport;
