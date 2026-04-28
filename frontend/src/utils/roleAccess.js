// =====================================================
// ROLE-BASED ACCESS CONTROL
// =====================================================
// Defines which pages each role can access
// Maps role_name from database to allowed page keys

export const roleAccess = {
  // ============================================
  // POLICE ROLES
  // ============================================
  
  Administrator: [
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
    "profile-settings",
  ],

  Investigator: [
    "dashboard",
    "crime-analytics",
    "e-blotter",
    "case-management",
    "crime-mapping",
    "profile-settings",
  ],

  Patrol: [
    "dashboard",
    "crime-mapping",
    "patrol-dashboard",
    "patrol-scheduling",
    "profile-settings",
    "after-patrol"
  ],

  // ============================================
  // BARANGAY ROLES
  // ============================================
  
  Barangay: [
  "dashboard",
  "crime-mapping",
  "brgy-report",
  "profile-settings",
],
};