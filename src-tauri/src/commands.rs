//! Tauri Commands Module
//! Exposes backend functionality to the frontend

use crate::audio::RepeatMode;
use crate::database::{Album, Artist, LibraryFolder, Statistics, Track};
use crate::streaming::{
    SpotifyAlbum, SpotifySearchResult, SpotifyTrack, StreamInfo, StreamSource, StreamingService,
    StreamingURLs,
};
use crate::AppState;
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use serde::{Deserialize, Serialize};
use std::path::Path;
use tauri::State;

#[derive(Serialize)]
pub struct SearchResults {
    pub tracks: Vec<Track>,
    pub albums: Vec<Album>,
    pub artists: Vec<Artist>,
}

#[derive(Serialize)]
pub struct SmartPlaylist {
    pub id: String,
    pub name: String,
    pub icon: String,
    pub track_count: i64,
}

#[derive(Serialize)]
pub struct PlaybackStateResponse {
    pub is_playing: bool,
    pub current_track: Option<Track>,
    pub position: f64,
    pub duration: f64,
    pub volume: f32,
    pub sample_rate: u32,
    pub bit_depth: u16,
    pub channels: u16,
    pub shuffle: bool,
    pub repeat_mode: String,
}

// Library Commands
#[tauri::command]
pub fn get_all_tracks(state: State<AppState>) -> Result<Vec<Track>, String> {
    let db = state.database.lock();
    db.get_all_tracks().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_all_albums(state: State<AppState>) -> Result<Vec<Album>, String> {
    let db = state.database.lock();
    db.get_all_albums().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_all_artists(state: State<AppState>) -> Result<Vec<Artist>, String> {
    let db = state.database.lock();
    db.get_all_artists().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_album_tracks(
    state: State<AppState>,
    album: String,
    artist: String,
) -> Result<Vec<Track>, String> {
    let db = state.database.lock();
    db.get_album_tracks(&album, &artist)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_artist_albums(state: State<AppState>, artist: String) -> Result<Vec<Album>, String> {
    let db = state.database.lock();
    db.get_artist_albums(&artist).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn scan_library(state: State<'_, AppState>) -> Result<i32, String> {
    let folders = {
        let db = state.database.lock();
        db.get_library_folders().map_err(|e| e.to_string())?
    };

    let mut total_added = 0;

    for folder in folders {
        if !folder.enabled {
            continue;
        }

        let tracks = {
            let mut scanner = state.library_scanner.lock();
            scanner.scan_folder(Path::new(&folder.path))
        };

        {
            let db = state.database.lock();
            for track in tracks {
                // Check for duplicates
                if db.track_exists(&track.file_hash).unwrap_or(false) {
                    continue;
                }

                if db.insert_track(&track).is_ok() {
                    total_added += 1;
                }
            }
            db.update_folder_scanned(&folder.path).ok();
        }
    }

    Ok(total_added)
}

#[tauri::command]
pub fn add_library_folder(state: State<AppState>, path: String) -> Result<(), String> {
    let db = state.database.lock();
    db.add_library_folder(&path).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn remove_library_folder(state: State<AppState>, path: String) -> Result<(), String> {
    let db = state.database.lock();
    db.remove_library_folder(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_library_folders(state: State<AppState>) -> Result<Vec<LibraryFolder>, String> {
    let db = state.database.lock();
    db.get_library_folders().map_err(|e| e.to_string())
}

// Playback Commands
#[tauri::command]
pub fn play_track(state: State<AppState>, file_path: String) -> Result<(), String> {
    let mut engine = state.audio_engine.lock();
    engine.play(&file_path).map_err(|e| e.to_string())?;

    // Record play in database
    let db = state.database.lock();
    if let Ok(Some(track)) = db.get_track_by_path(&file_path) {
        db.record_play(track.id).ok();
    }

    Ok(())
}

#[tauri::command]
pub fn pause(state: State<AppState>) -> Result<(), String> {
    let mut engine = state.audio_engine.lock();
    engine.pause();
    Ok(())
}

#[tauri::command]
pub fn resume(state: State<AppState>) -> Result<(), String> {
    let mut engine = state.audio_engine.lock();
    engine.resume();
    Ok(())
}

#[tauri::command]
pub fn stop(state: State<AppState>) -> Result<(), String> {
    let mut engine = state.audio_engine.lock();
    engine.stop();
    Ok(())
}

#[tauri::command]
pub fn seek(state: State<AppState>, position: f64) -> Result<(), String> {
    let mut engine = state.audio_engine.lock();
    engine.seek(position);
    Ok(())
}

#[tauri::command]
pub fn set_volume(state: State<AppState>, volume: f32) -> Result<(), String> {
    let mut engine = state.audio_engine.lock();
    engine.set_volume(volume);
    Ok(())
}

#[tauri::command]
pub fn get_playback_state(state: State<AppState>) -> Result<PlaybackStateResponse, String> {
    let engine = state.audio_engine.lock();
    let playback_state = engine.get_state();

    let current_track = if let Some(path) = &playback_state.current_track {
        let db = state.database.lock();
        db.get_track_by_path(path).ok().flatten()
    } else {
        None
    };

    Ok(PlaybackStateResponse {
        is_playing: playback_state.is_playing,
        current_track,
        position: playback_state.position,
        duration: playback_state.duration,
        volume: playback_state.volume,
        sample_rate: playback_state.sample_rate,
        bit_depth: playback_state.bit_depth,
        channels: playback_state.channels,
        shuffle: playback_state.shuffle,
        repeat_mode: match playback_state.repeat_mode {
            RepeatMode::Off => "off".to_string(),
            RepeatMode::One => "one".to_string(),
            RepeatMode::All => "all".to_string(),
        },
    })
}

#[tauri::command]
pub fn next_track(state: State<AppState>) -> Result<(), String> {
    // This would be handled by the frontend queue management
    // For now, just stop playback
    let mut engine = state.audio_engine.lock();
    engine.stop();
    Ok(())
}

#[tauri::command]
pub fn previous_track(state: State<AppState>) -> Result<(), String> {
    // This would be handled by the frontend queue management
    let mut engine = state.audio_engine.lock();
    engine.seek(0.0);
    Ok(())
}

#[tauri::command]
pub fn set_shuffle(state: State<AppState>, enabled: bool) -> Result<(), String> {
    let mut engine = state.audio_engine.lock();
    engine.set_shuffle(enabled);
    Ok(())
}

#[tauri::command]
pub fn set_repeat_mode(state: State<AppState>, mode: String) -> Result<(), String> {
    let mut engine = state.audio_engine.lock();
    let repeat_mode = match mode.as_str() {
        "one" => RepeatMode::One,
        "all" => RepeatMode::All,
        _ => RepeatMode::Off,
    };
    engine.set_repeat_mode(repeat_mode);
    Ok(())
}

#[tauri::command]
pub fn get_audio_devices(state: State<AppState>) -> Result<Vec<String>, String> {
    let engine = state.audio_engine.lock();
    Ok(engine.get_devices())
}

#[tauri::command]
pub fn set_audio_device(state: State<AppState>, device_name: String) -> Result<(), String> {
    let mut engine = state.audio_engine.lock();
    engine.set_device(&device_name).map_err(|e| e.to_string())
}

// Artwork
#[tauri::command]
pub fn get_track_artwork(
    state: State<AppState>,
    file_path: String,
) -> Result<Option<String>, String> {
    let scanner = state.library_scanner.lock();
    let path = Path::new(&file_path);

    if let Some(artwork_data) = scanner.extract_artwork(path) {
        let base64 = BASE64.encode(&artwork_data);
        // Detect image type from magic bytes
        let mime_type = if artwork_data.starts_with(&[0xFF, 0xD8, 0xFF]) {
            "image/jpeg"
        } else if artwork_data.starts_with(&[0x89, 0x50, 0x4E, 0x47]) {
            "image/png"
        } else {
            "image/jpeg"
        };
        Ok(Some(format!("data:{};base64,{}", mime_type, base64)))
    } else {
        Ok(None)
    }
}

// Search
#[tauri::command]
pub fn search(state: State<AppState>, query: String) -> Result<SearchResults, String> {
    let db = state.database.lock();

    let tracks = db.search(&query).map_err(|e| e.to_string())?;

    // Get unique albums and artists from search results
    let mut seen_albums = std::collections::HashSet::new();
    let mut seen_artists = std::collections::HashSet::new();
    let mut albums = Vec::new();
    let mut artists = Vec::new();

    for track in &tracks {
        let album_key = format!("{}-{}", track.album, track.artist);
        if !seen_albums.contains(&album_key) {
            seen_albums.insert(album_key);
            albums.push(Album {
                id: 0,
                name: track.album.clone(),
                artist: track.artist.clone(),
                year: track.year,
                track_count: 0,
                total_duration: 0.0,
                artwork_path: None,
            });
        }

        if !seen_artists.contains(&track.artist) {
            seen_artists.insert(track.artist.clone());
            artists.push(Artist {
                id: 0,
                name: track.artist.clone(),
                album_count: 0,
                track_count: 0,
            });
        }
    }

    Ok(SearchResults {
        tracks,
        albums,
        artists,
    })
}

// Statistics
#[tauri::command]
pub fn get_statistics(state: State<AppState>) -> Result<Statistics, String> {
    let db = state.database.lock();
    db.get_statistics().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_recently_played(state: State<AppState>, limit: i32) -> Result<Vec<Track>, String> {
    let db = state.database.lock();
    db.get_recently_played(limit).map_err(|e| e.to_string())
}

// Favorites
#[tauri::command]
pub fn add_to_favorites(state: State<AppState>, track_id: i64) -> Result<(), String> {
    let db = state.database.lock();
    db.set_favorite(track_id, true).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn remove_from_favorites(state: State<AppState>, track_id: i64) -> Result<(), String> {
    let db = state.database.lock();
    db.set_favorite(track_id, false).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_favorites(state: State<AppState>) -> Result<Vec<Track>, String> {
    let db = state.database.lock();
    db.get_favorites().map_err(|e| e.to_string())
}

// Smart Playlists
#[tauri::command]
pub fn get_smart_playlists(state: State<AppState>) -> Result<Vec<SmartPlaylist>, String> {
    let db = state.database.lock();
    let stats = db.get_statistics().map_err(|e| e.to_string())?;
    let favorites = db.get_favorites().map_err(|e| e.to_string())?;

    Ok(vec![
        SmartPlaylist {
            id: "favorites".to_string(),
            name: "Favorites".to_string(),
            icon: "heart".to_string(),
            track_count: favorites.len() as i64,
        },
        SmartPlaylist {
            id: "recently-added".to_string(),
            name: "Recently Added".to_string(),
            icon: "sparkles".to_string(),
            track_count: stats.total_tracks.min(50),
        },
        SmartPlaylist {
            id: "hires".to_string(),
            name: "Hi-Res Only".to_string(),
            icon: "audio".to_string(),
            track_count: stats.hires_tracks,
        },
    ])
}

// Lyrics
#[tauri::command]
pub fn get_lyrics(state: State<AppState>, file_path: String) -> Result<Option<String>, String> {
    // First check database
    let db = state.database.lock();
    if let Ok(Some(track)) = db.get_track_by_path(&file_path) {
        if let Ok(Some((content, _))) = db.get_lyrics(track.id) {
            return Ok(Some(content));
        }
    }
    drop(db);

    // Then check for .lrc file
    let scanner = state.library_scanner.lock();
    let path = Path::new(&file_path);

    if let Some(lrc_path) = scanner.find_lrc_file(path) {
        if let Ok(content) = std::fs::read_to_string(lrc_path) {
            return Ok(Some(content));
        }
    }

    Ok(None)
}

// ==================== STREAMING COMMANDS ====================
// On-demand hi-res playback via Spotify -> Tidal/Qobuz/Amazon

#[derive(Deserialize)]
pub struct StreamingPreferences {
    pub prefer_hires: bool,
    pub service_order: Vec<String>,
}

/// Search Spotify for tracks and albums
#[tauri::command]
pub async fn search_spotify(
    _state: State<'_, AppState>,
    query: String,
    limit: Option<u32>,
) -> Result<SpotifySearchResult, String> {
    // Create a new streaming service instance for this request to avoid holding mutex across await
    let streaming = StreamingService::new();
    streaming.search_spotify(&query, limit.unwrap_or(20)).await
}

/// Get Spotify track metadata by ID
#[tauri::command]
pub async fn get_spotify_track(
    _state: State<'_, AppState>,
    track_id: String,
) -> Result<SpotifyTrack, String> {
    let streaming = StreamingService::new();
    streaming.get_spotify_track(&track_id).await
}

/// Get Spotify album with all tracks
#[tauri::command]
pub async fn get_spotify_album(
    _state: State<'_, AppState>,
    album_id: String,
) -> Result<SpotifyAlbum, String> {
    let streaming = StreamingService::new();
    streaming.get_spotify_album(&album_id).await
}

/// Get streaming URLs from song.link for a Spotify track
#[tauri::command]
pub async fn get_streaming_urls(
    _state: State<'_, AppState>,
    spotify_track_id: String,
    region: Option<String>,
) -> Result<StreamingURLs, String> {
    let streaming = StreamingService::new();
    streaming
        .get_streaming_urls(&spotify_track_id, region.as_deref())
        .await
}

/// Get the best available stream URL for a track
#[tauri::command]
pub async fn get_best_stream(
    _state: State<'_, AppState>,
    spotify_track_id: String,
    isrc: Option<String>,
    region: Option<String>,
) -> Result<StreamInfo, String> {
    let streaming = StreamingService::new();
    streaming
        .get_best_stream(&spotify_track_id, isrc.as_deref(), region.as_deref())
        .await
}

/// Play a Spotify track by streaming from best available source
#[tauri::command]
pub async fn play_spotify_track(
    _state: State<'_, AppState>,
    spotify_track_id: String,
    isrc: Option<String>,
    region: Option<String>,
) -> Result<StreamInfo, String> {
    // Get the best stream URL
    let streaming = StreamingService::new();
    let stream_info = streaming
        .get_best_stream(&spotify_track_id, isrc.as_deref(), region.as_deref())
        .await?;

    // TODO: Pass stream URL to audio engine for playback
    // For now, return the stream info - frontend can handle download/playback
    Ok(stream_info)
}

/// Set streaming preferences (hi-res preference, service order)
#[tauri::command]
pub fn set_streaming_preferences(
    state: State<AppState>,
    preferences: StreamingPreferences,
) -> Result<(), String> {
    let mut streaming = state.streaming_service.lock();

    streaming.set_prefer_hires(preferences.prefer_hires);

    let order: Vec<StreamSource> = preferences
        .service_order
        .iter()
        .filter_map(|s| match s.to_lowercase().as_str() {
            "tidal" => Some(StreamSource::Tidal),
            "qobuz" => Some(StreamSource::Qobuz),
            "amazon" => Some(StreamSource::Amazon),
            "deezer" => Some(StreamSource::Deezer),
            _ => None,
        })
        .collect();

    if !order.is_empty() {
        streaming.set_service_order(order);
    }

    Ok(())
}
