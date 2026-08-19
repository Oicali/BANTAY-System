import { lazy, Suspense } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute";
import PageLayout from "./components/layout/PageLayout.jsx";

// Lazy-loaded views — each becomes its own chunk, only fetched when visited
const LoginSystem = lazy(() => import("./components/views/LoginSystem"));
const ModusManagement = lazy(() => import("./components/views/ModusManagement"));
const CrimeDashboard = lazy(() => import("./components/views/CrimeDashboard"));
const EBlotter = lazy(() => import("./components/views/EBlotter"));
const CaseManagement = lazy(() => import("./components/views/CaseManagement"));
const CrimeMapping = lazy(() => import("./components/views/CrimeMapping"));
const PatrollerDashboard = lazy(() => import("./components/views/PatrolDashboard"));
const PatrollerDashboardView = lazy(() => import("./components/views/PatrollerDashboardView"));
const PatrolScheduling = lazy(() => import("./components/views/PatrolScheduling"));
const UserManagement = lazy(() => import("./components/views/UserManagement"));
const ProfileSettings = lazy(() => import("./components/views/ProfileSettings"));
const BrgyReport = lazy(() => import("./components/views/BrgyReport"));
const VerificationSuccess = lazy(() => import("./components/views/VerificationSucess"));
const AfterPatrol = lazy(() => import("./components/views/AfterPatrol"));
const ResidentManagement = lazy(() => import("./components/views/ResidentManagement"));
const AuditLog = lazy(() => import("./components/views/AuditLog"));

const getRole = () => {
  const raw = localStorage.getItem("token");
  if (!raw) return null;
  try {
    const b64 = raw.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(b64))?.role ?? null;
  } catch {
    return null;
  }
};

const RoleBasedPatrolDashboard = () => {
  const role = getRole();
  return role === "Administrator" || role === "Technical Administrator" ? (
    <PatrolScheduling />
  ) : (
    <PatrollerDashboardView />
  );
};

function App() {
  return (
    <Router>
      <Suspense fallback={<div style={{ padding: "2rem", textAlign: "center" }}>Loading…</div>}>
        <Routes>
          {/* Public */}
          <Route path="/login" element={<LoginSystem />} />
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/verification-success" element={<VerificationSuccess />} />

          {/* Protected Layout */}
          <Route
            element={
              <ProtectedRoute>
                <PageLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/crime-dashboard" element={<CrimeDashboard />} />
            <Route path="/e-blotter" element={<EBlotter />} />
            <Route path="/case-management" element={<CaseManagement />} />
            <Route path="/crime-mapping" element={<CrimeMapping />} />
            <Route path="/patrol-dashboard" element={<PatrollerDashboard />} />
            <Route path="/patrol-scheduling" element={<RoleBasedPatrolDashboard />} />
            <Route path="/after-patrol" element={<AfterPatrol />} />
            <Route path="/user-management" element={<UserManagement />} />
            <Route path="/profile" element={<ProfileSettings />} />
            <Route path="/modus-management" element={<ModusManagement />} />
            <Route path="/brgy-report" element={<BrgyReport />} />
            <Route path="/resident-management" element={<ResidentManagement />} />
            <Route path="/audit-log" element={<AuditLog />} />
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Suspense>
    </Router>
  );
}

export default App;