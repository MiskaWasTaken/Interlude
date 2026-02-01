import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Layout from "./components/layout/Layout";
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
import SpotiFlacPage from "./pages/SpotiFlacPage";
import { GradientProvider } from "./contexts/GradientContext";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <GradientProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Layout />}>
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
              <Route path="statistics" element={<StatisticsPage />} />
              <Route
                path="playlist/:playlistId"
                element={<SmartPlaylistPage />}
              />
              <Route path="spotiflac" element={<SpotiFlacPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </GradientProvider>
    </QueryClientProvider>
  );
}

export default App;
