import { useState } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import TopBar from "./Topbar";
import { navItems } from "../../utils/navItems";
import "./DashboardLayout.css";

export default function DashboardLayout() {
  // ✅ STATE LIVES HERE (PERSISTENT ACROSS VIEW CHANGES)
  const [openSections, setOpenSections] = useState(
    navItems.reduce((acc, group) => {
      acc[group.section] = true; // all open by default
      return acc;
    }, {})
  );

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
      {/* SIDEBAR - Persistent, never unmounts */}
      <Sidebar
        openSections={openSections}
        toggleSection={toggleSection}
        handleLogout={handleLogout}
      />

      {/* MAIN CONTENT AREA */}
      <div className="main-content">
        {/* TOP BAR - Persistent, never unmounts, query runs once */}
        <TopBar />

        {/* CONTENT AREA - This is where views change */}
        <div className="content-wrapper">
          <Outlet /> {/* Dashboard, EBlotter, etc render here */}
        </div>
      </div>
    </div>
  );
}