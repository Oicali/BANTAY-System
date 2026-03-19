import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import LoginSystem from "./components/views/LoginSystem";
import ModusManagement from "./components/views/ModusManagement";
import CrimeDashboard from "./components/views/CrimeDashboard";
import EBlotter from "./components/views/EBlotter";
import CaseManagement from "./components/views/CaseManagement";
import CrimeMapping from "./components/views/CrimeMapping";
import PatrolDashboard from "./components/views/PatrolDashboard";
import PatrolScheduling from "./components/views/PatrolScheduling";
import UserManagement from "./components/views/UserManagement";
import ProfileSettings from "./components/views/ProfileSettings";

import VerificationSuccess from "./components/views/VerificationSucess";

import ProtectedRoute from "./components/ProtectedRoute";
import DashboardLayout from "./components/layout/DashboardLayout";



function App() {
  return (
    <Router>
      <Routes>
        {/* Public */}
        <Route path="/login" element={<LoginSystem />} />
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/verification-success" element={<VerificationSuccess />} />
        {/* Protected Layout */}
        <Route
          element={
            <ProtectedRoute>
              <DashboardLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/crime-dashboard" element={<CrimeDashboard />} />
          <Route path="/e-blotter" element={<EBlotter />} />
          <Route path="/case-management" element={<CaseManagement />} />
          <Route path="/crime-mapping" element={<CrimeMapping />} />
          <Route path="/patrol-dashboard" element={<PatrolDashboard />} />
          <Route path="/patrol-scheduling" element={<PatrolScheduling />} />
          <Route path="/user-management" element={<UserManagement />} />
          <Route path="/profile" element={<ProfileSettings />} />
          <Route path="/modus-management" element={<ModusManagement />} /> 

          
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
