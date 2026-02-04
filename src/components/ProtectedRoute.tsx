import { Navigate, useLocation } from "react-router-dom";
import { useAuthStore } from "../stores/authStore";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading } = useAuthStore();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-amoled-black flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 mx-auto mb-4 border-3 border-accent-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-text-secondary">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    // Redirect to auth page, but save the location they were trying to go to
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
