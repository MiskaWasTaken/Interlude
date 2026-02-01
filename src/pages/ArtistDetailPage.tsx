import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/tauri';
import { clsx } from 'clsx';
import { usePlayerStore } from '../stores/playerStore';
import AlbumArt from '../components/common/AlbumArt';
import { PlayIcon, ArtistIcon } from '../components/icons';
import { formatDuration } from '../utils/format';
import type { Album, Track } from '../types';

export default function ArtistDetailPage() {
  const { artistName } = useParams<{ artistName: string }>();
  const navigate = useNavigate();
  const [albums, setAlbums] = useState<Album[]>([]);
  const [albumArtworks, setAlbumArtworks] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const { playTrack } = usePlayerStore();

  const artist = artistName ? decodeURIComponent(artistName) : '';

  useEffect(() => {
    async function loadArtist() {
      setIsLoading(true);
      try {
        const artistAlbums = await invoke<Album[]>('get_artist_albums', { artist });
        setAlbums(artistAlbums);

        // Load artworks for each album
        const artworks: Record<string, string> = {};
        for (const album of artistAlbums) {
          try {
            const tracks = await invoke<Track[]>('get_album_tracks', { 
              album: album.name, 
              artist: album.artist 
            });
            if (tracks.length > 0) {
              const url = await invoke<string | null>('get_track_artwork', { 
                filePath: tracks[0].file_path 
              });
              if (url) {
                artworks[album.name] = url;
              }
            }
          } catch (e) {
            console.error('Failed to load artwork:', e);
          }
        }
        setAlbumArtworks(artworks);
      } catch (error) {
        console.error('Failed to load artist:', error);
      } finally {
        setIsLoading(false);
      }
    }

    if (artist) {
      loadArtist();
    }
  }, [artist]);

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

  const handlePlayAll = async () => {
    try {
      const allTracks: Track[] = [];
      for (const album of albums) {
        const tracks = await invoke<Track[]>('get_album_tracks', {
          album: album.name,
          artist: album.artist,
        });
        allTracks.push(...tracks);
      }
      if (allTracks.length > 0) {
        playTrack(allTracks[0], allTracks);
      }
    } catch (error) {
      console.error('Failed to play all:', error);
    }
  };

  const totalTracks = albums.reduce((acc, album) => acc + album.track_count, 0);
  const totalDuration = albums.reduce((acc, album) => acc + album.total_duration, 0);

  if (isLoading) {
    return (
      <div className="p-6 pb-28 flex items-center justify-center min-h-screen">
        <div className="animate-pulse text-text-secondary">Loading artist...</div>
      </div>
    );
  }

  return (
    <div className="p-6 pb-28">
      {/* Artist Header */}
      <div className="flex items-end gap-6 mb-8">
        <div className="w-48 h-48 rounded-full bg-amoled-card flex items-center justify-center shadow-card">
          <ArtistIcon className="w-20 h-20 text-text-muted" />
        </div>
        <div className="flex-1">
          <p className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-2">
            Artist
          </p>
          <h1 className="text-4xl font-bold text-text-primary mb-2">{artist}</h1>
          <div className="flex items-center gap-2 text-text-secondary">
            <span>{albums.length} album{albums.length !== 1 ? 's' : ''}</span>
            <span>•</span>
            <span>{totalTracks} songs</span>
            <span>•</span>
            <span>{formatDuration(totalDuration)}</span>
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
          Play All
        </button>
      </div>

      {/* Albums */}
      <div>
        <h2 className="text-xl font-semibold text-text-primary mb-4">Albums</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5">
          {albums.map((album) => (
            <AlbumCard
              key={album.name}
              album={album}
              artwork={albumArtworks[album.name]}
              onClick={() => navigate(`/albums/${encodeURIComponent(album.name)}/${encodeURIComponent(album.artist)}`)}
              onPlay={(e) => handlePlayAlbum(album, e)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

interface AlbumCardProps {
  album: Album;
  artwork?: string;
  onClick: () => void;
  onPlay: (e: React.MouseEvent) => void;
}

function AlbumCard({ album, artwork, onClick, onPlay }: AlbumCardProps) {
  const [isHovered, setIsHovered] = useState(false);

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
      <p className="text-xs text-text-secondary">
        {album.year || 'Unknown year'} • {album.track_count} tracks
      </p>
    </div>
  );
}
