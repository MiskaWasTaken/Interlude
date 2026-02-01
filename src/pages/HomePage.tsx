import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/tauri';
import { clsx } from 'clsx';
import { useLibraryStore } from '../stores/libraryStore';
import { usePlayerStore } from '../stores/playerStore';
import { useGradient } from '../contexts/GradientContext';
import AlbumArt from '../components/common/AlbumArt';
import { SearchIcon, PlayIcon, StarFilledIcon, ClockIcon } from '../components/icons';
import { formatDuration, formatAudioQuality } from '../utils/format';
import type { Track } from '../types';

export default function HomePage() {
  const navigate = useNavigate();
  const { statistics, recentlyPlayed, tracks, albums } = useLibraryStore();
  const { playbackState, playTrack } = usePlayerStore();
  const { setColorsFromImage } = useGradient();
  const [searchQuery, setSearchQuery] = useState('');
  const [currentTrackArtwork, setCurrentTrackArtwork] = useState<string | null>(null);

  // Get current playing track artwork
  useEffect(() => {
    const track = playbackState.current_track;
    if (track?.file_path) {
      invoke<string | null>('get_track_artwork', { filePath: track.file_path })
        .then(url => {
          setCurrentTrackArtwork(url);
          if (url) setColorsFromImage(url);
        })
        .catch(console.error);
    }
  }, [playbackState.current_track?.file_path, setColorsFromImage]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery)}`);
    }
  };

  const handlePlayAlbum = async (albumName: string, artistName: string) => {
    try {
      const albumTracks = await invoke<Track[]>('get_album_tracks', { 
        album: albumName, 
        artist: artistName 
      });
      if (albumTracks.length > 0) {
        playTrack(albumTracks[0], albumTracks);
      }
    } catch (error) {
      console.error('Failed to play album:', error);
    }
  };

  // Get unique albums from recently played
  const recentAlbums = recentlyPlayed
    .reduce((acc, track) => {
      const key = `${track.album}-${track.artist}`;
      if (!acc.find(t => `${t.album}-${t.artist}` === key)) {
        acc.push(track);
      }
      return acc;
    }, [] as Track[])
    .slice(0, 5);

  return (
    <div className="p-6 pb-28 relative z-10">
      {/* Search Bar */}
      <div className="max-w-xl mx-auto mb-8">
        <form onSubmit={handleSearch} className="relative">
          <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tracks, albums, artists..."
            className="w-full pl-12 pr-4 py-3 bg-amoled-card/80 backdrop-blur rounded-full text-text-primary placeholder-text-muted border border-amoled-border focus:border-accent-primary focus:outline-none transition-colors"
          />
        </form>
      </div>

      {/* Welcome Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-text-primary mb-2">Welcome back</h1>
        <p className="text-text-secondary">Ready to enjoy some high-resolution audio?</p>
      </div>

      {/* Now Playing */}
      {playbackState.current_track && (
        <section className="mb-8">
          <h2 className="text-xl font-semibold text-text-primary mb-4">Now Playing</h2>
          <div className="bg-amoled-card/60 backdrop-blur rounded-xl p-4 flex items-center gap-4 border border-amoled-border">
            <AlbumArt
              src={currentTrackArtwork}
              alt={playbackState.current_track.album}
              size="lg"
              className="rounded-lg shadow-card"
            />
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-semibold text-text-primary truncate">
                {playbackState.current_track.title}
              </h3>
              <p className="text-text-secondary truncate">
                {playbackState.current_track.artist} • {playbackState.current_track.album}
              </p>
            </div>
            <div className="text-right">
              <div className="text-accent-primary text-sm font-medium">
                {formatAudioQuality(
                  playbackState.current_track.bit_depth,
                  playbackState.current_track.sample_rate
                )}
              </div>
              <div className="text-text-muted text-xs">
                {playbackState.current_track.format}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Statistics Cards */}
      <section className="mb-8">
        <div className="grid grid-cols-4 gap-4">
          <StatCard
            value={statistics?.total_tracks || 0}
            label="Tracks"
            icon={<span className="text-lg">♪</span>}
          />
          <StatCard
            value={statistics?.total_albums || 0}
            label="Albums"
            icon={<span className="text-lg">◉</span>}
          />
          <StatCard
            value={statistics?.total_artists || 0}
            label="Artists"
            icon={<StarFilledIcon className="w-5 h-5" />}
          />
          <StatCard
            value={formatDuration(statistics?.total_duration || 0)}
            label="Total Duration"
            icon={<ClockIcon className="w-5 h-5" />}
            isString
          />
        </div>
      </section>

      {/* Recently Played */}
      {recentAlbums.length > 0 && (
        <section className="mb-8">
          <h2 className="text-xl font-semibold text-text-primary mb-4">Recently Played</h2>
          <div className="grid grid-cols-5 gap-4">
            {recentAlbums.map((track) => (
              <RecentAlbumCard
                key={`${track.album}-${track.artist}`}
                track={track}
                onPlay={() => handlePlayAlbum(track.album, track.artist)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Quick Access Albums */}
      {albums.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-text-primary">Your Albums</h2>
            <Link 
              to="/albums" 
              className="text-sm text-text-secondary hover:text-text-primary transition-colors"
            >
              See all
            </Link>
          </div>
          <div className="grid grid-cols-5 gap-4">
            {albums.slice(0, 5).map((album) => (
              <AlbumCard
                key={`${album.name}-${album.artist}`}
                album={album}
                onClick={() => navigate(`/albums/${encodeURIComponent(album.name)}/${encodeURIComponent(album.artist)}`)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Empty State */}
      {tracks.length === 0 && (
        <div className="text-center py-16">
          <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-amoled-card flex items-center justify-center">
            <span className="text-4xl">🎵</span>
          </div>
          <h2 className="text-2xl font-semibold text-text-primary mb-2">
            Your library is empty
          </h2>
          <p className="text-text-secondary mb-6 max-w-md mx-auto">
            Add some folders containing your FLAC, WAV, or ALAC files to get started.
          </p>
          <button
            onClick={() => navigate('/library')}
            className="px-6 py-3 bg-accent-primary text-amoled-black font-medium rounded-full hover:bg-accent-secondary transition-colors"
          >
            Add Music Folder
          </button>
        </div>
      )}
    </div>
  );
}

interface StatCardProps {
  value: number | string;
  label: string;
  icon: React.ReactNode;
  isString?: boolean;
}

function StatCard({ value, label, icon, isString }: StatCardProps) {
  return (
    <div className="bg-amoled-card/60 backdrop-blur rounded-xl p-4 border border-amoled-border hover:border-amoled-hover transition-colors">
      <div className="flex items-start justify-between mb-3">
        <span className="text-3xl font-bold text-text-primary tabular-nums">
          {isString ? value : value.toLocaleString()}
        </span>
        <span className="text-text-muted">{icon}</span>
      </div>
      <p className="text-sm text-text-secondary">{label}</p>
    </div>
  );
}

interface RecentAlbumCardProps {
  track: Track;
  onPlay: () => void;
}

function RecentAlbumCard({ track, onPlay }: RecentAlbumCardProps) {
  const [artwork, setArtwork] = useState<string | null>(null);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    invoke<string | null>('get_track_artwork', { filePath: track.file_path })
      .then(setArtwork)
      .catch(console.error);
  }, [track.file_path]);

  return (
    <div
      className="group cursor-pointer"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onPlay}
    >
      <div className="relative mb-3 rounded-lg overflow-hidden shadow-card">
        <AlbumArt
          src={artwork}
          alt={track.album}
          size="xl"
          className="w-full aspect-square"
        />
        <div className={clsx(
          'absolute inset-0 bg-black/40 flex items-center justify-center transition-opacity',
          isHovered ? 'opacity-100' : 'opacity-0'
        )}>
          <button className="p-3 bg-accent-primary rounded-full shadow-lg transform hover:scale-105 transition-transform">
            <PlayIcon className="w-6 h-6 text-amoled-black" />
          </button>
        </div>
      </div>
      <h3 className="font-medium text-text-primary truncate text-sm">{track.album}</h3>
      <p className="text-xs text-text-secondary truncate">{track.artist}</p>
    </div>
  );
}

interface AlbumCardProps {
  album: { name: string; artist: string; year: number | null };
  onClick: () => void;
}

function AlbumCard({ album, onClick }: AlbumCardProps) {
  return (
    <div
      className="group cursor-pointer"
      onClick={onClick}
    >
      <div className="relative mb-3 rounded-lg overflow-hidden shadow-card bg-amoled-card aspect-square flex items-center justify-center">
        <span className="text-5xl text-text-muted">◉</span>
        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <button className="p-3 bg-accent-primary rounded-full shadow-lg transform hover:scale-105 transition-transform">
            <PlayIcon className="w-6 h-6 text-amoled-black" />
          </button>
        </div>
      </div>
      <h3 className="font-medium text-text-primary truncate text-sm">{album.name}</h3>
      <p className="text-xs text-text-secondary truncate">
        {album.artist}
        {album.year && ` • ${album.year}`}
      </p>
    </div>
  );
}
