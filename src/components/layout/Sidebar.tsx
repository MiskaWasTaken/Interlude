import { NavLink, useNavigate } from "react-router-dom";
import { useState } from "react";
import { clsx } from "clsx";
import { useLibraryStore } from "../../stores/libraryStore";
import {
  HomeIcon,
  AlbumIcon,
  ArtistIcon,
  LibraryIcon,
  FolderPlusIcon,
  HeartIcon,
  SparklesIcon,
  AudioWaveIcon,
  SettingsIcon,
  ChartIcon,
} from "../icons";

export default function Sidebar() {
  const navigate = useNavigate();
  const smartPlaylists = useLibraryStore((state) => state.smartPlaylists);
  const [isHovered, setIsHovered] = useState(false);

  const navItems = [
    { path: "/", icon: HomeIcon, label: "Home" },
    { path: "/albums", icon: AlbumIcon, label: "Albums" },
    { path: "/artists", icon: ArtistIcon, label: "Artists" },
    { path: "/library", icon: LibraryIcon, label: "Library" },
  ];

  const utilityItems = [
    { path: "/settings", icon: SettingsIcon, label: "Settings" },
    { path: "/statistics", icon: ChartIcon, label: "Statistics" },
  ];

  const getPlaylistIcon = (iconName: string) => {
    switch (iconName) {
      case "heart":
        return HeartIcon;
      case "sparkles":
        return SparklesIcon;
      case "audio":
        return AudioWaveIcon;
      default:
        return LibraryIcon;
    }
  };

  return (
    <aside
      className="w-56 flex-shrink-0 flex flex-col bg-amoled-black/80 backdrop-blur-xl border-r border-amoled-border relative z-10"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Logo */}
      <div className="p-6 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent-primary to-accent-secondary flex items-center justify-center">
            <span className="text-lg">♪</span>
          </div>
          <span className="text-xl font-bold text-text-primary tracking-tight">
            HiFlac
          </span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 overflow-y-auto scrollbar-thin">
        {/* Main nav */}
        <div className="space-y-1">
          {navItems.map(({ path, icon: Icon, label }) => (
            <NavLink
              key={path}
              to={path}
              className={({ isActive }) =>
                clsx(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                  isActive
                    ? "bg-amoled-hover text-text-primary"
                    : "text-text-secondary hover:text-text-primary hover:bg-amoled-hover/50",
                )
              }
            >
              <Icon className="w-5 h-5" />
              <span>{label}</span>
            </NavLink>
          ))}
        </div>

        {/* Add Folder */}
        <div className="mt-6">
          <button
            onClick={() => navigate("/library")}
            className="flex items-center gap-3 px-3 py-2.5 w-full rounded-lg text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-amoled-hover/50 transition-all duration-200"
          >
            <FolderPlusIcon className="w-5 h-5" />
            <span>Add Folder</span>
          </button>
        </div>

        {/* Smart Playlists */}
        {smartPlaylists.length > 0 && (
          <div className="mt-8">
            <h3 className="px-3 mb-2 text-xs font-semibold text-text-muted uppercase tracking-wider">
              Smart Playlists
            </h3>
            <div className="space-y-1">
              {smartPlaylists.map((playlist) => {
                const Icon = getPlaylistIcon(playlist.icon);
                return (
                  <NavLink
                    key={playlist.id}
                    to={`/playlist/${playlist.id}`}
                    className={({ isActive }) =>
                      clsx(
                        "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                        isActive
                          ? "bg-amoled-hover text-text-primary"
                          : "text-text-secondary hover:text-text-primary hover:bg-amoled-hover/50",
                      )
                    }
                  >
                    <Icon
                      className={clsx(
                        "w-5 h-5",
                        playlist.id === "favorites" && "text-red-500",
                      )}
                    />
                    <span className="flex-1 truncate">{playlist.name}</span>
                    <span className="text-xs text-text-muted">
                      {playlist.track_count}
                    </span>
                  </NavLink>
                );
              })}
            </div>
          </div>
        )}

        {/* Audio Tools */}
        <div className="mt-8">
          <h3 className="px-3 mb-2 text-xs font-semibold text-text-muted uppercase tracking-wider">
            Audio Tools
          </h3>
          <div className="space-y-1">
            {/* SpotiFlac - On-demand streaming */}
            <NavLink
              to="/spotiflac"
              className={({ isActive }) =>
                clsx(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                  isActive
                    ? "bg-amoled-hover text-text-primary"
                    : "text-text-secondary hover:text-text-primary hover:bg-amoled-hover/50",
                )
              }
            >
              <svg
                className="w-5 h-5 text-[#1DB954]"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
              </svg>
              <span>SpotiFlac</span>
              <span className="text-[10px] px-1.5 py-0.5 bg-[#1DB954]/20 text-[#1DB954] rounded-full ml-auto">
                Hi-Res
              </span>
            </NavLink>

            {utilityItems.map(({ path, icon: Icon, label }) => (
              <NavLink
                key={path}
                to={path}
                className={({ isActive }) =>
                  clsx(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                    isActive
                      ? "bg-amoled-hover text-text-primary"
                      : "text-text-secondary hover:text-text-primary hover:bg-amoled-hover/50",
                  )
                }
              >
                <Icon className="w-5 h-5" />
                <span>{label}</span>
              </NavLink>
            ))}
          </div>
        </div>
      </nav>

      {/* Bottom padding for player bar */}
      <div className="h-24" />
    </aside>
  );
}
