import { create } from "zustand";
import { invoke } from "@tauri-apps/api/tauri";
import { supabase } from "../lib/supabase";
import type {
  SpotifyTrack,
  SpotifyAlbum,
  SpotifySearchResult,
  StreamInfo,
  StreamingURLs,
  StreamingPreferences,
  SpotifyCredentials,
  DownloadResult,
  ProgressiveStreamResult,
  NextChunkResult,
} from "../types/streaming";

// Progressive streaming state for a track
interface ProgressiveStreamState {
  trackId: string;
  currentChunk: number;
  totalChunks: number;
  isComplete: boolean;
  chunkPaths: string[];
  preloadingNext: boolean;
}

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
  isPlaying: boolean;

  // Progressive streaming state
  progressiveStream: ProgressiveStreamState | null;

  // Album view
  currentAlbum: SpotifyAlbum | null;
  isLoadingAlbum: boolean;

  // Queue for streaming tracks
  streamQueue: SpotifyTrack[];
  streamQueueIndex: number;

  // Preferences
  preferences: StreamingPreferences;

  // Credentials status
  hasCredentials: boolean | null;

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
  togglePlayPause: () => Promise<void>;
  stopStream: () => void;

  setStreamQueue: (tracks: SpotifyTrack[], startIndex?: number) => void;
  nextStreamTrack: () => Promise<void>;
  previousStreamTrack: () => Promise<void>;

  setPreferences: (prefs: Partial<StreamingPreferences>) => void;

  clearStreamError: () => void;

  // Progressive streaming actions
  preloadNextChunks: (trackId: string, totalChunks: number) => void;
  playNextChunk: (trackId: string, chunkIndex: number) => Promise<void>;
  finalizeStream: (trackId: string) => Promise<void>;
  seekToPosition: (
    trackId: string,
    positionSeconds: number,
    totalDuration: number,
  ) => Promise<void>;

  // Credentials
  checkCredentials: () => Promise<void>;
  setCredentials: (clientId: string, clientSecret: string) => Promise<void>;
  clearCredentials: () => Promise<void>;
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

  progressiveStream: null,

  currentAlbum: null,
  isLoadingAlbum: false,

  streamQueue: [],
  streamQueueIndex: 0,

  isPlaying: false,

  hasCredentials: null,

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
      isPlaying: false,
    });

    try {
      // First, get the streaming URLs to find Tidal link
      const streamingUrls = await invoke<StreamingURLs>("get_streaming_urls", {
        spotifyTrackId: track.id,
        region: null,
      });

      // Use progressive streaming - downloads first 30 seconds and starts playing immediately
      // Then downloads remaining chunks in background while playing
      console.log(`[Streaming] Starting progressive stream for: ${track.name}`);

      const result = await invoke<ProgressiveStreamResult>(
        "start_progressive_stream",
        {
          spotifyTrackId: track.id,
          tidalUrl: streamingUrls.tidal_url,
          metadata: {
            name: track.name,
            artist: track.artists.join(", "),
            album: track.album,
            duration_ms: track.duration_ms,
          },
        },
      );

      if (result.success && result.first_chunk_path) {
        // Create a StreamInfo-like object from the result
        const streamInfo: StreamInfo = {
          url: result.first_chunk_path,
          quality:
            result.bit_depth && result.bit_depth > 16
              ? "HiResLossless"
              : "Lossless",
          format: result.format,
          sample_rate: result.sample_rate,
          bit_depth: result.bit_depth,
          source: result.source as StreamInfo["source"],
        };

        set({
          currentStreamInfo: streamInfo,
          isLoadingStream: false,
          isPlaying: true,
        });

        console.log(
          `[Streaming] Progressive stream started: ${result.total_chunks} chunks`,
        );
        if (result.sample_rate && result.bit_depth) {
          console.log(
            `[Streaming] Quality: ${result.bit_depth}-bit / ${result.sample_rate / 1000}kHz ${result.format}`,
          );
        }

        // Start background download of next chunks
        if (result.total_chunks > 1) {
          get().preloadNextChunks(track.id, result.total_chunks);
        }
      } else {
        throw new Error(result.error || "Failed to start stream");
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to play track";
      console.error("[Streaming] Error:", errorMessage);

      // If progressive streaming fails, fall back to full download
      if (
        errorMessage.includes("BTS format") ||
        errorMessage.includes("Preview")
      ) {
        console.log("[Streaming] Falling back to full download...");
        try {
          const streamingUrls = await invoke<StreamingURLs>(
            "get_streaming_urls",
            {
              spotifyTrackId: track.id,
              region: null,
            },
          );

          const result = await invoke<DownloadResult>(
            "download_and_play_track",
            {
              spotifyTrackId: track.id,
              tidalUrl: streamingUrls.tidal_url,
              amazonUrl: streamingUrls.amazon_url,
              isrc: track.isrc,
              metadata: {
                name: track.name,
                artist: track.artists.join(", "),
                album: track.album,
                duration_ms: track.duration_ms,
              },
            },
          );

          if (result.success && result.file_path) {
            const streamInfo: StreamInfo = {
              url: result.file_path,
              quality:
                result.bit_depth && result.bit_depth > 16
                  ? "HiResLossless"
                  : "Lossless",
              format: result.format,
              sample_rate: result.sample_rate,
              bit_depth: result.bit_depth,
              source: result.source as StreamInfo["source"],
            };

            set({
              currentStreamInfo: streamInfo,
              isLoadingStream: false,
              isPlaying: true,
            });
            return;
          }
        } catch (fallbackError) {
          console.error("[Streaming] Fallback also failed:", fallbackError);
        }
      }

      // Check if it's an FFmpeg error
      if (errorMessage.includes("FFmpeg")) {
        set({
          streamError:
            "FFmpeg is required for streaming. Please install it from Settings.",
          isLoadingStream: false,
          isPlaying: false,
        });
      } else {
        set({
          streamError: errorMessage,
          isLoadingStream: false,
          isPlaying: false,
        });
      }
    }
  },

  togglePlayPause: async () => {
    const { isPlaying } = get();
    try {
      if (isPlaying) {
        await invoke("pause");
      } else {
        await invoke("resume");
      }
      set({ isPlaying: !isPlaying });
    } catch (error) {
      console.error("Failed to toggle play/pause:", error);
    }
  },

  stopStream: () => {
    set({
      currentSpotifyTrack: null,
      currentStreamInfo: null,
      isPlaying: false,
      streamQueue: [],
      streamQueueIndex: 0,
    });
    invoke("stop").catch(console.error);
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

  checkCredentials: async () => {
    try {
      // First check local cache (Rust backend)
      const hasCachedCreds = await invoke<boolean>("has_spotify_credentials");
      if (hasCachedCreds) {
        set({ hasCredentials: true });
        return;
      }

      // If no local cache, try to fetch from Supabase
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        set({ hasCredentials: false });
        return;
      }

      const { data: credentials, error } = await supabase
        .from("user_spotify_credentials")
        .select("client_id, client_secret")
        .eq("user_id", user.id)
        .single();

      if (error || !credentials) {
        set({ hasCredentials: false });
        return;
      }

      // Restore credentials to local cache
      await invoke("set_spotify_credentials", {
        clientId: credentials.client_id,
        clientSecret: credentials.client_secret,
      });
      set({ hasCredentials: true });
    } catch (error) {
      console.error("Failed to check credentials:", error);
      set({ hasCredentials: false });
    }
  },

  setCredentials: async (clientId, clientSecret) => {
    try {
      // Save to local cache (Rust backend)
      await invoke("set_spotify_credentials", { clientId, clientSecret });

      // Also save to Supabase for persistence across devices
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { error } = await supabase
          .from("user_spotify_credentials")
          .upsert(
            {
              user_id: user.id,
              client_id: clientId,
              client_secret: clientSecret,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id" },
          );

        if (error) {
          console.error("Failed to save credentials to Supabase:", error);
          // Don't throw - local cache still works
        }
      }

      set({ hasCredentials: true });
    } catch (error) {
      console.error("Failed to set credentials:", error);
      throw error;
    }
  },

  clearCredentials: async () => {
    try {
      // Clear local cache
      await invoke("clear_spotify_credentials");

      // Also clear from Supabase
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from("user_spotify_credentials")
          .delete()
          .eq("user_id", user.id);
      }

      set({ hasCredentials: false });
    } catch (error) {
      console.error("Failed to clear credentials:", error);
      throw error;
    }
  },

  // Progressive streaming - start downloading ALL chunks in background
  preloadNextChunks: (trackId, totalChunks) => {
    // Initialize progressive stream state
    set({
      progressiveStream: {
        trackId,
        currentChunk: 0,
        totalChunks,
        isComplete: totalChunks === 1,
        chunkPaths: [],
        preloadingNext: true, // Start downloading immediately
      },
    });

    // If only one chunk (already complete), finalize immediately when done playing
    if (totalChunks === 1) {
      console.log("[Progressive] Single chunk, will finalize when complete");
      return;
    }

    // Start downloading ALL remaining chunks in background with multithreaded support
    const downloadAllChunksInBackground = async () => {
      console.log(
        `[Progressive] Starting multithreaded download of all ${totalChunks} chunks (2 threads)`,
      );

      try {
        // Call backend to download all remaining chunks with 2 threads
        const downloadedCount = await invoke<number>("download_all_chunks_mt", {
          trackId,
        });

        console.log(
          `[Progressive] Downloaded ${downloadedCount} chunks in background`,
        );

        // Update state to mark as complete
        const currentState = get().progressiveStream;
        if (currentState && currentState.trackId === trackId) {
          set({
            progressiveStream: {
              ...currentState,
              isComplete: true,
              preloadingNext: false,
            },
          });

          // All chunks downloaded - finalize to FLAC immediately so next play uses local file
          console.log(
            "[Progressive] All chunks downloaded, finalizing to FLAC in background...",
          );
          try {
            const finalPath = await invoke<string>("finalize_stream", {
              trackId,
            });
            console.log(`[Progressive] Stream finalized to FLAC: ${finalPath}`);
          } catch (finalizeError) {
            console.error(
              "[Progressive] Background finalization failed:",
              finalizeError,
            );
          }
        }
      } catch (error) {
        console.error("[Progressive] Failed to download all chunks:", error);
        const currentState = get().progressiveStream;
        if (currentState) {
          set({
            progressiveStream: {
              ...currentState,
              preloadingNext: false,
            },
          });
        }
      }
    };

    // Start downloading after a short delay to let first chunk playback start
    setTimeout(() => downloadAllChunksInBackground(), 500);

    // Start monitoring for chunk transitions with GAPLESS playback
    const startChunkMonitor = () => {
      let monitorInterval: number | null = null;
      let chunkDuration = 32; // Default ~8 segments * 4 seconds
      let lastAppendedChunk = 0; // Track which chunks we've already appended
      let isTransitioning = false; // Prevent race conditions

      // Get actual chunk duration from backend
      invoke<number>("get_chunk_duration", { trackId })
        .then((duration) => {
          chunkDuration = duration;
          console.log(`[Progressive] Chunk duration: ${chunkDuration}s`);
        })
        .catch(() => {
          console.log("[Progressive] Using default chunk duration");
        });

      const appendNextChunk = async (): Promise<boolean> => {
        const state = get().progressiveStream;
        if (!state || state.trackId !== trackId) return false;

        const nextChunkToAppend = lastAppendedChunk + 1;
        if (nextChunkToAppend >= state.totalChunks) return false;

        // Check if next chunk is ready
        const isReady = await invoke<boolean>("is_chunk_ready", {
          trackId,
          chunkIndex: nextChunkToAppend,
        });

        if (!isReady) {
          console.log(
            `[Progressive] Chunk ${nextChunkToAppend + 1} not ready yet`,
          );
          return false;
        }

        const chunkPath = await invoke<string | null>("get_chunk_by_index", {
          trackId,
          chunkIndex: nextChunkToAppend,
        });

        if (!chunkPath) {
          console.error(
            `[Progressive] Failed to get path for chunk ${nextChunkToAppend + 1}`,
          );
          return false;
        }

        console.log(
          `[Progressive] Appending chunk ${nextChunkToAppend + 1}/${state.totalChunks}: ${chunkPath}`,
        );

        try {
          // Append the chunk samples to buffer for gapless playback
          await invoke("append_chunk", { chunkPath });

          lastAppendedChunk = nextChunkToAppend;

          // Update state
          set({
            progressiveStream: {
              ...state,
              currentChunk: nextChunkToAppend,
            },
          });

          // Advance in backend
          await invoke("advance_to_next_chunk", { trackId });

          console.log(
            `[Progressive] Chunk ${nextChunkToAppend + 1} appended successfully`,
          );

          return true;
        } catch (error) {
          console.error(
            `[Progressive] Failed to append chunk ${nextChunkToAppend + 1}:`,
            error,
          );
          return false;
        }
      };

      const checkPlaybackStatus = async () => {
        const state = get().progressiveStream;
        if (!state || state.trackId !== trackId) {
          // Stream ended or changed, stop monitoring
          if (monitorInterval) {
            clearInterval(monitorInterval);
            monitorInterval = null;
          }
          return;
        }

        // Prevent concurrent transitions
        if (isTransitioning) return;

        try {
          const playbackState = await invoke<{
            is_playing: boolean;
            position: number;
            duration: number;
            track_finished: boolean;
          }>("get_playback_state");

          const timeRemaining = playbackState.duration - playbackState.position;
          const nextChunkToAppend = lastAppendedChunk + 1;
          const hasMoreChunks = nextChunkToAppend < state.totalChunks;

          // STRATEGY: Append chunks as soon as they're ready, with plenty of buffer
          // This ensures seamless playback even if download is slow

          // CASE 1: Track finished but we have more chunks - URGENT append and resume
          if (playbackState.track_finished && hasMoreChunks) {
            isTransitioning = true;
            console.log(
              `[Progressive] URGENT: Track finished, appending chunk ${nextChunkToAppend + 1}...`,
            );

            // Try up to 10 times with 200ms delays to wait for chunk
            for (let attempt = 0; attempt < 10; attempt++) {
              const appended = await appendNextChunk();
              if (appended) {
                // Resume playback
                await invoke("resume");
                console.log(
                  `[Progressive] Resumed playback after appending chunk`,
                );
                break;
              }
              // Wait a bit for chunk to become ready
              await new Promise((r) => setTimeout(r, 200));
            }

            isTransitioning = false;
            return;
          }

          // CASE 2: Proactive append - append next chunk as soon as it's ready
          // Do this whenever we're playing and have unappended chunks
          if (playbackState.is_playing && hasMoreChunks) {
            isTransitioning = true;
            // Try to append, will return false if chunk isn't ready yet
            await appendNextChunk();
            isTransitioning = false;
            return;
          }

          // CASE 3: All chunks played, finalize
          if (
            playbackState.track_finished &&
            lastAppendedChunk >= state.totalChunks - 1
          ) {
            console.log("[Progressive] All chunks played, finalizing...");
            if (monitorInterval) {
              clearInterval(monitorInterval);
              monitorInterval = null;
            }
            get().finalizeStream(trackId);
          }
        } catch (error) {
          isTransitioning = false;
          // Ignore errors during monitoring
        }
      };

      // Check every 100ms for faster response (was 500ms)
      monitorInterval = window.setInterval(checkPlaybackStatus, 100);
    };

    // Start monitoring immediately when playback begins
    setTimeout(() => startChunkMonitor(), 500);
  },

  // Play the next chunk when current chunk ends (manual trigger if needed)
  playNextChunk: async (trackId, chunkIndex) => {
    const state = get().progressiveStream;
    if (!state || state.trackId !== trackId) return;

    try {
      // Check if chunk is ready
      const isReady = await invoke<boolean>("is_chunk_ready", {
        trackId,
        chunkIndex,
      });

      if (!isReady) {
        console.log(
          `[Progressive] Chunk ${chunkIndex + 1} not ready yet, waiting...`,
        );
        // Wait for chunk to be ready
        const waitForChunk = async (attempts = 0): Promise<void> => {
          if (attempts > 50) {
            // Max 5 seconds wait
            throw new Error("Timeout waiting for chunk");
          }
          const ready = await invoke<boolean>("is_chunk_ready", {
            trackId,
            chunkIndex,
          });
          if (!ready) {
            await new Promise((resolve) => setTimeout(resolve, 100));
            return waitForChunk(attempts + 1);
          }
        };
        await waitForChunk();
      }

      // Get chunk path
      const chunkPath = await invoke<string | null>("get_chunk_by_index", {
        trackId,
        chunkIndex,
      });

      if (chunkPath) {
        // Advance in backend
        await invoke("advance_to_next_chunk", { trackId });

        // Play the chunk
        await invoke("play_chunk", { chunkPath });

        set({
          progressiveStream: {
            ...state,
            currentChunk: chunkIndex,
          },
        });

        console.log(`[Progressive] Playing chunk ${chunkIndex + 1}`);
      }
    } catch (error) {
      console.error("[Progressive] Failed to play next chunk:", error);
    }
  },

  // Finalize stream - join all chunks and save to music library
  finalizeStream: async (trackId) => {
    const state = get().progressiveStream;
    if (!state || state.trackId !== trackId) return;

    try {
      console.log("[Progressive] Finalizing stream...");
      const finalPath = await invoke<string>("finalize_stream", { trackId });
      console.log(`[Progressive] Stream finalized: ${finalPath}`);

      set({ progressiveStream: null });
    } catch (error) {
      console.error("[Progressive] Failed to finalize stream:", error);
      // Clean up anyway
      try {
        await invoke("cleanup_stream", { trackId });
      } catch (e) {
        console.error("[Progressive] Cleanup failed:", e);
      }
      set({ progressiveStream: null });
    }
  },

  // Seek to a specific position in the stream
  // This reprioritizes chunk downloads to start from the seek position
  seekToPosition: async (trackId, positionSeconds, totalDuration) => {
    const state = get().progressiveStream;
    if (!state || state.trackId !== trackId) {
      // Not a progressive stream, just do a normal seek
      await invoke("seek", { position: positionSeconds });
      return;
    }

    try {
      console.log(`[Progressive] Seeking to position ${positionSeconds}s`);

      // Get the target chunk for this position
      const targetChunk = await invoke<number>("get_chunk_for_position", {
        trackId,
        positionSeconds,
      });

      console.log(`[Progressive] Target chunk for seek: ${targetChunk}`);

      // Check if target chunk is already downloaded
      const isReady = await invoke<boolean>("is_chunk_ready", {
        trackId,
        chunkIndex: targetChunk,
      });

      if (isReady) {
        // Chunk is ready, we can seek immediately
        // Calculate position within the chunk
        const chunkDuration = await invoke<number>("get_chunk_duration", {
          trackId,
        });
        const chunkStartTime = targetChunk * chunkDuration;
        const positionInChunk = positionSeconds - chunkStartTime;

        console.log(
          `[Progressive] Chunk ${targetChunk} is ready, seeking to ${positionInChunk}s within chunk`,
        );

        // If we have buffered audio up to this point, seek directly
        const playbackState = await invoke<{ duration: number }>(
          "get_playback_state",
        );
        if (positionSeconds <= playbackState.duration) {
          // Position is within buffered content, seek directly
          await invoke("seek", { position: positionSeconds });
          // Small pause before resuming playback for smoother scrubbing experience
          await new Promise((resolve) => setTimeout(resolve, 100));
        } else {
          // Need to load/append chunks up to this position
          // For now, seek to the end of buffered content
          console.log(
            `[Progressive] Position beyond buffer, seeking to ${playbackState.duration}s`,
          );
          await invoke("seek", {
            position: Math.max(0, playbackState.duration - 0.1),
          });
        }
      } else {
        // Chunk not ready, reprioritize downloads
        console.log(
          `[Progressive] Chunk ${targetChunk} not ready, reprioritizing downloads...`,
        );

        // Reprioritize the download queue
        const newQueue = await invoke<number[]>("seek_reprioritize", {
          trackId,
          targetChunk,
        });

        console.log(
          `[Progressive] New download queue: ${newQueue.slice(0, 5).join(", ")}...`,
        );

        // Update local state
        set({
          progressiveStream: {
            ...state,
            currentChunk: targetChunk,
          },
        });

        // Wait for the target chunk to download (with timeout)
        const maxWaitMs = 15000; // 15 seconds max wait
        const checkIntervalMs = 200;
        let waited = 0;

        while (waited < maxWaitMs) {
          const ready = await invoke<boolean>("is_chunk_ready", {
            trackId,
            chunkIndex: targetChunk,
          });

          if (ready) {
            console.log(
              `[Progressive] Target chunk ${targetChunk} is now ready`,
            );

            // Get the chunk path and play it
            const chunkPath = await invoke<string | null>(
              "get_chunk_by_index",
              {
                trackId,
                chunkIndex: targetChunk,
              },
            );

            if (chunkPath) {
              // Play the new chunk
              await invoke("play_chunk", { chunkPath });

              // Calculate position within chunk for more accurate seeking
              const chunkDuration = await invoke<number>("get_chunk_duration", {
                trackId,
              });
              const chunkStartTime = targetChunk * chunkDuration;
              const positionInChunk = positionSeconds - chunkStartTime;

              // Seek within the chunk
              if (positionInChunk > 0) {
                await invoke("seek", { position: positionInChunk });
              }
            }
            break;
          }

          await new Promise((resolve) => setTimeout(resolve, checkIntervalMs));
          waited += checkIntervalMs;
        }

        if (waited >= maxWaitMs) {
          console.warn(
            `[Progressive] Timeout waiting for chunk ${targetChunk}`,
          );
        }
      }
    } catch (error) {
      console.error("[Progressive] Seek failed:", error);
      // Fallback to normal seek if something goes wrong
      try {
        await invoke("seek", { position: positionSeconds });
      } catch (e) {
        console.error("[Progressive] Fallback seek also failed:", e);
      }
    }
  },
}));
