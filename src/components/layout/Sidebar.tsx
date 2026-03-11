import { NavLink, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { clsx } from "clsx";
import { invoke } from "@tauri-apps/api/core";
import { useLibraryStore } from "../../stores/libraryStore";
import { usePlayerStore } from "../../stores/playerStore";
import AlbumArt from "../common/AlbumArt";
import {
  HomeIcon,
  HomeFilledIcon,
  SearchIcon,
  LibraryIcon,
  PlusIcon,
  HeartFilledIcon,
  PinIcon,
} from "../icons";
import type { Track } from "../../types";

export default function Sidebar() {
  const navigate = useNavigate();
  const { recentlyPlayed, smartPlaylists } = useLibraryStore();
  const { playTrack } = usePlayerStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [albumArtworks, setAlbumArtworks] = useState<Record<string, string>>(
    {},
  );

  // Load artworks for albums
  useEffect(() => {
    const loadArtworks = async () => {
      const artworks: Record<string, string> = {};
      for (const track of recentlyPlayed.slice(0, 10)) {
        const key = `${track.album}-${track.artist}`;
        if (!artworks[key]) {
          try {
            const url = await invoke<string | null>("get_track_artwork", {
              filePath: track.file_path,
            });
            if (url) artworks[key] = url;
          } catch {
            // ignore
          }
        }
      }
      setAlbumArtworks(artworks);
    };
    loadArtworks();
  }, [recentlyPlayed]);

  const handlePlayAlbum = async (albumName: string, artistName: string) => {
    try {
      const albumTracks = await invoke<Track[]>("get_album_tracks", {
        album: albumName,
        artist: artistName,
      });
      if (albumTracks.length > 0) {
        playTrack(albumTracks[0], albumTracks);
      }
    } catch (error) {
      console.error("Failed to play album:", error);
    }
  };

  // Get unique items from recently played
  const recentAlbums = recentlyPlayed
    .reduce((acc, track) => {
      const key = `${track.album}-${track.artist}`;
      if (!acc.find((t) => `${t.album}-${t.artist}` === key)) {
        acc.push(track);
      }
      return acc;
    }, [] as Track[])
    .slice(0, 20);

  return (
    <aside className="w-[240px] shrink-0 flex flex-col gap-2 p-2 relative z-10">
      {/* Top Navigation Card */}
      <div className="bg-amoled-elevated rounded-lg p-3">
        <nav className="flex flex-col gap-1">
          <NavLink
            to="/"
            className={({ isActive }) =>
              clsx(
                "flex items-center gap-3 px-3 py-2 rounded-lg font-medium transition-colors text-sm",
                isActive
                  ? "text-text-primary bg-amoled-hover/50"
                  : "text-text-secondary hover:text-text-primary hover:bg-amoled-hover/30",
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive ? (
                  <HomeFilledIcon className="w-5 h-5" />
                ) : (
                  <HomeIcon className="w-5 h-5" />
                )}
                <span>Home</span>
              </>
            )}
          </NavLink>

          <NavLink
            to="/search"
            className={({ isActive }) =>
              clsx(
                "flex items-center gap-3 px-3 py-2 rounded-lg font-medium transition-colors text-sm",
                isActive
                  ? "text-text-primary bg-amoled-hover/50"
                  : "text-text-secondary hover:text-text-primary hover:bg-amoled-hover/30",
              )
            }
          >
            <SearchIcon className="w-5 h-5" />
            <span>Search</span>
          </NavLink>
        </nav>
      </div>

      {/* Library Card */}
      <div className="flex-1 bg-amoled-elevated rounded-lg flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-3 py-2">
          <div className="flex items-center justify-between">
            <button
              onClick={() => navigate("/library")}
              className="flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors font-medium text-sm"
            >
              <LibraryIcon className="w-5 h-5" />
              <span>Your Library</span>
            </button>
            <button
              onClick={() => navigate("/library")}
              className="p-1.5 text-text-secondary hover:text-text-primary hover:bg-amoled-hover rounded-full transition-all"
              title="Create playlist or folder"
            >
              <PlusIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Search and Sort Row */}
        <div className="px-3 py-2 flex items-center justify-between border-t border-amoled-border/30">
          <button
            onClick={() => setShowSearch(!showSearch)}
            className="p-2.5 text-text-secondary hover:text-text-primary hover:bg-amoled-hover rounded-lg transition-all"
          >
            <SearchIcon className="w-5 h-5" />
          </button>
          <button className="flex items-center gap-2 text-text-secondary hover:text-text-primary text-sm transition-colors px-3 py-2 hover:bg-amoled-hover rounded-lg">
            <span>Recents</span>
            <svg
              className="w-5 h-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="8" y1="6" x2="21" y2="6" />
              <line x1="8" y1="12" x2="21" y2="12" />
              <line x1="8" y1="18" x2="21" y2="18" />
              <line x1="3" y1="6" x2="3.01" y2="6" />
              <line x1="3" y1="12" x2="3.01" y2="12" />
              <line x1="3" y1="18" x2="3.01" y2="18" />
            </svg>
          </button>
        </div>

        {/* Search Input */}
        {showSearch && (
          <div className="px-5 pb-4">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search in Your Library"
              className="w-full px-5 py-3 bg-amoled-hover rounded-xl text-sm text-text-primary placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-text-secondary"
              autoFocus
            />
          </div>
        )}

        {/* Library Items */}
        <div className="flex-1 overflow-y-auto scrollbar-thin px-2 pb-2 space-y-0.5">
          {/* Smart Playlists */}
          {smartPlaylists.map((playlist) => (
            <NavLink
              key={playlist.id}
              to={`/playlist/${playlist.id}`}
              className={({ isActive }) =>
                clsx(
                  "flex items-center gap-2.5 p-2 rounded-lg transition-colors group",
                  isActive ? "bg-amoled-hover" : "hover:bg-amoled-hover/50",
                )
              }
            >
              <div
                className={clsx(
                  "w-10 h-10 rounded flex items-center justify-center shrink-0",
                  playlist.id === "favorites"
                    ? "bg-linear-to-br from-purple-700 to-blue-300"
                    : "bg-amoled-card",
                )}
              >
                {playlist.id === "favorites" ? (
                  <HeartFilledIcon className="w-5 h-5 text-white" />
                ) : (
                  <span className="text-lg">
                    {playlist.icon === "sparkles"
                      ? "✨"
                      : playlist.icon === "audio"
                        ? "🎵"
                        : "📋"}
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text-primary truncate">
                  {playlist.name}
                </p>
                <div className="flex items-center gap-1 text-[10px] text-text-secondary">
                  <PinIcon className="w-2.5 h-2.5 text-[#1DB954]" />
                  <span>Playlist</span>
                  <span>•</span>
                  <span>{playlist.track_count} songs</span>
                </div>
              </div>
            </NavLink>
          ))}

          {/* Recent albums */}
          {recentAlbums
            .filter((t) => {
              if (!searchQuery) return true;
              const query = searchQuery.toLowerCase();
              return (
                t.album.toLowerCase().includes(query) ||
                t.artist.toLowerCase().includes(query)
              );
            })
            .map((track: any) => {
              const key = `${track.album}-${track.artist}`;
              return (
                <div
                  key={key}
                  onClick={() => handlePlayAlbum(track.album, track.artist)}
                  className="flex items-center gap-2.5 p-2 rounded-lg transition-colors cursor-pointer hover:bg-amoled-hover/50"
                >
                  <div className="w-10 h-10 rounded bg-amoled-card shrink-0 overflow-hidden">
                    <AlbumArt
                      src={albumArtworks[key]}
                      alt={track.album}
                      size="sm"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-text-primary truncate">
                      {track.album}
                    </p>
                    <p className="text-[10px] text-text-secondary truncate">
                      Album • {track.artist}
                    </p>
                  </div>
                </div>
              );
            })}

          {/* Empty State */}
          {recentAlbums.length === 0 && (
            <div className="text-center py-4 text-text-muted text-xs">
              {searchQuery
                ? "No results found"
                : "Your library is empty. Add some music!"}
            </div>
          )}
        </div>
      </div>

      {/* Bottom padding for player bar */}
      <div className="h-20" />
    </aside>
  );
}
