import { Navigate } from "react-router-dom";
import { getToken } from "../utils/auth"; // adjust path to your actual auth.jsx location

export default function ProtectedRoute({ children }) {
  const token = getToken();

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return children;
}
