// =====================================================
// ROLE-BASED ACCESS CONTROL
// =====================================================
// Defines which pages each role can access
// Maps role_name from database to allowed page keys

export const roleAccess = {
  // ============================================
  // POLICE ROLES
  // ============================================

  "Technical Administrator": [
    "dashboard",
    "crime-analytics",
    "e-blotter",
    "case-management",
    "modus-management",
    "crime-mapping",
    "patrol-dashboard",
    "patrol-scheduling",
    "after-patrol",
    "user-management",
    "audit-log",
    "profile-settings",
  ],
  
  "Administrator": [
    "dashboard",
    "crime-analytics",
    "e-blotter",
    "case-management",
    "modus-management",
    "crime-mapping",
    "patrol-dashboard",
    "patrol-scheduling",
    "after-patrol",
    "audit-log",
    "profile-settings",
  ],

  "Investigator": [
    "dashboard",
    "crime-analytics",
    "e-blotter",
    "case-management",
    "modus-management",
    "crime-mapping",
    "audit-log",
    "profile-settings",
  ],

  "Patrol": [
    "dashboard",
    "crime-mapping",
    "e-blotter",
    "patrol-scheduling",
    "profile-settings",
    "audit-log",
    "after-patrol"
  ],

  // ============================================
  // BARANGAY ROLES
  // ============================================
  
  "Brgy. Councilor": ["dashboard", "crime-mapping", "brgy-report", "resident-management", "audit-log", "profile-settings"],
  "Brgy. Tanod": ["dashboard", "crime-mapping", "brgy-report", "resident-management", "audit-log", "profile-settings"],
};