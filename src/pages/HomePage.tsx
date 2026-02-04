import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/tauri";
import { clsx } from "clsx";
import { useLibraryStore } from "../stores/libraryStore";
import { usePlayerStore } from "../stores/playerStore";
import { useStreamingStore } from "../stores/streamingStore";
import { useGradient } from "../contexts/GradientContext";
import AlbumArt from "../components/common/AlbumArt";
import SpotifyCredentialsBanner from "../components/common/SpotifyCredentialsBanner";
import { PlayIcon, PauseIcon } from "../components/icons";
import type { Track } from "../types";

type ContentFilter = "all" | "music" | "playlists";

export default function HomePage() {
  const navigate = useNavigate();
  const { statistics, recentlyPlayed, tracks, albums, artists } =
    useLibraryStore();
  const { playbackState, playTrack, togglePlayPause } = usePlayerStore();
  const { hasCredentials, checkCredentials } = useStreamingStore();
  const { setColorsFromImage } = useGradient();
  const [activeFilter, setActiveFilter] = useState<ContentFilter>("all");
  const [albumArtworks, setAlbumArtworks] = useState<Record<string, string>>(
    {},
  );
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);

  // Check for Spotify credentials on mount
  useEffect(() => {
    checkCredentials();
  }, [checkCredentials]);

  // Load artworks for albums
  useEffect(() => {
    const loadArtworks = async () => {
      const artworks: Record<string, string> = {};
      const tracksToLoad = [...recentlyPlayed.slice(0, 10)];

      for (const track of tracksToLoad) {
        const key = `${track.album}-${track.artist}`;
        if (!artworks[key]) {
          try {
            const url = await invoke<string | null>("get_track_artwork", {
              filePath: track.file_path,
            });
            if (url) artworks[key] = url;
          } catch {
            // ignore
          }
        }
      }
      setAlbumArtworks(artworks);
    };
    loadArtworks();
  }, [recentlyPlayed]);

  // Get current playing track artwork
  useEffect(() => {
    const track = playbackState.current_track;
    if (track?.file_path) {
      invoke<string | null>("get_track_artwork", { filePath: track.file_path })
        .then((url) => {
          if (url) setColorsFromImage(url);
        })
        .catch(console.error);
    }
  }, [playbackState.current_track?.file_path, setColorsFromImage]);

  const handlePlayAlbum = async (albumName: string, artistName: string) => {
    try {
      const albumTracks = await invoke<Track[]>("get_album_tracks", {
        album: albumName,
        artist: artistName,
      });
      if (albumTracks.length > 0) {
        playTrack(albumTracks[0], albumTracks);
      }
    } catch (error) {
      console.error("Failed to play album:", error);
    }
  };

  // Get unique albums from recently played
  const recentAlbums = recentlyPlayed
    .reduce((acc, track) => {
      const key = `${track.album}-${track.artist}`;
      if (!acc.find((t) => `${t.album}-${t.artist}` === key)) {
        acc.push(track);
      }
      return acc;
    }, [] as Track[])
    .slice(0, 6);

  // Get greeting based on time
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  };

  const filterTabs: { id: ContentFilter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "music", label: "Music" },
    { id: "playlists", label: "Playlists" },
  ];

  return (
    <div className="min-h-full bg-gradient-to-b from-amoled-elevated to-amoled-black">
      {/* Header with filter pills */}
      <div className="sticky top-0 z-20 px-6 pt-4 pb-4 bg-gradient-to-b from-amoled-elevated/95 to-transparent backdrop-blur-sm">
        <div className="flex items-center gap-2">
          {filterTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveFilter(tab.id)}
              className={clsx(
                "px-4 py-2 text-sm font-medium rounded-full transition-colors",
                activeFilter === tab.id
                  ? "bg-text-primary text-amoled-black"
                  : "bg-amoled-hover/80 text-text-primary hover:bg-amoled-card",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-6 pb-32">
        {/* Spotify Credentials Banner */}
        {hasCredentials === false && (
          <div className="mb-6">
            <SpotifyCredentialsBanner variant="card" />
          </div>
        )}

        {/* Quick Access Grid - Like Spotify's top section */}
        {recentAlbums.length > 0 && (
          <section className="mb-8">
            <h1 className="text-3xl font-bold text-text-primary mb-6">
              {getGreeting()}
            </h1>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              {recentAlbums.map((track) => {
                const key = `${track.album}-${track.artist}`;
                const isPlaying =
                  playbackState.current_track?.album === track.album &&
                  playbackState.current_track?.artist === track.artist;
                const isHovered = hoveredCard === key;

                return (
                  <div
                    key={key}
                    onClick={() => handlePlayAlbum(track.album, track.artist)}
                    onMouseEnter={() => setHoveredCard(key)}
                    onMouseLeave={() => setHoveredCard(null)}
                    className="flex items-center bg-amoled-card/60 hover:bg-amoled-card rounded overflow-hidden cursor-pointer group transition-colors"
                  >
                    <div className="w-20 h-20 flex-shrink-0">
                      <AlbumArt
                        src={albumArtworks[key]}
                        alt={track.album}
                        size="lg"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1 px-4 min-w-0">
                      <p className="font-semibold text-text-primary truncate text-sm">
                        {track.album}
                      </p>
                    </div>
                    <div
                      className={clsx(
                        "mr-4 transition-all duration-200",
                        isHovered || isPlaying
                          ? "opacity-100 translate-x-0"
                          : "opacity-0 translate-x-2",
                      )}
                    >
                      <button
                        className="w-12 h-12 bg-[#1DB954] rounded-full flex items-center justify-center shadow-lg hover:scale-105 transition-transform"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isPlaying) {
                            togglePlayPause();
                          } else {
                            handlePlayAlbum(track.album, track.artist);
                          }
                        }}
                      >
                        {isPlaying && playbackState.is_playing ? (
                          <PauseIcon className="w-6 h-6 text-black" />
                        ) : (
                          <PlayIcon className="w-6 h-6 text-black ml-1" />
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Made For You Section */}
        {albums.length > 0 && (
          <section className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold text-text-primary hover:underline cursor-pointer">
                Made For You
              </h2>
              <Link
                to="/albums"
                className="text-sm font-semibold text-text-secondary hover:text-text-primary transition-colors"
              >
                Show all
              </Link>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
              {albums.slice(0, 6).map((album, index) => (
                <AlbumCard
                  key={`${album.name}-${album.artist}`}
                  album={album}
                  index={index + 1}
                  onClick={() =>
                    navigate(
                      `/albums/${encodeURIComponent(album.name)}/${encodeURIComponent(album.artist)}`,
                    )
                  }
                  onPlay={() => handlePlayAlbum(album.name, album.artist)}
                  isPlaying={playbackState.current_track?.album === album.name}
                  isCurrentlyPlaying={
                    playbackState.current_track?.album === album.name &&
                    playbackState.is_playing
                  }
                />
              ))}
            </div>
          </section>
        )}

        {/* Recently Played Section */}
        {recentlyPlayed.length > 0 && (
          <section className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold text-text-primary hover:underline cursor-pointer">
                Recently played
              </h2>
              <button className="text-sm font-semibold text-text-secondary hover:text-text-primary transition-colors">
                Show all
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
              {recentlyPlayed.slice(0, 6).map((track) => {
                const key = `recent-${track.id}`;
                return (
                  <TrackCard
                    key={key}
                    track={track}
                    artwork={albumArtworks[`${track.album}-${track.artist}`]}
                    onClick={() => playTrack(track)}
                    isPlaying={playbackState.current_track?.id === track.id}
                    isCurrentlyPlaying={
                      playbackState.current_track?.id === track.id &&
                      playbackState.is_playing
                    }
                  />
                );
              })}
            </div>
          </section>
        )}

        {/* Your Top Artists */}
        {artists.length > 0 && (
          <section className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold text-text-primary hover:underline cursor-pointer">
                Your top artists
              </h2>
              <Link
                to="/artists"
                className="text-sm font-semibold text-text-secondary hover:text-text-primary transition-colors"
              >
                Show all
              </Link>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
              {artists.slice(0, 6).map((artist) => (
                <ArtistCard
                  key={artist.id}
                  artist={artist}
                  onClick={() =>
                    navigate(`/artists/${encodeURIComponent(artist.name)}`)
                  }
                />
              ))}
            </div>
          </section>
        )}

        {/* Empty State */}
        {tracks.length === 0 && (
          <div className="text-center py-20">
            <div className="w-32 h-32 mx-auto mb-8 rounded-full bg-amoled-card flex items-center justify-center">
              <span className="text-6xl">🎵</span>
            </div>
            <h2 className="text-3xl font-bold text-text-primary mb-3">
              Your library is empty
            </h2>
            <p className="text-text-secondary mb-8 max-w-md mx-auto text-lg">
              Add some folders containing your FLAC, WAV, or ALAC files to get
              started with high-resolution audio.
            </p>
            <button
              onClick={() => navigate("/library")}
              className="px-8 py-3 bg-text-primary text-amoled-black font-semibold rounded-full hover:scale-105 transition-transform"
            >
              Add Music Folder
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

interface AlbumCardProps {
  album: { name: string; artist: string; year: number | null };
  index: number;
  onClick: () => void;
  onPlay: () => void;
  isPlaying: boolean;
  isCurrentlyPlaying: boolean;
}

function AlbumCard({
  album,
  index,
  onClick,
  onPlay,
  isPlaying,
  isCurrentlyPlaying,
}: AlbumCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [artwork, setArtwork] = useState<string | null>(null);

  return (
    <div
      className="p-4 bg-amoled-card/40 hover:bg-amoled-card rounded-lg cursor-pointer transition-all duration-300 group"
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="relative mb-4">
        <div className="aspect-square rounded-md overflow-hidden shadow-lg bg-amoled-hover">
          <div className="w-full h-full bg-gradient-to-br from-purple-600 via-pink-500 to-orange-400 flex items-center justify-center">
            <span className="text-white text-4xl font-bold">0{index}</span>
          </div>
        </div>
        <div
          className={clsx(
            "absolute right-2 bottom-2 transition-all duration-200",
            isHovered || isPlaying
              ? "opacity-100 translate-y-0"
              : "opacity-0 translate-y-2",
          )}
        >
          <button
            className="w-12 h-12 bg-[#1DB954] rounded-full flex items-center justify-center shadow-lg hover:scale-105 transition-transform"
            onClick={(e) => {
              e.stopPropagation();
              onPlay();
            }}
          >
            {isCurrentlyPlaying ? (
              <PauseIcon className="w-6 h-6 text-black" />
            ) : (
              <PlayIcon className="w-6 h-6 text-black ml-1" />
            )}
          </button>
        </div>
      </div>
      <h3 className="font-semibold text-text-primary truncate mb-1">
        {album.name}
      </h3>
      <p className="text-sm text-text-secondary truncate">
        {album.artist}
        {album.year && ` • ${album.year}`}
      </p>
    </div>
  );
}

interface TrackCardProps {
  track: Track;
  artwork: string | null | undefined;
  onClick: () => void;
  isPlaying: boolean;
  isCurrentlyPlaying: boolean;
}

function TrackCard({
  track,
  artwork,
  onClick,
  isPlaying,
  isCurrentlyPlaying,
}: TrackCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [loadedArtwork, setLoadedArtwork] = useState<string | null>(null);

  useEffect(() => {
    if (!artwork && track.file_path) {
      invoke<string | null>("get_track_artwork", { filePath: track.file_path })
        .then(setLoadedArtwork)
        .catch(console.error);
    }
  }, [track.file_path, artwork]);

  const displayArtwork = artwork || loadedArtwork;

  return (
    <div
      className="p-4 bg-amoled-card/40 hover:bg-amoled-card rounded-lg cursor-pointer transition-all duration-300 group"
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="relative mb-4">
        <div className="aspect-square rounded-md overflow-hidden shadow-lg">
          <AlbumArt
            src={displayArtwork}
            alt={track.album}
            size="xl"
            className="w-full h-full object-cover"
          />
        </div>
        <div
          className={clsx(
            "absolute right-2 bottom-2 transition-all duration-200",
            isHovered || isPlaying
              ? "opacity-100 translate-y-0"
              : "opacity-0 translate-y-2",
          )}
        >
          <button
            className="w-12 h-12 bg-[#1DB954] rounded-full flex items-center justify-center shadow-lg hover:scale-105 transition-transform"
            onClick={(e) => {
              e.stopPropagation();
              onClick();
            }}
          >
            {isCurrentlyPlaying ? (
              <PauseIcon className="w-6 h-6 text-black" />
            ) : (
              <PlayIcon className="w-6 h-6 text-black ml-1" />
            )}
          </button>
        </div>
      </div>
      <h3 className="font-semibold text-text-primary truncate mb-1">
        {track.title}
      </h3>
      <p className="text-sm text-text-secondary truncate">{track.artist}</p>
    </div>
  );
}

interface ArtistCardProps {
  artist: {
    id: number;
    name: string;
    album_count: number;
    track_count: number;
  };
  onClick: () => void;
}

function ArtistCard({ artist, onClick }: ArtistCardProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className="p-4 bg-amoled-card/40 hover:bg-amoled-card rounded-lg cursor-pointer transition-all duration-300 group"
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="relative mb-4">
        <div className="aspect-square rounded-full overflow-hidden shadow-lg bg-amoled-hover flex items-center justify-center">
          <span className="text-5xl">🎤</span>
        </div>
        <div
          className={clsx(
            "absolute right-2 bottom-2 transition-all duration-200",
            isHovered ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2",
          )}
        >
          <button
            className="w-12 h-12 bg-[#1DB954] rounded-full flex items-center justify-center shadow-lg hover:scale-105 transition-transform"
            onClick={(e) => {
              e.stopPropagation();
              onClick();
            }}
          >
            <PlayIcon className="w-6 h-6 text-black ml-1" />
          </button>
        </div>
      </div>
      <h3 className="font-semibold text-text-primary truncate mb-1">
        {artist.name}
      </h3>
      <p className="text-sm text-text-secondary">Artist</p>
    </div>
  );
}
