#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

mod audio;
mod database;
mod library;
mod commands;
mod streaming;

use tauri::Manager;
use std::sync::Arc;
use parking_lot::Mutex;

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
            let app_dir = app.path_resolver()
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
