import React, { useState, useEffect } from "react";
import { getUserFromToken } from "../../utils/auth";

const TopBar = ({ onMenuClick }) => {
  const [user, setUser] = useState(null);
  const [profileData, setProfileData] = useState(null);
  const [profilePicture, setProfilePicture] = useState(null);

  const API_URL = import.meta.env.VITE_API_URL;

  useEffect(() => {
    const userData = getUserFromToken();
    setUser(userData);
    fetchProfileData();

    // Refresh instantly when ProfileSettings fires profileUpdated event
    const handleProfileUpdated = () => fetchProfileData();
    window.addEventListener("profileUpdated", handleProfileUpdated);

    return () =>
      window.removeEventListener("profileUpdated", handleProfileUpdated);
  }, []);

  // Refresh when user comes back to the tab
  useEffect(() => {
    const handleFocus = () => fetchProfileData();
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, []);

  const fetchProfileData = async () => {
    try {
      const token = localStorage.getItem("token");

      const response = await fetch(`${API_URL}/users/profile`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();

        if (data.user) {
          setProfileData(data.user);

          if (data.user.profile_picture) {
            setProfilePicture(data.user.profile_picture);
          } else {
            setProfilePicture(null);
          }
        }
      }
    } catch (error) {
      console.error("Error fetching profile data:", error);
    }
  };

  const getInitials = () => {
    if (!profileData) {
      return user?.username ? user.username.substring(0, 2).toUpperCase() : "JI";
    }
    const first = profileData.first_name?.[0] || "";
    const last = profileData.last_name?.[0] || "";
    return (first + last).toUpperCase() || "?";
  };

  const getDisplayName = () => {
    if (!profileData) return user?.username || "User";

    const firstName = profileData.first_name || "";
    const lastName = profileData.last_name || "";

    let displayFirstName =
      firstName.length > 15 ? firstName.substring(0, 9) + "..." : firstName;
    let displayLastName =
      lastName.length > 15 ? lastName.substring(0, 9) + "..." : lastName;

    let fullName = displayFirstName;
    if (displayLastName) fullName += " " + displayLastName;

    return fullName.trim() || user?.username || "User";
  };

  return (
    <header className="top-bar">
      <div
        className="top-bar-left"
        style={{ display: "flex", alignItems: "center", gap: "12px" }}
      >
        {/* Hamburger — only visible on mobile via CSS */}
        <button
          className="hamburger-btn"
          onClick={onMenuClick}
          aria-label="Open menu"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <h2>BANTAY System</h2>
      </div>

      <div className="top-bar-right">
        <div className="user-profile">
          <div className="user-info">
            <div className="user-name">{getDisplayName()}</div>
            <div className="user-role">
              {profileData?.role || user?.role || "User Role"}
            </div>
          </div>

          <div className="user-avatar">
            {profilePicture ? (
              <img
                src={profilePicture}
                alt="Profile"
                style={{
                  width: "100%",
                  height: "100%",
                  borderRadius: "50%",
                  objectFit: "cover",
                }}
              />
            ) : (
              getInitials()
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default TopBar;