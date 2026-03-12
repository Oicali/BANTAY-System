export const navItems = [
  {
    section: "Main",
    items: [
      { key: "dashboard", label: "Dashboard", path: "/crime-dashboard" },
      { key: "crime-mapping", label: "Crime Mapping", path: "/crime-mapping" },
    ],
  },
    {
  section: "Investigation",
  items: [
    // { key: "crime-analytics", label: "Crime Analytics", path: "/crime-analytics" },
    { key: "e-blotter", label: "Reporting", path: "/e-blotter" },
    { key: "case-management", label: "Case Management", path: "/case-management" },
    { key: "modus-management", label: "Modus Management", path: "/modus-management" },
    
  ],
},
  {
  section: "Operations",
  items: [
    { key: "patrol-dashboard", label: "Patroller Dashboard", path: "/patrol-dashboard" }, // Changed key
    { key: "patrol-scheduling", label: "Patrol Scheduling", path: "/patrol-scheduling" },
  ],
},
  {
    section: "Settings",
    items: [
      { key: "user-management", label: "User Management", path: "/user-management" },
      { key: "profile-settings", label: "Profile Settings", path: "/profile" },
    ],
  },
];
