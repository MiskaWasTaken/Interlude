import { Outlet } from "react-router-dom";
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import { clsx } from "clsx";
import Sidebar from "./Sidebar";
import PlayerBar from "./PlayerBar";
import { useGradient } from "../../contexts/GradientContext";
import { useLibraryStore } from "../../stores/libraryStore";
import { usePlayerStore } from "../../stores/playerStore";
import AlbumArt from "../common/AlbumArt";

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
  const [showRightPanel, setShowRightPanel] = useState(true);
  const [currentArtwork, setCurrentArtwork] = useState<string | null>(null);

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
    <div className="flex h-screen bg-amoled-black overflow-hidden">
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
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          <Outlet />
        </div>
      </main>

      {/* Right Panel - Now Playing Info */}
      {showRightPanel && playbackState.current_track && (
        <aside className="w-[280px] flex-shrink-0 bg-amoled-elevated p-4 overflow-y-auto scrollbar-thin relative z-10">
          {/* Album Art */}
          <div className="relative mb-4 rounded-lg overflow-hidden shadow-lg">
            <AlbumArt
              src={currentArtwork}
              alt={playbackState.current_track.album}
              size="xl"
              className="w-full aspect-square object-cover"
            />
          </div>

          {/* Track Info */}
          <div className="mb-6">
            <h2 className="text-xl font-bold text-text-primary truncate">
              {playbackState.current_track.title}
            </h2>
            <p className="text-text-secondary truncate">
              {playbackState.current_track.artist}
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
                  {playbackState.current_track.artist}
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
                  {(playbackState.current_track.sample_rate / 1000).toFixed(1)}{" "}
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
            </div>
            {playbackState.current_track.bit_depth >= 24 && (
              <div className="mt-3 px-2 py-1 bg-[#1DB954]/20 rounded text-center">
                <span className="text-xs font-semibold text-[#1DB954]">
                  Hi-Res Audio
                </span>
              </div>
            )}
          </div>

          {/* Album Info */}
          <div className="mt-4 bg-amoled-card rounded-lg p-4">
            <h3 className="text-sm font-semibold text-text-primary mb-2">
              Album
            </h3>
            <p className="text-text-secondary text-sm truncate">
              {playbackState.current_track.album}
            </p>
            {playbackState.current_track.year && (
              <p className="text-text-muted text-xs mt-1">
                {playbackState.current_track.year}
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
  );
}
