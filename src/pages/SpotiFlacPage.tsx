import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useStreamingStore } from "../stores/streamingStore";
import { formatDuration, getSourceIcon } from "../types/streaming";
import type { SpotifyTrack, SpotifyAlbum } from "../types/streaming";

// Spotify icon component
const SpotifyIcon = ({ className = "w-6 h-6" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
  </svg>
);

// Search result track item
const TrackItem = ({
  track,
  onPlay,
  isPlaying,
  isLoading,
}: {
  track: SpotifyTrack;
  onPlay: () => void;
  isPlaying: boolean;
  isLoading: boolean;
}) => (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    className={`flex items-center gap-4 p-3 rounded-lg hover:bg-amoled-surface/50 cursor-pointer transition-colors group ${
      isPlaying ? "bg-accent/10" : ""
    }`}
    onClick={onPlay}
  >
    {/* Album art */}
    <div className="relative w-12 h-12 flex-shrink-0">
      {track.cover_url ? (
        <img
          src={track.cover_url}
          alt={track.album}
          className="w-full h-full object-cover rounded"
        />
      ) : (
        <div className="w-full h-full bg-amoled-surface rounded flex items-center justify-center">
          <SpotifyIcon className="w-6 h-6 text-gray-500" />
        </div>
      )}
      {/* Play overlay */}
      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded">
        {isLoading ? (
          <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
        ) : (
          <svg
            className="w-6 h-6 text-white"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </div>
    </div>

    {/* Track info */}
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2">
        <span
          className={`truncate font-medium ${isPlaying ? "text-accent" : "text-white"}`}
        >
          {track.name}
        </span>
        {track.is_explicit && (
          <span className="text-[10px] px-1 py-0.5 bg-gray-600 rounded text-gray-300">
            E
          </span>
        )}
      </div>
      <div className="text-sm text-gray-400 truncate">
        {track.artists.join(", ")} • {track.album}
      </div>
    </div>

    {/* Duration */}
    <span className="text-sm text-gray-500 flex-shrink-0">
      {formatDuration(track.duration_ms)}
    </span>
  </motion.div>
);

// Album card
const AlbumCard = ({
  album,
  onClick,
}: {
  album: SpotifyAlbum;
  onClick: () => void;
}) => (
  <motion.div
    initial={{ opacity: 0, scale: 0.95 }}
    animate={{ opacity: 1, scale: 1 }}
    whileHover={{ scale: 1.02 }}
    className="bg-amoled-surface/30 rounded-lg p-4 cursor-pointer hover:bg-amoled-surface/50 transition-colors"
    onClick={onClick}
  >
    <div className="relative aspect-square mb-3">
      {album.cover_url ? (
        <img
          src={album.cover_url}
          alt={album.name}
          className="w-full h-full object-cover rounded-lg shadow-lg"
        />
      ) : (
        <div className="w-full h-full bg-amoled-surface rounded-lg flex items-center justify-center">
          <SpotifyIcon className="w-12 h-12 text-gray-500" />
        </div>
      )}
    </div>
    <h3 className="font-semibold text-white truncate">{album.name}</h3>
    <p className="text-sm text-gray-400 truncate">{album.artists.join(", ")}</p>
    <p className="text-xs text-gray-500 mt-1">
      {album.total_tracks} tracks • {album.release_date?.split("-")[0]}
    </p>
  </motion.div>
);

// Stream info badge
const StreamBadge = ({
  streamInfo,
}: {
  streamInfo: {
    quality: string;
    format: string;
    sample_rate: number | null;
    bit_depth: number | null;
    source: string;
  };
}) => {
  const hiRes = streamInfo.bit_depth && streamInfo.bit_depth > 16;

  return (
    <div
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm ${
        hiRes ? "bg-accent/20 text-accent" : "bg-amoled-surface text-gray-300"
      }`}
    >
      <span>{getSourceIcon(streamInfo.source as any)}</span>
      <span className="font-mono">
        {streamInfo.bit_depth && streamInfo.sample_rate
          ? `${streamInfo.bit_depth}-bit / ${(streamInfo.sample_rate / 1000).toFixed(1)}kHz`
          : streamInfo.format}
      </span>
      {hiRes && <span className="text-xs font-semibold">Hi-Res</span>}
    </div>
  );
};

// Main SpotiFlac Page
export default function SpotiFlacPage() {
  const {
    searchQuery,
    setSearchQuery,
    searchResults,
    isSearching,
    searchError,
    searchSpotify,
    clearSearch,
    currentSpotifyTrack,
    currentStreamInfo,
    isLoadingStream,
    streamError,
    playSpotifyTrack,
    currentAlbum,
    getSpotifyAlbum,
    playAlbum,
    preferences,
    setPreferences,
    clearStreamError,
  } = useStreamingStore();

  const [activeTab, setActiveTab] = useState<"tracks" | "albums">("tracks");
  const [showSettings, setShowSettings] = useState(false);
  const [selectedAlbum, setSelectedAlbum] = useState<SpotifyAlbum | null>(null);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery.trim()) {
        searchSpotify(searchQuery);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, searchSpotify]);

  const handleAlbumClick = async (album: SpotifyAlbum) => {
    await getSpotifyAlbum(album.id);
    setSelectedAlbum(album);
  };

  return (
    <div className="h-full overflow-y-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-[#1DB954] flex items-center justify-center">
            <SpotifyIcon className="w-7 h-7 text-black" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">SpotiFlac</h1>
            <p className="text-gray-400 text-sm">On-demand Hi-Res streaming</p>
          </div>
        </div>

        <button
          onClick={() => setShowSettings(!showSettings)}
          className="p-2 rounded-lg hover:bg-amoled-surface transition-colors"
        >
          <svg
            className="w-5 h-5 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
        </button>
      </div>

      {/* Settings Panel */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-6 p-4 bg-amoled-surface/30 rounded-lg overflow-hidden"
          >
            <h3 className="text-white font-semibold mb-4">
              Streaming Preferences
            </h3>

            <div className="space-y-4">
              <label className="flex items-center justify-between">
                <span className="text-gray-300">
                  Prefer Hi-Res when available
                </span>
                <button
                  onClick={() =>
                    setPreferences({ prefer_hires: !preferences.prefer_hires })
                  }
                  className={`w-12 h-6 rounded-full transition-colors ${
                    preferences.prefer_hires ? "bg-accent" : "bg-gray-600"
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-white transition-transform ${
                      preferences.prefer_hires
                        ? "translate-x-6"
                        : "translate-x-0.5"
                    }`}
                  />
                </button>
              </label>

              <div>
                <span className="text-gray-300 block mb-2">
                  Service Priority
                </span>
                <div className="flex gap-2 flex-wrap">
                  {["tidal", "qobuz", "amazon"].map((service) => {
                    const isActive =
                      preferences.service_order.includes(service);
                    const order =
                      preferences.service_order.indexOf(service) + 1;

                    return (
                      <button
                        key={service}
                        className={`px-3 py-1.5 rounded-lg text-sm capitalize transition-colors ${
                          isActive
                            ? "bg-accent/20 text-accent border border-accent/30"
                            : "bg-amoled-surface text-gray-400"
                        }`}
                      >
                        {isActive && <span className="mr-1">{order}.</span>}
                        {service}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Search Bar */}
      <div className="relative mb-6">
        <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
          <svg
            className="w-5 h-5 text-gray-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search Spotify for tracks, albums, artists..."
          className="w-full bg-amoled-surface/50 border border-gray-800 rounded-full py-3 pl-12 pr-12 text-white placeholder-gray-500 focus:outline-none focus:border-accent/50 transition-colors"
        />
        {searchQuery && (
          <button
            onClick={clearSearch}
            className="absolute inset-y-0 right-4 flex items-center"
          >
            <svg
              className="w-5 h-5 text-gray-500 hover:text-gray-300"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        )}
      </div>

      {/* Error display */}
      {(searchError || streamError) && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center justify-between"
        >
          <span className="text-red-400">{searchError || streamError}</span>
          <button
            onClick={() => {
              clearStreamError();
              // Clear search error by re-searching or similar
            }}
            className="text-red-400 hover:text-red-300"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </motion.div>
      )}

      {/* Current Playing */}
      {currentSpotifyTrack && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 p-6 bg-gradient-to-r from-amoled-surface/50 to-amoled-surface/30 rounded-xl"
        >
          <div className="flex items-center gap-6">
            {/* Album art */}
            <div className="w-24 h-24 flex-shrink-0">
              {currentSpotifyTrack.cover_url ? (
                <img
                  src={currentSpotifyTrack.cover_url}
                  alt={currentSpotifyTrack.album}
                  className="w-full h-full object-cover rounded-lg shadow-lg"
                />
              ) : (
                <div className="w-full h-full bg-amoled-surface rounded-lg flex items-center justify-center">
                  <SpotifyIcon className="w-10 h-10 text-gray-500" />
                </div>
              )}
            </div>

            {/* Track info */}
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-bold text-white truncate">
                {currentSpotifyTrack.name}
              </h2>
              <p className="text-gray-400">
                {currentSpotifyTrack.artists.join(", ")}
              </p>
              <p className="text-gray-500 text-sm">
                {currentSpotifyTrack.album}
              </p>

              {/* Stream info */}
              {isLoadingStream ? (
                <div className="mt-3 flex items-center gap-2 text-gray-400">
                  <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm">
                    Finding best quality stream...
                  </span>
                </div>
              ) : (
                currentStreamInfo && (
                  <div className="mt-3">
                    <StreamBadge streamInfo={currentStreamInfo} />
                  </div>
                )
              )}
            </div>
          </div>
        </motion.div>
      )}

      {/* Search Results */}
      {searchResults && (
        <>
          {/* Tabs */}
          <div className="flex gap-4 mb-6 border-b border-gray-800">
            <button
              onClick={() => setActiveTab("tracks")}
              className={`pb-3 px-1 text-sm font-medium transition-colors ${
                activeTab === "tracks"
                  ? "text-accent border-b-2 border-accent"
                  : "text-gray-400 hover:text-gray-300"
              }`}
            >
              Tracks ({searchResults.tracks.length})
            </button>
            <button
              onClick={() => setActiveTab("albums")}
              className={`pb-3 px-1 text-sm font-medium transition-colors ${
                activeTab === "albums"
                  ? "text-accent border-b-2 border-accent"
                  : "text-gray-400 hover:text-gray-300"
              }`}
            >
              Albums ({searchResults.albums.length})
            </button>
          </div>

          {/* Results */}
          <AnimatePresence mode="wait">
            {activeTab === "tracks" ? (
              <motion.div
                key="tracks"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-1"
              >
                {searchResults.tracks.map((track) => (
                  <TrackItem
                    key={track.id}
                    track={track}
                    onPlay={() => playSpotifyTrack(track)}
                    isPlaying={currentSpotifyTrack?.id === track.id}
                    isLoading={
                      isLoadingStream && currentSpotifyTrack?.id === track.id
                    }
                  />
                ))}
                {searchResults.tracks.length === 0 && (
                  <p className="text-gray-500 text-center py-8">
                    No tracks found
                  </p>
                )}
              </motion.div>
            ) : (
              <motion.div
                key="albums"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4"
              >
                {searchResults.albums.map((album) => (
                  <AlbumCard
                    key={album.id}
                    album={album}
                    onClick={() => handleAlbumClick(album)}
                  />
                ))}
                {searchResults.albums.length === 0 && (
                  <p className="text-gray-500 text-center py-8 col-span-full">
                    No albums found
                  </p>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}

      {/* Loading state */}
      {isSearching && (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Empty state */}
      {!searchQuery && !searchResults && (
        <div className="text-center py-16">
          <SpotifyIcon className="w-16 h-16 text-[#1DB954] mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-white mb-2">
            Search Spotify
          </h2>
          <p className="text-gray-400 max-w-md mx-auto">
            Search for any track or album on Spotify, then stream it in Hi-Res
            quality from Tidal, Qobuz, or Amazon Music.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            {["tidal", "qobuz", "amazon"].map((service) => (
              <div
                key={service}
                className="px-4 py-2 bg-amoled-surface/30 rounded-full text-sm text-gray-400 capitalize"
              >
                {getSourceIcon(
                  (service.charAt(0).toUpperCase() + service.slice(1)) as any,
                )}{" "}
                {service}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Album Detail Modal */}
      <AnimatePresence>
        {selectedAlbum && currentAlbum && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
            onClick={() => setSelectedAlbum(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-amoled-black border border-gray-800 rounded-xl max-w-2xl w-full max-h-[80vh] overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Album header */}
              <div className="p-6 flex gap-6">
                <div className="w-40 h-40 flex-shrink-0">
                  {currentAlbum.cover_url ? (
                    <img
                      src={currentAlbum.cover_url}
                      alt={currentAlbum.name}
                      className="w-full h-full object-cover rounded-lg shadow-lg"
                    />
                  ) : (
                    <div className="w-full h-full bg-amoled-surface rounded-lg flex items-center justify-center">
                      <SpotifyIcon className="w-16 h-16 text-gray-500" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-2xl font-bold text-white">
                    {currentAlbum.name}
                  </h2>
                  <p className="text-gray-400 mt-1">
                    {currentAlbum.artists.join(", ")}
                  </p>
                  <p className="text-gray-500 text-sm mt-2">
                    {currentAlbum.total_tracks} tracks •{" "}
                    {currentAlbum.release_date}
                  </p>
                  <button
                    onClick={() => playAlbum(currentAlbum)}
                    className="mt-4 px-6 py-2 bg-accent text-black font-semibold rounded-full hover:bg-accent/90 transition-colors"
                  >
                    Play Album
                  </button>
                </div>
                <button
                  onClick={() => setSelectedAlbum(null)}
                  className="absolute top-4 right-4 text-gray-400 hover:text-white"
                >
                  <svg
                    className="w-6 h-6"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>

              {/* Track list */}
              <div className="px-6 pb-6 max-h-[40vh] overflow-y-auto">
                {currentAlbum.tracks.map((track, index) => (
                  <TrackItem
                    key={track.id}
                    track={track}
                    onPlay={() => playAlbum(currentAlbum, index)}
                    isPlaying={currentSpotifyTrack?.id === track.id}
                    isLoading={
                      isLoadingStream && currentSpotifyTrack?.id === track.id
                    }
                  />
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
