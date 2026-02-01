import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLibraryStore } from '../stores/libraryStore';
import { SearchIcon, ArtistIcon } from '../components/icons';
import type { Artist } from '../types';

export default function ArtistsPage() {
  const navigate = useNavigate();
  const { artists } = useLibraryStore();
  const [searchQuery, setSearchQuery] = useState('');

  const filteredArtists = artists.filter(artist =>
    artist.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleArtistClick = (artist: Artist) => {
    navigate(`/artists/${encodeURIComponent(artist.name)}`);
  };

  return (
    <div className="p-6 pb-28">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-text-primary">Artists</h1>
        <div className="relative">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter artists..."
            className="pl-9 pr-4 py-2 bg-amoled-card rounded-lg text-sm text-text-primary placeholder-text-muted border border-amoled-border focus:border-accent-primary focus:outline-none transition-colors"
          />
        </div>
      </div>

      {/* Artist Grid */}
      {filteredArtists.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
          {filteredArtists.map((artist) => (
            <ArtistCard
              key={artist.name}
              artist={artist}
              onClick={() => handleArtistClick(artist)}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-16">
          <p className="text-text-secondary">
            {searchQuery ? 'No artists match your search' : 'No artists in your library'}
          </p>
        </div>
      )}
    </div>
  );
}

interface ArtistCardProps {
  artist: Artist;
  onClick: () => void;
}

function ArtistCard({ artist, onClick }: ArtistCardProps) {
  return (
    <div
      className="group cursor-pointer text-center"
      onClick={onClick}
    >
      <div className="relative mb-3 mx-auto w-32 h-32 rounded-full overflow-hidden shadow-card bg-amoled-card flex items-center justify-center group-hover:ring-2 ring-accent-primary transition-all">
        <ArtistIcon className="w-12 h-12 text-text-muted group-hover:text-text-secondary transition-colors" />
      </div>
      <h3 className="font-medium text-text-primary truncate text-sm">{artist.name}</h3>
      <p className="text-xs text-text-secondary">
        {artist.album_count} album{artist.album_count !== 1 ? 's' : ''} • {artist.track_count} track{artist.track_count !== 1 ? 's' : ''}
      </p>
    </div>
  );
}
