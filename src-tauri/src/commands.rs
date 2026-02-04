//! Tauri Commands Module
//! Exposes backend functionality to the frontend

use crate::audio::RepeatMode;
use crate::database::{Album, Artist, LibraryFolder, Statistics, Track};
use crate::stream_cache::{DownloadResult, NextChunkResult, ProgressiveStreamResult, STREAM_CACHE};
use crate::streaming::{
    SpotifyAlbum, SpotifyCredentials, SpotifySearchResult, SpotifyTrack, StreamInfo, StreamSource,
    StreamingService, StreamingURLs,
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
    pub track_finished: bool, // True when current track has finished playing
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
        track_finished: playback_state.track_finished,
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

/// Set Spotify API credentials
#[tauri::command]
pub fn set_spotify_credentials(
    _state: State<AppState>,
    client_id: String,
    client_secret: String,
) -> Result<(), String> {
    if client_id.trim().is_empty() || client_secret.trim().is_empty() {
        return Err("Client ID and Client Secret are required".to_string());
    }

    SpotifyCredentials::set_global(Some(SpotifyCredentials {
        client_id: client_id.trim().to_string(),
        client_secret: client_secret.trim().to_string(),
    }));

    Ok(())
}

/// Get current Spotify API credentials (for checking if configured)
#[tauri::command]
pub fn get_spotify_credentials(
    _state: State<AppState>,
) -> Result<Option<SpotifyCredentials>, String> {
    Ok(SpotifyCredentials::get_global())
}

/// Clear Spotify API credentials
#[tauri::command]
pub fn clear_spotify_credentials(_state: State<AppState>) -> Result<(), String> {
    SpotifyCredentials::set_global(None);
    Ok(())
}

/// Check if Spotify credentials are configured
#[tauri::command]
pub fn has_spotify_credentials(_state: State<AppState>) -> bool {
    SpotifyCredentials::has_credentials()
}

// ============ Stream Cache Commands ============

/// Check if a track is cached
#[tauri::command]
pub fn is_track_cached(track_id: String) -> Option<String> {
    STREAM_CACHE
        .is_cached(&track_id)
        .map(|p| p.to_string_lossy().to_string())
}

/// Get cache directory path
#[tauri::command]
pub fn get_cache_dir() -> String {
    STREAM_CACHE.cache_dir().to_string_lossy().to_string()
}

/// Get cache size in bytes
#[tauri::command]
pub fn get_cache_size() -> u64 {
    STREAM_CACHE.cache_size()
}

/// Clear all cached tracks
#[tauri::command]
pub fn clear_stream_cache() -> Result<usize, String> {
    STREAM_CACHE.clear_cache()
}

/// Download a track from Tidal (handles both BTS and DASH formats)
#[tauri::command]
pub async fn download_tidal_track(
    _state: State<'_, AppState>,
    track_id: String,
    spotify_track_id: String,
) -> Result<DownloadResult, String> {
    // Check if already cached
    if let Some(path) = STREAM_CACHE.is_cached(&spotify_track_id) {
        return Ok(DownloadResult {
            success: true,
            file_path: Some(path.to_string_lossy().to_string()),
            error: None,
            source: "Cache".to_string(),
            format: "FLAC".to_string(),
            sample_rate: None,
            bit_depth: None,
        });
    }

    // We need to get the manifest directly from the API
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let quality_param = "HI_RES_LOSSLESS";
    let apis = vec![
        "https://triton.squid.wtf",
        "https://hifi-one.spotisaver.net",
        "https://hifi-two.spotisaver.net",
        "https://tidal.kinoplus.online",
        "https://tidal-api.binimum.org",
    ];

    for api_base in apis {
        let api_url = format!(
            "{}/track/?id={}&quality={}",
            api_base, track_id, quality_param
        );
        println!("[Download] Trying API: {}", api_url);

        match client.get(&api_url).send().await {
            Ok(response) if response.status().is_success() => {
                let data: serde_json::Value = match response.json().await {
                    Ok(d) => d,
                    Err(_) => continue,
                };

                // Extract manifest from V2 response format
                if let Some(manifest) = data
                    .get("data")
                    .and_then(|d| d.get("manifest"))
                    .and_then(|m| m.as_str())
                {
                    let sample_rate = data
                        .get("data")
                        .and_then(|d| d.get("sampleRate"))
                        .and_then(|s| s.as_u64())
                        .map(|s| s as u32);
                    let bit_depth = data
                        .get("data")
                        .and_then(|d| d.get("bitDepth"))
                        .and_then(|b| b.as_u64())
                        .map(|b| b as u32);

                    return STREAM_CACHE
                        .download_tidal_dash(&spotify_track_id, manifest, sample_rate, bit_depth)
                        .await;
                }

                // Try legacy manifest format
                if let Some(manifest) = data.get("manifest").and_then(|m| m.as_str()) {
                    return STREAM_CACHE
                        .download_tidal_dash(&spotify_track_id, manifest, None, None)
                        .await;
                }

                // Try direct URL
                if let Some(url) = data.get("url").and_then(|u| u.as_str()) {
                    let sample_rate = data
                        .get("sampleRate")
                        .and_then(|s| s.as_u64())
                        .map(|s| s as u32);
                    let bit_depth = data
                        .get("bitDepth")
                        .and_then(|b| b.as_u64())
                        .map(|b| b as u32);

                    return STREAM_CACHE
                        .download_direct_url(
                            &spotify_track_id,
                            url,
                            sample_rate,
                            bit_depth,
                            "Tidal",
                        )
                        .await;
                }

                // Try V1 array format
                if let Some(arr) = data.as_array() {
                    for item in arr {
                        if let Some(url) = item.get("OriginalTrackUrl").and_then(|u| u.as_str()) {
                            return STREAM_CACHE
                                .download_direct_url(&spotify_track_id, url, None, None, "Tidal")
                                .await;
                        }
                    }
                }
            }
            _ => continue,
        }
    }

    Err("Failed to get Tidal stream from all APIs".to_string())
}

/// Download a track from Qobuz
#[tauri::command]
pub async fn download_qobuz_track(
    _state: State<'_, AppState>,
    isrc: String,
    spotify_track_id: String,
) -> Result<DownloadResult, String> {
    // Check if already cached
    if let Some(path) = STREAM_CACHE.is_cached(&spotify_track_id) {
        return Ok(DownloadResult {
            success: true,
            file_path: Some(path.to_string_lossy().to_string()),
            error: None,
            source: "Cache".to_string(),
            format: "FLAC".to_string(),
            sample_rate: None,
            bit_depth: None,
        });
    }

    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    // Search for track by ISRC
    let search_url = format!(
        "https://www.qobuz.com/api.json/0.2/track/search?query={}&limit=1&app_id=798273057",
        urlencoding::encode(&isrc)
    );
    println!("[Download Qobuz] Searching with ISRC: {}", isrc);

    let search_response = client
        .get(&search_url)
        .send()
        .await
        .map_err(|e| format!("Qobuz search failed: {}", e))?;

    let search_data: serde_json::Value = search_response
        .json()
        .await
        .map_err(|e| format!("Failed to parse Qobuz search: {}", e))?;

    let track_id = search_data
        .get("tracks")
        .and_then(|t| t.get("items"))
        .and_then(|i| i.as_array())
        .and_then(|a| a.first())
        .and_then(|t| t.get("id"))
        .and_then(|id| id.as_i64())
        .ok_or_else(|| "Track not found on Qobuz".to_string())?;

    println!("[Download Qobuz] Found track ID: {}", track_id);

    // Try to get stream URL
    let quality_code = "7"; // Hi-Res
    let apis = vec![
        format!(
            "https://jumo-dl.pages.dev/file?track_id={}&format_id={}&region=US",
            track_id, quality_code
        ),
        format!(
            "https://dab.yeet.su/api/stream?trackId={}&quality={}",
            track_id, quality_code
        ),
        format!(
            "https://dabmusic.xyz/api/stream?trackId={}&quality={}",
            track_id, quality_code
        ),
    ];

    for api_url in &apis {
        println!("[Download Qobuz] Trying API: {}", api_url);

        match client.get(api_url).send().await {
            Ok(response) if response.status().is_success() => {
                let text = match response.text().await {
                    Ok(t) => t,
                    Err(_) => continue,
                };

                let data: serde_json::Value = match serde_json::from_str(&text) {
                    Ok(d) => d,
                    Err(_) => continue,
                };

                // Try various URL formats
                let url = data
                    .get("url")
                    .and_then(|u| u.as_str())
                    .or_else(|| {
                        data.get("data")
                            .and_then(|d| d.get("url"))
                            .and_then(|u| u.as_str())
                    })
                    .or_else(|| data.get("link").and_then(|l| l.as_str()));

                if let Some(url) = url {
                    if !url.is_empty() {
                        return STREAM_CACHE
                            .download_direct_url(&spotify_track_id, url, None, None, "Qobuz")
                            .await;
                    }
                }
            }
            _ => continue,
        }
    }

    Err("Failed to get Qobuz stream from all APIs".to_string())
}

/// Download a track from Amazon Music
#[tauri::command]
pub async fn download_amazon_track(
    amazon_url: String,
    spotify_track_id: String,
) -> Result<DownloadResult, String> {
    // Check if already cached
    if let Some(path) = STREAM_CACHE.is_cached(&spotify_track_id) {
        return Ok(DownloadResult {
            success: true,
            file_path: Some(path.to_string_lossy().to_string()),
            error: None,
            source: "Cache".to_string(),
            format: "FLAC".to_string(),
            sample_rate: None,
            bit_depth: None,
        });
    }

    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let api_url = format!(
        "https://amazon.afkarxyz.fun/convert?url={}",
        urlencoding::encode(&amazon_url)
    );
    println!("[Download Amazon] API URL: {}", api_url);

    let response = client
        .get(&api_url)
        .send()
        .await
        .map_err(|e| format!("Amazon API request failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Amazon API returned status: {}", response.status()));
    }

    let data: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse Amazon response: {}", e))?;

    let success = data
        .get("success")
        .and_then(|s| s.as_bool())
        .unwrap_or(false);
    if !success {
        return Err("Amazon API returned success=false".to_string());
    }

    let direct_link = data
        .get("data")
        .and_then(|d| d.get("direct_link"))
        .and_then(|l| l.as_str())
        .ok_or_else(|| "No direct_link in Amazon response".to_string())?;

    STREAM_CACHE
        .download_direct_url(&spotify_track_id, direct_link, None, None, "Amazon")
        .await
}

/// Play a cached track
#[tauri::command]
pub async fn play_cached_track(
    state: State<'_, AppState>,
    spotify_track_id: String,
) -> Result<(), String> {
    let cached_path = STREAM_CACHE
        .is_cached(&spotify_track_id)
        .ok_or_else(|| "Track not cached".to_string())?;

    let path_str = cached_path.to_string_lossy();
    let mut audio_engine = state.audio_engine.lock();
    audio_engine
        .play(&path_str)
        .map_err(|e| format!("Failed to play cached track: {}", e))
}

/// Track metadata for download with proper file naming
#[derive(Debug, Clone, Deserialize)]
pub struct TrackMetadata {
    pub name: String,
    pub artist: String,
    pub album: String,
    pub duration_ms: Option<u64>,
}

/// Download and play a track - the main streaming entry point
/// This handles: checking cache, downloading from Tidal/Qobuz/Amazon, converting DASH, and playing
#[tauri::command]
pub async fn download_and_play_track(
    state: State<'_, AppState>,
    spotify_track_id: String,
    tidal_url: Option<String>,
    amazon_url: Option<String>,
    isrc: Option<String>,
    metadata: Option<TrackMetadata>,
) -> Result<DownloadResult, String> {
    // 1. Check if already cached/downloaded
    if let Some(cached_path) = STREAM_CACHE.is_cached(&spotify_track_id) {
        println!("[Download] Track already cached: {:?}", cached_path);

        // Play the cached file
        let path_str = cached_path.to_string_lossy().to_string();
        {
            let mut audio_engine = state.audio_engine.lock();
            audio_engine
                .play(&path_str)
                .map_err(|e| format!("Failed to play cached track: {}", e))?;
        }

        return Ok(DownloadResult {
            success: true,
            file_path: Some(path_str),
            error: None,
            source: "Cache".to_string(),
            format: "FLAC".to_string(),
            sample_rate: None,
            bit_depth: None,
        });
    }

    // Check if FFmpeg is available (required for DASH conversion)
    if !crate::ffmpeg::is_ffmpeg_installed() {
        return Err(
            "FFmpeg is required for streaming. Please install it from Settings.".to_string(),
        );
    }

    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let meta = metadata.as_ref();
    let track_name = meta.map(|m| m.name.as_str());
    let artist_name = meta.map(|m| m.artist.as_str());
    let album_name = meta.map(|m| m.album.as_str());
    let duration_ms = meta.and_then(|m| m.duration_ms);

    // 2. Try Tidal first (best quality - HI_RES_LOSSLESS)
    if let Some(ref tidal_url) = tidal_url {
        println!("[Download] Trying Tidal...");

        // Extract track ID from Tidal URL
        let tidal_track_id = extract_tidal_track_id(tidal_url)?;

        let quality_param = "HI_RES_LOSSLESS";
        let apis = vec![
            "https://triton.squid.wtf",
            "https://hifi-one.spotisaver.net",
            "https://hifi-two.spotisaver.net",
            "https://tidal.kinoplus.online",
            "https://tidal-api.binimum.org",
        ];

        for api_base in &apis {
            let api_url = format!(
                "{}/track/?id={}&quality={}",
                api_base, tidal_track_id, quality_param
            );
            println!("[Download Tidal] Trying API: {}", api_url);

            match client.get(&api_url).send().await {
                Ok(response) if response.status().is_success() => {
                    let data: serde_json::Value = match response.json().await {
                        Ok(d) => d,
                        Err(_) => continue,
                    };

                    // Extract manifest from V2 response format
                    if let Some(manifest) = data
                        .get("data")
                        .and_then(|d| d.get("manifest"))
                        .and_then(|m| m.as_str())
                    {
                        let sample_rate = data
                            .get("data")
                            .and_then(|d| d.get("sampleRate"))
                            .and_then(|s| s.as_u64())
                            .map(|s| s as u32);
                        let bit_depth = data
                            .get("data")
                            .and_then(|d| d.get("bitDepth"))
                            .and_then(|b| b.as_u64())
                            .map(|b| b as u32);

                        println!("[Download Tidal] Got manifest, downloading DASH segments...");

                        // Download the track with duration validation (handles both BTS and DASH)
                        match STREAM_CACHE
                            .download_tidal_dash_with_duration(
                                &spotify_track_id,
                                manifest,
                                sample_rate,
                                bit_depth,
                                track_name,
                                artist_name,
                                album_name,
                                duration_ms,
                            )
                            .await
                        {
                            Ok(result) => {
                                // Play the downloaded file
                                if let Some(ref path) = result.file_path {
                                    let mut audio_engine = state.audio_engine.lock();
                                    audio_engine
                                        .play(path)
                                        .map_err(|e| format!("Failed to play: {}", e))?;
                                }
                                return Ok(result);
                            }
                            Err(e) => {
                                println!("[Download Tidal] Download failed: {}", e);
                                continue;
                            }
                        }
                    }

                    // Try legacy manifest format
                    if let Some(manifest) = data.get("manifest").and_then(|m| m.as_str()) {
                        match STREAM_CACHE
                            .download_tidal_dash_with_duration(
                                &spotify_track_id,
                                manifest,
                                None,
                                None,
                                track_name,
                                artist_name,
                                album_name,
                                duration_ms,
                            )
                            .await
                        {
                            Ok(result) => {
                                if let Some(ref path) = result.file_path {
                                    let mut audio_engine = state.audio_engine.lock();
                                    audio_engine
                                        .play(path)
                                        .map_err(|e| format!("Failed to play: {}", e))?;
                                }
                                return Ok(result);
                            }
                            Err(e) => {
                                println!("[Download Tidal] Download failed: {}", e);
                                continue;
                            }
                        }
                    }

                    // Try direct URL
                    if let Some(url) = data.get("url").and_then(|u| u.as_str()) {
                        let sample_rate = data
                            .get("sampleRate")
                            .and_then(|s| s.as_u64())
                            .map(|s| s as u32);
                        let bit_depth = data
                            .get("bitDepth")
                            .and_then(|b| b.as_u64())
                            .map(|b| b as u32);

                        match STREAM_CACHE
                            .download_direct_url_with_metadata(
                                &spotify_track_id,
                                url,
                                sample_rate,
                                bit_depth,
                                "Tidal",
                                track_name,
                                artist_name,
                                album_name,
                            )
                            .await
                        {
                            Ok(result) => {
                                if let Some(ref path) = result.file_path {
                                    let mut audio_engine = state.audio_engine.lock();
                                    audio_engine
                                        .play(path)
                                        .map_err(|e| format!("Failed to play: {}", e))?;
                                }
                                return Ok(result);
                            }
                            Err(e) => {
                                println!("[Download Tidal] Download failed: {}", e);
                                continue;
                            }
                        }
                    }

                    // Try V1 array format
                    if let Some(arr) = data.as_array() {
                        for item in arr {
                            if let Some(url) = item.get("OriginalTrackUrl").and_then(|u| u.as_str())
                            {
                                match STREAM_CACHE
                                    .download_direct_url_with_metadata(
                                        &spotify_track_id,
                                        url,
                                        None,
                                        None,
                                        "Tidal",
                                        track_name,
                                        artist_name,
                                        album_name,
                                    )
                                    .await
                                {
                                    Ok(result) => {
                                        if let Some(ref path) = result.file_path {
                                            let mut audio_engine = state.audio_engine.lock();
                                            audio_engine
                                                .play(path)
                                                .map_err(|e| format!("Failed to play: {}", e))?;
                                        }
                                        return Ok(result);
                                    }
                                    Err(_) => continue,
                                }
                            }
                        }
                    }
                }
                _ => continue,
            }
        }
        println!("[Download] Tidal failed, trying next service...");
    }

    // 3. Try Qobuz if ISRC available
    if let Some(ref isrc_code) = isrc {
        println!("[Download] Trying Qobuz with ISRC: {}", isrc_code);

        // Search for track by ISRC
        let search_url = format!(
            "https://www.qobuz.com/api.json/0.2/track/search?query={}&limit=1&app_id=798273057",
            urlencoding::encode(isrc_code)
        );

        if let Ok(search_response) = client.get(&search_url).send().await {
            if let Ok(search_data) = search_response.json::<serde_json::Value>().await {
                if let Some(track_id) = search_data
                    .get("tracks")
                    .and_then(|t| t.get("items"))
                    .and_then(|i| i.as_array())
                    .and_then(|a| a.first())
                    .and_then(|t| t.get("id"))
                    .and_then(|id| id.as_i64())
                {
                    println!("[Download Qobuz] Found track ID: {}", track_id);

                    let quality_code = "7"; // Hi-Res
                    let qobuz_apis = vec![
                        format!(
                            "https://jumo-dl.pages.dev/file?track_id={}&format_id={}&region=US",
                            track_id, quality_code
                        ),
                        format!(
                            "https://dab.yeet.su/api/stream?trackId={}&quality={}",
                            track_id, quality_code
                        ),
                    ];

                    for api_url in &qobuz_apis {
                        println!("[Download Qobuz] Trying API: {}", api_url);

                        if let Ok(response) = client.get(api_url).send().await {
                            if response.status().is_success() {
                                if let Ok(text) = response.text().await {
                                    if let Ok(data) =
                                        serde_json::from_str::<serde_json::Value>(&text)
                                    {
                                        // Try various URL formats
                                        let url = data
                                            .get("url")
                                            .and_then(|u| u.as_str())
                                            .or_else(|| {
                                                data.get("data")
                                                    .and_then(|d| d.get("url"))
                                                    .and_then(|u| u.as_str())
                                            })
                                            .or_else(|| data.get("link").and_then(|l| l.as_str()));

                                        if let Some(url) = url {
                                            if !url.is_empty() {
                                                match STREAM_CACHE
                                                    .download_direct_url_with_metadata(
                                                        &spotify_track_id,
                                                        url,
                                                        None,
                                                        None,
                                                        "Qobuz",
                                                        track_name,
                                                        artist_name,
                                                        album_name,
                                                    )
                                                    .await
                                                {
                                                    Ok(result) => {
                                                        if let Some(ref path) = result.file_path {
                                                            let mut audio_engine =
                                                                state.audio_engine.lock();
                                                            audio_engine.play(path).map_err(
                                                                |e| {
                                                                    format!("Failed to play: {}", e)
                                                                },
                                                            )?;
                                                        }
                                                        return Ok(result);
                                                    }
                                                    Err(e) => {
                                                        println!(
                                                            "[Download Qobuz] Download failed: {}",
                                                            e
                                                        );
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        println!("[Download] Qobuz failed, trying next service...");
    }

    // 4. Try Amazon Music
    if let Some(ref amazon_url) = amazon_url {
        println!("[Download] Trying Amazon Music...");

        let api_url = format!(
            "https://amazon.afkarxyz.fun/convert?url={}",
            urlencoding::encode(amazon_url)
        );

        if let Ok(response) = client.get(&api_url).send().await {
            if response.status().is_success() {
                if let Ok(data) = response.json::<serde_json::Value>().await {
                    let success = data
                        .get("success")
                        .and_then(|s| s.as_bool())
                        .unwrap_or(false);

                    if success {
                        if let Some(direct_link) = data
                            .get("data")
                            .and_then(|d| d.get("direct_link"))
                            .and_then(|l| l.as_str())
                        {
                            match STREAM_CACHE
                                .download_direct_url_with_metadata(
                                    &spotify_track_id,
                                    direct_link,
                                    None,
                                    None,
                                    "Amazon",
                                    track_name,
                                    artist_name,
                                    album_name,
                                )
                                .await
                            {
                                Ok(result) => {
                                    if let Some(ref path) = result.file_path {
                                        let mut audio_engine = state.audio_engine.lock();
                                        audio_engine
                                            .play(path)
                                            .map_err(|e| format!("Failed to play: {}", e))?;
                                    }
                                    return Ok(result);
                                }
                                Err(e) => {
                                    println!("[Download Amazon] Download failed: {}", e);
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    Err(
        "Failed to download track from any available service. All APIs failed or returned no data."
            .to_string(),
    )
}

/// Helper to extract Tidal track ID from URL
fn extract_tidal_track_id(url: &str) -> Result<i64, String> {
    let parts: Vec<&str> = url.split('/').collect();
    for (i, part) in parts.iter().enumerate() {
        if *part == "track" && i + 1 < parts.len() {
            return parts[i + 1]
                .split('?')
                .next()
                .and_then(|id| id.parse().ok())
                .ok_or_else(|| "Invalid Tidal track ID".to_string());
        }
    }
    Err("Could not extract Tidal track ID from URL".to_string())
}

/// Get music library download directory
#[tauri::command]
pub fn get_music_download_dir() -> String {
    STREAM_CACHE.music_dir().to_string_lossy().to_string()
}

// ============ FFmpeg Commands ============

use crate::ffmpeg::{FFmpegStatus, FFMPEG_MANAGER};

/// Check FFmpeg installation status
#[tauri::command]
pub fn get_ffmpeg_status() -> FFmpegStatus {
    FFMPEG_MANAGER.check_status()
}

/// Download and install FFmpeg
#[tauri::command]
pub async fn download_ffmpeg(window: tauri::Window) -> Result<String, String> {
    FFMPEG_MANAGER
        .download_ffmpeg(|progress| {
            // Emit progress events to the frontend
            window.emit("ffmpeg-download-progress", &progress).ok();
        })
        .await
}

/// Uninstall bundled FFmpeg
#[tauri::command]
pub fn uninstall_ffmpeg() -> Result<(), String> {
    FFMPEG_MANAGER.uninstall()
}

/// Check if FFmpeg is available
#[tauri::command]
pub fn is_ffmpeg_available() -> bool {
    crate::ffmpeg::is_ffmpeg_installed()
}

// ============ Progressive Streaming Commands ============

/// Start a progressive stream - downloads first chunk and returns immediately for playback
#[tauri::command]
pub async fn start_progressive_stream(
    state: State<'_, AppState>,
    spotify_track_id: String,
    tidal_url: Option<String>,
    metadata: Option<TrackMetadata>,
) -> Result<ProgressiveStreamResult, String> {
    // Check if already fully cached by track ID
    if let Some(cached_path) = STREAM_CACHE.is_cached(&spotify_track_id) {
        println!("[Progressive] Track already cached: {:?}", cached_path);

        // Play immediately
        let path_str = cached_path.to_string_lossy().to_string();
        {
            let mut audio_engine = state.audio_engine.lock();
            audio_engine
                .play(&path_str)
                .map_err(|e| format!("Failed to play cached track: {}", e))?;
        }

        return Ok(ProgressiveStreamResult {
            success: true,
            first_chunk_path: Some(path_str),
            total_chunks: 1,
            error: None,
            source: "Cache".to_string(),
            format: "FLAC".to_string(),
            sample_rate: None,
            bit_depth: None,
        });
    }

    // Check if already downloaded in music library with metadata-based filename (Artist/Album/Track.flac)
    if let Some(meta) = metadata.as_ref() {
        if let Some(music_path) =
            STREAM_CACHE.find_in_music_library_full(&meta.name, &meta.artist, &meta.album)
        {
            println!(
                "[Progressive] Track found in music library: {:?}",
                music_path
            );

            // Play immediately from music library
            let path_str = music_path.to_string_lossy().to_string();
            {
                let mut audio_engine = state.audio_engine.lock();
                audio_engine
                    .play(&path_str)
                    .map_err(|e| format!("Failed to play from library: {}", e))?;
            }

            return Ok(ProgressiveStreamResult {
                success: true,
                first_chunk_path: Some(path_str),
                total_chunks: 1,
                error: None,
                source: "Library".to_string(),
                format: "FLAC".to_string(),
                sample_rate: None,
                bit_depth: None,
            });
        }
    }

    // Check FFmpeg
    if !crate::ffmpeg::is_ffmpeg_installed() {
        return Err("FFmpeg is required for streaming".to_string());
    }

    let meta = metadata.as_ref();
    let track_name = meta.map(|m| m.name.as_str());
    let artist_name = meta.map(|m| m.artist.as_str());
    let album_name = meta.map(|m| m.album.as_str());
    let duration_ms = meta.and_then(|m| m.duration_ms);

    // Need Tidal URL for progressive streaming
    let tidal_url =
        tidal_url.ok_or_else(|| "Tidal URL required for progressive streaming".to_string())?;

    // Extract Tidal track ID
    let tidal_track_id = extract_tidal_track_id(&tidal_url)?;

    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let quality_param = "HI_RES_LOSSLESS";
    let apis = vec![
        "https://hifi-one.spotisaver.net", // Good API first
        "https://hifi-two.spotisaver.net",
        "https://tidal.kinoplus.online",
        "https://tidal-api.binimum.org",
        "https://triton.squid.wtf", // Preview API last
    ];

    for api_base in &apis {
        let api_url = format!(
            "{}/track/?id={}&quality={}",
            api_base, tidal_track_id, quality_param
        );
        println!("[Progressive] Trying API: {}", api_url);

        match client.get(&api_url).send().await {
            Ok(response) if response.status().is_success() => {
                let data: serde_json::Value = match response.json().await {
                    Ok(d) => d,
                    Err(_) => continue,
                };

                // Extract manifest
                let manifest = data
                    .get("data")
                    .and_then(|d| d.get("manifest"))
                    .and_then(|m| m.as_str())
                    .or_else(|| data.get("manifest").and_then(|m| m.as_str()));

                if let Some(manifest) = manifest {
                    let sample_rate = data
                        .get("data")
                        .and_then(|d| d.get("sampleRate"))
                        .and_then(|s| s.as_u64())
                        .map(|s| s as u32);
                    let bit_depth = data
                        .get("data")
                        .and_then(|d| d.get("bitDepth"))
                        .and_then(|b| b.as_u64())
                        .map(|b| b as u32);

                    // Start progressive stream
                    match STREAM_CACHE
                        .start_progressive_stream(
                            &spotify_track_id,
                            manifest,
                            sample_rate,
                            bit_depth,
                            track_name,
                            artist_name,
                            album_name,
                            duration_ms,
                        )
                        .await
                    {
                        Ok(result) => {
                            // Play first chunk
                            if let Some(ref path) = result.first_chunk_path {
                                let mut audio_engine = state.audio_engine.lock();
                                audio_engine
                                    .play(path)
                                    .map_err(|e| format!("Failed to play first chunk: {}", e))?;
                            }
                            return Ok(result);
                        }
                        Err(e) => {
                            println!("[Progressive] Failed: {}", e);
                            continue;
                        }
                    }
                }
            }
            _ => continue,
        }
    }

    Err("Failed to start progressive stream from any API".to_string())
}

/// Download the next chunk of a progressive stream
#[tauri::command]
pub async fn download_next_chunk(track_id: String) -> Result<NextChunkResult, String> {
    STREAM_CACHE.download_next_chunk(&track_id).await
}

/// Get the current chunk info
#[tauri::command]
pub fn get_current_chunk(track_id: String) -> Result<NextChunkResult, String> {
    STREAM_CACHE.get_current_chunk(&track_id)
}

/// Advance to the next chunk (when playback moves forward)
#[tauri::command]
pub fn advance_to_next_chunk(track_id: String) -> Result<(), String> {
    STREAM_CACHE.advance_chunk(&track_id)
}

/// Play a specific chunk file
#[tauri::command]
pub fn play_chunk(state: State<'_, AppState>, chunk_path: String) -> Result<(), String> {
    let mut audio_engine = state.audio_engine.lock();
    audio_engine
        .play(&chunk_path)
        .map_err(|e| format!("Failed to play chunk: {}", e))
}

/// Append a chunk to the current playback buffer (for gapless transitions)
#[tauri::command]
pub fn append_chunk(state: State<'_, AppState>, chunk_path: String) -> Result<(), String> {
    let mut audio_engine = state.audio_engine.lock();
    audio_engine
        .append_samples(&chunk_path)
        .map_err(|e| format!("Failed to append chunk: {}", e))
}

/// Finalize a progressive stream - join all chunks and save to music library
#[tauri::command]
pub async fn finalize_stream(track_id: String) -> Result<String, String> {
    STREAM_CACHE.finalize_stream(&track_id).await
}

/// Get stream progress (downloaded chunks / total chunks)
#[tauri::command]
pub fn get_stream_progress(track_id: String) -> Option<(usize, usize, bool)> {
    STREAM_CACHE.get_stream_progress(&track_id)
}

/// Clean up a progressive stream (cancel/abort)
#[tauri::command]
pub fn cleanup_stream(track_id: String) -> Result<(), String> {
    STREAM_CACHE.cleanup_stream(&track_id)
}

/// Download ALL remaining chunks for a track (background download)
#[tauri::command]
pub async fn download_all_chunks(track_id: String) -> Result<usize, String> {
    STREAM_CACHE.download_all_remaining_chunks(&track_id).await
}

/// Get a specific chunk by index
#[tauri::command]
pub fn get_chunk_by_index(track_id: String, chunk_index: usize) -> Result<Option<String>, String> {
    STREAM_CACHE.get_chunk_by_index(&track_id, chunk_index)
}

/// Get chunk duration in seconds
#[tauri::command]
pub fn get_chunk_duration(track_id: String) -> Result<f64, String> {
    STREAM_CACHE.get_chunk_duration_seconds(&track_id)
}

/// Get total number of chunks
#[tauri::command]
pub fn get_total_chunks(track_id: String) -> Result<usize, String> {
    STREAM_CACHE.get_total_chunks(&track_id)
}

/// Check if a specific chunk is ready
#[tauri::command]
pub fn is_chunk_ready(track_id: String, chunk_index: usize) -> bool {
    STREAM_CACHE.is_chunk_ready(&track_id, chunk_index)
}

/// Get the chunk index for a given position in seconds
#[tauri::command]
pub fn get_chunk_for_position(track_id: String, position_seconds: f64) -> Result<usize, String> {
    STREAM_CACHE.get_chunk_for_position(&track_id, position_seconds)
}

/// Reprioritize chunk downloads when user seeks to a new position
/// Returns the new download queue order
#[tauri::command]
pub fn seek_reprioritize(track_id: String, target_chunk: usize) -> Result<Vec<usize>, String> {
    STREAM_CACHE.reprioritize_for_seek(&track_id, target_chunk)
}

/// Download all chunks with multithreaded support (2 threads)
/// This replaces download_all_chunks with a faster multithreaded version
#[tauri::command]
pub async fn download_all_chunks_mt(track_id: String) -> Result<usize, String> {
    STREAM_CACHE
        .download_all_chunks_multithreaded(&track_id)
        .await
}

/// Clear entire music library (database + files)
#[tauri::command]
pub fn clear_music_library(state: State<'_, AppState>) -> Result<(usize, u64), String> {
    // Clear database
    let db = state.database.lock();
    let deleted_tracks = db.clear_all_tracks().map_err(|e| e.to_string())?;
    drop(db);

    // Clear downloaded music files
    let music_dir = STREAM_CACHE.get_music_dir();
    let mut deleted_bytes = 0u64;

    if music_dir.exists() {
        for entry in std::fs::read_dir(&music_dir).map_err(|e| e.to_string())? {
            if let Ok(entry) = entry {
                if let Ok(meta) = entry.metadata() {
                    deleted_bytes += meta.len();
                }
                std::fs::remove_file(entry.path()).ok();
            }
        }
    }

    Ok((deleted_tracks, deleted_bytes))
}

/// Get cache size info
#[tauri::command]
pub fn get_cache_info() -> Result<CacheInfo, String> {
    let cache_size = STREAM_CACHE.cache_size();
    let music_size = STREAM_CACHE.music_size();
    Ok(CacheInfo {
        cache_size,
        music_size,
    })
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct CacheInfo {
    pub cache_size: u64,
    pub music_size: u64,
}
