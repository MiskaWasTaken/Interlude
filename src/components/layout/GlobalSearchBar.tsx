import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { clsx } from "clsx";
import { invoke } from "@tauri-apps/api/tauri";
import { useStreamingStore } from "../../stores/streamingStore";
import { usePlayerStore } from "../../stores/playerStore";
import { SearchIcon, GlobeIcon, PlayIcon } from "../icons";
import SpotifyCredentialsBanner from "../common/SpotifyCredentialsBanner";
import {
  formatDuration,
  getSourceIcon,
  isHiRes as isStreamHiRes,
} from "../../types/streaming";
import type { SpotifyTrack, SpotifyAlbum } from "../../types/streaming";
import type { Track, SearchResults } from "../../types";

export default function GlobalSearchBar() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [localResults, setLocalResults] = useState<SearchResults | null>(null);
  const [isSearchingLocal, setIsSearchingLocal] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const {
    searchSpotify,
    searchResults: onlineResults,
    isSearching: isSearchingOnline,
    searchError,
    playSpotifyTrack,
    currentSpotifyTrack,
    isLoadingStream,
    hasCredentials,
    checkCredentials,
  } = useStreamingStore();

  const { playTrack } = usePlayerStore();

  // Check for Spotify credentials on mount
  useEffect(() => {
    checkCredentials();
  }, [checkCredentials]);

  // Debounced search
  useEffect(() => {
    if (!query.trim()) {
      setLocalResults(null);
      return;
    }

    const timer = setTimeout(async () => {
      // Search local library
      setIsSearchingLocal(true);
      try {
        const results = await invoke<SearchResults>("search", { query });
        setLocalResults(results);
      } catch (error) {
        console.error("Local search failed:", error);
      } finally {
        setIsSearchingLocal(false);
      }

      // Search online
      searchSpotify(query);
    }, 300);

    return () => clearTimeout(timer);
  }, [query, searchSpotify]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Keyboard shortcut to focus search (Ctrl/Cmd + K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setIsOpen(true);
      }
      if (e.key === "Escape") {
        setIsOpen(false);
        inputRef.current?.blur();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handlePlayLocalTrack = (track: Track) => {
    playTrack(track, localResults?.tracks || [track]);
    setIsOpen(false);
    setQuery("");
  };

  const handlePlaySpotifyTrack = async (track: SpotifyTrack) => {
    await playSpotifyTrack(track);
    setIsOpen(false);
    setQuery("");
  };

  const handleViewAll = () => {
    navigate(`/search?q=${encodeURIComponent(query)}`);
    setIsOpen(false);
  };

  const isSearching = isSearchingLocal || isSearchingOnline;
  const hasResults =
    (localResults?.tracks.length || 0) > 0 ||
    (onlineResults?.tracks.length || 0) > 0;

  return (
    <div className="relative flex-1 max-w-2xl mx-auto">
      {/* Search Input */}
      <div className="relative">
        <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder="Search songs, albums, artists... (Ctrl+K)"
          className="w-full pl-12 pr-4 py-3 bg-amoled-card rounded-full text-text-primary placeholder-text-muted border border-amoled-border focus:border-accent-primary focus:outline-none transition-colors"
        />
        {isSearching && (
          <div className="absolute right-4 top-1/2 -translate-y-1/2">
            <div className="w-5 h-5 border-2 border-accent-primary border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* Dropdown Results */}
      {isOpen && query.trim() && (
        <div
          ref={dropdownRef}
          className="absolute top-full left-0 right-0 mt-2 bg-amoled-elevated rounded-xl shadow-2xl border border-amoled-border overflow-hidden z-50 max-h-[70vh] overflow-y-auto"
        >
          {/* Spotify Credentials Banner */}
          {hasCredentials === false && (
            <SpotifyCredentialsBanner
              variant="dropdown"
              onNavigate={() => setIsOpen(false)}
            />
          )}

          {/* Local Results */}
          {localResults && localResults.tracks.length > 0 && (
            <div className="p-3">
              <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2 px-2">
                From Your Library
              </h3>
              <div className="space-y-1">
                {localResults.tracks.slice(0, 4).map((track) => (
                  <LocalTrackItem
                    key={track.id}
                    track={track}
                    onPlay={() => handlePlayLocalTrack(track)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Online Results */}
          {onlineResults && onlineResults.tracks.length > 0 && (
            <div className="p-3 border-t border-amoled-border">
              <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2 px-2 flex items-center gap-2">
                <GlobeIcon className="w-3 h-3" />
                Stream Online (Hi-Res FLAC)
              </h3>
              <div className="space-y-1">
                {onlineResults.tracks.slice(0, 6).map((track) => (
                  <OnlineTrackItem
                    key={track.id}
                    track={track}
                    isCurrent={currentSpotifyTrack?.id === track.id}
                    isLoading={
                      currentSpotifyTrack?.id === track.id && isLoadingStream
                    }
                    onPlay={() => handlePlaySpotifyTrack(track)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Error State */}
          {searchError && (
            <div className="p-4 text-center">
              <p className="text-red-400 text-sm">{searchError}</p>
              <p className="text-text-muted text-xs mt-1">
                Online search unavailable. Try again later.
              </p>
            </div>
          )}

          {/* No Results */}
          {!isSearching && !hasResults && query.trim() && !searchError && (
            <div className="p-6 text-center">
              <p className="text-text-secondary">
                No results found for "{query}"
              </p>
            </div>
          )}

          {/* View All Button */}
          {hasResults && (
            <div className="p-3 border-t border-amoled-border">
              <button
                onClick={handleViewAll}
                className="w-full py-2 text-sm text-accent-primary hover:bg-amoled-hover rounded-lg transition-colors"
              >
                View all results for "{query}"
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Local track item component
function LocalTrackItem({
  track,
  onPlay,
}: {
  track: Track;
  onPlay: () => void;
}) {
  const [artwork, setArtwork] = useState<string | null>(null);

  useEffect(() => {
    invoke<string | null>("get_track_artwork", { filePath: track.file_path })
      .then(setArtwork)
      .catch(() => {});
  }, [track.file_path]);

  return (
    <div
      className="flex items-center gap-3 p-2 rounded-lg hover:bg-amoled-hover cursor-pointer group transition-colors"
      onClick={onPlay}
    >
      <div className="relative w-10 h-10 flex-shrink-0 rounded overflow-hidden bg-amoled-card">
        {artwork ? (
          <img
            src={artwork}
            alt={track.album}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-text-muted">
            ◉
          </div>
        )}
        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
          <PlayIcon className="w-4 h-4 text-white" />
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text-primary truncate">
          {track.title}
        </p>
        <p className="text-xs text-text-secondary truncate">{track.artist}</p>
      </div>
      <span className="text-xs text-text-muted bg-amoled-card px-2 py-0.5 rounded">
        {track.bit_depth}bit
      </span>
    </div>
  );
}

// Online track item component
function OnlineTrackItem({
  track,
  isCurrent,
  isLoading,
  onPlay,
}: {
  track: SpotifyTrack;
  isCurrent: boolean;
  isLoading: boolean;
  onPlay: () => void;
}) {
  return (
    <div
      className={clsx(
        "flex items-center gap-3 p-2 rounded-lg cursor-pointer group transition-colors",
        isCurrent ? "bg-accent-primary/10" : "hover:bg-amoled-hover",
      )}
      onClick={onPlay}
    >
      <div className="relative w-10 h-10 flex-shrink-0 rounded overflow-hidden bg-amoled-card">
        {track.cover_url ? (
          <img
            src={track.cover_url}
            alt={track.album}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-text-muted">
            ◉
          </div>
        )}
        <div
          className={clsx(
            "absolute inset-0 bg-black/50 flex items-center justify-center transition-opacity",
            isLoading ? "opacity-100" : "opacity-0 group-hover:opacity-100",
          )}
        >
          {isLoading ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <PlayIcon className="w-4 h-4 text-white" />
          )}
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <p
          className={clsx(
            "text-sm font-medium truncate",
            isCurrent ? "text-accent-primary" : "text-text-primary",
          )}
        >
          {track.name}
        </p>
        <p className="text-xs text-text-secondary truncate">
          {track.artists.join(", ")}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <GlobeIcon className="w-3 h-3 text-accent-primary" />
        <span className="text-xs text-accent-primary">FLAC</span>
      </div>
    </div>
  );
}
