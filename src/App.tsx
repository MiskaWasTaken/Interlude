import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";
import Layout from "./components/layout/Layout";
import ProtectedRoute from "./components/ProtectedRoute";
import HomePage from "./pages/HomePage";
import AlbumsPage from "./pages/AlbumsPage";
import ArtistsPage from "./pages/ArtistsPage";
import LibraryPage from "./pages/LibraryPage";
import AlbumDetailPage from "./pages/AlbumDetailPage";
import ArtistDetailPage from "./pages/ArtistDetailPage";
import SearchPage from "./pages/SearchPage";
import SettingsPage from "./pages/SettingsPage";
import StatisticsPage from "./pages/StatisticsPage";
import SmartPlaylistPage from "./pages/SmartPlaylistPage";
import AuthPage from "./pages/AuthPage";
import AuthCallbackPage from "./pages/AuthCallbackPage";
import AdminInviteCodesPage from "./pages/AdminInviteCodesPage";
import ProfileSettingsPage from "./pages/ProfileSettingsPage";
import { GradientProvider } from "./contexts/GradientContext";
import { useAuthStore } from "./stores/authStore";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
    },
  },
});

function App() {
  const initialize = useAuthStore((state) => state.initialize);

  useEffect(() => {
    initialize();
  }, [initialize]);

  return (
    <QueryClientProvider client={queryClient}>
      <GradientProvider>
        <BrowserRouter>
          <Routes>
            {/* Auth routes - outside of Layout */}
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/auth/callback" element={<AuthCallbackPage />} />

            {/* Protected routes */}
            <Route
              path="/admin/invite-codes"
              element={
                <ProtectedRoute>
                  <AdminInviteCodesPage />
                </ProtectedRoute>
              }
            />

            {/* Main app routes - all protected */}
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route index element={<HomePage />} />
              <Route path="albums" element={<AlbumsPage />} />
              <Route
                path="albums/:albumName/:artistName"
                element={<AlbumDetailPage />}
              />
              <Route path="artists" element={<ArtistsPage />} />
              <Route
                path="artists/:artistName"
                element={<ArtistDetailPage />}
              />
              <Route path="library" element={<LibraryPage />} />
              <Route path="search" element={<SearchPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="profile" element={<ProfileSettingsPage />} />
              <Route path="statistics" element={<StatisticsPage />} />
              <Route
                path="playlist/:playlistId"
                element={<SmartPlaylistPage />}
              />
            </Route>
          </Routes>
        </BrowserRouter>
      </GradientProvider>
    </QueryClientProvider>
  );
}

export default App;
