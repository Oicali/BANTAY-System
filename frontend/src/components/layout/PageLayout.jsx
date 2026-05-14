// frontend\src\components\layout\PageLayout.jsx
import { useState } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import TopBar from "./Topbar";
import { navItems } from "../../utils/navItems";
import "./PageLayout.css";

const API_URL = import.meta.env.VITE_API_URL;

export default function PageLayout() {
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

  const handleLogout = async () => {
    const token = localStorage.getItem("token");

    try {
      await fetch(`${API_URL}/auth/logout`, {
        method:  "POST",
        headers: {
          Authorization:  `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
    } catch (err) {
      // Server unreachable — still log the user out on the client side
      console.error("Logout API error:", err);
    } finally {
      localStorage.clear();
      window.location.href = "/";
    }
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