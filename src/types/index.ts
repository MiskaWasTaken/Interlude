// Track type
export interface Track {
  id: number;
  file_path: string;
  file_hash: string;
  title: string;
  artist: string;
  album: string;
  album_artist: string | null;
  track_number: number | null;
  disc_number: number | null;
  year: number | null;
  genre: string | null;
  duration: number;
  sample_rate: number;
  bit_depth: number;
  channels: number;
  file_size: number;
  format: string;
  has_artwork: boolean;
  play_count: number;
  last_played: string | null;
  date_added: string;
  is_favorite: boolean;
}

// Album type
export interface Album {
  id: number;
  name: string;
  artist: string;
  year: number | null;
  track_count: number;
  total_duration: number;
  artwork_path: string | null;
}

// Artist type
export interface Artist {
  id: number;
  name: string;
  album_count: number;
  track_count: number;
}

// Library folder
export interface LibraryFolder {
  id: number;
  path: string;
  enabled: boolean;
  last_scanned: string | null;
}

// Playback state
export interface PlaybackState {
  is_playing: boolean;
  current_track: Track | null;
  position: number;
  duration: number;
  volume: number;
  sample_rate: number;
  bit_depth: number;
  channels: number;
  shuffle: boolean;
  repeat_mode: 'off' | 'one' | 'all';
}

// Statistics
export interface Statistics {
  total_tracks: number;
  total_albums: number;
  total_artists: number;
  total_duration: number;
  total_size: number;
  hires_tracks: number;
}

// Search results
export interface SearchResults {
  tracks: Track[];
  albums: Album[];
  artists: Artist[];
}

// Smart playlist
export interface SmartPlaylist {
  id: string;
  name: string;
  icon: string;
  track_count: number;
}

// Audio device
export interface AudioDevice {
  name: string;
  is_default: boolean;
}

// Lyrics line
export interface LyricLine {
  time: number;
  text: string;
}

// Parsed lyrics
export interface ParsedLyrics {
  lines: LyricLine[];
  isSynced: boolean;
}
