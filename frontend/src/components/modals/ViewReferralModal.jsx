import { useState, useEffect } from "react";
import "./ViewReferralModal.css";

/**
 * ViewReferralModal
 * -----------------------------------------------------------------------
 * Wired to real data. Given a `blotterId`, it fetches the full blotter
 * record (GET /blotters/:id) and its attachments (GET /blotters/:id/attachments)
 * — the same endpoints EBlotter.jsx's handleView() uses — and renders them.
 *
 * `summary` is optional: pass the table row (`b`) you already have so the
 * header can paint instantly (entry number, status, crime type) while the
 * full detail is still loading.
 *
 * Usage:
 *   <ViewReferralModal
 *     blotterId={selectedReferral.blotter_id}
 *     summary={selectedReferral}
 *     onClose={() => setShowReferralModal(false)}
 *   />
 * -----------------------------------------------------------------------
 */

// Matches the valid status set enforced server-side in
// blotterController.updateBlotterStatus (Pending / Under Investigation /
// Resolved / Urgent). "Solved"/"Cleared" appear elsewhere in the app as
// filter options, so they're mapped too in case a record carries one.
const statusStyles = {
  Pending: "vrm-status-pending",
  "Under Investigation": "vrm-status-pending",
  Resolved: "vrm-status-accepted",
  Solved: "vrm-status-accepted",
  Cleared: "vrm-status-accepted",
  Urgent: "vrm-status-escalated",
};

const formatDateTime = (dateString) => {
  if (!dateString) return "N/A";
  const cleaned = String(dateString)
    .replace("Z", "")
    .replace(/\+\d{2}:\d{2}$/, "");
  const date = new Date(cleaned);
  if (isNaN(date.getTime())) return String(dateString);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  return `${day}/${month}/${year} — ${hours}:${minutes} ${ampm}`;
};

const fullName = (p) =>
  [p.first_name, p.middle_name, p.last_name, p.qualifier]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim() || "Unknown";

const formatPeso = (amount) => {
  if (amount === null || amount === undefined || amount === "") return null;
  const n = parseFloat(amount);
  if (isNaN(n)) return null;
  return `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;
};

// Joins a person's address parts the same way EBlotter.jsx's view mode does.
const addressLine = (p) =>
  [p.house_street, p.barangay, p.city_municipality, p.district_province, p.region]
    .filter((v) => v && String(v).trim() !== "")
    .join(", ") || "N/A";

// importBlotters always inserts a suspect row, defaulting first/last name
// to "UNKNOWN" when the sheet had no suspect data — filter those out the
// same way EBlotter.jsx's own view mode does, so imported records without
// a real suspect don't render a fake "Unknown Unknown" person card.
const isRealSuspect = (s) => {
  const first = (s.first_name || "").toUpperCase();
  const last = (s.last_name || "").toUpperCase();
  const hasFirst = first && first !== "UNKNOWN";
  const hasLast = last && last !== "UNKNOWN";
  return hasFirst || hasLast;
};

/*
 * ── Call site change needed in EBlotter.jsx ──────────────────────────
 * Replace:
 *   {showReferralModal && (
 *     <ViewReferralModal
 *       referral={selectedReferral}
 *       onClose={() => { setShowReferralModal(false); setSelectedReferral(null); }}
 *     />
 *   )}
 *
 * With:
 *   {showReferralModal && (
 *     <ViewReferralModal
 *       blotterId={selectedReferral?.blotter_id}
 *       summary={selectedReferral}
 *       onClose={() => { setShowReferralModal(false); setSelectedReferral(null); }}
 *     />
 *   )}
 * ─────────────────────────────────────────────────────────────────────
 */
export default function ViewReferralModal({
  blotterId,
  summary = null,
  onClose = () => {},
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [detail, setDetail] = useState(null);
  const [attachments, setAttachments] = useState([]);

  const API_URL = `${import.meta.env.VITE_API_URL}/blotters`;

  useEffect(() => {
    if (!blotterId) {
      setError("No referral selected.");
      setLoading(false);
      return;
    }

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const token = localStorage.getItem("token");
        const [detailRes, attRes] = await Promise.all([
          fetch(`${API_URL}/${blotterId}`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`${API_URL}/${blotterId}/attachments`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        const detailJson = await detailRes.json();
        if (cancelled) return;

        if (!detailJson.success) {
          setError(detailJson.message || "Failed to load referral details.");
          setLoading(false);
          return;
        }
        setDetail(detailJson.data);

        try {
          const attJson = await attRes.json();
          if (!cancelled && attJson.success) setAttachments(attJson.data);
        } catch {
          // attachments are non-critical; ignore failures here
        }
      } catch (err) {
        if (!cancelled) setError("Failed to load referral details.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [blotterId]);

  // Values that can paint immediately from the row the user clicked,
  // falling back to the fetched detail once it arrives. Field names below
  // match the blotter_entries columns actually written by
  // blotterController.js (createBrgyReport / importBlotters inserts).
  const entryNumber =
    detail?.blotter_entry_number || summary?.blotter_entry_number || "—";
  const status = detail?.status || summary?.status || "Pending";
  const incidentType = detail?.incident_type || summary?.incident_type || "—";
  const responder = summary?.responder || null;

  const persons = detail
    ? [
        ...(detail.complainants || []).map((p) => ({ ...p, _kind: "person" })),
        ...(detail.suspects || [])
          .filter(isRealSuspect)
          .map((p) => ({ ...p, _kind: "suspect" })),
      ]
    : [];

  const placeLine = detail
    ? [
        detail.place_street,
        detail.place_barangay,
        detail.place_city_municipality,
        detail.place_district_province,
      ]
        .filter(Boolean)
        .join(", ")
    : "";

  const amountDisplay = formatPeso(detail?.amount_involved);

  return (
    <div className="vrm-overlay">
      <div className="vrm-modal">
        {/* ===== HEADER ===== */}
        <div className="vrm-header">
          <div className="vrm-header-left">
            <div className="vrm-header-icon">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </div>
            <div>
              <h2 className="vrm-title">View Referral</h2>
              <span className="vrm-ref-badge">#{entryNumber}</span>
              <p className="vrm-subtitle">
                Read-only view of the referred barangay report
              </p>
            </div>
          </div>

          <div className="vrm-header-right">
            <span className={`vrm-status-pill ${statusStyles[status] || ""}`}>
              <span className="vrm-status-dot" />
              {status}
            </span>
            <span className="vrm-modal-close" onClick={onClose}>
              &times;
            </span>
          </div>
        </div>

        {/* ===== BODY ===== */}
        <div className="vrm-body">
          {loading && (
            <div style={{ padding: "48px 24px", textAlign: "center" }}>
              <div style={{ color: "#6b7280", fontSize: "13px" }}>
                Loading referral details…
              </div>
            </div>
          )}

          {!loading && error && (
            <div
              style={{
                padding: "32px 24px",
                textAlign: "center",
                color: "#b91c1c",
                background: "#fef2f2",
                border: "1px solid #fecaca",
                borderRadius: "8px",
                margin: "16px",
              }}
            >
              {error}
            </div>
          )}

          {!loading && !error && detail && (
            <>
              {/* --- Case Details (merged referral context + blotter record) --- */}
              <div className="vrm-section">
                <h3 className="vrm-section-title">Case Details</h3>
                <div className="vrm-section-body">
                  <div className="vrm-card">
                    <div className="vrm-grid">
                      <div className="vrm-item">
                        <span className="vrm-label">Crime Type</span>
                        <span className="vrm-value">{incidentType}</span>
                      </div>
                      <div className="vrm-item">
                        <span className="vrm-label">
                          Date & Time of Commission
                        </span>
                        <span className="vrm-value">
                          {formatDateTime(detail.date_time_commission)}
                        </span>
                      </div>
                      <div className="vrm-item">
                        <span className="vrm-label">
                          Date & Time Reported
                        </span>
                        <span className="vrm-value">
                          {formatDateTime(detail.date_time_reported)}
                        </span>
                      </div>
                      <div className="vrm-item vrm-item-span2">
                        <span className="vrm-label">Place of Commission</span>
                        <span className="vrm-value">
                          {placeLine || "N/A"}
                        </span>
                      </div>
                      <div className="vrm-item">
                        <span className="vrm-label">Responder</span>
                        <span className="vrm-value">
                          {responder
                            ? `${responder.rank_abbreviation ? responder.rank_abbreviation + ". " : ""}${responder.first_name || ""} ${responder.last_name || ""}`.trim()
                            : "Not yet responded"}
                        </span>
                      </div>

                      {detail.cop && (
                        <div className="vrm-item">
                          <span className="vrm-label">
                            COP (Chief of Police)
                          </span>
                          <span className="vrm-value">{detail.cop}</span>
                        </div>
                      )}
                      {detail.is_private_place && (
                        <div className="vrm-item">
                          <span className="vrm-label">Private Place?</span>
                          <span className="vrm-value">
                            {detail.is_private_place}
                          </span>
                        </div>
                      )}
                      {amountDisplay && (
                        <div className="vrm-item">
                          <span className="vrm-label">Amount Involved</span>
                          <span className="vrm-value">{amountDisplay}</span>
                        </div>
                      )}

                      {detail.type_of_place && (
                        <div className="vrm-item">
                          <span className="vrm-label">Type of Place</span>
                          <span className="vrm-value">
                            {detail.type_of_place}
                          </span>
                        </div>
                      )}
                      {detail.case_solve_type && (
                        <div className="vrm-item">
                          <span className="vrm-label">Case Solve Type</span>
                          <span className="vrm-value">
                            {detail.case_solve_type}
                          </span>
                        </div>
                      )}

                      {detail.narrative && (
                        <div className="vrm-item vrm-item-full">
                          <span className="vrm-label">Narrative</span>
                          <span className="vrm-value vrm-narrative">
                            {detail.narrative}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* --- Persons Involved --- */}
              <div className="vrm-section">
                <h3 className="vrm-section-title">Persons Involved</h3>
                <div className="vrm-section-body">
                  {persons.length === 0 ? (
                    <div
                      style={{
                        padding: "20px",
                        textAlign: "center",
                        color: "#9ca3af",
                        fontSize: "13px",
                        border: "1px dashed #e5e7eb",
                        borderRadius: "8px",
                      }}
                    >
                      No persons recorded on this referral.
                    </div>
                  ) : (
                    persons.map((p, i) => {
                      const name = fullName(p);
                      const isSuspect = p._kind === "suspect";
                      const role = isSuspect ? "Suspect" : p.role || "Victim";
                      return (
                        <div className="vrm-card" key={i}>
                          <h4 className="vrm-person-card-title">
                            {role} #{i + 1}
                          </h4>
                          <div className={`vrm-grid ${!isSuspect ? "vrm-grid-2col" : ""}`}>
                            <div className="vrm-item">
                              <span className="vrm-label">Name</span>
                              <span className="vrm-value">{name}</span>
                            </div>
                            <div className="vrm-item">
                              <span className="vrm-label">Gender</span>
                              <span className="vrm-value">
                                {p.gender || "N/A"}
                              </span>
                            </div>
                            <div className="vrm-item">
                              <span className="vrm-label">Nationality</span>
                              <span className="vrm-value">
                                {p.nationality || "N/A"}
                              </span>
                            </div>
                            <div className="vrm-item">
                              <span className="vrm-label">Contact</span>
                              <span className="vrm-value">
                                {p.contact_number || "N/A"}
                              </span>
                            </div>
                            {isSuspect && (
                              <>
                                <div className="vrm-item">
                                  <span className="vrm-label">Alias</span>
                                  <span className="vrm-value">
                                    {p.alias || "N/A"}
                                  </span>
                                </div>
                                <div className="vrm-item">
                                  <span className="vrm-label">Occupation</span>
                                  <span className="vrm-value">
                                    {p.occupation || "N/A"}
                                  </span>
                                </div>
                                <div className="vrm-item vrm-item-full">
                                  <span className="vrm-label">Address</span>
                                  <span className="vrm-value">
                                    {addressLine(p)}
                                  </span>
                                </div>
                                <div className="vrm-item">
                                  <span className="vrm-label">Status</span>
                                  <span className="vrm-value">
                                    {p.status || "N/A"}
                                  </span>
                                </div>
                              </>
                            )}
                            {!isSuspect && (
                              <div className="vrm-item vrm-item-full">
                                <span className="vrm-label">
                                  House/Street Address
                                </span>
                                <span className="vrm-value">
                                  {p.house_street || "N/A"}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* --- Attachments --- */}
              {attachments.length > 0 && (
                <div className="vrm-section vrm-section-last">
                  <h3 className="vrm-section-title">
                    Evidence & Attachments
                    <span className="vrm-count-chip">
                      {attachments.length} file
                      {attachments.length > 1 ? "s" : ""}
                    </span>
                  </h3>
                  <div className="vrm-section-body">
                    <div className="vrm-attachment-grid">
                      {attachments.map((a) => {
                        const isVideo = a.file_type?.startsWith("video");
                        return (
                          <a
                            key={a.attachment_id}
                            className="vrm-attachment-card"
                            href={a.file_url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <div className="vrm-attachment-thumb">
                              {isVideo ? (
                                <svg
                                  width="20"
                                  height="20"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="white"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <polygon points="23 7 16 12 23 17 23 7" />
                                  <rect x="1" y="5" width="15" height="14" rx="2" />
                                </svg>
                              ) : (
                                <svg
                                  width="20"
                                  height="20"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="white"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                                  <circle cx="12" cy="13" r="4" />
                                </svg>
                              )}
                            </div>
                            <span className="vrm-attachment-caption">
                              {a.caption || (isVideo ? "Video" : "Photo")}
                            </span>
                          </a>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* ===== FOOTER ===== */}
        <div className="vrm-footer">
          <button
            type="button"
            className="vrm-btn vrm-btn-secondary"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}