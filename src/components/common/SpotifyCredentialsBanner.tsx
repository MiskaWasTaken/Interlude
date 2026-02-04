import { useNavigate } from "react-router-dom";
import { SettingsIcon } from "../icons";

interface SpotifyCredentialsBannerProps {
  variant?: "dropdown" | "card";
  onNavigate?: () => void;
}

export default function SpotifyCredentialsBanner({
  variant = "dropdown",
  onNavigate,
}: SpotifyCredentialsBannerProps) {
  const navigate = useNavigate();

  const handleClick = () => {
    navigate("/settings");
    onNavigate?.();
  };

  if (variant === "card") {
    return (
      <div
        onClick={handleClick}
        className="p-4 bg-gradient-to-r from-[#1DB954]/20 to-[#1DB954]/5 rounded-xl border border-[#1DB954]/30 cursor-pointer hover:from-[#1DB954]/30 hover:to-[#1DB954]/10 transition-colors"
      >
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-[#1DB954] flex items-center justify-center flex-shrink-0">
            <svg
              className="w-7 h-7 text-black"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-base font-semibold text-text-primary">
              Enable Online Streaming
            </p>
            <p className="text-sm text-text-secondary">
              Add your free Spotify API credentials to search and stream Hi-Res
              FLAC
            </p>
          </div>
          <SettingsIcon className="w-5 h-5 text-text-muted" />
        </div>
      </div>
    );
  }

  // Dropdown variant (original)
  return (
    <div
      onClick={handleClick}
      className="p-3 bg-gradient-to-r from-[#1DB954]/20 to-[#1DB954]/5 border-b border-amoled-border cursor-pointer hover:from-[#1DB954]/30 hover:to-[#1DB954]/10 transition-colors"
    >
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-[#1DB954] flex items-center justify-center flex-shrink-0">
          <svg
            className="w-5 h-5 text-black"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-text-primary">
            Set up Spotify API for better search
          </p>
          <p className="text-xs text-text-secondary truncate">
            Click to add your free Spotify Developer credentials
          </p>
        </div>
        <SettingsIcon className="w-5 h-5 text-text-muted" />
      </div>
    </div>
  );
}
