import { Outlet } from "react-router-dom";
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import Titlebar from "./Titlebar";
import Sidebar from "./Sidebar";
import PlayerBar from "./PlayerBar";
import GlobalSearchBar from "./GlobalSearchBar";
import { useGradient } from "../../contexts/GradientContext";
import { useLibraryStore } from "../../stores/libraryStore";
import { usePlayerStore } from "../../stores/playerStore";
import { useStreamingStore } from "../../stores/streamingStore";
import AlbumArt from "../common/AlbumArt";
import { getSourceIcon, isHiRes as isStreamHiRes } from "../../types/streaming";

export default function Layout() {
  const {
    colors,
    setColorsFromImage,
    gradientEnabled,
    gradientMode,
    intensity,
  } = useGradient();
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
        .then((url) => {
          setCurrentArtwork(url);
          if (url) setColorsFromImage(url);
        })
        .catch(console.error);
    } else {
      setCurrentArtwork(null);
    }
  }, [playbackState.current_track?.file_path, setColorsFromImage]);

  // Update colors when streaming track changes
  useEffect(() => {
    if (currentSpotifyTrack?.cover_url) {
      setColorsFromImage(currentSpotifyTrack.cover_url);
    }
  }, [currentSpotifyTrack?.cover_url, setColorsFromImage]);

  return (
    <div className="flex flex-col h-screen bg-amoled-black overflow-hidden relative">
      {/* Animated floating gradient background based on album art */}
      {gradientEnabled && showNowPlaying && (
        <>
          {/* Primary floating orb */}
          <div
            className={`absolute pointer-events-none transition-all duration-1000 ease-out ${gradientMode === "animated" ? "animate-float-slow" : ""}`}
            style={{
              width: "60%",
              height: "60%",
              top: "10%",
              right: "-10%",
              background: `radial-gradient(ellipse at center, ${colors.primary}${Math.round(
                intensity * 60,
              )
                .toString(16)
                .padStart(2, "0")} 0%, transparent 70%)`,
              filter: "blur(60px)",
            }}
          />
          {/* Secondary floating orb */}
          <div
            className={`absolute pointer-events-none transition-all duration-1000 ease-out ${gradientMode === "animated" ? "animate-float-medium" : ""}`}
            style={{
              width: "50%",
              height: "50%",
              bottom: "5%",
              right: "10%",
              background: `radial-gradient(ellipse at center, ${colors.secondary}${Math.round(
                intensity * 50,
              )
                .toString(16)
                .padStart(2, "0")} 0%, transparent 70%)`,
              filter: "blur(80px)",
            }}
          />
          {/* Tertiary floating orb */}
          <div
            className={`absolute pointer-events-none transition-all duration-1000 ease-out ${gradientMode === "animated" ? "animate-float-fast" : ""}`}
            style={{
              width: "40%",
              height: "40%",
              top: "30%",
              left: "20%",
              background: `radial-gradient(ellipse at center, ${colors.tertiary}${Math.round(
                intensity * 40,
              )
                .toString(16)
                .padStart(2, "0")} 0%, transparent 70%)`,
              filter: "blur(100px)",
            }}
          />
        </>
      )}

      {/* Custom Titlebar */}
      <Titlebar />

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <Sidebar />

        {/* Main content */}
        <main className="flex-1 flex flex-col overflow-hidden relative">
          {/* Top Header with Search Bar */}
          <header
            className="flex items-center gap-3 px-4 py-2 sticky top-0 z-40 border-b border-white/5 transition-all duration-500"
            style={{
              background:
                gradientEnabled && showNowPlaying
                  ? `linear-gradient(90deg, transparent 0%, ${colors.primary}20 100%)`
                  : "rgb(0,0,0)",
            }}
          >
            <GlobalSearchBar />
          </header>

          <div className="flex-1 overflow-y-auto scrollbar-thin">
            <Outlet />
          </div>
        </main>

        {/* Right Panel - Now Playing Info */}
        {showRightPanel && showNowPlaying && (
          <aside
            className="w-[260px] shrink-0 m-2 ml-0 rounded-2xl overflow-hidden relative z-10 transition-all duration-500"
            style={{
              background: gradientEnabled
                ? `linear-gradient(180deg, ${colors.primary}95 0%, ${colors.secondary}70 40%, #0a0a0a 100%)`
                : "#1a1a1a",
            }}
          >
            <div className="h-full overflow-y-auto scrollbar-thin p-4 backdrop-blur-xl bg-black/20">
              {/* Album Art with glow effect */}
              <div className="relative mb-4 group">
                <div
                  className="absolute -inset-2 rounded-2xl opacity-60 blur-xl transition-opacity duration-500"
                  style={{ background: colors.primary }}
                />
                <div className="relative rounded-xl overflow-hidden shadow-2xl ring-1 ring-white/10">
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
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-3">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-accent-primary animate-pulse" />
                        <span className="text-xs text-white font-medium">
                          Streaming from {currentStreamInfo.source}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Track Info */}
              <div className="mb-5 text-center">
                <h2 className="text-lg font-bold text-text-primary truncate mb-1">
                  {isStreaming
                    ? currentSpotifyTrack?.name
                    : playbackState.current_track?.title}
                </h2>
                <p className="text-sm text-text-secondary truncate">
                  {isStreaming
                    ? currentSpotifyTrack?.artists.join(", ")
                    : playbackState.current_track?.artist}
                </p>
              </div>

              {/* About the artist section */}
              <div className="bg-white/5 backdrop-blur-md rounded-xl p-3 border border-white/10">
                <h3 className="text-xs font-semibold text-text-primary/80 mb-2 uppercase tracking-wider">
                  Artist
                </h3>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-accent-primary/30 to-accent-secondary/20 flex items-center justify-center overflow-hidden ring-2 ring-white/10">
                    <span className="text-xl">🎤</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-text-primary truncate">
                      {isStreaming
                        ? currentSpotifyTrack?.artists[0]
                        : playbackState.current_track?.artist}
                    </p>
                    <p className="text-[10px] text-text-secondary">Artist</p>
                  </div>
                </div>
                <button className="w-full py-2 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-medium text-text-primary transition-all">
                  Follow
                </button>
              </div>

              {/* Audio Quality */}
              <div className="mt-3 bg-white/5 backdrop-blur-md rounded-xl p-3 border border-white/10">
                <h3 className="text-xs font-semibold text-text-primary/80 mb-2 uppercase tracking-wider">
                  Quality
                </h3>
                {isStreaming && currentStreamInfo ? (
                  <div className="space-y-2 text-xs">
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
                      <div className="mt-3 py-1.5 bg-gradient-to-r from-accent-primary/30 to-accent-secondary/20 rounded-lg text-center border border-accent-primary/30">
                        <span className="text-[10px] font-bold text-accent-primary uppercase tracking-wider">
                          ✦ Hi-Res Audio
                        </span>
                      </div>
                    )}
                  </div>
                ) : playbackState.current_track ? (
                  <div className="space-y-2 text-xs">
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
                        {(
                          playbackState.current_track.sample_rate / 1000
                        ).toFixed(1)}{" "}
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
                      <div className="mt-3 py-1.5 bg-gradient-to-r from-[#1DB954]/30 to-emerald-500/20 rounded-lg text-center border border-[#1DB954]/30">
                        <span className="text-[10px] font-bold text-[#1DB954] uppercase tracking-wider">
                          ✦ Hi-Res Audio
                        </span>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>

              {/* Album Info */}
              <div className="mt-3 bg-white/5 backdrop-blur-md rounded-xl p-3 border border-white/10">
                <h3 className="text-xs font-semibold text-text-primary/80 mb-1 uppercase tracking-wider">
                  Album
                </h3>
                <p className="text-text-primary text-sm font-medium truncate">
                  {isStreaming
                    ? currentSpotifyTrack?.album
                    : playbackState.current_track?.album}
                </p>
                {!isStreaming && playbackState.current_track?.year && (
                  <p className="text-text-muted text-[10px] mt-0.5">
                    {playbackState.current_track.year}
                  </p>
                )}
                {isStreaming && currentSpotifyTrack?.release_date && (
                  <p className="text-text-muted text-[10px] mt-0.5">
                    {currentSpotifyTrack.release_date.split("-")[0]}
                  </p>
                )}
              </div>

              {/* Bottom padding for player bar */}
              <div className="h-24" />
            </div>
          </aside>
        )}

        {/* Player bar */}
        <PlayerBar />
      </div>
    </div>
  );
}
