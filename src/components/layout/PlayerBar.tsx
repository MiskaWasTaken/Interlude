import { useState, useEffect, useRef } from 'react';
import { clsx } from 'clsx';
import { usePlayerStore } from '../../stores/playerStore';
import { useLibraryStore } from '../../stores/libraryStore';
import { useGradient } from '../../contexts/GradientContext';
import AlbumArt from '../common/AlbumArt';
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
  ABLoopIcon,
} from '../icons';
import { formatTime } from '../../utils/format';

export default function PlayerBar() {
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

  const toggleFavorite = useLibraryStore(state => state.toggleFavorite);
  const { setColorsFromImage } = useGradient();
  
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekPosition, setSeekPosition] = useState(0);
  const [abLoop, setAbLoop] = useState<{ a: number | null; b: number | null }>({ a: null, b: null });
  const [artworkUrl, setArtworkUrl] = useState<string | null>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  const { current_track, is_playing, position, duration, volume, shuffle, repeat_mode } = playbackState;

  // Load artwork when track changes
  useEffect(() => {
    if (current_track?.file_path) {
      import('@tauri-apps/api/tauri').then(({ invoke }) => {
        invoke<string | null>('get_track_artwork', { filePath: current_track.file_path })
          .then(url => {
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
    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setSeekPosition(percent * duration);
  };

  const handleProgressMouseUp = () => {
    if (isSeeking) {
      seekTo(seekPosition);
      setIsSeeking(false);
    }
  };

  const handleABLoop = () => {
    if (abLoop.a === null) {
      setAbLoop({ a: position, b: null });
    } else if (abLoop.b === null) {
      setAbLoop({ ...abLoop, b: position });
    } else {
      setAbLoop({ a: null, b: null });
    }
  };

  const displayPosition = isSeeking ? seekPosition : position;
  const progress = duration > 0 ? (displayPosition / duration) * 100 : 0;

  const RepeatIconComponent = repeat_mode === 'one' ? RepeatOneIcon : RepeatIcon;
  const VolumeIconComponent = volume === 0 ? VolumeMuteIcon : VolumeIcon;
  const FavoriteIconComponent = current_track?.is_favorite ? HeartFilledIcon : HeartIcon;

  return (
    <div className="fixed bottom-0 left-0 right-0 h-20 bg-amoled-elevated/95 backdrop-blur-xl border-t border-amoled-border z-50">
      <div className="flex items-center h-full px-4 gap-4">
        {/* Track Info */}
        <div className="flex items-center gap-3 w-72 min-w-0">
          <AlbumArt
            src={artworkUrl}
            alt={current_track?.album || 'No album'}
            size="sm"
            className="rounded shadow-lg"
          />
          
          {current_track ? (
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-text-primary truncate">
                {current_track.title}
              </p>
              <p className="text-xs text-text-secondary truncate">
                {current_track.artist}
                {current_track.album && ` • ${current_track.album}`}
              </p>
            </div>
          ) : (
            <div className="min-w-0 flex-1">
              <p className="text-sm text-text-muted">No track playing</p>
            </div>
          )}

          {current_track && (
            <button
              onClick={() => toggleFavorite(current_track.id)}
              className={clsx(
                'p-1.5 rounded-full transition-colors',
                current_track.is_favorite 
                  ? 'text-red-500 hover:text-red-400' 
                  : 'text-text-muted hover:text-text-primary'
              )}
            >
              <FavoriteIconComponent className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Player Controls */}
        <div className="flex-1 flex flex-col items-center gap-1.5 max-w-2xl">
          {/* Control Buttons */}
          <div className="flex items-center gap-4">
            <button
              onClick={toggleShuffle}
              className={clsx(
                'p-1.5 rounded-full transition-colors',
                shuffle ? 'text-accent-primary' : 'text-text-muted hover:text-text-primary'
              )}
            >
              <ShuffleIcon className="w-4 h-4" />
            </button>

            <button
              onClick={previousTrack}
              className="p-1.5 text-text-secondary hover:text-text-primary transition-colors"
            >
              <PreviousIcon className="w-5 h-5" />
            </button>

            <button
              onClick={togglePlayPause}
              className="p-2.5 bg-text-primary text-amoled-black rounded-full hover:scale-105 transition-transform"
            >
              {is_playing ? (
                <PauseIcon className="w-5 h-5" />
              ) : (
                <PlayIcon className="w-5 h-5" />
              )}
            </button>

            <button
              onClick={nextTrack}
              className="p-1.5 text-text-secondary hover:text-text-primary transition-colors"
            >
              <NextIcon className="w-5 h-5" />
            </button>

            <button
              onClick={cycleRepeatMode}
              className={clsx(
                'p-1.5 rounded-full transition-colors',
                repeat_mode !== 'off' ? 'text-accent-primary' : 'text-text-muted hover:text-text-primary'
              )}
            >
              <RepeatIconComponent className="w-4 h-4" />
            </button>

            <button
              onClick={handleABLoop}
              className={clsx(
                'p-1.5 rounded-full transition-colors',
                abLoop.a !== null ? 'text-accent-primary' : 'text-text-muted hover:text-text-primary'
              )}
              title={abLoop.a === null ? 'Set A point' : abLoop.b === null ? 'Set B point' : 'Clear A-B loop'}
            >
              <ABLoopIcon className="w-4 h-4" />
            </button>
          </div>

          {/* Progress Bar */}
          <div className="w-full flex items-center gap-2">
            <span className="text-2xs text-text-muted w-10 text-right tabular-nums">
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
              {/* A-B Loop markers */}
              {abLoop.a !== null && duration > 0 && (
                <div 
                  className="absolute top-0 bottom-0 w-0.5 bg-accent-primary"
                  style={{ left: `${(abLoop.a / duration) * 100}%` }}
                />
              )}
              {abLoop.b !== null && duration > 0 && (
                <div 
                  className="absolute top-0 bottom-0 w-0.5 bg-accent-primary"
                  style={{ left: `${(abLoop.b / duration) * 100}%` }}
                />
              )}
              
              {/* Progress fill */}
              <div 
                className="h-full bg-text-primary rounded-full relative"
                style={{ width: `${progress}%` }}
              >
                {/* Thumb */}
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-text-primary rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg" />
              </div>
            </div>
            
            <span className="text-2xs text-text-muted w-10 tabular-nums">
              {formatTime(duration)}
            </span>
          </div>
        </div>

        {/* Right Section */}
        <div className="flex items-center gap-3 w-72 justify-end">
          {/* Format Badge */}
          {current_track && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 bg-amoled-hover rounded text-2xs">
              <span className="text-accent-primary font-medium">
                {current_track.bit_depth}bit/{(current_track.sample_rate / 1000).toFixed(1)}kHz
              </span>
              <span className="text-text-muted">
                {current_track.format}
              </span>
            </div>
          )}

          {/* Volume Control */}
          <div 
            className="relative flex items-center"
            onMouseEnter={() => setShowVolumeSlider(true)}
            onMouseLeave={() => setShowVolumeSlider(false)}
          >
            <button
              onClick={() => setVolume(volume === 0 ? 1 : 0)}
              className="p-1.5 text-text-secondary hover:text-text-primary transition-colors"
            >
              <VolumeIconComponent className="w-5 h-5" />
            </button>
            
            {showVolumeSlider && (
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 p-3 bg-amoled-elevated rounded-lg shadow-lg">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={volume}
                  onChange={(e) => setVolume(parseFloat(e.target.value))}
                  className="w-24 h-1 appearance-none bg-amoled-hover rounded-full"
                  style={{
                    '--progress': `${volume * 100}%`,
                  } as React.CSSProperties}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
