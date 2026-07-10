import { useState, useEffect } from "react";
import "./ViewReferralModal.css";

/**
 * ViewReferralModal
 * -----------------------------------------------------------------------
 * Read-only view of a referred barangay report.
 *
 * IMPORTANT: This modal only displays fields that the resident-facing
 * submission form actually collects:
 *   - Incident Details: Crime Type, Barangay, Date & Time of Incident,
 *     Date & Time Reported, Street/Location, Narrative
 *   - Persons Involved: Role, First/Middle/Last Name, Contact Number,
 *     Nationality, House/Street Address, Gender
 *   - Attach CCTV / Evidence: Photo / Video attachments
 *
 * Fields that only exist on the officer-side blotter record (Suspect
 * Information, Index Type, Modus Operandi, Stage of Felony, COP,
 * Amount Involved, Type of Place, Alias, Occupation, Info Obtained,
 * Relationship to Victim, Witness Statement, Responder, Coordinates)
 * are intentionally NOT shown here, since the resident never submitted
 * that data.
 *
 * Data-wise it's wired to the same endpoints EBlotter.jsx's handleView()
 * uses: GET /blotters/:id and GET /blotters/:id/attachments. `summary` is
 * optional — pass the table row (`b`) you already have so the header can
 * paint instantly (entry number, status, crime type) while full detail
 * is still loading.
 *
 * Usage:
 *   <ViewReferralModal
 *     blotterId={selectedReferral.blotter_id}
 *     summary={selectedReferral}
 *     onClose={() => setShowReferralModal(false)}
 *   />
 * -----------------------------------------------------------------------
 */

const statusStyles = {
  Pending: "vrfm-status-pending",
  "Under Investigation": "vrfm-status-pending",
  Resolved: "vrfm-status-accepted",
  Solved: "vrfm-status-accepted",
  Cleared: "vrfm-status-accepted",
  Urgent: "vrfm-status-escalated",
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
  return `${day}/${month}/${year} ${hours}:${minutes} ${ampm}`;
};

const formatUploadedAt = (raw) => {
  if (!raw) return "";
  const cleaned = String(raw).replace("Z", "").replace(/\+\d{2}:\d{2}$/, "");
  return new Date(cleaned).toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Manila",
  });
};

// House/Street + Barangay only — matches what the submission form
// actually asks for ("House / Street Address" field, plus the
// barangay the report was filed under).
const addressLine = (p, barangay) =>
  [p.house_street, barangay].filter((v) => v && String(v).trim() !== "").join(", ") ||
  "N/A";

export default function ViewReferralModal({
  blotterId,
  summary = null,
  onClose = () => {},
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [detail, setDetail] = useState(null);
  const [attachments, setAttachments] = useState([]);
  const [mediaTab, setMediaTab] = useState("image"); // "image" | "video"

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

  const entryNumber =
    detail?.blotter_entry_number || summary?.blotter_entry_number || "—";
  const status = detail?.status || summary?.status || "Pending";
  const incidentType = detail?.incident_type || summary?.incident_type || "—";
  const barangay = detail?.place_barangay || summary?.place_barangay || "N/A";

  const complainants = (detail?.complainants || []).map((c) => ({
    ...c,
    role: c.role || "Victim",
  }));

  const images = attachments.filter((a) => !a.file_type?.startsWith("video"));
  const videos = attachments.filter((a) => a.file_type?.startsWith("video"));
  const hasImages = images.length > 0;
  const hasVideos = videos.length > 0;
  const effectiveTab =
    mediaTab === "image" && !hasImages && hasVideos
      ? "video"
      : mediaTab === "video" && !hasVideos && hasImages
        ? "image"
        : mediaTab;
  const displayedAttachments = effectiveTab === "image" ? images : videos;

  return (
    <div className="vrfm-overlay">
      <div className="vrfm-modal">
        {/* ===== HEADER ===== */}
        <div className="vrfm-header">
          <div className="vrfm-header-left">
            <div className="vrfm-header-icon">
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
              <h2 className="vrfm-title">View Referral</h2>
              <span className="vrfm-ref-badge">#{entryNumber}</span>
              <p className="vrfm-subtitle">
                Read-only view of the referred barangay report
              </p>
            </div>
          </div>

          <div className="vrfm-header-right">
            <span className={`vrfm-status-pill ${statusStyles[status] || ""}`}>
              <span className="vrfm-status-dot" />
              {status}
            </span>
            <span className="vrfm-modal-close" onClick={onClose}>
              &times;
            </span>
          </div>
        </div>

        {/* ===== BODY ===== */}
        <div className="vrfm-body">
          {loading && (
            <div className="vrfm-state-box">Loading referral details…</div>
          )}

          {!loading && error && (
            <div className="vrfm-state-box vrfm-state-error">{error}</div>
          )}

          {!loading && !error && detail && (
            <>
              {/* --- Incident Details --- */}
              <div className="vrfm-section">
                <h3 className="vrfm-section-title">Incident Details</h3>
                <div className="vrfm-section-body">
                  <div className="vrfm-card">
                    <div className="vrfm-grid">
                      <div className="vrfm-item">
                        <span className="vrfm-label">Crime Type</span>
                        <span className="vrfm-value">{incidentType}</span>
                      </div>
                      <div className="vrfm-item">
                        <span className="vrfm-label">Barangay</span>
                        <span className="vrfm-value">{barangay}</span>
                      </div>
                      <div className="vrfm-item">
                        <span className="vrfm-label">
                          Date & Time of Incident
                        </span>
                        <span className="vrfm-value">
                          {formatDateTime(detail.date_time_commission)}
                        </span>
                      </div>
                      <div className="vrfm-item">
                        <span className="vrfm-label">
                          Date & Time Reported
                        </span>
                        <span className="vrfm-value">
                          {formatDateTime(detail.date_time_reported)}
                        </span>
                      </div>
                      <div className="vrfm-item vrfm-item-span2">
                        <span className="vrfm-label">Street / Location</span>
                        <span className="vrfm-value">
                          {detail.place_street || "N/A"}
                        </span>
                      </div>
                      <div className="vrfm-item vrfm-item-full">
                        <span className="vrfm-label">Narrative</span>
                        <span className="vrfm-value vrfm-narrative">
                          {detail.narrative || "N/A"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* --- Persons Involved --- */}
              <div className="vrfm-section">
                <h3 className="vrfm-section-title">Persons Involved</h3>
                <div className="vrfm-section-body">
                  {complainants.length === 0 ? (
                    <div className="vrfm-empty-box">
                      No persons recorded on this referral.
                    </div>
                  ) : (
                    complainants.map((c, i) => (
                      <div className="vrfm-card" key={i}>
                        <h4 className="vrfm-card-title">
                          {c.role} #{i + 1}
                        </h4>
                        <div className="vrfm-grid">
                          <div className="vrfm-item">
                            <span className="vrfm-label">Name</span>
                            <span className="vrfm-value">
                              {`${c.first_name || ""} ${c.middle_name || ""} ${c.last_name || ""}`
                                .replace(/\s+/g, " ")
                                .trim() || "N/A"}
                            </span>
                          </div>
                          <div className="vrfm-item">
                            <span className="vrfm-label">Gender</span>
                            <span className="vrfm-value">
                              {c.gender || "N/A"}
                            </span>
                          </div>
                          <div className="vrfm-item">
                            <span className="vrfm-label">Nationality</span>
                            <span className="vrfm-value">
                              {c.nationality || "N/A"}
                            </span>
                          </div>
                          <div className="vrfm-item">
                            <span className="vrfm-label">Contact Number</span>
                            <span className="vrfm-value">
                              {c.contact_number || "N/A"}
                            </span>
                          </div>
                          <div className="vrfm-item vrfm-item-span2">
                            <span className="vrfm-label">
                              House / Street Address
                            </span>
                            <span className="vrfm-value">
                              {addressLine(c, barangay)}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* --- Evidence & CCTV Attachments --- */}
              <div className="vrfm-section vrfm-section-last">
                <h3 className="vrfm-section-title">
                  Attach CCTV / Evidence
                  {attachments.length > 0 && (
                    <span className="vrfm-count-chip">
                      {attachments.length} file
                      {attachments.length > 1 ? "s" : ""}
                    </span>
                  )}
                </h3>
                <div className="vrfm-section-body">
                  {attachments.length === 0 ? (
                    <div className="vrfm-empty-box">
                      No photos or videos were attached to this report.
                    </div>
                  ) : (
                    <>
                      {hasImages && hasVideos && (
                        <div className="vrfm-media-tabs">
                          <button
                            type="button"
                            className={`vrfm-media-tab ${effectiveTab === "image" ? "active" : ""}`}
                            onClick={() => setMediaTab("image")}
                          >
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
                              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                              <circle cx="12" cy="13" r="4" />
                            </svg>
                            Photos ({images.length})
                          </button>
                          <button
                            type="button"
                            className={`vrfm-media-tab ${effectiveTab === "video" ? "active" : ""}`}
                            onClick={() => setMediaTab("video")}
                          >
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
                              <polygon points="23 7 16 12 23 17 23 7" />
                              <rect x="1" y="5" width="15" height="14" rx="2" />
                            </svg>
                            Videos ({videos.length})
                          </button>
                        </div>
                      )}

                      <div className="vrfm-attachment-grid">
                        {displayedAttachments.map((a) => (
                          <a
                            key={a.attachment_id}
                            className="vrfm-attachment-card"
                            href={a.file_url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {a.file_type?.startsWith("video") ? (
                              <video
                                src={a.file_url}
                                className="vrfm-attachment-media"
                                muted
                                preload="metadata"
                              />
                            ) : (
                              <img
                                src={a.file_url}
                                alt={a.caption || "Evidence"}
                                className="vrfm-attachment-media"
                              />
                            )}
                            <div className="vrfm-attachment-meta">
                              {a.caption && (
                                <div className="vrfm-attachment-caption">
                                  {a.caption}
                                </div>
                              )}
                              <div className="vrfm-attachment-date">
                                {formatUploadedAt(a.uploaded_at)}
                              </div>
                            </div>
                          </a>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* ===== FOOTER ===== */}
        <div className="vrfm-footer">
          <button
            type="button"
            className="vrfm-btn vrfm-btn-secondary"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}