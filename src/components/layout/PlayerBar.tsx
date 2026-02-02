import { useState, useEffect, useRef } from "react";
import { clsx } from "clsx";
import { useNavigate } from "react-router-dom";
import { usePlayerStore } from "../../stores/playerStore";
import { useLibraryStore } from "../../stores/libraryStore";
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
} from "../icons";
import { formatTime } from "../../utils/format";

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
      import("@tauri-apps/api/tauri").then(({ invoke }) => {
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
      });
    }
  }, [current_track?.file_path, setColorsFromImage]);

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressRef.current || !duration) return;

    const rect = progressRef.current.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    const newPosition = percent * duration;
    seekTo(newPosition);
  };

  const handleProgressDrag = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isSeeking || !progressRef.current || !duration) return;

    const rect = progressRef.current.getBoundingClientRect();
    const percent = Math.max(
      0,
      Math.min(1, (e.clientX - rect.left) / rect.width),
    );
    setSeekPosition(percent * duration);
  };

  const handleProgressMouseUp = () => {
    if (isSeeking) {
      seekTo(seekPosition);
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

  const displayPosition = isSeeking ? seekPosition : position;
  const progress = duration > 0 ? (displayPosition / duration) * 100 : 0;

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
          {current_track && (
            <>
              <div
                className="w-14 h-14 rounded overflow-hidden flex-shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() =>
                  navigate(
                    `/albums/${encodeURIComponent(current_track.album)}/${encodeURIComponent(current_track.artist)}`,
                  )
                }
              >
                <AlbumArt
                  src={artworkUrl}
                  alt={current_track.album}
                  size="sm"
                  className="w-full h-full object-cover"
                />
              </div>

              <div className="min-w-0 flex-1">
                <p
                  className="text-sm font-medium text-text-primary truncate hover:underline cursor-pointer"
                  onClick={() =>
                    navigate(
                      `/albums/${encodeURIComponent(current_track.album)}/${encodeURIComponent(current_track.artist)}`,
                    )
                  }
                >
                  {current_track.title}
                </p>
                <p
                  className="text-xs text-text-secondary truncate hover:underline cursor-pointer"
                  onClick={() =>
                    navigate(
                      `/artists/${encodeURIComponent(current_track.artist)}`,
                    )
                  }
                >
                  {current_track.artist}
                </p>
              </div>

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
              onClick={previousTrack}
              className="p-2 text-text-secondary hover:text-text-primary transition-colors"
            >
              <PreviousIcon className="w-5 h-5" />
            </button>

            <button
              onClick={togglePlayPause}
              className="p-2 bg-text-primary text-amoled-black rounded-full hover:scale-105 transition-transform"
            >
              {is_playing ? (
                <PauseIcon className="w-5 h-5" />
              ) : (
                <PlayIcon className="w-5 h-5 ml-0.5" />
              )}
            </button>

            <button
              onClick={nextTrack}
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
              <div
                className="h-full bg-text-primary group-hover:bg-[#1DB954] rounded-full relative transition-colors"
                style={{ width: `${progress}%` }}
              >
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-text-primary rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg" />
              </div>
            </div>

            <span className="text-xs text-text-muted w-10 tabular-nums">
              {formatTime(duration)}
            </span>
          </div>
        </div>

        {/* Right - Additional Controls */}
        <div className="flex items-center gap-2 w-[30%] min-w-[180px] justify-end">
          {/* Audio Quality Badge */}
          {current_track && (
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
