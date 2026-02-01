import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/tauri';
import { clsx } from 'clsx';
import { useLibraryStore } from '../stores/libraryStore';
import { usePlayerStore } from '../stores/playerStore';
import AlbumArt from '../components/common/AlbumArt';
import { PlayIcon, SearchIcon } from '../components/icons';
import type { Album, Track } from '../types';

export default function AlbumsPage() {
  const navigate = useNavigate();
  const { albums } = useLibraryStore();
  const { playTrack } = usePlayerStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [albumArtworks, setAlbumArtworks] = useState<Record<string, string>>({});

  const filteredAlbums = albums.filter(album =>
    album.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    album.artist.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handlePlayAlbum = async (album: Album, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const tracks = await invoke<Track[]>('get_album_tracks', {
        album: album.name,
        artist: album.artist,
      });
      if (tracks.length > 0) {
        playTrack(tracks[0], tracks);
      }
    } catch (error) {
      console.error('Failed to play album:', error);
    }
  };

  const handleAlbumClick = (album: Album) => {
    navigate(`/albums/${encodeURIComponent(album.name)}/${encodeURIComponent(album.artist)}`);
  };

  return (
    <div className="p-6 pb-28">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-text-primary">Albums</h1>
        <div className="relative">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter albums..."
            className="pl-9 pr-4 py-2 bg-amoled-card rounded-lg text-sm text-text-primary placeholder-text-muted border border-amoled-border focus:border-accent-primary focus:outline-none transition-colors"
          />
        </div>
      </div>

      {/* Album Grid */}
      {filteredAlbums.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
          {filteredAlbums.map((album) => (
            <AlbumCard
              key={`${album.name}-${album.artist}`}
              album={album}
              onClick={() => handleAlbumClick(album)}
              onPlay={(e) => handlePlayAlbum(album, e)}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-16">
          <p className="text-text-secondary">
            {searchQuery ? 'No albums match your search' : 'No albums in your library'}
          </p>
        </div>
      )}
    </div>
  );
}

interface AlbumCardProps {
  album: Album;
  onClick: () => void;
  onPlay: (e: React.MouseEvent) => void;
}

function AlbumCard({ album, onClick, onPlay }: AlbumCardProps) {
  const [artwork, setArtwork] = useState<string | null>(null);
  const [isHovered, setIsHovered] = useState(false);

  // Load first track artwork for the album
  useEffect(() => {
    invoke<Track[]>('get_album_tracks', { album: album.name, artist: album.artist })
      .then(tracks => {
        if (tracks.length > 0) {
          return invoke<string | null>('get_track_artwork', { filePath: tracks[0].file_path });
        }
        return null;
      })
      .then(url => setArtwork(url))
      .catch(console.error);
  }, [album.name, album.artist]);

  return (
    <div
      className="group cursor-pointer"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onClick}
    >
      <div className="relative mb-3 rounded-lg overflow-hidden shadow-card bg-amoled-card">
        <AlbumArt
          src={artwork}
          alt={album.name}
          size="xl"
          className="w-full aspect-square"
        />
        <div className={clsx(
          'absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent flex items-end justify-end p-3 transition-opacity',
          isHovered ? 'opacity-100' : 'opacity-0'
        )}>
          <button 
            onClick={onPlay}
            className="p-3 bg-accent-primary rounded-full shadow-lg transform hover:scale-105 transition-transform"
          >
            <PlayIcon className="w-5 h-5 text-amoled-black" />
          </button>
        </div>
      </div>
      <h3 className="font-medium text-text-primary truncate text-sm">{album.name}</h3>
      <p className="text-xs text-text-secondary truncate">
        {album.artist}
        {album.year && ` • ${album.year}`}
      </p>
      <p className="text-xs text-text-muted mt-0.5">
        {album.track_count} tracks
      </p>
    </div>
  );
}
