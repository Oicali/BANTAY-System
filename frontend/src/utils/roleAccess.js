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
  ],

  // ============================================
  // BARANGAY ROLES
  // ============================================
  
  BarangayAdmin: [
    "dashboard",           // Can create blotter entries
    "crime-mapping",          // View crimes in their barangay
    //"barangay-reports",       // View barangay-specific reports
    // "user-management",        // Manage barangay users
    "profile-settings",
  ],

  BarangayUser: [
    "dashboard",            // Can create blotter entries
    "crime-mapping",          // View crimes in their barangay
    //"barangay-reports",       // View barangay reports
    "profile-settings",
  ],
};