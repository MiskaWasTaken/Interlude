// Stream Cache Module
// Downloads tracks from streaming services, caches locally for playback
// Supports progressive streaming: downloads in chunks for immediate playback
// Now also saves to user's music library for permanent storage

use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use reqwest::Client;
use std::collections::HashMap;
use std::fs::{self, File};
use std::io::Write;
use std::path::PathBuf;
use std::process::Command;
use std::sync::{Arc, Mutex};

/// Result of a stream download operation
#[derive(Debug, Clone, serde::Serialize)]
pub struct DownloadResult {
    pub success: bool,
    pub file_path: Option<String>,
    pub error: Option<String>,
    pub source: String,
    pub format: String,
    pub sample_rate: Option<u32>,
    pub bit_depth: Option<u32>,
}

/// Represents a single chunk of a progressive stream
#[derive(Debug, Clone)]
pub struct StreamChunk {
    pub chunk_index: usize,
    pub file_path: PathBuf,
    pub segment_start: usize,
    pub segment_end: usize,
    pub duration_seconds: f32,
    pub is_ready: bool,
}

/// State of a progressive stream download
#[derive(Debug, Clone)]
pub struct ProgressiveStreamState {
    pub track_id: String,
    pub total_segments: usize,
    pub segments_per_chunk: usize, // ~8 segments = ~30 seconds (for regular chunks)
    pub first_chunk_segments: usize, // Smaller first chunk for faster start (~2 segments = ~8 seconds)
    pub chunks: Vec<StreamChunk>,
    pub init_segment: Option<Vec<u8>>,
    pub media_urls: Vec<String>,
    pub current_chunk: usize,
    pub is_complete: bool,
    pub sample_rate: Option<u32>,
    pub bit_depth: Option<u32>,
    pub track_name: Option<String>,
    pub artist_name: Option<String>,
    pub album_name: Option<String>,
    /// Priority chunk index - when user seeks, this is set to the target chunk
    pub priority_chunk: Option<usize>,
    /// Download order: chunks are downloaded in this order (reordered on seek)
    pub download_queue: Vec<usize>,
    /// Flag to signal download threads to reprioritize
    pub needs_reprioritize: bool,
}

impl ProgressiveStreamState {
    /// Calculate total number of chunks for this stream
    pub fn total_chunks(&self) -> usize {
        if self.total_segments <= self.first_chunk_segments {
            1
        } else {
            let remaining = self.total_segments - self.first_chunk_segments;
            1 + (remaining + self.segments_per_chunk - 1) / self.segments_per_chunk
        }
    }

    /// Get segment range for a specific chunk index
    pub fn get_chunk_segment_range(&self, chunk_index: usize) -> (usize, usize) {
        if chunk_index == 0 {
            (
                0,
                std::cmp::min(self.first_chunk_segments, self.total_segments),
            )
        } else {
            let offset = self.first_chunk_segments;
            let chunk_offset = (chunk_index - 1) * self.segments_per_chunk;
            let start = offset + chunk_offset;
            let end = std::cmp::min(start + self.segments_per_chunk, self.total_segments);
            (start, end)
        }
    }
}

/// Result of starting a progressive stream
#[derive(Debug, Clone, serde::Serialize)]
pub struct ProgressiveStreamResult {
    pub success: bool,
    pub first_chunk_path: Option<String>,
    pub total_chunks: usize,
    pub error: Option<String>,
    pub source: String,
    pub format: String,
    pub sample_rate: Option<u32>,
    pub bit_depth: Option<u32>,
}

/// Result of getting the next chunk
#[derive(Debug, Clone, serde::Serialize)]
pub struct NextChunkResult {
    pub chunk_path: Option<String>,
    pub chunk_index: usize,
    pub is_last: bool,
    pub is_ready: bool,
}

/// Stream cache manager for downloading and caching streaming tracks
pub struct StreamCache {
    cache_dir: PathBuf,
    music_dir: PathBuf,
    client: Client,
    /// Active progressive streams (track_id -> state)
    progressive_streams: Arc<Mutex<HashMap<String, ProgressiveStreamState>>>,
}

impl StreamCache {
    pub fn new() -> Self {
        // Use app data directory for cache (temporary)
        let cache_dir = dirs::data_local_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("HiFlac")
            .join("stream_cache");

        // Use user's music directory for permanent storage
        let music_dir = dirs::audio_dir()
            .unwrap_or_else(|| {
                dirs::home_dir()
                    .unwrap_or_else(|| PathBuf::from("."))
                    .join("Music")
            })
            .join("HiFlac Downloads");

        // Ensure directories exist
        fs::create_dir_all(&cache_dir).ok();
        fs::create_dir_all(&music_dir).ok();

        Self {
            cache_dir,
            music_dir,
            client: Client::builder()
                .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
                .timeout(std::time::Duration::from_secs(180)) // Increased timeout for large downloads
                .build()
                .unwrap(),
            progressive_streams: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Get music library directory path (where permanent downloads are stored)
    pub fn music_dir(&self) -> &PathBuf {
        &self.music_dir
    }

    /// Get cache directory path
    pub fn cache_dir(&self) -> &PathBuf {
        &self.cache_dir
    }

    /// Check if a track is already cached (either in cache dir or music dir)
    pub fn is_cached(&self, track_id: &str) -> Option<PathBuf> {
        // First check music library (permanent storage)
        let music_path = self.music_dir.join(format!("{}.flac", track_id));
        if music_path.exists() {
            return Some(music_path);
        }

        // Then check cache dir (temporary storage)
        let cache_path = self.cache_dir.join(format!("{}.flac", track_id));
        if cache_path.exists() {
            return Some(cache_path);
        }

        None
    }

    /// Check if track is in music library with metadata-based filename
    pub fn find_in_music_library(&self, track_name: &str, artist_name: &str) -> Option<PathBuf> {
        let sanitized_name = Self::sanitize_filename(&format!("{} - {}", artist_name, track_name));
        let music_path = self.music_dir.join(format!("{}.flac", sanitized_name));
        if music_path.exists() {
            return Some(music_path);
        }
        None
    }

    /// Check if track is in music library with full Artist/Album/Track.flac structure
    pub fn find_in_music_library_full(
        &self,
        track_name: &str,
        artist_name: &str,
        album_name: &str,
    ) -> Option<PathBuf> {
        let sanitized_artist = Self::sanitize_filename(artist_name);
        let sanitized_album = Self::sanitize_filename(album_name);
        let sanitized_track = Self::sanitize_filename(track_name);

        // Check Artist/Album/Track.flac path (primary)
        let music_path = self
            .music_dir
            .join(&sanitized_artist)
            .join(&sanitized_album)
            .join(format!("{}.flac", sanitized_track));

        if music_path.exists() {
            println!("[StreamCache] Found track at: {:?}", music_path);
            return Some(music_path);
        }

        // Also check flat structure: Artist - Track.flac
        let flat_path = self
            .music_dir
            .join(format!("{} - {}.flac", sanitized_artist, sanitized_track));
        if flat_path.exists() {
            println!("[StreamCache] Found track at flat path: {:?}", flat_path);
            return Some(flat_path);
        }

        None
    }

    /// Sanitize filename for safe file system usage
    fn sanitize_filename(name: &str) -> String {
        name.chars()
            .map(|c| match c {
                '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
                _ => c,
            })
            .collect::<String>()
            .trim()
            .to_string()
    }

    /// Get cached file path for a track ID (uses music library as primary)
    pub fn get_cache_path(&self, track_id: &str) -> PathBuf {
        self.music_dir.join(format!("{}.flac", track_id))
    }

    /// Get the path where the track will be saved with proper filename
    pub fn get_music_path(&self, track_name: &str, artist_name: &str, album_name: &str) -> PathBuf {
        let sanitized_artist = Self::sanitize_filename(artist_name);
        let sanitized_album = Self::sanitize_filename(album_name);
        let sanitized_track = Self::sanitize_filename(track_name);

        // Create Artist/Album folder structure
        let album_dir = self
            .music_dir
            .join(&sanitized_artist)
            .join(&sanitized_album);
        fs::create_dir_all(&album_dir).ok();

        album_dir.join(format!("{}.flac", sanitized_track))
    }

    /// Download a track from Tidal using DASH manifest
    pub async fn download_tidal_dash(
        &self,
        track_id: &str,
        manifest_b64: &str,
        sample_rate: Option<u32>,
        bit_depth: Option<u32>,
    ) -> Result<DownloadResult, String> {
        self.download_tidal_dash_with_metadata(
            track_id,
            manifest_b64,
            sample_rate,
            bit_depth,
            None,
            None,
            None,
        )
        .await
    }

    /// Download a track from Tidal using DASH manifest with metadata for proper file naming
    pub async fn download_tidal_dash_with_metadata(
        &self,
        track_id: &str,
        manifest_b64: &str,
        sample_rate: Option<u32>,
        bit_depth: Option<u32>,
        track_name: Option<&str>,
        artist_name: Option<&str>,
        album_name: Option<&str>,
    ) -> Result<DownloadResult, String> {
        println!(
            "[StreamCache] Downloading Tidal track {} via manifest",
            track_id
        );

        // Decode base64 manifest
        let manifest_bytes = BASE64
            .decode(manifest_b64)
            .map_err(|e| format!("Failed to decode manifest: {}", e))?;

        let manifest_str = String::from_utf8_lossy(&manifest_bytes);

        // Check if it's BTS (JSON) or DASH (XML)
        let trimmed = manifest_str.trim();
        if trimmed.starts_with('{') {
            // BTS format - direct URL in JSON
            println!("[StreamCache] Manifest is BTS format (JSON)");
            let manifest_json: serde_json::Value = serde_json::from_slice(&manifest_bytes)
                .map_err(|e| format!("Failed to parse BTS manifest: {}", e))?;

            if let Some(urls) = manifest_json.get("urls").and_then(|u| u.as_array()) {
                if let Some(url) = urls.first().and_then(|u| u.as_str()) {
                    return self
                        .download_direct_url_with_metadata(
                            track_id,
                            url,
                            sample_rate,
                            bit_depth,
                            "Tidal",
                            track_name,
                            artist_name,
                            album_name,
                        )
                        .await;
                }
            }
            return Err("No URLs in BTS manifest".to_string());
        }

        // DASH XML format - parse and download segments
        println!("[StreamCache] Manifest is DASH format (XML), downloading segments...");
        self.download_dash_segments_with_metadata(
            track_id,
            &manifest_str,
            sample_rate,
            bit_depth,
            track_name,
            artist_name,
            album_name,
        )
        .await
    }

    /// Download a track from Tidal using DASH manifest with duration validation
    pub async fn download_tidal_dash_with_duration(
        &self,
        track_id: &str,
        manifest_b64: &str,
        sample_rate: Option<u32>,
        bit_depth: Option<u32>,
        track_name: Option<&str>,
        artist_name: Option<&str>,
        album_name: Option<&str>,
        expected_duration_ms: Option<u64>,
    ) -> Result<DownloadResult, String> {
        println!(
            "[StreamCache] Downloading Tidal track {} via manifest (duration check: {:?}ms)",
            track_id, expected_duration_ms
        );

        // Decode base64 manifest
        let manifest_bytes = BASE64
            .decode(manifest_b64)
            .map_err(|e| format!("Failed to decode manifest: {}", e))?;

        let manifest_str = String::from_utf8_lossy(&manifest_bytes);

        // Check if it's BTS (JSON) or DASH (XML)
        let trimmed = manifest_str.trim();
        if trimmed.starts_with('{') {
            // BTS format - direct URL in JSON (no duration check needed - full track)
            println!("[StreamCache] Manifest is BTS format (JSON)");
            let manifest_json: serde_json::Value = serde_json::from_slice(&manifest_bytes)
                .map_err(|e| format!("Failed to parse BTS manifest: {}", e))?;

            if let Some(urls) = manifest_json.get("urls").and_then(|u| u.as_array()) {
                if let Some(url) = urls.first().and_then(|u| u.as_str()) {
                    return self
                        .download_direct_url_with_metadata(
                            track_id,
                            url,
                            sample_rate,
                            bit_depth,
                            "Tidal",
                            track_name,
                            artist_name,
                            album_name,
                        )
                        .await;
                }
            }
            return Err("No URLs in BTS manifest".to_string());
        }

        // DASH XML format - parse and download segments with duration validation
        println!("[StreamCache] Manifest is DASH format (XML), downloading segments...");
        self.download_dash_segments_with_duration(
            track_id,
            &manifest_str,
            sample_rate,
            bit_depth,
            track_name,
            artist_name,
            album_name,
            expected_duration_ms,
        )
        .await
    }

    /// Download directly from a URL (for BTS format or direct stream URLs)
    /// Saves to music library with proper Artist/Album/Track structure
    pub async fn download_direct_url(
        &self,
        track_id: &str,
        url: &str,
        sample_rate: Option<u32>,
        bit_depth: Option<u32>,
        source: &str,
    ) -> Result<DownloadResult, String> {
        self.download_direct_url_with_metadata(
            track_id,
            url,
            sample_rate,
            bit_depth,
            source,
            None,
            None,
            None,
        )
        .await
    }

    /// Download directly from a URL with metadata for proper file organization
    pub async fn download_direct_url_with_metadata(
        &self,
        track_id: &str,
        url: &str,
        sample_rate: Option<u32>,
        bit_depth: Option<u32>,
        source: &str,
        track_name: Option<&str>,
        artist_name: Option<&str>,
        album_name: Option<&str>,
    ) -> Result<DownloadResult, String> {
        println!(
            "[StreamCache] Downloading {} track {} from direct URL",
            source, track_id
        );

        let response = self
            .client
            .get(url)
            .send()
            .await
            .map_err(|e| format!("Download request failed: {}", e))?;

        if !response.status().is_success() {
            return Err(format!(
                "Download failed with status: {}",
                response.status()
            ));
        }

        let bytes = response
            .bytes()
            .await
            .map_err(|e| format!("Failed to read response: {}", e))?;

        // Determine output path based on metadata or track_id
        let output_path = if let (Some(track), Some(artist), Some(album)) =
            (track_name, artist_name, album_name)
        {
            self.get_music_path(track, artist, album)
        } else {
            self.get_cache_path(track_id)
        };

        // Also create a symlink/copy in cache with track_id for quick lookup
        let cache_path = self.cache_dir.join(format!("{}.flac", track_id));

        // Determine file type from content or URL
        let is_flac = url.contains(".flac") || bytes.starts_with(b"fLaC");

        if is_flac {
            // Already FLAC, save directly
            let mut file =
                File::create(&output_path).map_err(|e| format!("Failed to create file: {}", e))?;
            file.write_all(&bytes)
                .map_err(|e| format!("Failed to write file: {}", e))?;

            // Create copy in cache dir for quick ID lookup
            if output_path != cache_path {
                fs::copy(&output_path, &cache_path).ok();
            }
        } else {
            // Need to convert to FLAC
            let temp_path = self.cache_dir.join(format!("{}.tmp", track_id));
            let mut file = File::create(&temp_path)
                .map_err(|e| format!("Failed to create temp file: {}", e))?;
            file.write_all(&bytes)
                .map_err(|e| format!("Failed to write temp file: {}", e))?;
            drop(file);

            // Convert using ffmpeg
            self.convert_to_flac(&temp_path, &output_path)?;
            fs::remove_file(&temp_path).ok();

            // Create copy in cache dir for quick ID lookup
            if output_path != cache_path {
                fs::copy(&output_path, &cache_path).ok();
            }
        }

        println!(
            "[StreamCache] Successfully saved {} track to: {:?}",
            source, output_path
        );

        Ok(DownloadResult {
            success: true,
            file_path: Some(output_path.to_string_lossy().to_string()),
            error: None,
            source: source.to_string(),
            format: "FLAC".to_string(),
            sample_rate,
            bit_depth,
        })
    }

    /// Download DASH segments and combine into a single file
    async fn download_dash_segments(
        &self,
        track_id: &str,
        manifest_xml: &str,
        sample_rate: Option<u32>,
        bit_depth: Option<u32>,
    ) -> Result<DownloadResult, String> {
        self.download_dash_segments_with_metadata(
            track_id,
            manifest_xml,
            sample_rate,
            bit_depth,
            None,
            None,
            None,
        )
        .await
    }

    /// Download DASH segments with metadata for proper file organization
    pub async fn download_dash_segments_with_metadata(
        &self,
        track_id: &str,
        manifest_xml: &str,
        sample_rate: Option<u32>,
        bit_depth: Option<u32>,
        track_name: Option<&str>,
        artist_name: Option<&str>,
        album_name: Option<&str>,
    ) -> Result<DownloadResult, String> {
        self.download_dash_segments_with_duration(
            track_id,
            manifest_xml,
            sample_rate,
            bit_depth,
            track_name,
            artist_name,
            album_name,
            None, // No duration check
        )
        .await
    }

    /// Download DASH segments with duration validation
    /// If expected_duration_ms is provided, validates that segment count matches
    pub async fn download_dash_segments_with_duration(
        &self,
        track_id: &str,
        manifest_xml: &str,
        sample_rate: Option<u32>,
        bit_depth: Option<u32>,
        track_name: Option<&str>,
        artist_name: Option<&str>,
        album_name: Option<&str>,
        expected_duration_ms: Option<u64>,
    ) -> Result<DownloadResult, String> {
        println!("[StreamCache] Parsing DASH manifest for track {}", track_id);

        // Parse the DASH manifest to extract URLs
        let (init_url, media_urls) = self.parse_dash_manifest(manifest_xml)?;

        let segment_count = media_urls.len();

        println!(
            "[StreamCache] DASH manifest: {} segments, expected duration: {:?}ms",
            segment_count, expected_duration_ms
        );

        // Validate segment count - detect preview/trial versions
        // Most DASH segments are ~4 seconds. A 30-second preview would have ~8 segments.
        // A full song (3+ minutes) would have 45+ segments.
        const MIN_SEGMENTS_FOR_FULL_TRACK: usize = 20;

        if segment_count < MIN_SEGMENTS_FOR_FULL_TRACK {
            // If we have expected duration, calculate expected segments
            if let Some(duration_ms) = expected_duration_ms {
                let expected_seconds = duration_ms / 1000;
                let expected_segments = (expected_seconds / 4) as usize; // ~4 sec per segment

                println!(
                    "[StreamCache] Track duration: {}s, expected ~{} segments, got {}",
                    expected_seconds, expected_segments, segment_count
                );

                // If we have less than 50% of expected segments, it's likely a preview
                if segment_count < expected_segments / 2 {
                    println!("[StreamCache] REJECTING: Preview manifest detected!");
                    return Err(format!(
                        "Preview manifest detected: got {} segments, expected ~{} for {}s track",
                        segment_count, expected_segments, expected_seconds
                    ));
                }
            } else {
                // No duration provided, but segment count is suspiciously low
                // Most songs are 3+ minutes = 45+ segments at 4sec each
                println!(
                    "[StreamCache] REJECTING: Only {} segments found (no duration provided) - likely a preview",
                    segment_count
                );
                return Err(format!(
                    "Preview manifest detected: only {} segments (expected 20+ for a full track)",
                    segment_count
                ));
            }
        }

        println!(
            "[StreamCache] Found {} segments to download (full track)",
            segment_count + 1
        );

        // Create temp file for concatenated segments
        let temp_path = self.cache_dir.join(format!("{}.m4a.tmp", track_id));
        let mut temp_file =
            File::create(&temp_path).map_err(|e| format!("Failed to create temp file: {}", e))?;

        // Download init segment
        println!("[StreamCache] Downloading init segment...");
        let init_bytes = self
            .client
            .get(&init_url)
            .send()
            .await
            .map_err(|e| format!("Init segment request failed: {}", e))?
            .bytes()
            .await
            .map_err(|e| format!("Failed to read init segment: {}", e))?;

        temp_file
            .write_all(&init_bytes)
            .map_err(|e| format!("Failed to write init segment: {}", e))?;

        // Download media segments
        let total = media_urls.len();
        for (i, url) in media_urls.iter().enumerate() {
            if i % 5 == 0 || i == total - 1 {
                println!("[StreamCache] Downloading segment {}/{}", i + 1, total);
            }

            let segment_bytes = self
                .client
                .get(url)
                .send()
                .await
                .map_err(|e| format!("Segment {} request failed: {}", i + 1, e))?
                .bytes()
                .await
                .map_err(|e| format!("Failed to read segment {}: {}", i + 1, e))?;

            temp_file
                .write_all(&segment_bytes)
                .map_err(|e| format!("Failed to write segment {}: {}", i + 1, e))?;
        }

        drop(temp_file);

        // Determine output path based on metadata or track_id
        let output_path = if let (Some(track), Some(artist), Some(album)) =
            (track_name, artist_name, album_name)
        {
            self.get_music_path(track, artist, album)
        } else {
            self.get_cache_path(track_id)
        };

        // Also create a symlink/copy in cache with track_id for quick lookup
        let cache_path = self.cache_dir.join(format!("{}.flac", track_id));

        // Convert to FLAC using ffmpeg
        println!("[StreamCache] Converting to FLAC...");
        self.convert_to_flac(&temp_path, &output_path)?;

        // Create copy in cache dir for quick ID lookup
        if output_path != cache_path {
            fs::copy(&output_path, &cache_path).ok();
        }

        // Clean up temp file
        fs::remove_file(&temp_path).ok();

        println!(
            "[StreamCache] Successfully saved Tidal DASH track to: {:?}",
            output_path
        );

        Ok(DownloadResult {
            success: true,
            file_path: Some(output_path.to_string_lossy().to_string()),
            error: None,
            source: "Tidal".to_string(),
            format: "FLAC".to_string(),
            sample_rate,
            bit_depth,
        })
    }

    /// Parse DASH manifest XML to extract segment URLs
    /// Uses proper XML parsing like SpotiFlac for accurate segment count
    fn parse_dash_manifest(&self, manifest: &str) -> Result<(String, Vec<String>), String> {
        use quick_xml::events::Event;
        use quick_xml::Reader;
        use regex::Regex;

        println!(
            "[StreamCache] Parsing DASH manifest (length: {} bytes)",
            manifest.len()
        );

        // Try XML parsing first (more accurate)
        let mut init_url = String::new();
        let mut media_template = String::new();
        let mut segment_count: usize = 0;

        // Parse XML to extract SegmentTemplate and SegmentTimeline
        let mut reader = Reader::from_str(manifest);
        reader.config_mut().trim_text(true);

        let mut in_segment_timeline = false;

        loop {
            match reader.read_event() {
                Ok(Event::Start(ref e)) | Ok(Event::Empty(ref e)) => {
                    let name_bytes = e.name();
                    let name = std::str::from_utf8(name_bytes.as_ref()).unwrap_or("");

                    if name == "SegmentTemplate" {
                        // Extract initialization and media attributes
                        for attr in e.attributes().flatten() {
                            let key = std::str::from_utf8(attr.key.as_ref()).unwrap_or("");
                            let value = std::str::from_utf8(&attr.value).unwrap_or("");

                            if key == "initialization" && init_url.is_empty() {
                                init_url = value.replace("&amp;", "&");
                                println!("[StreamCache] Found init URL from XML");
                            } else if key == "media" && media_template.is_empty() {
                                media_template = value.replace("&amp;", "&");
                                println!("[StreamCache] Found media template from XML");
                            }
                        }
                    } else if name == "SegmentTimeline" {
                        in_segment_timeline = true;
                    } else if name == "S" && in_segment_timeline {
                        // Parse segment: d="duration" r="repeat" (optional)
                        let mut repeat: usize = 0;
                        for attr in e.attributes().flatten() {
                            let key = std::str::from_utf8(attr.key.as_ref()).unwrap_or("");
                            if key == "r" {
                                let value = std::str::from_utf8(&attr.value).unwrap_or("0");
                                repeat = value.parse().unwrap_or(0);
                            }
                        }
                        // Each S element represents 1 segment, plus 'r' repeats
                        segment_count += repeat + 1;
                    }
                }
                Ok(Event::End(ref e)) => {
                    let name_bytes = e.name();
                    let name = std::str::from_utf8(name_bytes.as_ref()).unwrap_or("");
                    if name == "SegmentTimeline" {
                        in_segment_timeline = false;
                    }
                }
                Ok(Event::Eof) => break,
                Err(e) => {
                    println!(
                        "[StreamCache] XML parsing error: {}, falling back to regex",
                        e
                    );
                    break;
                }
                _ => {}
            }
        }

        // If XML parsing didn't find segments, fall back to regex
        if segment_count == 0 || init_url.is_empty() || media_template.is_empty() {
            println!("[StreamCache] Using regex fallback for DASH manifest...");

            // Extract initialization URL
            let init_re = Regex::new(r#"initialization="([^"]+)""#).unwrap();
            if init_url.is_empty() {
                init_url = init_re
                    .captures(manifest)
                    .and_then(|c| c.get(1))
                    .map(|m| m.as_str().replace("&amp;", "&"))
                    .unwrap_or_default();
            }

            // Extract media URL template
            let media_re = Regex::new(r#"media="([^"]+)""#).unwrap();
            if media_template.is_empty() {
                media_template = media_re
                    .captures(manifest)
                    .and_then(|c| c.get(1))
                    .map(|m| m.as_str().replace("&amp;", "&"))
                    .unwrap_or_default();
            }

            // Count segments from <S> tags with d and r attributes
            // Pattern: <S d="xxxxx" r="yy"/> or <S d="xxxxx"/>
            let seg_re = Regex::new(r#"<S\s+[^>]*?(?:/>|>)"#).unwrap();
            let repeat_re = Regex::new(r#"r="(\d+)""#).unwrap();

            segment_count = 0;
            for cap in seg_re.find_iter(manifest) {
                let seg_text = cap.as_str();
                let repeat = repeat_re
                    .captures(seg_text)
                    .and_then(|c| c.get(1))
                    .and_then(|m| m.as_str().parse::<usize>().ok())
                    .unwrap_or(0);
                segment_count += repeat + 1;
            }
        }

        if init_url.is_empty() {
            return Err("No initialization URL found in manifest".to_string());
        }

        if media_template.is_empty() {
            return Err("No media URL template found in manifest".to_string());
        }

        if segment_count == 0 {
            return Err("No segments found in manifest".to_string());
        }

        println!("[StreamCache] DASH manifest: {} segments", segment_count);

        println!("[StreamCache] DASH manifest: {} segments", segment_count);

        // Generate segment URLs
        let media_urls: Vec<String> = (1..=segment_count)
            .map(|i| media_template.replace("$Number$", &i.to_string()))
            .collect();

        Ok((init_url, media_urls))
    }

    /// Convert audio file to FLAC using ffmpeg
    fn convert_to_flac(&self, input: &PathBuf, output: &PathBuf) -> Result<(), String> {
        // Use FFmpeg manager to get the path
        let ffmpeg = crate::ffmpeg::get_ffmpeg_path()?;

        let status = Command::new(&ffmpeg)
            .args([
                "-y",
                "-i",
                input.to_str().unwrap(),
                "-vn",
                "-c:a",
                "flac",
                output.to_str().unwrap(),
            ])
            .output()
            .map_err(|e| format!("Failed to run ffmpeg: {}", e))?;

        if !status.status.success() {
            let stderr = String::from_utf8_lossy(&status.stderr);
            return Err(format!("ffmpeg conversion failed: {}", stderr));
        }

        Ok(())
    }

    /// Clear all cached files
    pub fn clear_cache(&self) -> Result<usize, String> {
        let mut count = 0;
        if let Ok(entries) = fs::read_dir(&self.cache_dir) {
            for entry in entries.flatten() {
                if entry
                    .path()
                    .extension()
                    .map(|e| e == "flac")
                    .unwrap_or(false)
                {
                    if fs::remove_file(entry.path()).is_ok() {
                        count += 1;
                    }
                }
            }
        }
        Ok(count)
    }

    /// Get cache size in bytes
    pub fn cache_size(&self) -> u64 {
        let mut size = 0;
        if let Ok(entries) = fs::read_dir(&self.cache_dir) {
            for entry in entries.flatten() {
                if let Ok(meta) = entry.metadata() {
                    size += meta.len();
                }
            }
        }
        size
    }

    /// Get music library size in bytes (recursive)
    pub fn music_size(&self) -> u64 {
        fn dir_size(path: &std::path::Path) -> u64 {
            let mut size = 0;
            if let Ok(entries) = fs::read_dir(path) {
                for entry in entries.flatten() {
                    if let Ok(meta) = entry.metadata() {
                        if meta.is_file() {
                            size += meta.len();
                        } else if meta.is_dir() {
                            size += dir_size(&entry.path());
                        }
                    }
                }
            }
            size
        }
        dir_size(&self.music_dir)
    }

    /// Get the music directory as a PathBuf
    pub fn get_music_dir(&self) -> PathBuf {
        self.music_dir.clone()
    }

    // ================== PROGRESSIVE STREAMING METHODS ==================

    /// Start a progressive stream - downloads first chunk and returns immediately
    /// Call get_next_chunk() to download subsequent chunks
    pub async fn start_progressive_stream(
        &self,
        track_id: &str,
        manifest_b64: &str,
        sample_rate: Option<u32>,
        bit_depth: Option<u32>,
        track_name: Option<&str>,
        artist_name: Option<&str>,
        album_name: Option<&str>,
        expected_duration_ms: Option<u64>,
    ) -> Result<ProgressiveStreamResult, String> {
        println!(
            "[Progressive] Starting progressive stream for track {}",
            track_id
        );

        // Decode base64 manifest
        let manifest_bytes = BASE64
            .decode(manifest_b64)
            .map_err(|e| format!("Failed to decode manifest: {}", e))?;

        let manifest_str = String::from_utf8_lossy(&manifest_bytes);
        let trimmed = manifest_str.trim();

        // Only DASH format supports progressive streaming
        if trimmed.starts_with('{') {
            return Err(
                "BTS format doesn't support progressive streaming, use full download".to_string(),
            );
        }

        // Parse DASH manifest
        let (init_url, media_urls) = self.parse_dash_manifest(&manifest_str)?;
        let total_segments = media_urls.len();

        // Validate - reject previews
        const MIN_SEGMENTS_FOR_FULL_TRACK: usize = 20;
        if total_segments < MIN_SEGMENTS_FOR_FULL_TRACK {
            if let Some(duration_ms) = expected_duration_ms {
                let expected_seconds = duration_ms / 1000;
                let expected_segments = (expected_seconds / 4) as usize;
                if total_segments < expected_segments / 2 {
                    return Err(format!(
                        "Preview manifest detected: got {} segments, expected ~{} for {}s track",
                        total_segments, expected_segments, expected_seconds
                    ));
                }
            } else {
                return Err(format!(
                    "Preview manifest detected: only {} segments",
                    total_segments
                ));
            }
        }

        // Download init segment
        println!("[Progressive] Downloading init segment...");
        let init_bytes = self
            .client
            .get(&init_url)
            .send()
            .await
            .map_err(|e| format!("Init segment request failed: {}", e))?
            .bytes()
            .await
            .map_err(|e| format!("Failed to read init segment: {}", e))?;

        // Use smaller first chunk for faster start (2 segments = ~8 seconds)
        // Subsequent chunks use 8 segments = ~32 seconds for efficiency
        let first_chunk_segments = 2;
        let regular_chunk_segments = 8;

        // Calculate total chunks: 1 small first chunk + remaining regular chunks
        let remaining_segments = total_segments.saturating_sub(first_chunk_segments);
        let remaining_chunks =
            (remaining_segments + regular_chunk_segments - 1) / regular_chunk_segments;
        let total_chunks = 1 + remaining_chunks;

        println!(
            "[Progressive] Total: {} segments, {} chunks (first: {} segments, rest: {} segments/chunk)",
            total_segments, total_chunks, first_chunk_segments, regular_chunk_segments
        );

        // Create download queue: 0, 1, 2, ... (sequential order initially)
        let download_queue: Vec<usize> = (0..total_chunks).collect();

        // Create initial state - store both segment sizes
        let state = ProgressiveStreamState {
            track_id: track_id.to_string(),
            total_segments,
            segments_per_chunk: regular_chunk_segments, // Default for non-first chunks
            first_chunk_segments,                       // New field for first chunk size
            chunks: Vec::with_capacity(total_chunks),
            init_segment: Some(init_bytes.to_vec()),
            media_urls: media_urls.clone(),
            current_chunk: 0,
            is_complete: false,
            sample_rate,
            bit_depth,
            track_name: track_name.map(|s| s.to_string()),
            artist_name: artist_name.map(|s| s.to_string()),
            album_name: album_name.map(|s| s.to_string()),
            priority_chunk: None,
            download_queue,
            needs_reprioritize: false,
        };

        // Store state
        {
            let mut streams = self.progressive_streams.lock().unwrap();
            streams.insert(track_id.to_string(), state);
        }

        // Download first chunk
        let first_chunk_path = self.download_chunk(track_id, 0).await?;

        Ok(ProgressiveStreamResult {
            success: true,
            first_chunk_path: Some(first_chunk_path),
            total_chunks,
            error: None,
            source: "Tidal".to_string(),
            format: "FLAC".to_string(),
            sample_rate,
            bit_depth,
        })
    }

    /// Download a specific chunk of segments
    async fn download_chunk(&self, track_id: &str, chunk_index: usize) -> Result<String, String> {
        let (init_segment, segment_urls, start_segment, end_segment, total_segments) = {
            let streams = self.progressive_streams.lock().unwrap();
            let state = streams
                .get(track_id)
                .ok_or_else(|| "No active stream for track".to_string())?;

            // Calculate segment range based on chunk index
            // First chunk uses smaller size for faster start
            let (start, end) = if chunk_index == 0 {
                (
                    0,
                    std::cmp::min(state.first_chunk_segments, state.total_segments),
                )
            } else {
                // Subsequent chunks: offset by first chunk, then regular chunk size
                let offset = state.first_chunk_segments;
                let chunk_offset = (chunk_index - 1) * state.segments_per_chunk;
                let start = offset + chunk_offset;
                let end = std::cmp::min(start + state.segments_per_chunk, state.total_segments);
                (start, end)
            };

            let urls: Vec<String> = state.media_urls[start..end].to_vec();
            (
                state.init_segment.clone(),
                urls,
                start,
                end,
                state.total_segments,
            )
        };

        let init_bytes = init_segment.ok_or_else(|| "Init segment not available".to_string())?;

        println!(
            "[Progressive] Downloading chunk {} (segments {}-{})",
            chunk_index,
            start_segment + 1,
            end_segment
        );

        // Create temp file for this chunk
        let temp_path = self
            .cache_dir
            .join(format!("{}_{}.m4a.tmp", track_id, chunk_index));
        let mut temp_file =
            File::create(&temp_path).map_err(|e| format!("Failed to create temp file: {}", e))?;

        // Write init segment
        temp_file
            .write_all(&init_bytes)
            .map_err(|e| format!("Failed to write init segment: {}", e))?;

        // Download and write media segments for this chunk
        for (i, url) in segment_urls.iter().enumerate() {
            let segment_bytes = self
                .client
                .get(url)
                .send()
                .await
                .map_err(|e| format!("Segment {} request failed: {}", i + 1, e))?
                .bytes()
                .await
                .map_err(|e| format!("Failed to read segment {}: {}", i + 1, e))?;

            temp_file
                .write_all(&segment_bytes)
                .map_err(|e| format!("Failed to write segment {}: {}", i + 1, e))?;
        }

        drop(temp_file);

        // Use M4A directly instead of converting to FLAC (Symphonia can decode M4A)
        // This is faster and enables better gapless playback
        let chunk_path = self
            .cache_dir
            .join(format!("{}_{}.m4a", track_id, chunk_index));

        // Rename temp file to final M4A
        fs::rename(&temp_path, &chunk_path)
            .map_err(|e| format!("Failed to rename chunk file: {}", e))?;

        println!("[Progressive] Chunk {} ready (M4A)", chunk_index);

        // Update state
        {
            let mut streams = self.progressive_streams.lock().unwrap();
            if let Some(state) = streams.get_mut(track_id) {
                let chunk = StreamChunk {
                    chunk_index,
                    file_path: chunk_path.clone(),
                    segment_start: start_segment,
                    segment_end: end_segment,
                    duration_seconds: (end_segment - start_segment) as f32 * 4.0, // ~4 sec per segment
                    is_ready: true,
                };

                // Ensure chunks vec is large enough
                while state.chunks.len() <= chunk_index {
                    state.chunks.push(StreamChunk {
                        chunk_index: state.chunks.len(),
                        file_path: PathBuf::new(),
                        segment_start: 0,
                        segment_end: 0,
                        duration_seconds: 0.0,
                        is_ready: false,
                    });
                }
                state.chunks[chunk_index] = chunk;

                // Check if all chunks downloaded
                let total_chunks = state.total_chunks();
                if chunk_index == total_chunks - 1 {
                    state.is_complete = true;
                }
            }
        }

        println!(
            "[Progressive] Chunk {} ready: {:?}",
            chunk_index, chunk_path
        );
        Ok(chunk_path.to_string_lossy().to_string())
    }

    /// Download the next chunk in the background
    /// Returns the path if ready, or starts download and returns None
    pub async fn download_next_chunk(&self, track_id: &str) -> Result<NextChunkResult, String> {
        let (next_chunk_index, total_chunks, is_ready) = {
            let streams = self.progressive_streams.lock().unwrap();
            let state = streams
                .get(track_id)
                .ok_or_else(|| "No active stream for track".to_string())?;

            let total_chunks = state.total_chunks();
            let next = state.current_chunk + 1;

            if next >= total_chunks {
                return Ok(NextChunkResult {
                    chunk_path: None,
                    chunk_index: next,
                    is_last: true,
                    is_ready: false,
                });
            }

            let is_ready = state.chunks.get(next).map(|c| c.is_ready).unwrap_or(false);
            (next, total_chunks, is_ready)
        };

        if is_ready {
            // Chunk already downloaded
            let path = {
                let streams = self.progressive_streams.lock().unwrap();
                let state = streams.get(track_id).unwrap();
                state.chunks[next_chunk_index]
                    .file_path
                    .to_string_lossy()
                    .to_string()
            };
            return Ok(NextChunkResult {
                chunk_path: Some(path),
                chunk_index: next_chunk_index,
                is_last: next_chunk_index == total_chunks - 1,
                is_ready: true,
            });
        }

        // Download chunk
        let chunk_path = self.download_chunk(track_id, next_chunk_index).await?;

        Ok(NextChunkResult {
            chunk_path: Some(chunk_path),
            chunk_index: next_chunk_index,
            is_last: next_chunk_index == total_chunks - 1,
            is_ready: true,
        })
    }

    /// Advance to the next chunk (called when playback moves to next chunk)
    pub fn advance_chunk(&self, track_id: &str) -> Result<(), String> {
        let mut streams = self.progressive_streams.lock().unwrap();
        let state = streams
            .get_mut(track_id)
            .ok_or_else(|| "No active stream for track".to_string())?;
        state.current_chunk += 1;
        Ok(())
    }

    /// Get current chunk info
    pub fn get_current_chunk(&self, track_id: &str) -> Result<NextChunkResult, String> {
        let streams = self.progressive_streams.lock().unwrap();
        let state = streams
            .get(track_id)
            .ok_or_else(|| "No active stream for track".to_string())?;

        let total_chunks = state.total_chunks();
        let current = state.current_chunk;

        if current >= state.chunks.len() || !state.chunks[current].is_ready {
            return Ok(NextChunkResult {
                chunk_path: None,
                chunk_index: current,
                is_last: current == total_chunks - 1,
                is_ready: false,
            });
        }

        Ok(NextChunkResult {
            chunk_path: Some(
                state.chunks[current]
                    .file_path
                    .to_string_lossy()
                    .to_string(),
            ),
            chunk_index: current,
            is_last: current == total_chunks - 1,
            is_ready: true,
        })
    }

    /// Finalize stream - join all chunks and save to music library
    pub async fn finalize_stream(&self, track_id: &str) -> Result<String, String> {
        let (chunks, metadata) = {
            let streams = self.progressive_streams.lock().unwrap();
            let state = streams
                .get(track_id)
                .ok_or_else(|| "No active stream for track".to_string())?;

            if !state.is_complete {
                return Err("Stream not complete, cannot finalize".to_string());
            }

            let chunk_paths: Vec<PathBuf> = state
                .chunks
                .iter()
                .filter(|c| c.is_ready)
                .map(|c| c.file_path.clone())
                .collect();

            (
                chunk_paths,
                (
                    state.track_name.clone(),
                    state.artist_name.clone(),
                    state.album_name.clone(),
                    state.sample_rate,
                    state.bit_depth,
                ),
            )
        };

        if chunks.is_empty() {
            return Err("No chunks to join".to_string());
        }

        // If only one chunk, convert M4A to FLAC
        if chunks.len() == 1 {
            let final_path = self.get_final_path(track_id, &metadata)?;
            let ffmpeg = crate::ffmpeg::get_ffmpeg_path()?;

            // Convert M4A to FLAC
            let status = Command::new(&ffmpeg)
                .args([
                    "-y",
                    "-i",
                    chunks[0].to_str().unwrap(),
                    "-c:a",
                    "flac",
                    "-compression_level",
                    "5",
                    final_path.to_str().unwrap(),
                ])
                .output()
                .map_err(|e| format!("Failed to convert chunk: {}", e))?;

            if !status.status.success() {
                let stderr = String::from_utf8_lossy(&status.stderr);
                return Err(format!("ffmpeg conversion failed: {}", stderr));
            }

            self.cleanup_stream(track_id)?;
            return Ok(final_path.to_string_lossy().to_string());
        }

        // Join multiple chunks using ffmpeg concat
        println!("[Progressive] Joining {} chunks...", chunks.len());
        let final_path = self.join_chunks(track_id, &chunks, &metadata).await?;

        // Cleanup
        self.cleanup_stream(track_id)?;

        println!("[Progressive] Finalized stream: {:?}", final_path);
        Ok(final_path.to_string_lossy().to_string())
    }

    /// Join multiple FLAC chunks into a single file
    async fn join_chunks(
        &self,
        track_id: &str,
        chunks: &[PathBuf],
        metadata: &(
            Option<String>,
            Option<String>,
            Option<String>,
            Option<u32>,
            Option<u32>,
        ),
    ) -> Result<PathBuf, String> {
        let ffmpeg = crate::ffmpeg::get_ffmpeg_path()?;

        // Create concat file list
        let concat_list_path = self.cache_dir.join(format!("{}_concat.txt", track_id));
        let mut concat_file = File::create(&concat_list_path)
            .map_err(|e| format!("Failed to create concat list: {}", e))?;

        for chunk in chunks {
            writeln!(
                concat_file,
                "file '{}'",
                chunk.to_string_lossy().replace('\'', "'\\''")
            )
            .map_err(|e| format!("Failed to write concat list: {}", e))?;
        }
        drop(concat_file);

        // Determine output path (FLAC for final file)
        let final_path = self.get_final_path(track_id, metadata)?;

        // Join M4A chunks and convert to FLAC with ffmpeg
        let status = Command::new(&ffmpeg)
            .args([
                "-y",
                "-f",
                "concat",
                "-safe",
                "0",
                "-i",
                concat_list_path.to_str().unwrap(),
                "-c:a",
                "flac",
                "-compression_level",
                "5",
                final_path.to_str().unwrap(),
            ])
            .output()
            .map_err(|e| format!("Failed to run ffmpeg concat: {}", e))?;

        if !status.status.success() {
            let stderr = String::from_utf8_lossy(&status.stderr);
            return Err(format!("ffmpeg concat failed: {}", stderr));
        }

        // Clean up concat list
        fs::remove_file(&concat_list_path).ok();

        Ok(final_path)
    }

    /// Get the final path for the joined file
    fn get_final_path(
        &self,
        track_id: &str,
        metadata: &(
            Option<String>,
            Option<String>,
            Option<String>,
            Option<u32>,
            Option<u32>,
        ),
    ) -> Result<PathBuf, String> {
        let (track_name, artist_name, album_name, _, _) = metadata;

        if let (Some(track), Some(artist), Some(album)) = (track_name, artist_name, album_name) {
            Ok(self.get_music_path(track, artist, album))
        } else {
            Ok(self.cache_dir.join(format!("{}.flac", track_id)))
        }
    }

    /// Clean up progressive stream state and temp files
    pub fn cleanup_stream(&self, track_id: &str) -> Result<(), String> {
        let chunks = {
            let mut streams = self.progressive_streams.lock().unwrap();
            let state = streams.remove(track_id);
            state.map(|s| s.chunks)
        };

        // Delete chunk files
        if let Some(chunks) = chunks {
            for chunk in chunks {
                if chunk.is_ready {
                    fs::remove_file(&chunk.file_path).ok();
                }
            }
        }

        // Delete any leftover temp files
        if let Ok(entries) = fs::read_dir(&self.cache_dir) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                if name.starts_with(&format!("{}_", track_id)) {
                    fs::remove_file(entry.path()).ok();
                }
            }
        }

        Ok(())
    }

    /// Download ALL remaining chunks in sequence (for background downloading)
    /// This downloads all chunks that haven't been downloaded yet
    pub async fn download_all_remaining_chunks(&self, track_id: &str) -> Result<usize, String> {
        let (total_chunks, already_downloaded) = {
            let streams = self.progressive_streams.lock().unwrap();
            let state = streams
                .get(track_id)
                .ok_or_else(|| "No active stream for track".to_string())?;

            let total_chunks = state.total_chunks();
            let downloaded: Vec<usize> = state
                .chunks
                .iter()
                .enumerate()
                .filter(|(_, c)| c.is_ready)
                .map(|(i, _)| i)
                .collect();

            (total_chunks, downloaded)
        };

        let mut downloaded_count = 0;

        // Download all chunks that haven't been downloaded yet
        for chunk_idx in 0..total_chunks {
            if already_downloaded.contains(&chunk_idx) {
                continue; // Skip already downloaded chunks
            }

            // Check if stream still exists (might have been cleaned up)
            {
                let streams = self.progressive_streams.lock().unwrap();
                if !streams.contains_key(track_id) {
                    println!("[Progressive] Stream was cleaned up, stopping downloads");
                    return Ok(downloaded_count);
                }
            }

            match self.download_chunk(track_id, chunk_idx).await {
                Ok(path) => {
                    downloaded_count += 1;
                    println!(
                        "[Progressive] Downloaded chunk {}/{}: {}",
                        chunk_idx + 1,
                        total_chunks,
                        path
                    );
                }
                Err(e) => {
                    println!(
                        "[Progressive] Failed to download chunk {}: {}",
                        chunk_idx, e
                    );
                    // Continue with next chunk instead of failing entirely
                }
            }
        }

        // Mark as complete if all chunks downloaded
        {
            let mut streams = self.progressive_streams.lock().unwrap();
            if let Some(state) = streams.get_mut(track_id) {
                let total_chunks = state.total_chunks();
                let all_ready =
                    state.chunks.iter().all(|c| c.is_ready) && state.chunks.len() == total_chunks;
                if all_ready {
                    state.is_complete = true;
                    println!("[Progressive] All chunks downloaded, stream complete");
                }
            }
        }

        Ok(downloaded_count)
    }

    /// Get chunk path by index (for playing specific chunk)
    pub fn get_chunk_by_index(
        &self,
        track_id: &str,
        chunk_index: usize,
    ) -> Result<Option<String>, String> {
        let streams = self.progressive_streams.lock().unwrap();
        let state = streams
            .get(track_id)
            .ok_or_else(|| "No active stream for track".to_string())?;

        if chunk_index >= state.chunks.len() {
            return Ok(None);
        }

        let chunk = &state.chunks[chunk_index];
        if chunk.is_ready {
            Ok(Some(chunk.file_path.to_string_lossy().to_string()))
        } else {
            Ok(None)
        }
    }

    /// Get chunk duration in seconds (for calculating cumulative position)
    /// Returns the default regular chunk duration (used for progress calculations)
    pub fn get_chunk_duration_seconds(&self, track_id: &str) -> Result<f64, String> {
        let streams = self.progressive_streams.lock().unwrap();
        let state = streams
            .get(track_id)
            .ok_or_else(|| "No active stream for track".to_string())?;

        // Return the regular chunk duration (used for most chunks)
        // First chunk is smaller but this is mainly used for progress bar math
        Ok((state.segments_per_chunk * 4) as f64)
    }

    /// Get duration in seconds for a specific chunk
    pub fn get_specific_chunk_duration(
        &self,
        track_id: &str,
        chunk_index: usize,
    ) -> Result<f64, String> {
        let streams = self.progressive_streams.lock().unwrap();
        let state = streams
            .get(track_id)
            .ok_or_else(|| "No active stream for track".to_string())?;

        let (start, end) = state.get_chunk_segment_range(chunk_index);
        Ok((end - start) as f64 * 4.0) // ~4 seconds per segment
    }

    /// Get total number of chunks
    pub fn get_total_chunks(&self, track_id: &str) -> Result<usize, String> {
        let streams = self.progressive_streams.lock().unwrap();
        let state = streams
            .get(track_id)
            .ok_or_else(|| "No active stream for track".to_string())?;

        Ok(state.total_chunks())
    }

    /// Check if a specific chunk is ready
    pub fn is_chunk_ready(&self, track_id: &str, chunk_index: usize) -> bool {
        let streams = self.progressive_streams.lock().unwrap();
        if let Some(state) = streams.get(track_id) {
            if chunk_index < state.chunks.len() {
                return state.chunks[chunk_index].is_ready;
            }
        }
        false
    }

    /// Check if a progressive stream is active for a track
    pub fn has_active_stream(&self, track_id: &str) -> bool {
        let streams = self.progressive_streams.lock().unwrap();
        streams.contains_key(track_id)
    }

    /// Get stream progress info
    pub fn get_stream_progress(&self, track_id: &str) -> Option<(usize, usize, bool)> {
        let streams = self.progressive_streams.lock().unwrap();
        streams.get(track_id).map(|s| {
            let total_chunks = s.total_chunks();
            let downloaded_chunks = s.chunks.iter().filter(|c| c.is_ready).count();
            (downloaded_chunks, total_chunks, s.is_complete)
        })
    }

    /// Calculate which chunk a given position (in seconds) falls into
    pub fn get_chunk_for_position(
        &self,
        track_id: &str,
        position_seconds: f64,
    ) -> Result<usize, String> {
        let streams = self.progressive_streams.lock().unwrap();
        let state = streams
            .get(track_id)
            .ok_or_else(|| "No active stream for track".to_string())?;

        // Each segment is ~4 seconds
        let segment_duration = 4.0;

        // First chunk has different size
        let first_chunk_duration = state.first_chunk_segments as f64 * segment_duration;

        if position_seconds < first_chunk_duration {
            return Ok(0);
        }

        // Position is beyond first chunk - calculate which regular chunk
        let position_after_first = position_seconds - first_chunk_duration;
        let regular_chunk_duration = state.segments_per_chunk as f64 * segment_duration;
        let chunk_index = 1 + (position_after_first / regular_chunk_duration).floor() as usize;

        let total_chunks = state.total_chunks();
        Ok(chunk_index.min(total_chunks.saturating_sub(1)))
    }

    /// Reprioritize download queue when user seeks to a position
    /// Downloads chunks from seek position to end first, then earlier chunks
    pub fn reprioritize_for_seek(
        &self,
        track_id: &str,
        target_chunk: usize,
    ) -> Result<Vec<usize>, String> {
        let mut streams = self.progressive_streams.lock().unwrap();
        let state = streams
            .get_mut(track_id)
            .ok_or_else(|| "No active stream for track".to_string())?;

        let total_chunks = state.total_chunks();

        // Build new download queue:
        // 1. Chunks from target_chunk to end (not yet downloaded)
        // 2. Chunks from 0 to target_chunk-1 (not yet downloaded)
        let mut new_queue: Vec<usize> = Vec::new();

        // First: target chunk to end
        for i in target_chunk..total_chunks {
            if i < state.chunks.len() && state.chunks[i].is_ready {
                continue; // Skip already downloaded
            }
            new_queue.push(i);
        }

        // Then: 0 to target_chunk-1
        for i in 0..target_chunk {
            if i < state.chunks.len() && state.chunks[i].is_ready {
                continue; // Skip already downloaded
            }
            new_queue.push(i);
        }

        println!(
            "[Progressive] Reprioritized download queue for seek to chunk {}: {:?}",
            target_chunk, new_queue
        );

        state.priority_chunk = Some(target_chunk);
        state.download_queue = new_queue.clone();
        state.needs_reprioritize = true;
        state.current_chunk = target_chunk;

        Ok(new_queue)
    }

    /// Get the next chunk to download from the priority queue
    pub fn get_next_download_chunk(&self, track_id: &str) -> Option<usize> {
        let streams = self.progressive_streams.lock().unwrap();
        let state = streams.get(track_id)?;

        // Find first chunk in queue that isn't downloaded yet
        for &chunk_idx in &state.download_queue {
            if chunk_idx >= state.chunks.len() || !state.chunks[chunk_idx].is_ready {
                return Some(chunk_idx);
            }
        }
        None
    }

    /// Download all remaining chunks with 2 concurrent worker threads
    /// Both workers run simultaneously, each continuously grabbing the next available chunk
    pub async fn download_all_chunks_multithreaded(&self, track_id: &str) -> Result<usize, String> {
        use std::sync::atomic::{AtomicUsize, Ordering};
        use tokio::sync::Mutex as TokioMutex;

        let (
            total_chunks,
            init_segment,
            media_urls,
            first_chunk_segments,
            segments_per_chunk,
            total_segments,
        ) = {
            let streams = self.progressive_streams.lock().unwrap();
            let state = streams
                .get(track_id)
                .ok_or_else(|| "No active stream for track".to_string())?;

            let total_chunks = state.total_chunks();
            (
                total_chunks,
                state.init_segment.clone(),
                state.media_urls.clone(),
                state.first_chunk_segments,
                state.segments_per_chunk,
                state.total_segments,
            )
        };

        let init_bytes = init_segment.ok_or_else(|| "Init segment not available".to_string())?;

        let downloaded_count = Arc::new(AtomicUsize::new(0));
        let track_id = track_id.to_string();

        // Shared references for tasks
        let cache_dir = self.cache_dir.clone();
        let client = self.client.clone();
        let progressive_streams = Arc::clone(&self.progressive_streams);

        // Track which chunks are currently being downloaded to avoid duplicates
        let downloading_chunks: Arc<TokioMutex<std::collections::HashSet<usize>>> =
            Arc::new(TokioMutex::new(std::collections::HashSet::new()));

        println!("[Progressive] Starting 2 concurrent download workers");

        // Create 2 worker tasks that will each continuously download chunks
        let mut handles = Vec::new();

        for worker_id in 0..2 {
            let track_id_clone = track_id.clone();
            let init_bytes_clone = init_bytes.clone();
            let media_urls_clone = media_urls.clone();
            let cache_dir_clone = cache_dir.clone();
            let client_clone = client.clone();
            let streams_clone = Arc::clone(&progressive_streams);
            let downloaded_count_clone = Arc::clone(&downloaded_count);
            let downloading_clone = Arc::clone(&downloading_chunks);

            let handle = tokio::spawn(async move {
                loop {
                    // Get next chunk to download
                    let chunk_to_download = {
                        let mut downloading = downloading_clone.lock().await;
                        let streams = streams_clone.lock().unwrap();

                        if let Some(state) = streams.get(&track_id_clone) {
                            // Check if stream was cleaned up or complete
                            if state.is_complete {
                                return;
                            }

                            // Find next undownloaded chunk in queue that's not being downloaded
                            let mut next_chunk = None;
                            for &chunk_idx in &state.download_queue {
                                let is_downloaded = chunk_idx < state.chunks.len()
                                    && state.chunks[chunk_idx].is_ready;
                                let is_being_downloaded = downloading.contains(&chunk_idx);

                                if !is_downloaded && !is_being_downloaded {
                                    next_chunk = Some(chunk_idx);
                                    downloading.insert(chunk_idx);
                                    break;
                                }
                            }
                            next_chunk
                        } else {
                            None
                        }
                    };

                    let Some(chunk_idx) = chunk_to_download else {
                        // No more chunks to download
                        return;
                    };

                    // Calculate segment range based on chunk index (variable first chunk)
                    let (start_segment, end_segment) = if chunk_idx == 0 {
                        (0, std::cmp::min(first_chunk_segments, total_segments))
                    } else {
                        let offset = first_chunk_segments;
                        let chunk_offset = (chunk_idx - 1) * segments_per_chunk;
                        let start = offset + chunk_offset;
                        let end = std::cmp::min(start + segments_per_chunk, total_segments);
                        (start, end)
                    };

                    let segment_urls: Vec<String> =
                        media_urls_clone[start_segment..end_segment].to_vec();

                    println!(
                        "[Progressive] Worker {} downloading chunk {} (segments {}-{})",
                        worker_id,
                        chunk_idx,
                        start_segment + 1,
                        end_segment
                    );

                    // Create temp file for this chunk
                    let temp_path =
                        cache_dir_clone.join(format!("{}_{}.m4a.tmp", track_id_clone, chunk_idx));
                    let chunk_path =
                        cache_dir_clone.join(format!("{}_{}.m4a", track_id_clone, chunk_idx));

                    // Download chunk
                    let result: Result<(), String> = async {
                        let mut temp_file = File::create(&temp_path)
                            .map_err(|e| format!("Failed to create temp file: {}", e))?;

                        // Write init segment
                        temp_file
                            .write_all(&init_bytes_clone)
                            .map_err(|e| format!("Failed to write init segment: {}", e))?;

                        // Download and write media segments
                        for (i, url) in segment_urls.iter().enumerate() {
                            let segment_bytes = client_clone
                                .get(url)
                                .send()
                                .await
                                .map_err(|e| format!("Segment {} request failed: {}", i + 1, e))?
                                .bytes()
                                .await
                                .map_err(|e| format!("Failed to read segment {}: {}", i + 1, e))?;

                            temp_file
                                .write_all(&segment_bytes)
                                .map_err(|e| format!("Failed to write segment {}: {}", i + 1, e))?;
                        }

                        drop(temp_file);

                        // Rename to final path
                        fs::rename(&temp_path, &chunk_path)
                            .map_err(|e| format!("Failed to rename chunk file: {}", e))?;

                        Ok(())
                    }
                    .await;

                    // Remove from downloading set
                    {
                        let mut downloading = downloading_clone.lock().await;
                        downloading.remove(&chunk_idx);
                    }

                    match result {
                        Ok(()) => {
                            // Update state
                            let mut streams = streams_clone.lock().unwrap();
                            if let Some(state) = streams.get_mut(&track_id_clone) {
                                let chunk = StreamChunk {
                                    chunk_index: chunk_idx,
                                    file_path: chunk_path.clone(),
                                    segment_start: start_segment,
                                    segment_end: end_segment,
                                    duration_seconds: (end_segment - start_segment) as f32 * 4.0,
                                    is_ready: true,
                                };

                                // Ensure chunks vec is large enough
                                while state.chunks.len() <= chunk_idx {
                                    state.chunks.push(StreamChunk {
                                        chunk_index: state.chunks.len(),
                                        file_path: PathBuf::new(),
                                        segment_start: 0,
                                        segment_end: 0,
                                        duration_seconds: 0.0,
                                        is_ready: false,
                                    });
                                }
                                state.chunks[chunk_idx] = chunk;

                                // Check if all chunks downloaded
                                let tc = state.total_chunks();
                                let all_downloaded = (0..tc)
                                    .all(|i| i < state.chunks.len() && state.chunks[i].is_ready);
                                if all_downloaded {
                                    state.is_complete = true;
                                }
                            }

                            downloaded_count_clone.fetch_add(1, Ordering::SeqCst);
                            println!(
                                "[Progressive] Worker {} completed chunk {} (M4A)",
                                worker_id, chunk_idx
                            );
                        }
                        Err(e) => {
                            println!(
                                "[Progressive] Worker {} failed chunk {}: {}",
                                worker_id, chunk_idx, e
                            );
                            // Clean up temp file
                            fs::remove_file(&temp_path).ok();
                        }
                    }
                }
            });

            handles.push(handle);
        }

        // Wait for all worker tasks to complete
        for handle in handles {
            let _ = handle.await;
        }

        let final_count = downloaded_count.load(Ordering::SeqCst);

        // Mark stream as complete if all chunks downloaded
        {
            let mut streams = progressive_streams.lock().unwrap();
            if let Some(state) = streams.get_mut(&track_id) {
                let tc = state.total_chunks();
                let all_downloaded =
                    (0..tc).all(|i| i < state.chunks.len() && state.chunks[i].is_ready);
                if all_downloaded {
                    state.is_complete = true;
                    println!("[Progressive] All {} chunks downloaded", total_chunks);
                }
            }
        }

        Ok(final_count)
    }
}

/// Global stream cache instance
lazy_static::lazy_static! {
    pub static ref STREAM_CACHE: StreamCache = StreamCache::new();
}
