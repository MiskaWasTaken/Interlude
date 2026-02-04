import { Outlet } from "react-router-dom";
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import { clsx } from "clsx";
import Titlebar from "./Titlebar";
import Sidebar from "./Sidebar";
import PlayerBar from "./PlayerBar";
import GlobalSearchBar from "./GlobalSearchBar";
import { useGradient } from "../../contexts/GradientContext";
import { useLibraryStore } from "../../stores/libraryStore";
import { usePlayerStore } from "../../stores/playerStore";
import { useStreamingStore } from "../../stores/streamingStore";
import AlbumArt from "../common/AlbumArt";
import { GlobeIcon } from "../icons";
import { getSourceIcon, isHiRes as isStreamHiRes } from "../../types/streaming";

export default function Layout() {
  const { colors, intensity, gradientEnabled } = useGradient();
  const loadLibrary = useLibraryStore((state) => state.loadLibrary);
  const loadStatistics = useLibraryStore((state) => state.loadStatistics);
  const loadSmartPlaylists = useLibraryStore(
    (state) => state.loadSmartPlaylists,
  );
  const loadRecentlyPlayed = useLibraryStore(
    (state) => state.loadRecentlyPlayed,
  );
  const updatePlaybackState = usePlayerStore(
    (state) => state.updatePlaybackState,
  );
  const playbackState = usePlayerStore((state) => state.playbackState);
  const {
    currentSpotifyTrack,
    currentStreamInfo,
    isPlaying: isStreamPlaying,
  } = useStreamingStore();
  const [showRightPanel, setShowRightPanel] = useState(true);
  const [currentArtwork, setCurrentArtwork] = useState<string | null>(null);

  // Determine if we're showing local track or streaming track
  const isStreaming = currentSpotifyTrack !== null;
  const showNowPlaying = playbackState.current_track || currentSpotifyTrack;

  // Load library on mount
  useEffect(() => {
    loadLibrary();
    loadStatistics();
    loadSmartPlaylists();
    loadRecentlyPlayed();
  }, [loadLibrary, loadStatistics, loadSmartPlaylists, loadRecentlyPlayed]);

  // Update playback state periodically
  useEffect(() => {
    const interval = setInterval(updatePlaybackState, 1000);
    return () => clearInterval(interval);
  }, [updatePlaybackState]);

  // Load artwork when track changes
  useEffect(() => {
    if (playbackState.current_track?.file_path) {
      invoke<string | null>("get_track_artwork", {
        filePath: playbackState.current_track.file_path,
      })
        .then(setCurrentArtwork)
        .catch(console.error);
    } else {
      setCurrentArtwork(null);
    }
  }, [playbackState.current_track?.file_path]);

  const gradientStyle = gradientEnabled
    ? {
        background: `linear-gradient(135deg, 
      ${colors.primary} 0%, 
      ${colors.secondary} 50%, 
      ${colors.tertiary} 100%)`,
        opacity: intensity,
      }
    : {};

  return (
    <div className="flex flex-col h-screen bg-amoled-black overflow-hidden">
      {/* Custom Titlebar */}
      <Titlebar />

      <div className="flex flex-1 overflow-hidden">
        {/* Animated gradient background */}
        {gradientEnabled && (
          <div
            className="fixed inset-0 pointer-events-none animate-gradient-bg transition-all duration-1000"
            style={gradientStyle}
          />
        )}

        {/* Sidebar */}
        <Sidebar />

        {/* Main content */}
        <main className="flex-1 flex flex-col overflow-hidden relative">
          {/* Top Header with Search Bar */}
          <header className="flex items-center gap-4 px-6 py-4 bg-amoled-black/80 backdrop-blur-sm sticky top-0 z-40 border-b border-amoled-border/50">
            <GlobalSearchBar />
          </header>

          <div className="flex-1 overflow-y-auto scrollbar-thin">
            <Outlet />
          </div>
        </main>

        {/* Right Panel - Now Playing Info */}
        {showRightPanel && showNowPlaying && (
          <aside className="w-[280px] flex-shrink-0 bg-amoled-elevated p-4 overflow-y-auto scrollbar-thin relative z-10">
            {/* Album Art */}
            <div className="relative mb-4 rounded-lg overflow-hidden shadow-lg">
              {isStreaming && currentSpotifyTrack?.cover_url ? (
                <img
                  src={currentSpotifyTrack.cover_url}
                  alt={currentSpotifyTrack.album}
                  className="w-full aspect-square object-cover"
                />
              ) : (
                <AlbumArt
                  src={currentArtwork}
                  alt={playbackState.current_track?.album || ""}
                  size="xl"
                  className="w-full aspect-square object-cover"
                />
              )}
              {/* Streaming indicator overlay */}
              {isStreaming && currentStreamInfo && (
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3">
                  <div className="flex items-center gap-2">
                    <GlobeIcon className="w-4 h-4 text-accent-primary" />
                    <span className="text-xs text-white">
                      Streaming from {currentStreamInfo.source}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Track Info */}
            <div className="mb-6">
              <h2 className="text-xl font-bold text-text-primary truncate">
                {isStreaming
                  ? currentSpotifyTrack?.name
                  : playbackState.current_track?.title}
              </h2>
              <p className="text-text-secondary truncate">
                {isStreaming
                  ? currentSpotifyTrack?.artists.join(", ")
                  : playbackState.current_track?.artist}
              </p>
            </div>

            {/* About the artist section */}
            <div className="bg-amoled-card rounded-lg p-4">
              <h3 className="text-sm font-semibold text-text-primary mb-3">
                About the artist
              </h3>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-16 h-16 rounded-full bg-amoled-hover flex items-center justify-center overflow-hidden">
                  <span className="text-3xl">🎤</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-text-primary truncate">
                    {isStreaming
                      ? currentSpotifyTrack?.artists[0]
                      : playbackState.current_track?.artist}
                  </p>
                  <p className="text-xs text-text-secondary">Artist</p>
                </div>
              </div>
              <button className="w-full py-2 border border-text-secondary rounded-full text-sm font-semibold text-text-primary hover:border-text-primary hover:scale-[1.02] transition-all">
                Follow
              </button>
            </div>

            {/* Audio Quality */}
            <div className="mt-4 bg-amoled-card rounded-lg p-4">
              <h3 className="text-sm font-semibold text-text-primary mb-3">
                Audio Quality
              </h3>
              {isStreaming && currentStreamInfo ? (
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-text-secondary">Source</span>
                    <span className="text-text-primary font-medium flex items-center gap-1">
                      {getSourceIcon(currentStreamInfo.source)}
                      {currentStreamInfo.source}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-secondary">Format</span>
                    <span className="text-text-primary font-medium">
                      {currentStreamInfo.format}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-secondary">Bit Depth</span>
                    <span className="text-text-primary font-medium">
                      {currentStreamInfo.bit_depth || 16}-bit
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-secondary">Sample Rate</span>
                    <span className="text-text-primary font-medium">
                      {(
                        (currentStreamInfo.sample_rate || 44100) / 1000
                      ).toFixed(1)}{" "}
                      kHz
                    </span>
                  </div>
                  {isStreamHiRes(currentStreamInfo) && (
                    <div className="mt-3 px-2 py-1 bg-accent-primary/20 rounded text-center">
                      <span className="text-xs font-semibold text-accent-primary">
                        Hi-Res Audio
                      </span>
                    </div>
                  )}
                </div>
              ) : playbackState.current_track ? (
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-text-secondary">Format</span>
                    <span className="text-text-primary font-medium">
                      {playbackState.current_track.format}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-secondary">Bit Depth</span>
                    <span className="text-text-primary font-medium">
                      {playbackState.current_track.bit_depth}-bit
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-secondary">Sample Rate</span>
                    <span className="text-text-primary font-medium">
                      {(playbackState.current_track.sample_rate / 1000).toFixed(
                        1,
                      )}{" "}
                      kHz
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-secondary">Channels</span>
                    <span className="text-text-primary font-medium">
                      {playbackState.current_track.channels === 2
                        ? "Stereo"
                        : "Mono"}
                    </span>
                  </div>
                  {playbackState.current_track.bit_depth >= 24 && (
                    <div className="mt-3 px-2 py-1 bg-[#1DB954]/20 rounded text-center">
                      <span className="text-xs font-semibold text-[#1DB954]">
                        Hi-Res Audio
                      </span>
                    </div>
                  )}
                </div>
              ) : null}
            </div>

            {/* Album Info */}
            <div className="mt-4 bg-amoled-card rounded-lg p-4">
              <h3 className="text-sm font-semibold text-text-primary mb-2">
                Album
              </h3>
              <p className="text-text-secondary text-sm truncate">
                {isStreaming
                  ? currentSpotifyTrack?.album
                  : playbackState.current_track?.album}
              </p>
              {!isStreaming && playbackState.current_track?.year && (
                <p className="text-text-muted text-xs mt-1">
                  {playbackState.current_track.year}
                </p>
              )}
              {isStreaming && currentSpotifyTrack?.release_date && (
                <p className="text-text-muted text-xs mt-1">
                  {currentSpotifyTrack.release_date.split("-")[0]}
                </p>
              )}
            </div>

            {/* Bottom padding for player bar */}
            <div className="h-24" />
          </aside>
        )}

        {/* Player bar */}
        <PlayerBar />
      </div>
    </div>
  );
}
