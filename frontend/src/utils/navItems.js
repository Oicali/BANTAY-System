export const navItems = [
  {
    section: "Main",
    flat: true, // ← new flag: no section header, no indent
    items: [
      { key: "dashboard", label: "Dashboard", path: "/crime-dashboard",
        icon: `<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>` },
      { key: "crime-mapping", label: "Crime Mapping", path: "/crime-mapping",
        icon: `<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><circle cx="11" cy="11" r="3"/>` },
    ],
  },
  {
    section: "Investigation",
    items: [
      { key: "e-blotter", label: "Reporting", path: "/e-blotter",
        icon: `<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>` },
      { key: "case-management", label: "Case Management", path: "/case-management",
        icon: `<path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22,4 12,14.01 9,11.01"/>` },
      { key: "modus-management", label: "Modus Management", path: "/modus-management",
        icon: `<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>` },
    ],
  },
  {
    section: "Operations",
    items: [
      { key: "patrol-dashboard", label: "Patroller Dashboard", path: "/patrol-dashboard",
        icon: `<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>` },
      { key: "patrol-scheduling", label: "Patrol Scheduling", path: "/patrol-scheduling",
        icon: `<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>` },
    ],
  },
  {
    section: "Settings",
    items: [
      { key: "user-management", label: "User Management", path: "/user-management",
        icon: `<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>` },
      { key: "profile-settings", label: "Profile Settings", path: "/profile",
        icon: `<path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>` },
    ],
  },
];