import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../stores/authStore";

export default function AuthCallbackPage() {
  const navigate = useNavigate();
  const { handleAuthCallback } = useAuthStore();
  const [error, setError] = useState<string | null>(null);
  const [signupSuccess, setSignupSuccess] = useState(false);

  useEffect(() => {
    const processCallback = async () => {
      try {
        const { isNewUser } = await handleAuthCallback();

        if (isNewUser) {
          // New user - show success message then redirect to sign in
          setSignupSuccess(true);
        } else {
          // Existing user - just go home
          navigate("/", { replace: true });
        }
      } catch (err: any) {
        console.error("Auth callback error:", err);
        setError(err.message || "Authentication failed");

        // Redirect to auth page after showing error
        setTimeout(() => {
          navigate("/auth", { replace: true, state: { error: err.message } });
        }, 3000);
      }
    };

    processCallback();
  }, [handleAuthCallback, navigate]);

  if (signupSuccess) {
    return (
      <div className="min-h-screen bg-amoled-black flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center">
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-green-500/20 flex items-center justify-center">
            <svg
              className="w-10 h-10 text-green-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-text-primary mb-3">
            Account Created Successfully!
          </h2>
          <p className="text-text-secondary mb-6">
            Welcome to Interlude! Your account has been created. Please sign in
            to continue.
          </p>
          <button
            onClick={() =>
              navigate("/auth", { replace: true, state: { mode: "signin" } })
            }
            className="w-full py-3 px-6 bg-accent-primary text-black font-semibold rounded-full hover:bg-accent-primary/90 transition-colors"
          >
            Sign In Now
          </button>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-amoled-black flex items-center justify-center p-4">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-red-500/20 flex items-center justify-center">
            <svg
              className="w-8 h-8 text-red-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-text-primary mb-2">
            Authentication Failed
          </h2>
          <p className="text-text-secondary mb-4">{error}</p>
          <p className="text-text-muted text-sm">Redirecting to login...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-amoled-black flex items-center justify-center p-4">
      <div className="text-center">
        <div className="w-16 h-16 mx-auto mb-6 border-4 border-accent-primary border-t-transparent rounded-full animate-spin" />
        <h2 className="text-xl font-semibold text-text-primary mb-2">
          Completing Sign In
        </h2>
        <p className="text-text-secondary">Please wait...</p>
      </div>
    </div>
  );
}
