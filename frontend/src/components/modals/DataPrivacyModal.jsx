import React, { useEffect } from "react";
import { X, ShieldCheck } from "lucide-react";
import "./DataPrivacyModal.css";

// ── Content lives here as data, not JSX, so updating the statement later
// (e.g. once a real client fills in the bracketed fields) doesn't require
// touching component logic — just this array. ─────────────────────────────
const PRIVACY_SECTIONS = [
  {
    title: "1. Introduction",
    body: (
      <>
        <p>
          The <strong>Bantay System</strong>, operated by{" "}
          <strong>PNP Bacoor</strong>, is committed to protecting your
          personal information and your privacy. This Data Privacy Statement
          explains how we collect, use, process, share, and protect personal
          data through the Bantay System web portal and mobile application,
          in compliance with the Philippine Data Privacy Act of 2012
          (Republic Act No. 10173).
        </p>
        <p>
          <strong>This system is not open to public sign-up.</strong>{" "}
          Accounts are created and assigned by PNP Bacoor administrators for
          authorized personnel only (police officers, investigators, patrol
          officers, barangay staff). By logging into and using the Bantay
          System, you consent to the data practices described in this
          statement.
        </p>
      </>
    ),
  },
  {
    title: "2. What Personal Data We Collect",
    body: (
      <>
        <p>
          <strong>If you are a system user</strong> (officer, investigator,
          patrol, administrator, barangay staff), we collect:
        </p>
        <ul>
          <li>Name, username, email, phone number, date of birth, gender</li>
          <li>Profile picture</li>
          <li>Role, rank, and assigned barangay/unit</li>
          <li>Login activity, IP address, and account status</li>
        </ul>
        <p>
          <strong>If you are a patrol officer</strong>, additionally:
        </p>
        <ul>
          <li>Real-time GPS location while on duty</li>
          <li>Patrol schedules and after-patrol report content</li>
        </ul>
        <p>
          <strong>If your information appears in a crime report</strong> (as
          a complainant, victim, witness, or suspect), entered by authorized
          personnel — not by you directly:
        </p>
        <ul>
          <li>Full name, contact details, address, demographic information</li>
          <li>Narrative description of the incident</li>
          <li>
            Where relevant to a suspect record: physical description and, if
            applicable, information regarding substance use
          </li>
        </ul>
        <p>
          <strong>If you are a registered barangay resident</strong>, entered
          by barangay staff:
        </p>
        <ul>
          <li>
            Full name, date of birth, gender, civil status, voter status,
            address, contact number
          </li>
        </ul>
      </>
    ),
  },
  {
    title: "3. How We Collect Your Data",
    body: (
      <ul>
        <li>An administrator creates your user account</li>
        <li>You log in and use the system</li>
        <li>You or another officer file a crime report or barangay referral</li>
        <li>A patrol officer's device reports GPS location while on duty</li>
        <li>Barangay staff register or import resident records</li>
        <li>You submit an after-patrol report or upload related photos</li>
      </ul>
    ),
  },
  {
    title: "4. Why We Collect and Process Your Data",
    body: (
      <ul>
        <li>
          <strong>Case Management:</strong> To record, investigate, and track
          crime reports and cases.
        </li>
        <li>
          <strong>Patrol Operations:</strong> To schedule, deploy, and
          monitor patrol officers and mobile units, and to document
          after-patrol activity.
        </li>
        <li>
          <strong>Crime Mapping and Analysis:</strong> To identify crime
          patterns and incidence levels across barangays for resource
          planning.
        </li>
        <li>
          <strong>Barangay Administration:</strong> To maintain resident
          records for local governance functions.
        </li>
        <li>
          <strong>Security and Accountability:</strong> To verify user
          identity, secure accounts, and maintain audit logs of system
          activity.
        </li>
      </ul>
    ),
  },
  {
    title: "5. Data Sharing and Disclosure",
    body: (
      <>
        <p>
          We do not sell, trade, or rent personal data. We only share or
          disclose it:
        </p>
        <ul>
          <li>
            <strong>Within PNP Bacoor:</strong> With authorized personnel on
            a need-to-know basis, according to their role.
          </li>
          <li>
            <strong>Legal Compliance:</strong> When required by law, a court
            order, or lawful request from government authorities (e.g. NPC,
            DOJ).
          </li>
          <li>
            <strong>Service Providers:</strong> Cloudinary (photo storage),
            Firebase/Google (push notifications), Cloudflare (automated
            crime-type classification), and OpenStreetMap (location lookup)
            — solely to provide their specific function.
          </li>
        </ul>
      </>
    ),
  },
  {
    title: "6. Data Retention and Disposal",
    body: (
      <ul>
        <li>
          Crime reports, case records, and audit logs are retained per PNP
          Bacoor records policy.
        </li>
        <li>
          Deleted records are soft-deleted (marked inactive, recoverable by
          administrators) before permanent removal.
        </li>
        <li>
          GPS location history is retained for a limited period and used
          only for patrol monitoring purposes.
        </li>
      </ul>
    ),
  },
  {
    title: "7. Data Security",
    body: (
      <ul>
        <li>Encrypted login (HTTPS) and hashed password storage</li>
        <li>
          Role-based access controls limiting data visibility to authorized
          personnel only
        </li>
        <li>Account lockout after repeated failed login attempts</li>
        <li>Full audit logging of system actions (who, what, when, from where)</li>
      </ul>
    ),
  },
  {
    title: "8. Rights of the Data Subject",
    body: (
      <>
        <ul>
          <li>
            <strong>Be Informed:</strong> Know whether your personal data is
            being processed.
          </li>
          <li>
            <strong>Access:</strong> Request a copy of the personal data we
            hold about you.
          </li>
          <li>
            <strong>Correct:</strong> Request correction of inaccurate
            personal data.
          </li>
          <li>
            <strong>Object:</strong> Object to certain processing, where
            applicable.
          </li>
          <li>
            <strong>Request Deletion:</strong> Subject to legal retention
            requirements — active case records cannot be deleted on request
            while a case is open.
          </li>
        </ul>
        <p>
          If your data appears in the system as a complainant, witness, or
          resident (not as a logged-in user), you may exercise these rights
          by contacting PNP Bacoor directly using the details below.
        </p>
      </>
    ),
  },
  {
    title: "9. Contact Us",
    body: (
      <>
        <p>
          <strong>PNP Bacoor — Records &amp; IT Office</strong>
          <br />
          Bacoor City Police Station, Bacoor City, Cavite
          <br />
          Office Hours: Monday to Friday, 8:00 AM – 5:00 PM
        </p>
      </>
    ),
  },
];

/**
 * DataPrivacyModal
 * Read-only privacy statement, opened via a link (e.g. from the login
 * screen's Security Notice). No acceptance/checkbox — this system is not
 * yet in official use, so there is no binding consent to capture.
 * When the system goes live for a real client, wrap this content in a
 * required-acknowledgment flow instead (see internal handling policy).
 */
const DataPrivacyModal = ({ isOpen, onClose }) => {
  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Lock background scroll while modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="dpm-overlay" onClick={onClose} role="presentation">
      <div
        className="dpm-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dpm-title"
      >
        <div className="dpm-header">
          <div className="dpm-header-text">
            <ShieldCheck size={22} className="dpm-header-icon" />
            <div>
              <h2 id="dpm-title" className="dpm-title">
                Data Privacy Statement
              </h2>
              <p className="dpm-subtitle">
                Please read our data privacy statement.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="dpm-close"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <div className="dpm-body">
          {PRIVACY_SECTIONS.map((section) => (
            <section key={section.title} className="dpm-section">
              <h3>{section.title}</h3>
              {section.body}
            </section>
          ))}

          {/* <p className="dpm-note">
            This statement reflects current testing configuration and is not
            yet in official use. Retention periods and contact details will
            be finalized before official deployment.
          </p> */}
        </div>

        <div className="dpm-footer">
          <button type="button" className="dpm-btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default DataPrivacyModal;