import { useState, useEffect, useRef } from "react";
import { clsx } from "clsx";
import { useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/tauri";
import { usePlayerStore } from "../../stores/playerStore";
import { useLibraryStore } from "../../stores/libraryStore";
import { useStreamingStore } from "../../stores/streamingStore";
import { useGradient } from "../../contexts/GradientContext";
import AlbumArt from "../common/AlbumArt";
import {
  PlayIcon,
  PauseIcon,
  NextIcon,
  PreviousIcon,
  ShuffleIcon,
  RepeatIcon,
  RepeatOneIcon,
  VolumeIcon,
  VolumeMuteIcon,
  HeartIcon,
  HeartFilledIcon,
  QueueIcon,
  DevicesIcon,
  ExpandIcon,
  GlobeIcon,
} from "../icons";
import { formatTime } from "../../utils/format";
import {
  formatDuration,
  getSourceIcon,
  isHiRes as isStreamHiRes,
} from "../../types/streaming";

export default function PlayerBar() {
  const navigate = useNavigate();
  const {
    playbackState,
    togglePlayPause,
    seekTo,
    setVolume,
    nextTrack,
    previousTrack,
    toggleShuffle,
    cycleRepeatMode,
  } = usePlayerStore();

  const toggleFavorite = useLibraryStore((state) => state.toggleFavorite);
  const { setColorsFromImage } = useGradient();

  // Streaming state
  const {
    currentSpotifyTrack,
    currentStreamInfo,
    isPlaying: isStreamPlaying,
    isLoadingStream,
    togglePlayPause: toggleStreamPlayPause,
    nextStreamTrack,
    previousStreamTrack,
    seekToPosition: seekStreamPosition,
  } = useStreamingStore();

  const [isSeeking, setIsSeeking] = useState(false);
  const [seekPosition, setSeekPosition] = useState(0);
  const [artworkUrl, setArtworkUrl] = useState<string | null>(null);
  const [isVolumeHovered, setIsVolumeHovered] = useState(false);
  const progressRef = useRef<HTMLDivElement>(null);
  const volumeRef = useRef<HTMLDivElement>(null);

  const {
    current_track,
    is_playing,
    position,
    duration,
    volume,
    shuffle,
    repeat_mode,
  } = playbackState;

  // Load artwork when track changes
  useEffect(() => {
    if (current_track?.file_path) {
      invoke<string | null>("get_track_artwork", {
        filePath: current_track.file_path,
      })
        .then((url) => {
          setArtworkUrl(url);
          if (url) {
            setColorsFromImage(url);
          }
        })
        .catch(console.error);
    } else if (currentSpotifyTrack?.cover_url) {
      // Use Spotify cover for streaming tracks
      setArtworkUrl(currentSpotifyTrack.cover_url);
      setColorsFromImage(currentSpotifyTrack.cover_url);
    }
  }, [
    current_track?.file_path,
    currentSpotifyTrack?.cover_url,
    setColorsFromImage,
  ]);

  // Determine if we're in streaming mode
  const isStreaming = currentSpotifyTrack !== null;
  const isPlaying = isStreaming ? isStreamPlaying : is_playing;
  const activeTrackName = isStreaming
    ? currentSpotifyTrack.name
    : current_track?.title;
  const activeTrackArtist = isStreaming
    ? currentSpotifyTrack.artists.join(", ")
    : current_track?.artist;
  const activeTrackAlbum = isStreaming
    ? currentSpotifyTrack.album
    : current_track?.album;
  // For streaming: use Spotify duration for display, but audio engine's duration for buffered amount
  const totalDuration = isStreaming
    ? currentSpotifyTrack.duration_ms / 1000
    : duration;
  // The audio engine's duration represents how much audio is actually loaded/buffered
  const bufferedDuration = duration;
  const activeArtwork = isStreaming
    ? currentSpotifyTrack.cover_url
    : artworkUrl;

  // For progressive streaming, the audio engine's position already reflects the
  // absolute position in the combined buffer (chunks are appended, not replaced).
  // No need to add chunk offset - just use the position directly.
  const activePosition = position;

  // Calculate buffered percentage for streaming
  const bufferedPercent =
    isStreaming && totalDuration > 0
      ? Math.min(100, (bufferedDuration / totalDuration) * 100)
      : 100;

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressRef.current || !totalDuration) return;

    const rect = progressRef.current.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    const newPosition = percent * totalDuration;

    // For streaming, use seekStreamPosition which handles chunk prioritization
    if (isStreaming && currentSpotifyTrack) {
      seekStreamPosition(currentSpotifyTrack.id, newPosition, totalDuration);
    } else {
      seekTo(newPosition);
    }
  };

  const handleProgressDrag = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isSeeking || !progressRef.current || !totalDuration) return;

    const rect = progressRef.current.getBoundingClientRect();
    const percent = Math.max(
      0,
      Math.min(1, (e.clientX - rect.left) / rect.width),
    );
    setSeekPosition(percent * totalDuration);
  };

  const handleProgressMouseUp = () => {
    if (isSeeking) {
      // For streaming, use seekStreamPosition which handles chunk prioritization
      if (isStreaming && currentSpotifyTrack) {
        seekStreamPosition(currentSpotifyTrack.id, seekPosition, totalDuration);
      } else {
        seekTo(seekPosition);
      }
      setIsSeeking(false);
    }
  };

  const handleVolumeClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!volumeRef.current) return;

    const rect = volumeRef.current.getBoundingClientRect();
    const percent = Math.max(
      0,
      Math.min(1, (e.clientX - rect.left) / rect.width),
    );
    setVolume(percent);
  };

  const displayPosition = isSeeking ? seekPosition : activePosition;
  const progress =
    totalDuration > 0 ? (displayPosition / totalDuration) * 100 : 0;

  const RepeatIconComponent =
    repeat_mode === "one" ? RepeatOneIcon : RepeatIcon;
  const VolumeIconComponent = volume === 0 ? VolumeMuteIcon : VolumeIcon;
  const FavoriteIconComponent = current_track?.is_favorite
    ? HeartFilledIcon
    : HeartIcon;

  return (
    <div className="fixed bottom-0 left-0 right-0 h-[90px] bg-amoled-black border-t border-amoled-border z-50">
      <div className="flex items-center h-full px-4">
        {/* Left - Track Info */}
        <div className="flex items-center gap-3 w-[30%] min-w-[180px]">
          {(current_track || currentSpotifyTrack) && (
            <>
              <div
                className="relative w-14 h-14 rounded overflow-hidden flex-shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => {
                  if (!isStreaming && current_track) {
                    navigate(
                      `/albums/${encodeURIComponent(current_track.album)}/${encodeURIComponent(current_track.artist)}`,
                    );
                  }
                }}
              >
                {activeArtwork ? (
                  <img
                    src={activeArtwork}
                    alt={activeTrackAlbum}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <AlbumArt
                    src={null}
                    alt={activeTrackAlbum || ""}
                    size="sm"
                    className="w-full h-full object-cover"
                  />
                )}
                {/* Streaming indicator */}
                {isStreaming && (
                  <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5 flex items-center justify-center gap-1">
                    <GlobeIcon className="w-3 h-3 text-accent-primary" />
                    <span className="text-2xs text-accent-primary">
                      {currentStreamInfo?.source || "Stream"}
                    </span>
                  </div>
                )}
                {/* Loading spinner for streaming */}
                {isLoadingStream && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                    <div className="w-6 h-6 border-2 border-accent-primary border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <p
                  className="text-sm font-medium text-text-primary truncate hover:underline cursor-pointer"
                  onClick={() => {
                    if (!isStreaming && current_track) {
                      navigate(
                        `/albums/${encodeURIComponent(current_track.album)}/${encodeURIComponent(current_track.artist)}`,
                      );
                    }
                  }}
                >
                  {activeTrackName}
                </p>
                <p
                  className="text-xs text-text-secondary truncate hover:underline cursor-pointer"
                  onClick={() => {
                    if (!isStreaming && current_track) {
                      navigate(
                        `/artists/${encodeURIComponent(current_track.artist)}`,
                      );
                    }
                  }}
                >
                  {activeTrackArtist}
                </p>
              </div>

              {!isStreaming && current_track && (
                <button
                  onClick={() => toggleFavorite(current_track.id)}
                  className={clsx(
                    "p-2 transition-colors",
                    current_track.is_favorite
                      ? "text-[#1DB954]"
                      : "text-text-muted hover:text-text-primary",
                  )}
                >
                  <FavoriteIconComponent className="w-4 h-4" />
                </button>
              )}
            </>
          )}
        </div>

        {/* Center - Player Controls */}
        <div className="flex-1 flex flex-col items-center gap-1 max-w-[722px] mx-auto">
          {/* Control Buttons */}
          <div className="flex items-center gap-4">
            <button
              onClick={toggleShuffle}
              className={clsx(
                "p-2 transition-colors",
                shuffle
                  ? "text-[#1DB954]"
                  : "text-text-secondary hover:text-text-primary",
              )}
            >
              <ShuffleIcon className="w-4 h-4" />
            </button>

            <button
              onClick={isStreaming ? previousStreamTrack : previousTrack}
              className="p-2 text-text-secondary hover:text-text-primary transition-colors"
            >
              <PreviousIcon className="w-5 h-5" />
            </button>

            <button
              onClick={isStreaming ? toggleStreamPlayPause : togglePlayPause}
              disabled={isLoadingStream}
              className="p-2 bg-text-primary text-amoled-black rounded-full hover:scale-105 transition-transform disabled:opacity-50"
            >
              {isLoadingStream ? (
                <div className="w-5 h-5 border-2 border-amoled-black border-t-transparent rounded-full animate-spin" />
              ) : isPlaying ? (
                <PauseIcon className="w-5 h-5" />
              ) : (
                <PlayIcon className="w-5 h-5 ml-0.5" />
              )}
            </button>

            <button
              onClick={isStreaming ? nextStreamTrack : nextTrack}
              className="p-2 text-text-secondary hover:text-text-primary transition-colors"
            >
              <NextIcon className="w-5 h-5" />
            </button>

            <button
              onClick={cycleRepeatMode}
              className={clsx(
                "p-2 transition-colors relative",
                repeat_mode !== "off"
                  ? "text-[#1DB954]"
                  : "text-text-secondary hover:text-text-primary",
              )}
            >
              <RepeatIconComponent className="w-4 h-4" />
              {repeat_mode !== "off" && (
                <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 bg-[#1DB954] rounded-full" />
              )}
            </button>
          </div>

          {/* Progress Bar */}
          <div className="w-full flex items-center gap-2">
            <span className="text-xs text-text-muted w-10 text-right tabular-nums">
              {formatTime(displayPosition)}
            </span>

            <div
              ref={progressRef}
              className="flex-1 h-1 bg-amoled-hover rounded-full cursor-pointer group relative"
              onClick={handleProgressClick}
              onMouseDown={() => setIsSeeking(true)}
              onMouseMove={handleProgressDrag}
              onMouseUp={handleProgressMouseUp}
              onMouseLeave={handleProgressMouseUp}
            >
              {/* Buffered indicator (shows how much is downloaded for streaming) */}
              {isStreaming && bufferedPercent < 100 && (
                <div
                  className="absolute h-full bg-text-muted/30 rounded-full transition-all duration-300"
                  style={{ width: `${bufferedPercent}%` }}
                />
              )}
              {/* Playback progress */}
              <div
                className="h-full bg-text-primary group-hover:bg-[#1DB954] rounded-full relative transition-colors z-10"
                style={{ width: `${progress}%` }}
              >
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-text-primary rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg" />
              </div>
            </div>

            <span className="text-xs text-text-muted w-10 tabular-nums">
              {formatTime(totalDuration)}
            </span>
          </div>
        </div>

        {/* Right - Additional Controls */}
        <div className="flex items-center gap-2 w-[30%] min-w-[180px] justify-end">
          {/* Audio Quality Badge */}
          {isStreaming && currentStreamInfo && (
            <div className="hidden lg:flex items-center gap-1 px-2 py-0.5 bg-amoled-hover rounded text-xs mr-2">
              <span className="text-lg mr-1">
                {getSourceIcon(currentStreamInfo.source)}
              </span>
              <span
                className={clsx(
                  "font-medium",
                  isStreamHiRes(currentStreamInfo)
                    ? "text-accent-primary"
                    : "text-blue-400",
                )}
              >
                {currentStreamInfo.bit_depth || 16}bit/
                {((currentStreamInfo.sample_rate || 44100) / 1000).toFixed(1)}
                kHz
              </span>
            </div>
          )}
          {!isStreaming && current_track && (
            <div className="hidden lg:flex items-center gap-1 px-2 py-0.5 bg-amoled-hover rounded text-xs mr-2">
              <span
                className={clsx(
                  "font-medium",
                  current_track.bit_depth >= 24
                    ? "text-[#1DB954]"
                    : "text-text-secondary",
                )}
              >
                {current_track.bit_depth}bit/
                {(current_track.sample_rate / 1000).toFixed(1)}kHz
              </span>
            </div>
          )}

          <button className="p-2 text-text-secondary hover:text-text-primary transition-colors">
            <QueueIcon className="w-4 h-4" />
          </button>

          <button className="p-2 text-text-secondary hover:text-text-primary transition-colors">
            <DevicesIcon className="w-4 h-4" />
          </button>

          {/* Volume Control */}
          <div
            className="flex items-center gap-1"
            onMouseEnter={() => setIsVolumeHovered(true)}
            onMouseLeave={() => setIsVolumeHovered(false)}
          >
            <button
              onClick={() => setVolume(volume === 0 ? 1 : 0)}
              className="p-2 text-text-secondary hover:text-text-primary transition-colors"
            >
              <VolumeIconComponent className="w-4 h-4" />
            </button>

            <div
              ref={volumeRef}
              className="w-24 h-1 bg-amoled-hover rounded-full cursor-pointer group relative"
              onClick={handleVolumeClick}
            >
              <div
                className="h-full bg-text-primary group-hover:bg-[#1DB954] rounded-full relative transition-colors"
                style={{ width: `${volume * 100}%` }}
              >
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-text-primary rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg" />
              </div>
            </div>
          </div>

          <button className="p-2 text-text-secondary hover:text-text-primary transition-colors">
            <ExpandIcon className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
