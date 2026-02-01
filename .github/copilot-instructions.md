# HiFlac - Copilot Instructions

## Project Overview

HiFlac is a hi-res audio player built with **Tauri** (Rust backend + React frontend). It supports FLAC/WAV/ALAC up to 24-bit/192kHz with WASAPI exclusive mode on Windows.

## Architecture

### Frontend-Backend Communication

All Rust ↔ React communication uses Tauri's `invoke` API:

```typescript
import { invoke } from "@tauri-apps/api/tauri";
const tracks = await invoke<Track[]>("get_all_tracks");
```

Commands are defined in [src-tauri/src/commands.rs](src-tauri/src/commands.rs) with `#[tauri::command]` and registered in [main.rs](src-tauri/src/main.rs) via `tauri::generate_handler![]`.

### State Management

- **Zustand stores** in `src/stores/` manage frontend state with persistence
- **playerStore.ts** - Playback control, queue management, calls Rust audio engine
- **libraryStore.ts** - Library data, scanning, favorites
- Types must match between [src/types/index.ts](src/types/index.ts) and [src-tauri/src/database.rs](src-tauri/src/database.rs) structs

### Audio Engine (`src-tauri/src/audio.rs`)

- Uses **Symphonia** for decoding, **cpal** for output
- WASAPI exclusive mode on Windows for bit-perfect playback
- Commands: `play_track`, `pause`, `resume`, `stop`, `seek`, `set_volume`

### Database (`src-tauri/src/database.rs`)

- SQLite via rusqlite with `bundled` feature
- Schema in `Database::initialize()` method
- Track deduplication uses blake3 file hashes

## Key Patterns

### Adding a New Tauri Command

1. Add function in `commands.rs` with `#[tauri::command]`
2. Register in `main.rs` handler list
3. Call from frontend: `invoke<ReturnType>('command_name', { param: value })`

### React Components

- Pages in `src/pages/` - route-level components
- Layout wraps all routes with Sidebar + PlayerBar
- Use `clsx` for conditional classes, not template literals
- AlbumArt component handles artwork loading and fallbacks

### Styling Conventions

- **AMOLED theme**: Use `bg-amoled-*` colors (`black: #000`, `surface: #0a0a0a`, `card: #181818`)
- **Text**: `text-text-primary` (white), `text-text-secondary` (gray), `text-text-muted`
- **Accent**: `accent-primary` (#d4a853 gold) for highlights
- Gradients extracted from album art via `GradientContext`

## Development Commands

```bash
npm install          # Install frontend deps
npm run tauri:dev    # Start dev mode (Vite + Tauri)
npm run tauri:build  # Production build
```

## File Naming & Organization

| Directory         | Purpose                                                 |
| ----------------- | ------------------------------------------------------- |
| `src/stores/`     | Zustand stores (camelCase: `playerStore.ts`)            |
| `src/pages/`      | Route components (PascalCase: `AlbumDetailPage.tsx`)    |
| `src/components/` | Reusable UI (`common/`, `layout/`, `icons/`)            |
| `src-tauri/src/`  | Rust modules (`audio.rs`, `database.rs`, `commands.rs`) |

## Common Tasks

### Add a new page

1. Create `src/pages/NewPage.tsx`
2. Add route in `App.tsx`: `<Route path="new" element={<NewPage />} />`
3. Add sidebar link in `Sidebar.tsx`

### Add a database field

1. Update struct in `database.rs` + add column in schema
2. Update corresponding TypeScript interface in `src/types/index.ts`
3. Update any SQL queries that SELECT/INSERT the table

### Debug audio issues

Check Rust logs: `RUST_LOG=debug npm run tauri:dev`

## SpotiFlac Streaming Integration

The streaming feature (`src/pages/SpotiFlacPage.tsx`) enables on-demand hi-res playback from external services.

### Architecture

- **Frontend**: `streamingStore.ts` manages search, playback state, and service preferences
- **Backend**: `streaming.rs` handles API calls via song.link to find tracks on Tidal/Qobuz/Amazon
- Types in `src/types/streaming.ts` must match Rust structs in `streaming.rs`

### Key Commands

```typescript
// Search for tracks/albums
await invoke<SpotifySearchResult>("search_spotify", { query, limit: 20 });

// Get streaming URLs for a track
await invoke<StreamingURLs>("get_streaming_urls", { trackId, region: "US" });

// Get album details
await invoke<SpotifyAlbum>("get_spotify_album", { albumId });
```

### Service Priority

Configured via `StreamingPreferences.service_order` - defaults to `['tidal', 'qobuz', 'amazon']`. The backend tries each service in order until a hi-res stream is found.

## Testing

**Current State**: No test framework is configured yet.

### Adding Tests (Recommended Setup)

**Frontend (Vitest)**:

```bash
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom
```

Add to `package.json`:

```json
"scripts": { "test": "vitest" }
```

**Rust**:
Add tests in module files using `#[cfg(test)]`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_track_deduplication() {
        // Test database hash-based dedup
    }
}
```

Run with: `cd src-tauri && cargo test`

### What to Test

- **Database**: Track insertion, deduplication, queries
- **Audio**: Decoder format detection (mock file I/O)
- **Stores**: Zustand action side effects (mock `invoke`)
