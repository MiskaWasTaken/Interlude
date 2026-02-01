import { create } from "zustand";
import { invoke } from "@tauri-apps/api/tauri";
import type {
  SpotifyTrack,
  SpotifyAlbum,
  SpotifySearchResult,
  StreamInfo,
  StreamingURLs,
  StreamingPreferences,
} from "../types/streaming";

interface StreamingState {
  // Search state
  searchQuery: string;
  searchResults: SpotifySearchResult | null;
  isSearching: boolean;
  searchError: string | null;

  // Current stream state
  currentSpotifyTrack: SpotifyTrack | null;
  currentStreamInfo: StreamInfo | null;
  isLoadingStream: boolean;
  streamError: string | null;

  // Album view
  currentAlbum: SpotifyAlbum | null;
  isLoadingAlbum: boolean;

  // Queue for streaming tracks
  streamQueue: SpotifyTrack[];
  streamQueueIndex: number;

  // Preferences
  preferences: StreamingPreferences;

  // Actions
  setSearchQuery: (query: string) => void;
  searchSpotify: (query: string) => Promise<void>;
  clearSearch: () => void;

  getSpotifyTrack: (trackId: string) => Promise<SpotifyTrack>;
  getSpotifyAlbum: (albumId: string) => Promise<void>;
  getStreamingUrls: (
    trackId: string,
    region?: string,
  ) => Promise<StreamingURLs>;

  playSpotifyTrack: (track: SpotifyTrack) => Promise<void>;
  playAlbum: (album: SpotifyAlbum, startIndex?: number) => Promise<void>;

  setStreamQueue: (tracks: SpotifyTrack[], startIndex?: number) => void;
  nextStreamTrack: () => Promise<void>;
  previousStreamTrack: () => Promise<void>;

  setPreferences: (prefs: Partial<StreamingPreferences>) => void;

  clearStreamError: () => void;
}

export const useStreamingStore = create<StreamingState>((set, get) => ({
  // Initial state
  searchQuery: "",
  searchResults: null,
  isSearching: false,
  searchError: null,

  currentSpotifyTrack: null,
  currentStreamInfo: null,
  isLoadingStream: false,
  streamError: null,

  currentAlbum: null,
  isLoadingAlbum: false,

  streamQueue: [],
  streamQueueIndex: 0,

  preferences: {
    prefer_hires: true,
    service_order: ["tidal", "qobuz", "amazon"],
  },

  // Actions
  setSearchQuery: (query) => set({ searchQuery: query }),

  searchSpotify: async (query) => {
    if (!query.trim()) {
      set({ searchResults: null });
      return;
    }

    set({ isSearching: true, searchError: null });

    try {
      const results = await invoke<SpotifySearchResult>("search_spotify", {
        query,
        limit: 20,
      });
      set({ searchResults: results, isSearching: false });
    } catch (error) {
      set({
        searchError: error instanceof Error ? error.message : "Search failed",
        isSearching: false,
      });
    }
  },

  clearSearch: () =>
    set({
      searchQuery: "",
      searchResults: null,
      searchError: null,
    }),

  getSpotifyTrack: async (trackId) => {
    const track = await invoke<SpotifyTrack>("get_spotify_track", { trackId });
    return track;
  },

  getSpotifyAlbum: async (albumId) => {
    set({ isLoadingAlbum: true });

    try {
      const album = await invoke<SpotifyAlbum>("get_spotify_album", {
        albumId,
      });
      set({ currentAlbum: album, isLoadingAlbum: false });
    } catch (error) {
      set({ isLoadingAlbum: false });
      throw error;
    }
  },

  getStreamingUrls: async (trackId, region) => {
    return await invoke<StreamingURLs>("get_streaming_urls", {
      spotifyTrackId: trackId,
      region,
    });
  },

  playSpotifyTrack: async (track) => {
    set({
      isLoadingStream: true,
      streamError: null,
      currentSpotifyTrack: track,
    });

    try {
      const streamInfo = await invoke<StreamInfo>("get_best_stream", {
        spotifyTrackId: track.id,
        isrc: track.isrc,
        region: null, // Could be set based on user location
      });

      set({
        currentStreamInfo: streamInfo,
        isLoadingStream: false,
      });

      // The stream URL is now available in streamInfo.url
      // In a full implementation, this would trigger the audio engine
      console.log("Stream ready:", streamInfo);
    } catch (error) {
      set({
        streamError:
          error instanceof Error ? error.message : "Failed to get stream",
        isLoadingStream: false,
      });
    }
  },

  playAlbum: async (album, startIndex = 0) => {
    const tracks = album.tracks;
    if (tracks.length === 0) return;

    set({
      streamQueue: tracks,
      streamQueueIndex: startIndex,
    });

    await get().playSpotifyTrack(tracks[startIndex]);
  },

  setStreamQueue: (tracks, startIndex = 0) => {
    set({
      streamQueue: tracks,
      streamQueueIndex: startIndex,
    });
  },

  nextStreamTrack: async () => {
    const { streamQueue, streamQueueIndex } = get();
    if (streamQueueIndex < streamQueue.length - 1) {
      const nextIndex = streamQueueIndex + 1;
      set({ streamQueueIndex: nextIndex });
      await get().playSpotifyTrack(streamQueue[nextIndex]);
    }
  },

  previousStreamTrack: async () => {
    const { streamQueue, streamQueueIndex } = get();
    if (streamQueueIndex > 0) {
      const prevIndex = streamQueueIndex - 1;
      set({ streamQueueIndex: prevIndex });
      await get().playSpotifyTrack(streamQueue[prevIndex]);
    }
  },

  setPreferences: async (prefs) => {
    const newPrefs = { ...get().preferences, ...prefs };
    set({ preferences: newPrefs });

    try {
      await invoke("set_streaming_preferences", { preferences: newPrefs });
    } catch (error) {
      console.error("Failed to save streaming preferences:", error);
    }
  },

  clearStreamError: () => set({ streamError: null }),
}));
