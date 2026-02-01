import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { invoke } from '@tauri-apps/api/tauri';
import type { Track, Album, Artist, LibraryFolder, Statistics, SmartPlaylist } from '../types';

interface LibraryStore {
  // State
  tracks: Track[];
  albums: Album[];
  artists: Artist[];
  folders: LibraryFolder[];
  statistics: Statistics | null;
  smartPlaylists: SmartPlaylist[];
  recentlyPlayed: Track[];
  isScanning: boolean;
  
  // Actions
  loadLibrary: () => Promise<void>;
  loadStatistics: () => Promise<void>;
  loadSmartPlaylists: () => Promise<void>;
  loadRecentlyPlayed: () => Promise<void>;
  scanLibrary: () => Promise<number>;
  addFolder: (path: string) => Promise<void>;
  removeFolder: (path: string) => Promise<void>;
  toggleFavorite: (trackId: number) => Promise<void>;
}

const defaultStatistics: Statistics = {
  total_tracks: 0,
  total_albums: 0,
  total_artists: 0,
  total_duration: 0,
  total_size: 0,
  hires_tracks: 0,
};

export const useLibraryStore = create<LibraryStore>()(
  persist(
    (set, get) => ({
      tracks: [],
      albums: [],
      artists: [],
      folders: [],
      statistics: null,
      smartPlaylists: [],
      recentlyPlayed: [],
      isScanning: false,

      loadLibrary: async () => {
        try {
          const [tracks, albums, artists, folders] = await Promise.all([
            invoke<Track[]>('get_all_tracks'),
            invoke<Album[]>('get_all_albums'),
            invoke<Artist[]>('get_all_artists'),
            invoke<LibraryFolder[]>('get_library_folders'),
          ]);
          set({ tracks, albums, artists, folders });
        } catch (error) {
          console.error('Failed to load library:', error);
        }
      },

      loadStatistics: async () => {
        try {
          const statistics = await invoke<Statistics>('get_statistics');
          set({ statistics });
        } catch (error) {
          console.error('Failed to load statistics:', error);
        }
      },

      loadSmartPlaylists: async () => {
        try {
          const smartPlaylists = await invoke<SmartPlaylist[]>('get_smart_playlists');
          set({ smartPlaylists });
        } catch (error) {
          console.error('Failed to load smart playlists:', error);
        }
      },

      loadRecentlyPlayed: async () => {
        try {
          const recentlyPlayed = await invoke<Track[]>('get_recently_played', { limit: 10 });
          set({ recentlyPlayed });
        } catch (error) {
          console.error('Failed to load recently played:', error);
        }
      },

      scanLibrary: async () => {
        set({ isScanning: true });
        try {
          const added = await invoke<number>('scan_library');
          await get().loadLibrary();
          await get().loadStatistics();
          return added;
        } catch (error) {
          console.error('Failed to scan library:', error);
          return 0;
        } finally {
          set({ isScanning: false });
        }
      },

      addFolder: async (path: string) => {
        try {
          await invoke('add_library_folder', { path });
          const folders = await invoke<LibraryFolder[]>('get_library_folders');
          set({ folders });
        } catch (error) {
          console.error('Failed to add folder:', error);
        }
      },

      removeFolder: async (path: string) => {
        try {
          await invoke('remove_library_folder', { path });
          const folders = await invoke<LibraryFolder[]>('get_library_folders');
          set({ folders });
          await get().loadLibrary();
        } catch (error) {
          console.error('Failed to remove folder:', error);
        }
      },

      toggleFavorite: async (trackId: number) => {
        const track = get().tracks.find(t => t.id === trackId);
        if (!track) return;

        try {
          if (track.is_favorite) {
            await invoke('remove_from_favorites', { trackId });
          } else {
            await invoke('add_to_favorites', { trackId });
          }
          
          set(state => ({
            tracks: state.tracks.map(t => 
              t.id === trackId ? { ...t, is_favorite: !t.is_favorite } : t
            )
          }));
        } catch (error) {
          console.error('Failed to toggle favorite:', error);
        }
      },
    }),
    {
      name: 'hiflac-library',
      partialize: () => ({}), // Don't persist library data
    }
  )
);
