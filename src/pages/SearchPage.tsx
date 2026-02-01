import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/tauri';
import { clsx } from 'clsx';
import { usePlayerStore } from '../stores/playerStore';
import { useLibraryStore } from '../stores/libraryStore';
import AlbumArt from '../components/common/AlbumArt';
import { SearchIcon, PlayIcon, HeartIcon, HeartFilledIcon, ArtistIcon } from '../components/icons';
import { formatTime, isHiRes } from '../utils/format';
import type { Track, Album, Artist, SearchResults } from '../types';

export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const query = searchParams.get('q') || '';
  const [searchQuery, setSearchQuery] = useState(query);
  const [results, setResults] = useState<SearchResults | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'tracks' | 'albums' | 'artists'>('all');

  const { playTrack, playbackState, togglePlayPause } = usePlayerStore();
  const { toggleFavorite, tracks: allTracks } = useLibraryStore();

  useEffect(() => {
    if (query) {
      performSearch(query);
    }
  }, [query]);

  const performSearch = async (q: string) => {
    if (!q.trim()) {
      setResults(null);
      return;
    }

    setIsSearching(true);
    try {
      const searchResults = await invoke<SearchResults>('search', { query: q });
      setResults(searchResults);
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      setSearchParams({ q: searchQuery });
    }
  };

  const handlePlayTrack = (track: Track) => {
    const isCurrentTrack = playbackState.current_track?.id === track.id;
    if (isCurrentTrack) {
      togglePlayPause();
    } else {
      playTrack(track, results?.tracks || [track]);
    }
  };

  const handlePlayAlbum = async (album: Album) => {
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

  const tabs = [
    { id: 'all', label: 'All' },
    { id: 'tracks', label: `Tracks (${results?.tracks.length || 0})` },
    { id: 'albums', label: `Albums (${results?.albums.length || 0})` },
    { id: 'artists', label: `Artists (${results?.artists.length || 0})` },
  ] as const;

  return (
    <div className="p-6 pb-28">
      {/* Search Header */}
      <div className="mb-8">
        <form onSubmit={handleSearch} className="relative max-w-2xl">
          <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tracks, albums, artists..."
            className="w-full pl-12 pr-4 py-4 bg-amoled-card rounded-xl text-lg text-text-primary placeholder-text-muted border border-amoled-border focus:border-accent-primary focus:outline-none transition-colors"
            autoFocus
          />
        </form>
      </div>

      {/* Results */}
      {isSearching ? (
        <div className="text-center py-16">
          <div className="animate-pulse text-text-secondary">Searching...</div>
        </div>
      ) : results ? (
        <>
          {/* Tabs */}
          <div className="flex gap-2 mb-6 border-b border-amoled-border">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={clsx(
                  'px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
                  activeTab === tab.id
                    ? 'text-text-primary border-accent-primary'
                    : 'text-text-secondary border-transparent hover:text-text-primary'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tracks */}
          {(activeTab === 'all' || activeTab === 'tracks') && results.tracks.length > 0 && (
            <section className="mb-8">
              {activeTab === 'all' && (
                <h2 className="text-lg font-semibold text-text-primary mb-4">Tracks</h2>
              )}
              <div className="space-y-1">
                {(activeTab === 'all' ? results.tracks.slice(0, 5) : results.tracks).map((track) => (
                  <TrackRow
                    key={track.id}
                    track={track}
                    isPlaying={playbackState.current_track?.id === track.id && playbackState.is_playing}
                    isCurrent={playbackState.current_track?.id === track.id}
                    onPlay={() => handlePlayTrack(track)}
                    onToggleFavorite={() => toggleFavorite(track.id)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Albums */}
          {(activeTab === 'all' || activeTab === 'albums') && results.albums.length > 0 && (
            <section className="mb-8">
              {activeTab === 'all' && (
                <h2 className="text-lg font-semibold text-text-primary mb-4">Albums</h2>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {(activeTab === 'all' ? results.albums.slice(0, 5) : results.albums).map((album) => (
                  <AlbumCard
                    key={`${album.name}-${album.artist}`}
                    album={album}
                    onClick={() => navigate(`/albums/${encodeURIComponent(album.name)}/${encodeURIComponent(album.artist)}`)}
                    onPlay={() => handlePlayAlbum(album)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Artists */}
          {(activeTab === 'all' || activeTab === 'artists') && results.artists.length > 0 && (
            <section>
              {activeTab === 'all' && (
                <h2 className="text-lg font-semibold text-text-primary mb-4">Artists</h2>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {(activeTab === 'all' ? results.artists.slice(0, 5) : results.artists).map((artist) => (
                  <ArtistCard
                    key={artist.name}
                    artist={artist}
                    onClick={() => navigate(`/artists/${encodeURIComponent(artist.name)}`)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* No results */}
          {results.tracks.length === 0 && results.albums.length === 0 && results.artists.length === 0 && (
            <div className="text-center py-16">
              <p className="text-text-secondary">No results found for "{query}"</p>
            </div>
          )}
        </>
      ) : query ? (
        <div className="text-center py-16">
          <p className="text-text-secondary">No results</p>
        </div>
      ) : (
        <div className="text-center py-16">
          <SearchIcon className="w-16 h-16 mx-auto text-text-muted mb-4" />
          <p className="text-text-secondary">Search for tracks, albums, or artists</p>
        </div>
      )}
    </div>
  );
}

interface TrackRowProps {
  track: Track;
  isPlaying: boolean;
  isCurrent: boolean;
  onPlay: () => void;
  onToggleFavorite: () => void;
}

function TrackRow({ track, isPlaying, isCurrent, onPlay, onToggleFavorite }: TrackRowProps) {
  const [artwork, setArtwork] = useState<string | null>(null);

  useEffect(() => {
    invoke<string | null>('get_track_artwork', { filePath: track.file_path })
      .then(setArtwork)
      .catch(console.error);
  }, [track.file_path]);

  return (
    <div
      className={clsx(
        'flex items-center gap-4 px-4 py-3 rounded-lg transition-colors group cursor-pointer',
        isCurrent ? 'bg-amoled-hover' : 'hover:bg-amoled-card'
      )}
      onClick={onPlay}
    >
      <div className="relative w-10 h-10 flex-shrink-0">
        <AlbumArt src={artwork} alt={track.album} size="xs" className="w-full h-full rounded" />
        <div className={clsx(
          'absolute inset-0 bg-black/40 flex items-center justify-center rounded transition-opacity',
          'opacity-0 group-hover:opacity-100'
        )}>
          <PlayIcon className="w-4 h-4 text-white" />
        </div>
      </div>

      <div className="flex-1 min-w-0">
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

      <span className={clsx(
        'text-2xs px-1.5 py-0.5 rounded',
        isHiRes(track.bit_depth, track.sample_rate)
          ? 'bg-accent-primary/20 text-accent-primary'
          : 'bg-amoled-hover text-text-muted'
      )}>
        {track.bit_depth}bit
      </span>

      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggleFavorite();
        }}
        className={clsx(
          'p-1 transition-colors',
          track.is_favorite ? 'text-red-500' : 'text-text-muted opacity-0 group-hover:opacity-100'
        )}
      >
        {track.is_favorite ? (
          <HeartFilledIcon className="w-4 h-4" />
        ) : (
          <HeartIcon className="w-4 h-4" />
        )}
      </button>

      <span className="text-sm text-text-muted tabular-nums w-12 text-right">
        {formatTime(track.duration)}
      </span>
    </div>
  );
}

interface AlbumCardProps {
  album: Album;
  onClick: () => void;
  onPlay: () => void;
}

function AlbumCard({ album, onClick, onPlay }: AlbumCardProps) {
  return (
    <div className="group cursor-pointer" onClick={onClick}>
      <div className="relative mb-3 rounded-lg overflow-hidden shadow-card bg-amoled-card aspect-square flex items-center justify-center">
        <span className="text-4xl text-text-muted">◉</span>
        <div className="absolute inset-0 bg-black/40 flex items-end justify-end p-3 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onPlay();
            }}
            className="p-2 bg-accent-primary rounded-full"
          >
            <PlayIcon className="w-4 h-4 text-amoled-black" />
          </button>
        </div>
      </div>
      <h3 className="font-medium text-text-primary truncate text-sm">{album.name}</h3>
      <p className="text-xs text-text-secondary truncate">{album.artist}</p>
    </div>
  );
}

interface ArtistCardProps {
  artist: Artist;
  onClick: () => void;
}

function ArtistCard({ artist, onClick }: ArtistCardProps) {
  return (
    <div className="group cursor-pointer text-center" onClick={onClick}>
      <div className="relative mb-3 mx-auto w-24 h-24 rounded-full overflow-hidden shadow-card bg-amoled-card flex items-center justify-center group-hover:ring-2 ring-accent-primary transition-all">
        <ArtistIcon className="w-10 h-10 text-text-muted" />
      </div>
      <h3 className="font-medium text-text-primary truncate text-sm">{artist.name}</h3>
    </div>
  );
}
