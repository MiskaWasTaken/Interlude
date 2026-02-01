import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/tauri';
import { clsx } from 'clsx';
import { usePlayerStore } from '../stores/playerStore';
import { useLibraryStore } from '../stores/libraryStore';
import { useGradient } from '../contexts/GradientContext';
import AlbumArt from '../components/common/AlbumArt';
import { PlayIcon, PauseIcon, HeartIcon, HeartFilledIcon, ClockIcon } from '../components/icons';
import { formatTime, formatDuration, formatAudioQuality, isHiRes } from '../utils/format';
import type { Track } from '../types';

export default function AlbumDetailPage() {
  const { albumName, artistName } = useParams<{ albumName: string; artistName: string }>();
  const [tracks, setTracks] = useState<Track[]>([]);
  const [artwork, setArtwork] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  const { playbackState, playTrack, togglePlayPause } = usePlayerStore();
  const { toggleFavorite } = useLibraryStore();
  const { setColorsFromImage } = useGradient();

  const album = albumName ? decodeURIComponent(albumName) : '';
  const artist = artistName ? decodeURIComponent(artistName) : '';

  useEffect(() => {
    async function loadAlbum() {
      setIsLoading(true);
      try {
        const albumTracks = await invoke<Track[]>('get_album_tracks', { album, artist });
        setTracks(albumTracks);

        if (albumTracks.length > 0) {
          const artworkUrl = await invoke<string | null>('get_track_artwork', { 
            filePath: albumTracks[0].file_path 
          });
          setArtwork(artworkUrl);
          if (artworkUrl) {
            setColorsFromImage(artworkUrl);
          }
        }
      } catch (error) {
        console.error('Failed to load album:', error);
      } finally {
        setIsLoading(false);
      }
    }

    if (album && artist) {
      loadAlbum();
    }
  }, [album, artist, setColorsFromImage]);

  const handlePlayAll = () => {
    if (tracks.length > 0) {
      playTrack(tracks[0], tracks);
    }
  };

  const handlePlayTrack = (track: Track) => {
    const isCurrentTrack = playbackState.current_track?.id === track.id;
    if (isCurrentTrack) {
      togglePlayPause();
    } else {
      playTrack(track, tracks);
    }
  };

  const totalDuration = tracks.reduce((acc, track) => acc + track.duration, 0);
  const firstTrack = tracks[0];
  const albumYear = firstTrack?.year;
  const hasHiRes = tracks.some(t => isHiRes(t.bit_depth, t.sample_rate));

  if (isLoading) {
    return (
      <div className="p-6 pb-28 flex items-center justify-center min-h-screen">
        <div className="animate-pulse text-text-secondary">Loading album...</div>
      </div>
    );
  }

  return (
    <div className="p-6 pb-28">
      {/* Album Header */}
      <div className="flex items-end gap-6 mb-8">
        <AlbumArt
          src={artwork}
          alt={album}
          size="xl"
          className="w-52 h-52 rounded-lg shadow-card"
        />
        <div className="flex-1">
          <p className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-2">
            Album
          </p>
          <h1 className="text-4xl font-bold text-text-primary mb-2">{album}</h1>
          <div className="flex items-center gap-2 text-text-secondary">
            <span className="font-medium text-text-primary">{artist}</span>
            {albumYear && (
              <>
                <span>•</span>
                <span>{albumYear}</span>
              </>
            )}
            <span>•</span>
            <span>{tracks.length} songs</span>
            <span>•</span>
            <span>{formatDuration(totalDuration)}</span>
            {hasHiRes && (
              <>
                <span>•</span>
                <span className="text-accent-primary font-medium">Hi-Res</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Play Button */}
      <div className="flex items-center gap-4 mb-8">
        <button
          onClick={handlePlayAll}
          className="flex items-center gap-2 px-6 py-3 bg-accent-primary text-amoled-black rounded-full font-medium hover:bg-accent-secondary transition-colors"
        >
          <PlayIcon className="w-5 h-5" />
          Play
        </button>
      </div>

      {/* Track List */}
      <div className="space-y-1">
        {/* Header */}
        <div className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-4 px-4 py-2 text-xs text-text-muted uppercase tracking-wider border-b border-amoled-border">
          <span className="w-8 text-center">#</span>
          <span>Title</span>
          <span className="w-20 text-right">Quality</span>
          <span className="w-8" />
          <span className="w-12 text-right">
            <ClockIcon className="w-4 h-4 inline" />
          </span>
        </div>

        {/* Tracks */}
        {tracks.map((track, index) => {
          const isPlaying = playbackState.current_track?.id === track.id && playbackState.is_playing;
          const isCurrent = playbackState.current_track?.id === track.id;

          return (
            <div
              key={track.id}
              className={clsx(
                'grid grid-cols-[auto_1fr_auto_auto_auto] gap-4 px-4 py-3 rounded-lg transition-colors group cursor-pointer',
                isCurrent ? 'bg-amoled-hover' : 'hover:bg-amoled-card'
              )}
              onClick={() => handlePlayTrack(track)}
            >
              {/* Track Number / Play Icon */}
              <div className="w-8 flex items-center justify-center">
                <span className={clsx(
                  'text-sm tabular-nums',
                  isCurrent ? 'text-accent-primary' : 'text-text-muted group-hover:hidden'
                )}>
                  {isPlaying ? (
                    <div className="flex items-center gap-0.5">
                      <span className="w-0.5 h-3 bg-accent-primary animate-pulse" />
                      <span className="w-0.5 h-4 bg-accent-primary animate-pulse delay-75" />
                      <span className="w-0.5 h-2 bg-accent-primary animate-pulse delay-150" />
                    </div>
                  ) : (
                    index + 1
                  )}
                </span>
                {!isCurrent && (
                  <PlayIcon className="w-4 h-4 text-text-primary hidden group-hover:block" />
                )}
              </div>

              {/* Title & Artist */}
              <div className="min-w-0">
                <p className={clsx(
                  'font-medium truncate',
                  isCurrent ? 'text-accent-primary' : 'text-text-primary'
                )}>
                  {track.title}
                </p>
                <p className="text-sm text-text-secondary truncate">{track.artist}</p>
              </div>

              {/* Quality Badge */}
              <div className="w-20 flex items-center justify-end">
                <span className={clsx(
                  'text-2xs px-1.5 py-0.5 rounded',
                  isHiRes(track.bit_depth, track.sample_rate)
                    ? 'bg-accent-primary/20 text-accent-primary'
                    : 'bg-amoled-hover text-text-muted'
                )}>
                  {track.bit_depth}bit
                </span>
              </div>

              {/* Favorite */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFavorite(track.id);
                }}
                className={clsx(
                  'w-8 flex items-center justify-center transition-colors',
                  track.is_favorite ? 'text-red-500' : 'text-text-muted opacity-0 group-hover:opacity-100'
                )}
              >
                {track.is_favorite ? (
                  <HeartFilledIcon className="w-4 h-4" />
                ) : (
                  <HeartIcon className="w-4 h-4" />
                )}
              </button>

              {/* Duration */}
              <span className="w-12 text-sm text-text-muted text-right tabular-nums">
                {formatTime(track.duration)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
