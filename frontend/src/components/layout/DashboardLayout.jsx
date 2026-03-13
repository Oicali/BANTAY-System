import { useState } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import TopBar from "./Topbar";
import { navItems } from "../../utils/navItems";
import "./DashboardLayout.css";

export default function DashboardLayout() {
  const [openSections, setOpenSections] = useState(
    navItems.reduce((acc, group) => {
      acc[group.section] = true;
      return acc;
    }, {})
  );
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const toggleSection = (section) => {
    setOpenSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const handleLogout = () => {
    localStorage.clear();
    window.location.href = "/";
  };

  return (
    <div className="dashboard-container">
      {/* Mobile overlay — click outside to close sidebar */}
      {sidebarOpen && (
        <div
          className="sidebar-overlay"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* SIDEBAR - Persistent, never unmounts */}
      <Sidebar
        openSections={openSections}
        toggleSection={toggleSection}
        handleLogout={handleLogout}
        sidebarOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* MAIN CONTENT AREA */}
      <div className="main-content">
        {/* TOP BAR */}
        <TopBar onMenuClick={() => setSidebarOpen(true)} />

        {/* CONTENT AREA - This is where views change */}
        <div className="content-wrapper">
          <Outlet />
        </div>
      </div>
    </div>
  );
}