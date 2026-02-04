#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

mod audio;
mod commands;
mod database;
mod ffmpeg;
mod library;
mod stream_cache;
mod streaming;

use parking_lot::Mutex;
use std::sync::Arc;
use tauri::Manager;

use audio::AudioEngine;
use database::Database;
use library::LibraryScanner;
use streaming::StreamingService;

pub struct AppState {
    pub audio_engine: Arc<Mutex<AudioEngine>>,
    pub database: Arc<Mutex<Database>>,
    pub library_scanner: Arc<Mutex<LibraryScanner>>,
    pub streaming_service: Arc<Mutex<StreamingService>>,
}

fn main() {
    env_logger::init();

    tauri::Builder::default()
        .setup(|app| {
            let app_dir = app
                .path_resolver()
                .app_data_dir()
                .expect("Failed to get app data directory");

            std::fs::create_dir_all(&app_dir).ok();

            let db_path = app_dir.join("hiflac.db");
            let database = Database::new(&db_path).expect("Failed to initialize database");
            let audio_engine = AudioEngine::new().expect("Failed to initialize audio engine");
            let library_scanner = LibraryScanner::new();
            let streaming_service = StreamingService::new();

            let state = AppState {
                audio_engine: Arc::new(Mutex::new(audio_engine)),
                database: Arc::new(Mutex::new(database)),
                library_scanner: Arc::new(Mutex::new(library_scanner)),
                streaming_service: Arc::new(Mutex::new(streaming_service)),
            };

            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_all_tracks,
            commands::get_all_albums,
            commands::get_all_artists,
            commands::get_album_tracks,
            commands::get_artist_albums,
            commands::scan_library,
            commands::add_library_folder,
            commands::remove_library_folder,
            commands::get_library_folders,
            commands::play_track,
            commands::pause,
            commands::resume,
            commands::stop,
            commands::seek,
            commands::set_volume,
            commands::get_playback_state,
            commands::next_track,
            commands::previous_track,
            commands::set_shuffle,
            commands::set_repeat_mode,
            commands::get_audio_devices,
            commands::set_audio_device,
            commands::get_track_artwork,
            commands::search,
            commands::get_statistics,
            commands::get_recently_played,
            commands::add_to_favorites,
            commands::remove_from_favorites,
            commands::get_favorites,
            commands::get_smart_playlists,
            commands::get_lyrics,
            // Streaming commands
            commands::search_spotify,
            commands::get_spotify_track,
            commands::get_spotify_album,
            commands::get_streaming_urls,
            commands::get_best_stream,
            commands::play_spotify_track,
            commands::set_streaming_preferences,
            commands::set_spotify_credentials,
            commands::get_spotify_credentials,
            commands::clear_spotify_credentials,
            commands::has_spotify_credentials,
            // Stream cache commands
            commands::is_track_cached,
            commands::get_cache_dir,
            commands::get_cache_size,
            commands::clear_stream_cache,
            commands::clear_music_library,
            commands::get_cache_info,
            commands::download_tidal_track,
            commands::download_qobuz_track,
            commands::download_amazon_track,
            commands::play_cached_track,
            commands::download_and_play_track,
            commands::get_music_download_dir,
            // FFmpeg commands
            commands::get_ffmpeg_status,
            commands::download_ffmpeg,
            commands::uninstall_ffmpeg,
            commands::is_ffmpeg_available,
            // Progressive streaming commands
            commands::start_progressive_stream,
            commands::download_next_chunk,
            commands::get_current_chunk,
            commands::advance_to_next_chunk,
            commands::play_chunk,
            commands::append_chunk,
            commands::finalize_stream,
            commands::get_stream_progress,
            commands::cleanup_stream,
            commands::download_all_chunks,
            commands::get_chunk_by_index,
            commands::get_chunk_duration,
            commands::get_total_chunks,
            commands::is_chunk_ready,
            commands::get_chunk_for_position,
            commands::seek_reprioritize,
            commands::download_all_chunks_mt,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
