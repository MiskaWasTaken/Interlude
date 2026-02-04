import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../stores/authStore";
import { GoogleIcon } from "../components/icons";

type AuthMode = "signin" | "signup";

export default function AuthPage() {
  const navigate = useNavigate();
  const { signInWithGoogle, signUpWithGoogle, validateInviteCode, isLoading } =
    useAuthStore();

  const [mode, setMode] = useState<AuthMode>("signin");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState("");
  const [isValidating, setIsValidating] = useState(false);
  const [isCodeValid, setIsCodeValid] = useState<boolean | null>(null);

  const handleInviteCodeChange = async (value: string) => {
    const trimmedValue = value.trim();
    setInviteCode(trimmedValue);
    setError("");
    setIsCodeValid(null);

    // Validate when it matches the pattern HIFLAC-XXXXXXXX (16 chars)
    if (trimmedValue.length >= 15) {
      setIsValidating(true);
      const valid = await validateInviteCode(trimmedValue);
      setIsCodeValid(valid);
      setIsValidating(false);

      if (!valid) {
        setError("Invalid or already used invite code");
      }
    }
  };

  const handleSignIn = async () => {
    setError("");
    try {
      await signInWithGoogle();
    } catch (err: any) {
      setError(err.message || "Sign in failed");
    }
  };

  const handleSignUp = async () => {
    setError("");

    if (!inviteCode) {
      setError("Please enter an invite code");
      return;
    }

    if (!isCodeValid) {
      setError("Please enter a valid invite code");
      return;
    }

    try {
      await signUpWithGoogle(inviteCode);
    } catch (err: any) {
      setError(err.message || "Sign up failed");
    }
  };

  return (
    <div className="min-h-screen bg-amoled-black flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-text-primary mb-2">
            Interlude
          </h1>
          <p className="text-text-secondary">Hi-Resolution Audio Player</p>
        </div>

        {/* Auth Card */}
        <div className="bg-amoled-card rounded-2xl p-8 border border-white/5">
          {/* Mode Toggle */}
          <div className="flex mb-8 bg-amoled-surface rounded-lg p-1">
            <button
              onClick={() => {
                setMode("signin");
                setError("");
              }}
              className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
                mode === "signin"
                  ? "bg-accent-primary text-black"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => {
                setMode("signup");
                setError("");
              }}
              className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
                mode === "signup"
                  ? "bg-accent-primary text-black"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              Sign Up
            </button>
          </div>

          {/* Sign Up - Invite Code */}
          {mode === "signup" && (
            <div className="mb-6">
              <label className="block text-text-secondary text-sm mb-2">
                Invite Code
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={inviteCode}
                  onChange={(e) =>
                    handleInviteCodeChange(e.target.value.toUpperCase())
                  }
                  placeholder="HIFLAC-XXXXXXXX"
                  className={`w-full bg-amoled-surface border rounded-lg px-4 py-3 text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 transition-all ${
                    isCodeValid === true
                      ? "border-green-500 focus:ring-green-500/50"
                      : isCodeValid === false
                        ? "border-red-500 focus:ring-red-500/50"
                        : "border-white/10 focus:ring-accent-primary/50"
                  }`}
                />
                {isValidating && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <div className="w-5 h-5 border-2 border-accent-primary border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
                {isCodeValid === true && !isValidating && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 text-green-500">
                    <svg
                      className="w-5 h-5"
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
                )}
              </div>
              <p className="text-text-muted text-xs mt-2">
                An invite code is required to create an account
              </p>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {/* Google Sign In/Up Button */}
          <button
            onClick={mode === "signin" ? handleSignIn : handleSignUp}
            disabled={isLoading || (mode === "signup" && !isCodeValid)}
            className={`w-full flex items-center justify-center gap-3 py-3 px-4 rounded-lg font-medium transition-all ${
              isLoading || (mode === "signup" && !isCodeValid)
                ? "bg-white/10 text-text-muted cursor-not-allowed"
                : "bg-white text-black hover:bg-gray-100"
            }`}
          >
            <GoogleIcon className="w-5 h-5" />
            {mode === "signin" ? "Sign in with Google" : "Sign up with Google"}
          </button>

          {/* Info Text */}
          <p className="text-text-muted text-xs text-center mt-6">
            {mode === "signin" ? (
              <>Don't have an account? Get an invite code to sign up.</>
            ) : (
              <>Already have an account? Switch to sign in.</>
            )}
          </p>
        </div>

        {/* Footer */}
        <p className="text-text-muted text-xs text-center mt-8">
          By continuing, you agree to our Terms of Service and Privacy Policy
        </p>
      </div>
    </div>
  );
}
