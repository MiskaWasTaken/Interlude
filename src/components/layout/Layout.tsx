import { Outlet } from 'react-router-dom';
import { useEffect } from 'react';
import Sidebar from './Sidebar';
import PlayerBar from './PlayerBar';
import { useGradient } from '../../contexts/GradientContext';
import { useLibraryStore } from '../../stores/libraryStore';
import { usePlayerStore } from '../../stores/playerStore';

export default function Layout() {
  const { colors, intensity, gradientEnabled } = useGradient();
  const loadLibrary = useLibraryStore(state => state.loadLibrary);
  const loadStatistics = useLibraryStore(state => state.loadStatistics);
  const loadSmartPlaylists = useLibraryStore(state => state.loadSmartPlaylists);
  const loadRecentlyPlayed = useLibraryStore(state => state.loadRecentlyPlayed);
  const updatePlaybackState = usePlayerStore(state => state.updatePlaybackState);

  // Load library on mount
  useEffect(() => {
    loadLibrary();
    loadStatistics();
    loadSmartPlaylists();
    loadRecentlyPlayed();
  }, [loadLibrary, loadStatistics, loadSmartPlaylists, loadRecentlyPlayed]);

  // Update playback state periodically
  useEffect(() => {
    const interval = setInterval(updatePlaybackState, 1000);
    return () => clearInterval(interval);
  }, [updatePlaybackState]);

  const gradientStyle = gradientEnabled ? {
    background: `linear-gradient(135deg, 
      ${colors.primary} 0%, 
      ${colors.secondary} 50%, 
      ${colors.tertiary} 100%)`,
    opacity: intensity,
  } : {};

  return (
    <div className="flex h-screen bg-amoled-black overflow-hidden">
      {/* Animated gradient background */}
      {gradientEnabled && (
        <div 
          className="fixed inset-0 pointer-events-none animate-gradient-bg transition-all duration-1000"
          style={gradientStyle}
        />
      )}
      
      {/* Sidebar */}
      <Sidebar />
      
      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          <Outlet />
        </div>
      </main>
      
      {/* Player bar */}
      <PlayerBar />
    </div>
  );
}
