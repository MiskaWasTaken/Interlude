import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/tauri';
import { clsx } from 'clsx';
import { usePlayerStore } from '../stores/playerStore';
import { useLibraryStore } from '../stores/libraryStore';
import AlbumArt from '../components/common/AlbumArt';
import { PlayIcon, HeartIcon, HeartFilledIcon, ClockIcon, SparklesIcon, AudioWaveIcon } from '../components/icons';
import { formatTime, isHiRes } from '../utils/format';
import type { Track } from '../types';

export default function SmartPlaylistPage() {
  const { playlistId } = useParams<{ playlistId: string }>();
  const [tracks, setTracks] = useState<Track[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const { playTrack, playbackState, togglePlayPause } = usePlayerStore();
  const { toggleFavorite } = useLibraryStore();

  const playlistInfo = {
    favorites: { name: 'Favorites', icon: HeartFilledIcon, color: 'text-red-500' },
    'recently-added': { name: 'Recently Added', icon: SparklesIcon, color: 'text-yellow-500' },
    hires: { name: 'Hi-Res Only', icon: AudioWaveIcon, color: 'text-green-500' },
  }[playlistId || ''] || { name: 'Playlist', icon: SparklesIcon, color: 'text-accent-primary' };

  useEffect(() => {
    async function loadPlaylist() {
      setIsLoading(true);
      try {
        let playlistTracks: Track[] = [];

        switch (playlistId) {
          case 'favorites':
            playlistTracks = await invoke<Track[]>('get_favorites');
            break;
          case 'recently-added':
            const allTracks = await invoke<Track[]>('get_all_tracks');
            playlistTracks = allTracks
              .sort((a, b) => parseInt(b.date_added) - parseInt(a.date_added))
              .slice(0, 50);
            break;
          case 'hires':
            const allTracksHires = await invoke<Track[]>('get_all_tracks');
            playlistTracks = allTracksHires.filter(t => t.bit_depth >= 24 || t.sample_rate > 48000);
            break;
        }

        setTracks(playlistTracks);
      } catch (error) {
        console.error('Failed to load playlist:', error);
      } finally {
        setIsLoading(false);
      }
    }

    if (playlistId) {
      loadPlaylist();
    }
  }, [playlistId]);

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

  const Icon = playlistInfo.icon;

  if (isLoading) {
    return (
      <div className="p-6 pb-28 flex items-center justify-center min-h-screen">
        <div className="animate-pulse text-text-secondary">Loading playlist...</div>
      </div>
    );
  }

  return (
    <div className="p-6 pb-28">
      {/* Header */}
      <div className="flex items-end gap-6 mb-8">
        <div className={clsx(
          'w-48 h-48 rounded-xl bg-amoled-card flex items-center justify-center shadow-card',
          playlistId === 'favorites' && 'bg-gradient-to-br from-red-900/30 to-pink-900/30',
          playlistId === 'recently-added' && 'bg-gradient-to-br from-yellow-900/30 to-orange-900/30',
          playlistId === 'hires' && 'bg-gradient-to-br from-green-900/30 to-emerald-900/30'
        )}>
          <Icon className={clsx('w-20 h-20', playlistInfo.color)} />
        </div>
        <div className="flex-1">
          <p className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-2">
            Smart Playlist
          </p>
          <h1 className="text-4xl font-bold text-text-primary mb-2">{playlistInfo.name}</h1>
          <p className="text-text-secondary">
            {tracks.length} track{tracks.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Play Button */}
      {tracks.length > 0 && (
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={handlePlayAll}
            className="flex items-center gap-2 px-6 py-3 bg-accent-primary text-amoled-black rounded-full font-medium hover:bg-accent-secondary transition-colors"
          >
            <PlayIcon className="w-5 h-5" />
            Play
          </button>
        </div>
      )}

      {/* Track List */}
      {tracks.length > 0 ? (
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
              <TrackRow
                key={track.id}
                track={track}
                index={index}
                isPlaying={isPlaying}
                isCurrent={isCurrent}
                onPlay={() => handlePlayTrack(track)}
                onToggleFavorite={() => toggleFavorite(track.id)}
              />
            );
          })}
        </div>
      ) : (
        <div className="text-center py-16">
          <Icon className={clsx('w-16 h-16 mx-auto mb-4', playlistInfo.color)} />
          <h2 className="text-xl font-semibold text-text-primary mb-2">
            No tracks yet
          </h2>
          <p className="text-text-secondary">
            {playlistId === 'favorites' && 'Add tracks to your favorites to see them here'}
            {playlistId === 'recently-added' && 'Add some music to your library'}
            {playlistId === 'hires' && 'No Hi-Res tracks found in your library'}
          </p>
        </div>
      )}
    </div>
  );
}

interface TrackRowProps {
  track: Track;
  index: number;
  isPlaying: boolean;
  isCurrent: boolean;
  onPlay: () => void;
  onToggleFavorite: () => void;
}

function TrackRow({ track, index, isPlaying, isCurrent, onPlay, onToggleFavorite }: TrackRowProps) {
  const [artwork, setArtwork] = useState<string | null>(null);

  useEffect(() => {
    invoke<string | null>('get_track_artwork', { filePath: track.file_path })
      .then(setArtwork)
      .catch(console.error);
  }, [track.file_path]);

  return (
    <div
      className={clsx(
        'grid grid-cols-[auto_1fr_auto_auto_auto] gap-4 px-4 py-3 rounded-lg transition-colors group cursor-pointer',
        isCurrent ? 'bg-amoled-hover' : 'hover:bg-amoled-card'
      )}
      onClick={onPlay}
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
      <div className="min-w-0 flex items-center gap-3">
        <AlbumArt src={artwork} alt={track.album} size="xs" className="rounded flex-shrink-0" />
        <div className="min-w-0">
          <p className={clsx(
            'font-medium truncate',
            isCurrent ? 'text-accent-primary' : 'text-text-primary'
          )}>
            {track.title}
          </p>
          <p className="text-sm text-text-secondary truncate">
            {track.artist} • {track.album}
          </p>
        </div>
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
          onToggleFavorite();
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
}
