import React, { useState, useEffect, useCallback } from "react";
import { logout, getUserFromToken } from "../../utils/auth";
import AddUserModal from "../modals/AddUserModal";
import EditUserModal from "../modals/EditUserModal";
import DeleteUserModal from "../modals/DeleteUserModal";
import RestoreUserModal from "../modals/RestoreUserModal";
import "./UserManagement.css";
import LoadingModal from "../modals/LoadingModal";

const ITEMS_PER_PAGE = 15;
const PSGC_BASE = "https://psgc.gitlab.io/api";
const API_URL = import.meta.env.VITE_API_URL;

const BACOOR_CITY_CODE = "042103000";

const STATUS_PARAM_MAP = {
  Default: null,
  Active: "active",
  Unverified: "unverified",
  Locked: "locked",
  Deactivated: "deactivated",
};

// =====================================================
// ICON COMPONENTS
// =====================================================
const EditIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);

const DeleteIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6M14 11v6" />
    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
  </svg>
);

const RestoreIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="1 4 1 10 7 10" />
    <path d="M3.51 15a9 9 0 1 0 .49-3.24" />
  </svg>
);

// =====================================================
// MAIN COMPONENT
// =====================================================
const UserManagement = () => {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isRestoreModalOpen, setIsRestoreModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [user, setUser] = useState(null);

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    limit: ITEMS_PER_PAGE,
    totalPages: 1,
  });

  const [policeRoles, setPoliceRoles] = useState([]);
  const [allBarangays, setAllBarangays] = useState([]);
  const [barangaysLoading, setBarangaysLoading] = useState(false);
  const [barangayNameMap, setBarangayNameMap] = useState({});

  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("Default");
  const [barangayFilter, setBarangayFilter] = useState("all");
  const [activeTab, setActiveTab] = useState("police");
  const [currentPage, setCurrentPage] = useState(1);

  // ===================================================
  // HELPER: resolve barangay name from map
  // ===================================================
  const getBarangayName = (code) => {
    if (!code) return "N/A";
    return barangayNameMap[code] || code;
  };

  // ===================================================
  // FETCH ALL BACOOR BARANGAYS FROM PSGC
  // ===================================================
  const fetchAllBacoorBarangays = useCallback(async () => {
    try {
      setBarangaysLoading(true);
      const res = await fetch(
        `${PSGC_BASE}/cities/${BACOOR_CITY_CODE}/barangays/`,
      );
      if (!res.ok) throw new Error(`PSGC returned ${res.status}`);
      const data = await res.json();

      const sorted = data
        .map((b) => ({ code: b.code, name: b.name }))
        .sort((a, b) => a.name.localeCompare(b.name));

      setAllBarangays(sorted);

      const nameMap = {};
      sorted.forEach(({ code, name }) => {
        nameMap[code] = name;
      });
      setBarangayNameMap(nameMap);
    } catch (err) {
      console.error("Failed to load Bacoor barangays from PSGC:", err);
      setAllBarangays([]);
    } finally {
      setBarangaysLoading(false);
    }
  }, []);

  // ===================================================
  // FETCH FILTER OPTIONS
  // ===================================================
  const fetchFilterOptions = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/user-management/filter-options`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setPoliceRoles(data.roles || []);
      }
    } catch (err) {
      console.error("Error fetching filter options:", err);
    }
  };

  // ===================================================
  // ON MOUNT
  // ===================================================
  useEffect(() => {
    const userData = getUserFromToken();
    setUser(userData);
    fetchFilterOptions();
    fetchAllBacoorBarangays();
  }, []);

  // ===================================================
  // FETCH USERS
  // ===================================================
  const fetchUsers = useCallback(
    async (page = 1) => {
      try {
        setLoading(true);
        const token = localStorage.getItem("token");

        const params = new URLSearchParams();
        params.set("userType", activeTab === "police" ? "police" : "barangay");
        params.set("page", page);
        params.set("limit", ITEMS_PER_PAGE);

        const statusParam = STATUS_PARAM_MAP[statusFilter];
        if (statusParam) params.set("status", statusParam);

        if (searchTerm.trim()) params.set("search", searchTerm.trim());

        if (activeTab === "police" && roleFilter !== "all") {
          params.set("role", roleFilter);
        }
        if (activeTab === "barangay" && barangayFilter !== "all") {
          params.set("barangayCode", barangayFilter);
        }

        const res = await fetch(
          `${API_URL}/user-management/users?${params.toString()}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          },
        );

        if (res.ok) {
          const data = await res.json();
          setUsers(data.users || []);
          setPagination(
            data.pagination || {
              total: 0,
              page: 1,
              limit: ITEMS_PER_PAGE,
              totalPages: 1,
            },
          );
          setError("");
        } else {
          setError("Failed to fetch users");
        }
      } catch (err) {
        console.error("Error fetching users:", err);
        setError("Error connecting to server");
      } finally {
        setLoading(false);
      }
    },
    [activeTab, statusFilter, searchTerm, roleFilter, barangayFilter],
  );

  // ===================================================
  // TAB SWITCH
  // ===================================================
  const handleTabSwitch = (tab) => {
    if (tab === activeTab) return;
    setUsers([]);
    setLoading(true);
    setError("");
    setPagination({ total: 0, page: 1, limit: ITEMS_PER_PAGE, totalPages: 1 });
    setCurrentPage(1);
    setSearchTerm("");
    setRoleFilter("all");
    setBarangayFilter("all");
    setStatusFilter("Default");
    setActiveTab(tab);
  };

  useEffect(() => {
    setCurrentPage(1);
    fetchUsers(1);
  }, [activeTab, statusFilter, roleFilter, barangayFilter]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setCurrentPage(1);
      fetchUsers(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    if (successMessage) {
      const t = setTimeout(() => setSuccessMessage(""), 5000);
      return () => clearTimeout(t);
    }
  }, [successMessage]);

  useEffect(() => {
    if (errorMessage) {
      const t = setTimeout(() => setErrorMessage(""), 5000);
      return () => clearTimeout(t);
    }
  }, [errorMessage]);

  // ===================================================
  // HANDLERS
  // ===================================================
  const handleUserAdded = (message) => {
    setSuccessMessage(message || "User added successfully!");
    fetchUsers(currentPage);
  };

  const handleUserUpdated = () => {
    setSuccessMessage("User updated successfully!");
    fetchUsers(currentPage);
  };

  const handleUserDeleted = (message) => {
    setSuccessMessage(message || "User deactivated successfully!");
    fetchUsers(currentPage);
  };

  const handleUserRestored = (message) => {
    setSuccessMessage(message || "User restored successfully!");
    fetchUsers(currentPage);
  };

  const handleEditUser = (userData) => {
    if (isCurrentUser(userData)) {
      setErrorMessage("You cannot edit your own account from this interface.");
      return;
    }
    setSelectedUser(userData);
    setIsEditModalOpen(true);
  };

  const handleDeleteUser = (userData) => {
    if (isCurrentUser(userData)) {
      setErrorMessage("You cannot delete your own account.");
      return;
    }
    setSelectedUser(userData);
    setIsDeleteModalOpen(true);
  };

  const handleRestoreUser = (userData) => {
    if (isCurrentUser(userData)) {
      setErrorMessage("You cannot restore your own account.");
      return;
    }
    setSelectedUser(userData);
    setIsRestoreModalOpen(true);
  };

  const handlePageChange = (page) => {
    setCurrentPage(page);
    fetchUsers(page);
  };

  // ===================================================
  // HELPERS
  // ===================================================
  const isCurrentUser = (userData) => user && userData.user_id === user.user_id;

  const formatDate = (dateString) => {
    if (!dateString) return "Never";
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getInitials = (firstName, lastName, username) => {
    if (firstName && lastName)
      return `${firstName[0]}${lastName[0]}`.toUpperCase();
    if (username) return username.substring(0, 2).toUpperCase();
    return "NA";
  };

  const formatDisplayName = (
    firstName,
    middleName,
    lastName,
    suffix,
    username,
  ) => {
    if (firstName && lastName) {
      const parts = [firstName, middleName, lastName, suffix].filter(Boolean);
      const fullName = parts.join(" ");
      if (fullName.length > 25) {
        return fullName.substring(0, 22) + "...";
      }
      return fullName;
    }
    return username;
  };

  const getRoleBadgeClass = (role) => {
    if (!role) return "um-role-default";
    const r = role.toLowerCase();
    if (r.includes("administrator")) return "um-role-admin";
    if (r.includes("investigator")) return "um-role-investigator";
    if (r.includes("patrol")) return "um-role-patrol";
    if (r.includes("barangay")) return "um-role-chairman";
    return "um-role-default";
  };

  const getStatusText = (userData) => {
    switch (userData.status) {
      case "deactivated":
        return "Deactivated";
      case "locked":
        return "Locked";
      case "unverified":
        return "Unverified";
      default:
        return "Active";
    }
  };

  const getStatusBadgeClass = (userData) => {
    switch (userData.status) {
      case "deactivated":
        return "um-status-inactive";
      case "locked":
        return "um-status-locked";
      case "unverified":
        return "um-status-unverified";
      default:
        return "um-status-active";
    }
  };

  const isUserDeactivated = (u) => u.status === "deactivated";

  const getSortedUsers = () => {
    if (activeTab !== "barangay") return users;
    return [...users].sort((a, b) => {
      const nameA =
        barangayNameMap[a.assigned_barangay_code] ||
        a.assigned_barangay_code ||
        "";
      const nameB =
        barangayNameMap[b.assigned_barangay_code] ||
        b.assigned_barangay_code ||
        "";
      return nameA.localeCompare(nameB);
    });
  };

  // ===================================================
  // RENDER
  // ===================================================
  return (
    <div className="um-content-area">
      <div className="um-page-header">
        <div className="um-page-header-left">
          <h1>User Management</h1>
          <p>Manage system users and permissions</p>
        </div>
        <button
          className="um-btn um-btn-primary"
          onClick={() => setIsAddModalOpen(true)}
        >
          + Add New User
        </button>
      </div>

      {/* Tab Navigation */}
      <div className="um-tabs">
        <button
          className={`um-tab ${activeTab === "police" ? "um-tab-active" : ""}`}
          onClick={() => handleTabSwitch("police")}
        >
          Police Users
        </button>
        <button
          className={`um-tab ${activeTab === "barangay" ? "um-tab-active" : ""}`}
          onClick={() => handleTabSwitch("barangay")}
        >
          Barangay Users
        </button>
      </div>

      {/* Filter Bar */}
      <div className="um-filter-bar">
        {/* Search */}
        <div className="um-filter-group">
          <label className="um-filter-label">Search</label>
          <input
            type="text"
            className="um-filter-input"
            placeholder="Name, username, or email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* Role filter — police tab only */}
        {activeTab === "police" && (
          <div className="um-filter-group">
            <label className="um-filter-label">Role</label>
            <select
              className="um-filter-input"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
            >
              <option value="all">All Roles</option>
              {policeRoles.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Barangay filter */}
        {activeTab === "barangay" && (
          <div className="um-filter-group">
            <label className="um-filter-label">Barangay</label>
            <select
              className="um-filter-input"
              value={barangayFilter}
              onChange={(e) => setBarangayFilter(e.target.value)}
              disabled={barangaysLoading}
            >
              <option value="all">
                {barangaysLoading ? "Loading barangays..." : "All Barangays"}
              </option>
              {allBarangays.map(({ code, name }) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Status filter */}
        <div className="um-filter-group">
          <label className="um-filter-label">Status</label>
          <select
            className={`um-filter-input${statusFilter === "Default" ? " um-status-placeholder" : ""}`}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={statusFilter === "Default" ? { color: "#adb5bd" } : {}}
          >
            <option value="Default" style={{ color: "#adb5bd" }}>
              Select Status
            </option>
            <option value="Active">Active</option>
            <option value="Unverified">Unverified</option>
            <option value="Locked">Locked</option>
            <option value="Deactivated">Deactivated</option>
          </select>
        </div>
      </div>

      {/* Users Table */}
      <div className="um-table-card">
        {error && <div className="um-error-message">{error}</div>}

        {loading ? (
          <LoadingModal isOpen={true} message={"Loading users..."} />
        ) : (
          <>
            <div className="um-table-container">
              <table
                className={`um-data-table ${activeTab === "barangay" ? "um-table-barangay" : "um-table-police"}`}
              >
                <thead>
                  <tr>
                    <th>User</th>
                    <th className="um-col-role">Role</th>
                    {activeTab === "barangay" && (
                      <th className="um-col-barangay">Barangay</th>
                    )}
                    <th className="um-col-status">Status</th>
                    <th className="um-col-last-login">Last Login</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {getSortedUsers().length === 0 ? (
                    <tr>
                      <td
                        colSpan={activeTab === "barangay" ? 6 : 5}
                        style={{ textAlign: "center", padding: "40px" }}
                      >
                        No {activeTab === "police" ? "Police" : "Barangay"}{" "}
                        users found matching your filters.
                      </td>
                    </tr>
                  ) : (
                    getSortedUsers().map((userData) => (
                      <tr key={userData.user_id}>
                        {/* User cell */}
                        <td>
                          <div className="um-user-cell">
                            <div className="um-user-cell-avatar">
                              {userData.profile_picture ? (
                                <img
                                  src={userData.profile_picture}
                                  alt="Profile"
                                  style={{
                                    width: "100%",
                                    height: "100%",
                                    borderRadius: "50%",
                                    objectFit: "cover",
                                  }}
                                />
                              ) : (
                                getInitials(
                                  userData.first_name,
                                  userData.last_name,
                                  userData.username,
                                )
                              )}
                            </div>
                            <div className="um-user-cell-info">
                              <div className="um-user-cell-name">
                                {formatDisplayName(
                                  userData.first_name,
                                  userData.middle_name,
                                  userData.last_name,
                                  userData.suffix,
                                  userData.username,
                                )}
                                {isCurrentUser(userData) && (
                                  <span className="um-you-badge">( YOU )</span>
                                )}
                              </div>
                              <div className="um-user-cell-email">
                                {userData.email}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Role */}
                        <td className="um-col-role">
                          <span
                            className={`um-role-badge ${getRoleBadgeClass(userData.role)}`}
                          >
                            {userData.role || "N/A"}
                          </span>
                        </td>

                        {/* Barangay column */}
                        {activeTab === "barangay" && (
                          <td className="um-col-barangay">
                            {getBarangayName(userData.assigned_barangay_code)}
                          </td>
                        )}

                        {/* Status */}
                        <td className="um-col-status">
                          <span
                            className={`um-status-badge ${getStatusBadgeClass(userData)}`}
                          >
                            {getStatusText(userData)}
                          </span>
                        </td>

                        {/* Last login */}
                        <td className="um-col-last-login">
                          {formatDate(userData.last_login)}
                        </td>

                        {/* Actions */}
                        <td>
                          <div className="um-action-links">
                            {/* EDIT */}
                            <button
                              onClick={() => handleEditUser(userData)}
                              className={`um-action-btn um-action-btn-edit${isCurrentUser(userData) ? " um-action-disabled" : ""}`}
                              disabled={isCurrentUser(userData)}
                              title={
                                isCurrentUser(userData)
                                  ? "You cannot edit your own account"
                                  : "Edit user"
                              }
                            >
                              <EditIcon />
                              Edit
                            </button>

                            {/* RESTORE or DELETE */}
                            {isUserDeactivated(userData) ? (
                              <button
                                onClick={() => handleRestoreUser(userData)}
                                className={`um-action-btn um-action-btn-success${isCurrentUser(userData) ? " um-action-disabled" : ""}`}
                                disabled={isCurrentUser(userData)}
                                title="Restore user"
                              >
                                <RestoreIcon />
                                Restore
                              </button>
                            ) : (
                              <button
                                onClick={() => handleDeleteUser(userData)}
                                className={`um-action-btn um-action-btn-danger${isCurrentUser(userData) ? " um-action-disabled" : ""}`}
                                disabled={isCurrentUser(userData)}
                                title="Deactivate user"
                              >
                                <DeleteIcon />
                                Delete
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pagination.total > 0 && (
              <div className="um-pagination">
                <div className="um-pagination-info">
                  Showing {(pagination.page - 1) * pagination.limit + 1}–
                  {Math.min(
                    pagination.page * pagination.limit,
                    pagination.total,
                  )}{" "}
                  of {pagination.total} users
                </div>
                <div className="um-pagination-controls">
                  <button
                    className="um-pagination-btn"
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                  >
                    Previous
                  </button>
                  <span className="um-pagination-current">
                    Page {currentPage} of {pagination.totalPages}
                  </span>
                  <button
                    className="um-pagination-btn"
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === pagination.totalPages}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* MODALS */}
      <AddUserModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onUserAdded={handleUserAdded}
      />
      <EditUserModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        user={selectedUser}
        onUserUpdated={handleUserUpdated}
      />
      <DeleteUserModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        user={selectedUser}
        onUserDeleted={handleUserDeleted}
      />
      <RestoreUserModal
        isOpen={isRestoreModalOpen}
        onClose={() => setIsRestoreModalOpen(false)}
        user={selectedUser}
        onUserRestored={handleUserRestored}
      />

      {/* SUCCESS TOAST */}
      {successMessage && (
        <div className="um-toast um-toast-success">
          <div className="um-toast-content">
            <svg
              className="um-toast-icon"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
            <span>{successMessage}</span>
          </div>
        </div>
      )}

      {/* ERROR TOAST */}
      {errorMessage && (
        <div className="um-toast um-toast-error">
          <div className="um-toast-content">
            <svg
              className="um-toast-icon"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                clipRule="evenodd"
              />
            </svg>
            <span>{errorMessage}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagement;
