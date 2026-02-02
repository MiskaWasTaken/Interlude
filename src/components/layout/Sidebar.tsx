import { NavLink, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { clsx } from "clsx";
import { invoke } from "@tauri-apps/api/tauri";
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

type FilterTab = "playlists" | "artists" | "albums";

export default function Sidebar() {
  const navigate = useNavigate();
  const { albums, artists, recentlyPlayed, smartPlaylists } = useLibraryStore();
  const { playTrack } = usePlayerStore();
  const [activeFilter, setActiveFilter] = useState<FilterTab | null>(null);
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

  const filteredItems = () => {
    const query = searchQuery.toLowerCase();

    if (activeFilter === "artists") {
      return artists
        .filter((a) => a.name.toLowerCase().includes(query))
        .slice(0, 30);
    }
    if (activeFilter === "albums") {
      return albums
        .filter(
          (a) =>
            a.name.toLowerCase().includes(query) ||
            a.artist.toLowerCase().includes(query),
        )
        .slice(0, 30);
    }

    // Default: show playlists and recent albums
    if (query) {
      return recentAlbums.filter(
        (t) =>
          t.album.toLowerCase().includes(query) ||
          t.artist.toLowerCase().includes(query),
      );
    }
    return recentAlbums;
  };

  const filterTabs: { id: FilterTab; label: string }[] = [
    { id: "playlists", label: "Playlists" },
    { id: "artists", label: "Artists" },
    { id: "albums", label: "Albums" },
  ];

  return (
    <aside className="w-[280px] flex-shrink-0 flex flex-col gap-2 p-2 relative z-10">
      {/* Top Navigation Card */}
      <div className="bg-amoled-elevated rounded-lg p-2">
        <NavLink
          to="/"
          className={({ isActive }) =>
            clsx(
              "flex items-center gap-4 px-3 py-2 rounded-md font-semibold transition-colors",
              isActive
                ? "text-text-primary"
                : "text-text-secondary hover:text-text-primary",
            )
          }
        >
          {({ isActive }) => (
            <>
              {isActive ? (
                <HomeFilledIcon className="w-6 h-6" />
              ) : (
                <HomeIcon className="w-6 h-6" />
              )}
              <span>Home</span>
            </>
          )}
        </NavLink>

        <NavLink
          to="/search"
          className={({ isActive }) =>
            clsx(
              "flex items-center gap-4 px-3 py-2 rounded-md font-semibold transition-colors",
              isActive
                ? "text-text-primary"
                : "text-text-secondary hover:text-text-primary",
            )
          }
        >
          <SearchIcon className="w-6 h-6" />
          <span>Search</span>
        </NavLink>
      </div>

      {/* Library Card */}
      <div className="flex-1 bg-amoled-elevated rounded-lg flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 pb-2">
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => navigate("/library")}
              className="flex items-center gap-3 text-text-secondary hover:text-text-primary transition-colors font-semibold"
            >
              <LibraryIcon className="w-6 h-6" />
              <span>Your Library</span>
            </button>
            <div className="flex items-center gap-2">
              <button
                onClick={() => navigate("/library")}
                className="p-2 text-text-secondary hover:text-text-primary hover:bg-amoled-hover rounded-full transition-all"
                title="Create playlist or folder"
              >
                <PlusIcon className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Filter Tabs */}
          <div className="flex items-center gap-2 flex-wrap">
            {activeFilter && (
              <button
                onClick={() => setActiveFilter(null)}
                className="p-1.5 bg-amoled-hover rounded-full text-text-primary hover:bg-amoled-card transition-colors"
              >
                <svg
                  className="w-4 h-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
            {filterTabs
              .filter((tab) => !activeFilter || tab.id === activeFilter)
              .map((tab) => (
                <button
                  key={tab.id}
                  onClick={() =>
                    setActiveFilter(activeFilter === tab.id ? null : tab.id)
                  }
                  className={clsx(
                    "px-3 py-1.5 text-sm font-medium rounded-full transition-colors",
                    activeFilter === tab.id
                      ? "bg-text-primary text-amoled-black"
                      : "bg-amoled-hover text-text-primary hover:bg-amoled-card",
                  )}
                >
                  {tab.label}
                </button>
              ))}
          </div>
        </div>

        {/* Search and Sort Row */}
        <div className="px-4 py-2 flex items-center justify-between">
          <button
            onClick={() => setShowSearch(!showSearch)}
            className="p-1.5 text-text-secondary hover:text-text-primary transition-colors"
          >
            <SearchIcon className="w-4 h-4" />
          </button>
          <button className="flex items-center gap-1 text-text-secondary hover:text-text-primary text-sm transition-colors">
            <span>Recents</span>
            <svg
              className="w-4 h-4"
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
          <div className="px-4 pb-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search in Your Library"
              className="w-full px-3 py-1.5 bg-amoled-hover rounded-md text-sm text-text-primary placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-text-secondary"
              autoFocus
            />
          </div>
        )}

        {/* Library Items */}
        <div className="flex-1 overflow-y-auto scrollbar-thin px-2 pb-4">
          {/* Smart Playlists */}
          {!activeFilter &&
            smartPlaylists.map((playlist) => (
              <NavLink
                key={playlist.id}
                to={`/playlist/${playlist.id}`}
                className={({ isActive }) =>
                  clsx(
                    "flex items-center gap-3 p-2 rounded-md transition-colors group",
                    isActive ? "bg-amoled-hover" : "hover:bg-amoled-hover/50",
                  )
                }
              >
                <div
                  className={clsx(
                    "w-12 h-12 rounded flex items-center justify-center flex-shrink-0",
                    playlist.id === "favorites"
                      ? "bg-gradient-to-br from-purple-700 to-blue-300"
                      : "bg-amoled-card",
                  )}
                >
                  {playlist.id === "favorites" ? (
                    <HeartFilledIcon className="w-6 h-6 text-white" />
                  ) : (
                    <span className="text-2xl">
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
                  <div className="flex items-center gap-1 text-xs text-text-secondary">
                    <PinIcon className="w-3 h-3 text-[#1DB954]" />
                    <span>Playlist</span>
                    <span>•</span>
                    <span>{playlist.track_count} songs</span>
                  </div>
                </div>
              </NavLink>
            ))}

          {/* Display based on filter */}
          {activeFilter === "artists"
            ? // Artists list
              filteredItems().map((artist: any) => (
                <NavLink
                  key={artist.id}
                  to={`/artists/${encodeURIComponent(artist.name)}`}
                  className={({ isActive }) =>
                    clsx(
                      "flex items-center gap-3 p-2 rounded-md transition-colors group",
                      isActive ? "bg-amoled-hover" : "hover:bg-amoled-hover/50",
                    )
                  }
                >
                  <div className="w-12 h-12 rounded-full bg-amoled-card flex items-center justify-center flex-shrink-0 overflow-hidden">
                    <span className="text-xl text-text-muted">🎤</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">
                      {artist.name}
                    </p>
                    <p className="text-xs text-text-secondary">Artist</p>
                  </div>
                </NavLink>
              ))
            : activeFilter === "albums"
              ? // Albums list
                filteredItems().map((album: any) => (
                  <div
                    key={`${album.name}-${album.artist}`}
                    onClick={() =>
                      navigate(
                        `/albums/${encodeURIComponent(
                          album.name,
                        )}/${encodeURIComponent(album.artist)}`,
                      )
                    }
                    className="flex items-center gap-3 p-2 rounded-md transition-colors cursor-pointer hover:bg-amoled-hover/50"
                  >
                    <div className="w-12 h-12 rounded bg-amoled-card flex items-center justify-center flex-shrink-0 overflow-hidden">
                      <span className="text-xl text-text-muted">💿</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-text-primary truncate">
                        {album.name}
                      </p>
                      <p className="text-xs text-text-secondary truncate">
                        Album • {album.artist}
                      </p>
                    </div>
                  </div>
                ))
              : // Recent albums (default)
                filteredItems().map((track: any) => {
                  const key = `${track.album}-${track.artist}`;
                  return (
                    <div
                      key={key}
                      onClick={() => handlePlayAlbum(track.album, track.artist)}
                      className="flex items-center gap-3 p-2 rounded-md transition-colors cursor-pointer hover:bg-amoled-hover/50"
                    >
                      <div className="w-12 h-12 rounded bg-amoled-card flex-shrink-0 overflow-hidden">
                        <AlbumArt
                          src={albumArtworks[key]}
                          alt={track.album}
                          size="sm"
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-text-primary truncate">
                          {track.album}
                        </p>
                        <p className="text-xs text-text-secondary truncate">
                          Album • {track.artist}
                        </p>
                      </div>
                    </div>
                  );
                })}

          {/* Empty State */}
          {filteredItems().length === 0 && (
            <div className="text-center py-8 text-text-muted text-sm">
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
