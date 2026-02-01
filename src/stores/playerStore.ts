import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { invoke } from '@tauri-apps/api/tauri';
import type { Track, PlaybackState } from '../types';

interface PlayerStore {
  // State
  playbackState: PlaybackState;
  queue: Track[];
  queueIndex: number;
  
  // Actions
  playTrack: (track: Track, queue?: Track[]) => Promise<void>;
  togglePlayPause: () => Promise<void>;
  stop: () => Promise<void>;
  seekTo: (position: number) => Promise<void>;
  setVolume: (volume: number) => Promise<void>;
  nextTrack: () => Promise<void>;
  previousTrack: () => Promise<void>;
  toggleShuffle: () => Promise<void>;
  cycleRepeatMode: () => Promise<void>;
  setQueue: (tracks: Track[], startIndex?: number) => void;
  updatePlaybackState: () => Promise<void>;
}

const defaultPlaybackState: PlaybackState = {
  is_playing: false,
  current_track: null,
  position: 0,
  duration: 0,
  volume: 1,
  sample_rate: 44100,
  bit_depth: 16,
  channels: 2,
  shuffle: false,
  repeat_mode: 'off',
};

export const usePlayerStore = create<PlayerStore>()(
  persist(
    (set, get) => ({
      playbackState: defaultPlaybackState,
      queue: [],
      queueIndex: -1,

      playTrack: async (track: Track, queue?: Track[]) => {
        try {
          if (queue) {
            const index = queue.findIndex(t => t.id === track.id);
            set({ queue, queueIndex: index >= 0 ? index : 0 });
          }
          
          await invoke('play_track', { filePath: track.file_path });
          
          set(state => ({
            playbackState: {
              ...state.playbackState,
              is_playing: true,
              current_track: track,
              position: 0,
              duration: track.duration,
              sample_rate: track.sample_rate,
              bit_depth: track.bit_depth,
              channels: track.channels,
            }
          }));
        } catch (error) {
          console.error('Failed to play track:', error);
        }
      },

      togglePlayPause: async () => {
        const { playbackState } = get();
        try {
          if (playbackState.is_playing) {
            await invoke('pause');
          } else {
            await invoke('resume');
          }
          set(state => ({
            playbackState: {
              ...state.playbackState,
              is_playing: !state.playbackState.is_playing,
            }
          }));
        } catch (error) {
          console.error('Failed to toggle play/pause:', error);
        }
      },

      stop: async () => {
        try {
          await invoke('stop');
          set(state => ({
            playbackState: {
              ...state.playbackState,
              is_playing: false,
              position: 0,
            }
          }));
        } catch (error) {
          console.error('Failed to stop:', error);
        }
      },

      seekTo: async (position: number) => {
        try {
          await invoke('seek', { position });
          set(state => ({
            playbackState: {
              ...state.playbackState,
              position,
            }
          }));
        } catch (error) {
          console.error('Failed to seek:', error);
        }
      },

      setVolume: async (volume: number) => {
        try {
          await invoke('set_volume', { volume });
          set(state => ({
            playbackState: {
              ...state.playbackState,
              volume,
            }
          }));
        } catch (error) {
          console.error('Failed to set volume:', error);
        }
      },

      nextTrack: async () => {
        const { queue, queueIndex, playbackState } = get();
        if (queue.length === 0) return;

        let nextIndex: number;
        
        if (playbackState.shuffle) {
          nextIndex = Math.floor(Math.random() * queue.length);
        } else {
          nextIndex = queueIndex + 1;
          if (nextIndex >= queue.length) {
            if (playbackState.repeat_mode === 'all') {
              nextIndex = 0;
            } else {
              return; // End of queue
            }
          }
        }

        const nextTrack = queue[nextIndex];
        if (nextTrack) {
          set({ queueIndex: nextIndex });
          await get().playTrack(nextTrack);
        }
      },

      previousTrack: async () => {
        const { queue, queueIndex, playbackState } = get();
        
        // If more than 3 seconds in, restart current track
        if (playbackState.position > 3) {
          await get().seekTo(0);
          return;
        }

        if (queue.length === 0 || queueIndex <= 0) {
          await get().seekTo(0);
          return;
        }

        const prevIndex = queueIndex - 1;
        const prevTrack = queue[prevIndex];
        if (prevTrack) {
          set({ queueIndex: prevIndex });
          await get().playTrack(prevTrack);
        }
      },

      toggleShuffle: async () => {
        const { playbackState } = get();
        const newShuffle = !playbackState.shuffle;
        try {
          await invoke('set_shuffle', { enabled: newShuffle });
          set(state => ({
            playbackState: {
              ...state.playbackState,
              shuffle: newShuffle,
            }
          }));
        } catch (error) {
          console.error('Failed to toggle shuffle:', error);
        }
      },

      cycleRepeatMode: async () => {
        const { playbackState } = get();
        const modes: PlaybackState['repeat_mode'][] = ['off', 'all', 'one'];
        const currentIndex = modes.indexOf(playbackState.repeat_mode);
        const nextMode = modes[(currentIndex + 1) % modes.length];
        
        try {
          await invoke('set_repeat_mode', { mode: nextMode });
          set(state => ({
            playbackState: {
              ...state.playbackState,
              repeat_mode: nextMode,
            }
          }));
        } catch (error) {
          console.error('Failed to set repeat mode:', error);
        }
      },

      setQueue: (tracks: Track[], startIndex = 0) => {
        set({ queue: tracks, queueIndex: startIndex });
      },

      updatePlaybackState: async () => {
        try {
          const state = await invoke<PlaybackState>('get_playback_state');
          set({ playbackState: state });
        } catch (error) {
          console.error('Failed to update playback state:', error);
        }
      },
    }),
    {
      name: 'hiflac-player',
      partialize: (state) => ({
        playbackState: {
          volume: state.playbackState.volume,
          shuffle: state.playbackState.shuffle,
          repeat_mode: state.playbackState.repeat_mode,
        },
      }),
    }
  )
);
