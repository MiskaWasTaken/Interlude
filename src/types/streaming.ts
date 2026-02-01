// Streaming types for on-demand hi-res playback

export interface StreamingURLs {
  tidal_url: string | null;
  amazon_url: string | null;
  qobuz_url: string | null;
  deezer_url: string | null;
  youtube_url: string | null;
}

export interface SpotifyTrack {
  id: string;
  name: string;
  artists: string[];
  album: string;
  album_id: string;
  duration_ms: number;
  track_number: number;
  disc_number: number;
  isrc: string | null;
  cover_url: string | null;
  release_date: string | null;
  is_explicit: boolean;
}

export interface SpotifyAlbum {
  id: string;
  name: string;
  artists: string[];
  cover_url: string | null;
  release_date: string | null;
  total_tracks: number;
  tracks: SpotifyTrack[];
}

export interface SpotifySearchResult {
  tracks: SpotifyTrack[];
  albums: SpotifyAlbum[];
}

export type StreamQuality = "Standard" | "Lossless" | "HiRes" | "HiResLossless";
export type StreamSource = "Tidal" | "Qobuz" | "Amazon" | "Deezer";

export interface StreamInfo {
  url: string;
  quality: StreamQuality;
  format: string;
  sample_rate: number | null;
  bit_depth: number | null;
  source: StreamSource;
}

export interface StreamingPreferences {
  prefer_hires: boolean;
  service_order: string[];
}

// Helper functions
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

export function getQualityBadge(info: StreamInfo): string {
  if (info.bit_depth && info.sample_rate) {
    const khz = info.sample_rate / 1000;
    return `${info.bit_depth}-bit / ${khz}kHz ${info.format}`;
  }
  return info.format;
}

export function getSourceIcon(source: StreamSource): string {
  switch (source) {
    case "Tidal":
      return "🌊";
    case "Qobuz":
      return "🎵";
    case "Amazon":
      return "📦";
    case "Deezer":
      return "🎧";
    default:
      return "🎶";
  }
}

export function isHiRes(info: StreamInfo): boolean {
  return (
    info.quality === "HiRes" ||
    info.quality === "HiResLossless" ||
    (info.bit_depth !== null && info.bit_depth > 16) ||
    (info.sample_rate !== null && info.sample_rate > 48000)
  );
}
