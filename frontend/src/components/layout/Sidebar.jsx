import { useState } from "react";
import { NavLink } from "react-router-dom";
import { navItems } from "../../utils/navItems";
import { roleAccess } from "../../utils/roleAccess";

export default function Sidebar({ openSections, toggleSection, handleLogout, sidebarOpen, onClose }) {
  const role = localStorage.getItem("role");
  const allowedTabs = roleAccess[role] || [];
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  return (
    <>
      <aside className={`sidebar ${sidebarOpen ? "sidebar-mobile-open" : ""}`}>
        {/* HEADER */}
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <img
              src="/images/pnp.png"
              alt="PNP Logo"
              className="logo-icon"
              style={{
                width: "48px",
                height: "48px",
                objectFit: "contain",
              }}
            />
            <div className="logo-text">
              <h1>BANTAY</h1>
              <p>PNP Bacoor</p>
            </div>
          </div>
        </div>

        {/* NAV */}
        <nav className="sidebar-nav">
          {navItems.map((group) => {
            const visibleItems = group.items.filter((item) =>
              allowedTabs.includes(item.key)
            );

            if (visibleItems.length === 0) return null;

            // Flat items — no section header, no indent, no toggle
            if (group.flat) {
              return visibleItems.map((item) => (
                <NavLink
                  key={item.key}
                  to={item.path}
                  onClick={onClose}
                  className={({ isActive }) =>
                    `nav-item nav-flat ${isActive ? "active" : ""}`
                  }
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    dangerouslySetInnerHTML={{ __html: item.icon }}
                  />
                  {item.label}
                </NavLink>
              ));
            }

            // Sectioned items
            const isOpen = openSections[group.section];

            return (
              <div key={group.section} className="nav-section">
                {/* SECTION LABEL */}
                <div
                  className="nav-section-title nav-section-toggle"
                  onClick={() => toggleSection(group.section)}
                >
                  <span>{group.section}</span>
                  <span className="arrow">{isOpen ? "▼" : "▶"}</span>
                </div>

                {/* ITEMS */}
                {isOpen &&
                  visibleItems.map((item) => (
                    <NavLink
                      key={item.key}
                      to={item.path}
                      onClick={onClose}
                      className={({ isActive }) =>
                        `nav-item sub-item ${isActive ? "active" : ""}`
                      }
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        dangerouslySetInnerHTML={{ __html: item.icon }}
                      />
                      {item.label}
                    </NavLink>
                  ))}
              </div>
            );
          })}

          {/* LOGOUT */}
          <button
            onClick={() => setShowLogoutModal(true)}
            className="nav-item logout-btn"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              style={{ width: "14px", height: "14px", flexShrink: 0, opacity: 0.7 }}
            >
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
              <polyline points="16,17 21,12 16,7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Logout
          </button>
        </nav>
      </aside>

      {/* Logout Confirmation Modal */}
      {showLogoutModal && (
        <div
          className="eb-modal"
          style={{
            zIndex: 10001,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            className="eb-modal-content"
            style={{ maxWidth: "400px", padding: "0" }}
          >
            <div style={{ padding: "24px", borderBottom: "1px solid #e5e7eb" }}>
              <h3
                style={{
                  margin: 0,
                  fontSize: "18px",
                  fontWeight: 600,
                  color: "#111827",
                }}
              >
                Confirm Logout
              </h3>
            </div>
            <div style={{ padding: "24px" }}>
              <p
                style={{
                  margin: 0,
                  fontSize: "14px",
                  color: "#6b7280",
                  lineHeight: "1.5",
                }}
              >
                Are you sure you want to logout?
              </p>
            </div>
            <div
              style={{
                padding: "16px 24px",
                borderTop: "1px solid #e5e7eb",
                display: "flex",
                gap: "12px",
                justifyContent: "flex-end",
              }}
            >
              <button
                className="eb-btn eb-btn-secondary"
                onClick={() => setShowLogoutModal(false)}
                style={{ minWidth: "80px" }}
              >
                Cancel
              </button>
              <button
                className="eb-btn eb-btn-primary"
                onClick={() => {
                  setShowLogoutModal(false);
                  handleLogout();
                }}
                style={{ minWidth: "80px", background: "#dc2626" }}
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}