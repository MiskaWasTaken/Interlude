// On-demand Hi-Res streaming service
// Integrates with multiple sources: Tidal, Qobuz, Amazon via song.link

use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::sync::RwLock;

// Global storage for Spotify credentials
lazy_static::lazy_static! {
    static ref SPOTIFY_CREDENTIALS: RwLock<Option<SpotifyCredentials>> = RwLock::new(None);
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpotifyCredentials {
    pub client_id: String,
    pub client_secret: String,
}

impl SpotifyCredentials {
    pub fn set_global(creds: Option<SpotifyCredentials>) {
        let mut global = SPOTIFY_CREDENTIALS.write().unwrap();
        *global = creds;
    }

    pub fn get_global() -> Option<SpotifyCredentials> {
        let global = SPOTIFY_CREDENTIALS.read().unwrap();
        global.clone()
    }

    pub fn has_credentials() -> bool {
        let global = SPOTIFY_CREDENTIALS.read().unwrap();
        global.is_some()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamingURLs {
    pub tidal_url: Option<String>,
    pub amazon_url: Option<String>,
    pub qobuz_url: Option<String>,
    pub deezer_url: Option<String>,
    pub youtube_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpotifyTrack {
    pub id: String,
    pub name: String,
    pub artists: Vec<String>,
    pub album: String,
    pub album_id: String,
    pub duration_ms: u64,
    pub track_number: u32,
    pub disc_number: u32,
    pub isrc: Option<String>,
    pub cover_url: Option<String>,
    pub release_date: Option<String>,
    pub is_explicit: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpotifyAlbum {
    pub id: String,
    pub name: String,
    pub artists: Vec<String>,
    pub cover_url: Option<String>,
    pub release_date: Option<String>,
    pub total_tracks: u32,
    pub tracks: Vec<SpotifyTrack>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpotifySearchResult {
    pub tracks: Vec<SpotifyTrack>,
    pub albums: Vec<SpotifyAlbum>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamInfo {
    pub url: String,
    pub quality: StreamQuality,
    pub format: String,
    pub sample_rate: Option<u32>,
    pub bit_depth: Option<u32>,
    pub source: StreamSource,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub enum StreamQuality {
    Standard,      // 16-bit/44.1kHz
    Lossless,      // 16-bit/44.1kHz FLAC
    HiRes,         // 24-bit/96kHz+ FLAC
    HiResLossless, // 24-bit/192kHz FLAC
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub enum StreamSource {
    Tidal,
    Qobuz,
    Amazon,
    Deezer,
}

pub struct StreamingService {
    client: Client,
    prefer_hires: bool,
    service_order: Vec<StreamSource>,
}

impl StreamingService {
    pub fn new() -> Self {
        Self {
            client: Client::builder()
                .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
                .timeout(std::time::Duration::from_secs(30))
                .build()
                .unwrap(),
            prefer_hires: true,
            service_order: vec![StreamSource::Tidal, StreamSource::Qobuz, StreamSource::Amazon],
        }
    }

    pub fn set_prefer_hires(&mut self, prefer: bool) {
        self.prefer_hires = prefer;
    }

    pub fn set_service_order(&mut self, order: Vec<StreamSource>) {
        self.service_order = order;
    }

    /// Get streaming URLs from song.link for a Spotify track
    pub async fn get_streaming_urls(
        &self,
        spotify_track_id: &str,
        region: Option<&str>,
    ) -> Result<StreamingURLs, String> {
        let spotify_url = format!("https://open.spotify.com/track/{}", spotify_track_id);
        let mut api_url = format!(
            "https://api.song.link/v1-alpha.1/links?url={}",
            urlencoding::encode(&spotify_url)
        );

        if let Some(r) = region {
            api_url.push_str(&format!("&userCountry={}", r));
        }

        let response = self
            .client
            .get(&api_url)
            .send()
            .await
            .map_err(|e| format!("Failed to fetch song.link: {}", e))?;

        if response.status() == 429 {
            return Err("Rate limited by song.link API".to_string());
        }

        let data: serde_json::Value = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse song.link response: {}", e))?;

        let links = data.get("linksByPlatform").and_then(|l| l.as_object());

        Ok(StreamingURLs {
            tidal_url: links
                .and_then(|l| l.get("tidal"))
                .and_then(|t| t.get("url"))
                .and_then(|u| u.as_str())
                .map(String::from),
            amazon_url: links
                .and_then(|l| l.get("amazonMusic"))
                .and_then(|t| t.get("url"))
                .and_then(|u| u.as_str())
                .map(String::from),
            qobuz_url: links
                .and_then(|l| l.get("qobuz"))
                .and_then(|t| t.get("url"))
                .and_then(|u| u.as_str())
                .map(String::from),
            deezer_url: links
                .and_then(|l| l.get("deezer"))
                .and_then(|t| t.get("url"))
                .and_then(|u| u.as_str())
                .map(String::from),
            youtube_url: links
                .and_then(|l| l.get("youtube"))
                .and_then(|t| t.get("url"))
                .and_then(|u| u.as_str())
                .map(String::from),
        })
    }

    /// Get a direct stream URL from Tidal
    pub async fn get_tidal_stream(
        &self,
        tidal_url: &str,
        quality: StreamQuality,
    ) -> Result<StreamInfo, String> {
        // Extract track ID from Tidal URL
        let track_id = self.extract_tidal_track_id(tidal_url)?;
        println!("[Tidal] Track ID: {}", track_id);

        let quality_param = match quality {
            StreamQuality::HiRes | StreamQuality::HiResLossless => "HI_RES_LOSSLESS",
            StreamQuality::Lossless => "LOSSLESS",
            StreamQuality::Standard => "HIGH",
        };

        // Try multiple Tidal API endpoints (from SpotiFLAC/hifi-api)
        let apis = vec![
            "https://triton.squid.wtf",
            "https://hifi-one.spotisaver.net",
            "https://hifi-two.spotisaver.net",
            "https://tidal.kinoplus.online",
            "https://tidal-api.binimum.org",
        ];

        let mut last_error = String::new();
        for api_base in apis {
            let api_url = format!(
                "{}/track/?id={}&quality={}",
                api_base, track_id, quality_param
            );
            println!("[Tidal] Trying API: {}", api_url);

            match self.client.get(&api_url).send().await {
                Ok(response) if response.status().is_success() => {
                    let data: serde_json::Value = response
                        .json()
                        .await
                        .map_err(|e| format!("Failed to parse Tidal response: {}", e))?;

                    // Helper function to parse manifest (BTS JSON or DASH XML)
                    fn parse_tidal_manifest(
                        manifest_b64: &str,
                    ) -> Option<(String, Option<u32>, Option<u32>)> {
                        let decoded = BASE64.decode(manifest_b64).ok()?;
                        let manifest_str = String::from_utf8_lossy(&decoded);

                        // Check if it's JSON (BTS format) or XML (DASH format)
                        let trimmed = manifest_str.trim();
                        if trimmed.starts_with('{') {
                            // BTS format - direct JSON with urls array
                            println!("[Tidal] Manifest: BTS format (JSON)");
                            let manifest_json: serde_json::Value =
                                serde_json::from_slice(&decoded).ok()?;

                            if let Some(urls) = manifest_json.get("urls").and_then(|u| u.as_array())
                            {
                                if let Some(url) = urls.first().and_then(|u| u.as_str()) {
                                    // Extract info from manifest
                                    let mime = manifest_json
                                        .get("mimeType")
                                        .and_then(|m| m.as_str())
                                        .unwrap_or("");
                                    let codecs = manifest_json
                                        .get("codecs")
                                        .and_then(|c| c.as_str())
                                        .unwrap_or("");
                                    println!("[Tidal] BTS: mime={}, codecs={}", mime, codecs);
                                    return Some((url.to_string(), None, None));
                                }
                            }
                            None
                        } else if trimmed.starts_with('<') || trimmed.starts_with("<?xml") {
                            // DASH format - XML with segments
                            // For streaming, DASH requires downloading segments + ffmpeg conversion
                            // This is complex for real-time playback, so we'll skip DASH manifests
                            // and try other APIs that return direct URLs
                            println!("[Tidal] Manifest: DASH format (XML) - not suitable for streaming, skipping");
                            println!("[Tidal] DASH manifest requires segment download + ffmpeg conversion");
                            None
                        } else {
                            println!("[Tidal] Unknown manifest format");
                            None
                        }
                    }

                    // Check for V2 response format (nested data.manifest)
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

                        let audio_quality = data
                            .get("data")
                            .and_then(|d| d.get("audioQuality"))
                            .and_then(|q| q.as_str())
                            .unwrap_or("unknown");
                        println!(
                            "[Tidal] V2 response: quality={}, sample_rate={:?}, bit_depth={:?}",
                            audio_quality, sample_rate, bit_depth
                        );

                        if let Some((url, _, _)) = parse_tidal_manifest(manifest) {
                            return Ok(StreamInfo {
                                url,
                                quality,
                                format: "FLAC".to_string(),
                                sample_rate,
                                bit_depth,
                                source: StreamSource::Tidal,
                            });
                        }
                        // DASH manifest - continue to next API
                        last_error = format!("DASH manifest from {} (needs download)", api_base);
                        continue;
                    }

                    // Check for legacy manifest at root level
                    if let Some(manifest) = data.get("manifest").and_then(|m| m.as_str()) {
                        if let Some((url, sr, bd)) = parse_tidal_manifest(manifest) {
                            return Ok(StreamInfo {
                                url,
                                quality,
                                format: "FLAC".to_string(),
                                sample_rate: sr.or(Some(96000)),
                                bit_depth: bd.or(Some(24)),
                                source: StreamSource::Tidal,
                            });
                        }
                        // DASH manifest - continue to next API
                        last_error = format!("DASH manifest from {} (needs download)", api_base);
                        continue;
                    }

                    // Check for V1 array response format with OriginalTrackUrl
                    if let Some(arr) = data.as_array() {
                        for item in arr {
                            if let Some(url) = item.get("OriginalTrackUrl").and_then(|u| u.as_str())
                            {
                                println!("[Tidal] V1 format: direct URL found");
                                return Ok(StreamInfo {
                                    url: url.to_string(),
                                    quality,
                                    format: "FLAC".to_string(),
                                    sample_rate: None,
                                    bit_depth: None,
                                    source: StreamSource::Tidal,
                                });
                            }
                        }
                    }

                    // Check for direct URL response
                    if let Some(url) = data.get("url").and_then(|u| u.as_str()) {
                        let sample_rate = data
                            .get("sampleRate")
                            .and_then(|s| s.as_u64())
                            .map(|s| s as u32);
                        let bit_depth = data
                            .get("bitDepth")
                            .and_then(|b| b.as_u64())
                            .map(|b| b as u32);

                        println!("[Tidal] Direct URL format");
                        return Ok(StreamInfo {
                            url: url.to_string(),
                            quality,
                            format: data
                                .get("codec")
                                .and_then(|c| c.as_str())
                                .unwrap_or("FLAC")
                                .to_string(),
                            sample_rate,
                            bit_depth,
                            source: StreamSource::Tidal,
                        });
                    }
                    println!("[Tidal] No valid URL found in response from {}", api_base);
                    last_error = format!("No valid URL in response from {}", api_base);
                }
                Ok(response) => {
                    println!(
                        "[Tidal] API {} returned status: {}",
                        api_base,
                        response.status()
                    );
                    last_error = format!("HTTP {} from {}", response.status(), api_base);
                }
                Err(e) => {
                    println!("[Tidal] API {} request failed: {}", api_base, e);
                    last_error = format!("Request failed for {}: {}", api_base, e);
                }
            }
        }

        Err(format!(
            "Failed to get Tidal stream from all APIs. Last error: {}",
            last_error
        ))
    }

    /// Get a direct stream URL from Qobuz
    pub async fn get_qobuz_stream(
        &self,
        isrc: &str,
        quality: StreamQuality,
    ) -> Result<StreamInfo, String> {
        // First search for the track by ISRC (with app_id like SpotiFLAC)
        let search_url = format!(
            "https://www.qobuz.com/api.json/0.2/track/search?query={}&limit=1&app_id=798273057",
            urlencoding::encode(isrc)
        );
        println!("[Qobuz] Searching with ISRC: {}", isrc);

        let search_response = self
            .client
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

        println!("[Qobuz] Found track ID: {}", track_id);

        let quality_code = match quality {
            StreamQuality::HiRes | StreamQuality::HiResLossless => "7", // Hi-Res (24-bit)
            StreamQuality::Lossless => "6",                             // CD quality (16-bit)
            StreamQuality::Standard => "5",
        };

        // Try multiple Qobuz stream APIs (from SpotiFLAC)
        // Note: jumo-dl uses format_id not quality, and a different URL structure
        let apis = vec![
            format!(
                "https://dab.yeet.su/api/stream?trackId={}&quality={}",
                track_id, quality_code
            ),
            format!(
                "https://dabmusic.xyz/api/stream?trackId={}&quality={}",
                track_id, quality_code
            ),
            format!(
                "https://qobuz.squid.wtf/api/download-music?track_id={}&quality={}",
                track_id, quality_code
            ),
            // Jumo-DL uses different URL format: /file?track_id=&format_id=&region=
            format!(
                "https://jumo-dl.pages.dev/file?track_id={}&format_id={}&region=US",
                track_id, quality_code
            ),
        ];

        let mut last_error = String::new();
        for api_url in &apis {
            println!("[Qobuz] Trying API: {}", api_url);
            match self.client.get(api_url).send().await {
                Ok(response) if response.status().is_success() => {
                    // Try to get response as text first for debugging
                    let text = response
                        .text()
                        .await
                        .map_err(|e| format!("Failed to read Qobuz response: {}", e))?;

                    // Try to parse as JSON
                    let data: serde_json::Value = match serde_json::from_str(&text) {
                        Ok(d) => d,
                        Err(_) => {
                            // Jumo-DL may return XOR-encoded response, try to detect
                            println!("[Qobuz] Response not JSON, might be XOR encoded");
                            last_error = "Response not valid JSON".to_string();
                            continue;
                        }
                    };

                    // Check various response formats
                    // Standard format: {"url": "..."}
                    if let Some(url) = data.get("url").and_then(|u| u.as_str()) {
                        if !url.is_empty() {
                            println!("[Qobuz] Got stream URL from standard format");
                            return Ok(StreamInfo {
                                url: url.to_string(),
                                quality,
                                format: "FLAC".to_string(),
                                sample_rate: data
                                    .get("sampling_rate")
                                    .and_then(|s| s.as_f64())
                                    .map(|s| (s * 1000.0) as u32),
                                bit_depth: data
                                    .get("bit_depth")
                                    .and_then(|b| b.as_u64())
                                    .map(|b| b as u32),
                                source: StreamSource::Qobuz,
                            });
                        }
                    }

                    // Jumo format: {"data": {"url": "..."}} or {"link": "..."}
                    if let Some(nested_url) = data
                        .get("data")
                        .and_then(|d| d.get("url"))
                        .and_then(|u| u.as_str())
                    {
                        if !nested_url.is_empty() {
                            println!("[Qobuz] Got stream URL from nested data format");
                            return Ok(StreamInfo {
                                url: nested_url.to_string(),
                                quality,
                                format: "FLAC".to_string(),
                                sample_rate: None,
                                bit_depth: None,
                                source: StreamSource::Qobuz,
                            });
                        }
                    }

                    if let Some(link) = data.get("link").and_then(|l| l.as_str()) {
                        if !link.is_empty() {
                            println!("[Qobuz] Got stream URL from link format");
                            return Ok(StreamInfo {
                                url: link.to_string(),
                                quality,
                                format: "FLAC".to_string(),
                                sample_rate: None,
                                bit_depth: None,
                                source: StreamSource::Qobuz,
                            });
                        }
                    }

                    last_error = "No URL found in response".to_string();
                }
                Ok(response) => {
                    println!("[Qobuz] API returned status: {}", response.status());
                    last_error = format!("HTTP {}", response.status());
                }
                Err(e) => {
                    println!("[Qobuz] API request failed: {}", e);
                    last_error = format!("Request failed: {}", e);
                }
            }
        }

        Err(format!(
            "Failed to get Qobuz stream from all APIs. Last error: {}",
            last_error
        ))
    }

    /// Get a direct stream URL from Amazon Music
    pub async fn get_amazon_stream(&self, amazon_url: &str) -> Result<StreamInfo, String> {
        println!("[Amazon] Fetching stream for URL: {}", amazon_url);
        let api_url = format!(
            "https://amazon.afkarxyz.fun/convert?url={}",
            urlencoding::encode(amazon_url)
        );
        println!("[Amazon] API URL: {}", api_url);

        let response = self
            .client
            .get(&api_url)
            .send()
            .await
            .map_err(|e| format!("Amazon API failed: {}", e))?;

        let status = response.status();
        println!("[Amazon] Response status: {}", status);

        let data: serde_json::Value = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse Amazon response: {}", e))?;

        let success = data
            .get("success")
            .and_then(|s| s.as_bool())
            .unwrap_or(false);
        if !success {
            let error_msg = data
                .get("error")
                .and_then(|e| e.as_str())
                .unwrap_or("Unknown error");
            println!("[Amazon] API returned failure: {}", error_msg);
            return Err(format!("Amazon API returned failure: {}", error_msg));
        }

        let direct_link = data
            .get("data")
            .and_then(|d| d.get("direct_link"))
            .and_then(|l| l.as_str())
            .ok_or_else(|| "No direct link in Amazon response".to_string())?;

        println!("[Amazon] Got direct link successfully");
        Ok(StreamInfo {
            url: direct_link.to_string(),
            quality: StreamQuality::Lossless, // Amazon usually provides CD quality
            format: "FLAC".to_string(),
            sample_rate: Some(44100),
            bit_depth: Some(16),
            source: StreamSource::Amazon,
        })
    }

    /// Get the best available stream for a Spotify track
    /// ALWAYS uses highest quality (HI_RES_LOSSLESS / 24-bit) - never falls back to lower quality
    pub async fn get_best_stream(
        &self,
        spotify_track_id: &str,
        isrc: Option<&str>,
        region: Option<&str>,
    ) -> Result<StreamInfo, String> {
        // Get streaming URLs from song.link
        let urls = self.get_streaming_urls(spotify_track_id, region).await?;

        // ALWAYS use highest quality - HiResLossless (24-bit/96kHz+)
        let quality = StreamQuality::HiResLossless;

        // Try services in order
        for source in &self.service_order {
            match source {
                StreamSource::Tidal => {
                    if let Some(ref tidal_url) = urls.tidal_url {
                        match self.get_tidal_stream(tidal_url, quality).await {
                            Ok(stream) => return Ok(stream),
                            Err(e) => eprintln!("Tidal failed: {}", e),
                        }
                    }
                }
                StreamSource::Qobuz => {
                    if let Some(isrc) = isrc {
                        match self.get_qobuz_stream(isrc, quality).await {
                            Ok(stream) => return Ok(stream),
                            Err(e) => eprintln!("Qobuz failed: {}", e),
                        }
                    }
                }
                StreamSource::Amazon => {
                    if let Some(ref amazon_url) = urls.amazon_url {
                        match self.get_amazon_stream(amazon_url).await {
                            Ok(stream) => return Ok(stream),
                            Err(e) => eprintln!("Amazon failed: {}", e),
                        }
                    }
                }
                StreamSource::Deezer => {
                    // Deezer support could be added here
                    continue;
                }
            }
        }

        Err("No streaming source available for this track".to_string())
    }

    /// Search Spotify for tracks
    pub async fn search_spotify(
        &self,
        query: &str,
        limit: u32,
    ) -> Result<SpotifySearchResult, String> {
        // If user has Spotify credentials, always try Spotify first
        if SpotifyCredentials::has_credentials() {
            match self.search_spotify_api(query, limit).await {
                Ok(results) => return Ok(results),
                Err(spotify_err) => {
                    eprintln!(
                        "Spotify search failed with user credentials: {}, trying Deezer...",
                        spotify_err
                    );
                    // Fall back to Deezer if Spotify fails
                    return self.search_deezer_fallback(query, limit).await;
                }
            }
        }

        // No credentials - try Deezer first (more reliable without auth)
        match self.search_deezer_fallback(query, limit).await {
            Ok(results) => Ok(results),
            Err(deezer_err) => {
                eprintln!("Deezer search failed: {}", deezer_err);
                // As last resort, try Spotify's web player token (unreliable)
                self.search_spotify_api(query, limit).await
            }
        }
    }

    async fn search_spotify_api(
        &self,
        query: &str,
        limit: u32,
    ) -> Result<SpotifySearchResult, String> {
        // Use Spotify's public search endpoint
        let search_url = format!(
            "https://api.spotify.com/v1/search?q={}&type=track,album&limit={}",
            urlencoding::encode(query),
            limit
        );

        // Get access token first
        let token = self.get_spotify_token().await?;

        let response = self
            .client
            .get(&search_url)
            .header("Authorization", format!("Bearer {}", token))
            .send()
            .await
            .map_err(|e| format!("Spotify search failed: {}", e))?;

        if !response.status().is_success() {
            return Err(format!(
                "Spotify API returned status: {}",
                response.status()
            ));
        }

        let data: serde_json::Value = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse Spotify response: {}", e))?;

        let tracks = self.parse_spotify_tracks(&data);
        let albums = self.parse_spotify_albums(&data);

        Ok(SpotifySearchResult { tracks, albums })
    }

    /// Fallback search using Deezer's public API
    async fn search_deezer_fallback(
        &self,
        query: &str,
        limit: u32,
    ) -> Result<SpotifySearchResult, String> {
        let search_url = format!(
            "https://api.deezer.com/search?q={}&limit={}",
            urlencoding::encode(query),
            limit
        );

        let response = self
            .client
            .get(&search_url)
            .send()
            .await
            .map_err(|e| format!("Deezer search failed: {}", e))?;

        let data: serde_json::Value = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse Deezer response: {}", e))?;

        let mut tracks = Vec::new();
        let mut albums_map = std::collections::HashMap::new();

        if let Some(items) = data.get("data").and_then(|d| d.as_array()) {
            for item in items {
                // Parse track
                let id = item
                    .get("id")
                    .and_then(|i| i.as_u64())
                    .map(|i| i.to_string())
                    .unwrap_or_default();
                let name = item
                    .get("title")
                    .and_then(|t| t.as_str())
                    .unwrap_or("")
                    .to_string();
                let artist_name = item
                    .get("artist")
                    .and_then(|a| a.get("name"))
                    .and_then(|n| n.as_str())
                    .unwrap_or("")
                    .to_string();
                let album_name = item
                    .get("album")
                    .and_then(|a| a.get("title"))
                    .and_then(|t| t.as_str())
                    .unwrap_or("")
                    .to_string();
                let album_id = item
                    .get("album")
                    .and_then(|a| a.get("id"))
                    .and_then(|i| i.as_u64())
                    .map(|i| i.to_string())
                    .unwrap_or_default();
                let cover_url = item
                    .get("album")
                    .and_then(|a| a.get("cover_big"))
                    .and_then(|c| c.as_str())
                    .map(String::from);
                let duration_ms = item.get("duration").and_then(|d| d.as_u64()).unwrap_or(0) * 1000;
                let is_explicit = item
                    .get("explicit_lyrics")
                    .and_then(|e| e.as_bool())
                    .unwrap_or(false);

                // Deezer provides ISRC in some responses
                let isrc = item.get("isrc").and_then(|i| i.as_str()).map(String::from);

                tracks.push(SpotifyTrack {
                    id: format!("deezer:{}", id), // Prefix with deezer: to identify source
                    name,
                    artists: vec![artist_name.clone()],
                    album: album_name.clone(),
                    album_id: format!("deezer:{}", album_id),
                    duration_ms,
                    track_number: 1,
                    disc_number: 1,
                    isrc,
                    cover_url: cover_url.clone(),
                    release_date: None,
                    is_explicit,
                });

                // Collect unique albums
                if !album_id.is_empty() && !albums_map.contains_key(&album_id) {
                    let album_cover = item
                        .get("album")
                        .and_then(|a| a.get("cover_xl"))
                        .and_then(|c| c.as_str())
                        .map(String::from);
                    albums_map.insert(
                        album_id.clone(),
                        SpotifyAlbum {
                            id: format!("deezer:{}", album_id),
                            name: album_name,
                            artists: vec![artist_name],
                            cover_url: album_cover.or(cover_url),
                            release_date: None,
                            total_tracks: 0,
                            tracks: vec![],
                        },
                    );
                }
            }
        }

        let albums: Vec<SpotifyAlbum> = albums_map.into_values().take(5).collect();

        Ok(SpotifySearchResult { tracks, albums })
    }

    /// Get Spotify track metadata by ID
    pub async fn get_spotify_track(&self, track_id: &str) -> Result<SpotifyTrack, String> {
        let token = self.get_spotify_token().await?;

        let url = format!("https://api.spotify.com/v1/tracks/{}", track_id);

        let response = self
            .client
            .get(&url)
            .header("Authorization", format!("Bearer {}", token))
            .send()
            .await
            .map_err(|e| format!("Failed to fetch track: {}", e))?;

        let data: serde_json::Value = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse track: {}", e))?;

        self.parse_single_track(&data)
    }

    /// Get Spotify album with all tracks
    pub async fn get_spotify_album(&self, album_id: &str) -> Result<SpotifyAlbum, String> {
        let token = self.get_spotify_token().await?;

        let url = format!("https://api.spotify.com/v1/albums/{}", album_id);

        let response = self
            .client
            .get(&url)
            .header("Authorization", format!("Bearer {}", token))
            .send()
            .await
            .map_err(|e| format!("Failed to fetch album: {}", e))?;

        let data: serde_json::Value = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse album: {}", e))?;

        self.parse_single_album(&data)
    }

    // Helper methods

    async fn get_spotify_token(&self) -> Result<String, String> {
        // Method 1: Use user-provided Spotify credentials (preferred)
        if let Some(creds) = SpotifyCredentials::get_global() {
            let auth = format!("{}:{}", creds.client_id, creds.client_secret);
            let auth_header = format!("Basic {}", BASE64.encode(auth.as_bytes()));

            let response = self
                .client
                .post("https://accounts.spotify.com/api/token")
                .header("Authorization", &auth_header)
                .header("Content-Type", "application/x-www-form-urlencoded")
                .body("grant_type=client_credentials")
                .send()
                .await;

            if let Ok(resp) = response {
                if let Ok(data) = resp.json::<serde_json::Value>().await {
                    if let Some(token) = data.get("access_token").and_then(|t| t.as_str()) {
                        return Ok(token.to_string());
                    }
                    // Check for error message
                    if let Some(error) = data.get("error_description").and_then(|e| e.as_str()) {
                        return Err(format!("Spotify API error: {}", error));
                    }
                }
            }
        }

        // Method 2: Try Spotify's open web player token endpoint (fallback, less reliable)
        let response = self
            .client
            .get(
                "https://open.spotify.com/get_access_token?reason=transport&productType=web_player",
            )
            .header("Accept", "application/json")
            .send()
            .await;

        if let Ok(resp) = response {
            if let Ok(data) = resp.json::<serde_json::Value>().await {
                if let Some(token) = data.get("accessToken").and_then(|t| t.as_str()) {
                    return Ok(token.to_string());
                }
            }
        }

        // If no credentials are set, provide a helpful error
        if !SpotifyCredentials::has_credentials() {
            return Err(
                "Spotify credentials not configured. Please add your Spotify API credentials in Settings.".to_string()
            );
        }

        Err(
            "Failed to get Spotify access token. Please check your credentials in Settings."
                .to_string(),
        )
    }

    fn extract_tidal_track_id(&self, url: &str) -> Result<i64, String> {
        // Extract track ID from URLs like:
        // https://tidal.com/browse/track/123456789
        // https://listen.tidal.com/track/123456789
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

    fn parse_spotify_tracks(&self, data: &serde_json::Value) -> Vec<SpotifyTrack> {
        let mut tracks = Vec::new();

        if let Some(items) = data
            .get("tracks")
            .and_then(|t| t.get("items"))
            .and_then(|i| i.as_array())
        {
            for item in items {
                if let Ok(track) = self.parse_single_track(item) {
                    tracks.push(track);
                }
            }
        }

        tracks
    }

    fn parse_spotify_albums(&self, data: &serde_json::Value) -> Vec<SpotifyAlbum> {
        let mut albums = Vec::new();

        if let Some(items) = data
            .get("albums")
            .and_then(|a| a.get("items"))
            .and_then(|i| i.as_array())
        {
            for item in items {
                if let Ok(album) = self.parse_single_album(item) {
                    albums.push(album);
                }
            }
        }

        albums
    }

    fn parse_single_track(&self, data: &serde_json::Value) -> Result<SpotifyTrack, String> {
        let id = data
            .get("id")
            .and_then(|i| i.as_str())
            .ok_or("Missing track ID")?;
        let name = data
            .get("name")
            .and_then(|n| n.as_str())
            .ok_or("Missing track name")?;

        let artists: Vec<String> = data
            .get("artists")
            .and_then(|a| a.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|a| a.get("name").and_then(|n| n.as_str()))
                    .map(String::from)
                    .collect()
            })
            .unwrap_or_default();

        let album = data
            .get("album")
            .and_then(|a| a.get("name"))
            .and_then(|n| n.as_str())
            .unwrap_or("")
            .to_string();

        let album_id = data
            .get("album")
            .and_then(|a| a.get("id"))
            .and_then(|i| i.as_str())
            .unwrap_or("")
            .to_string();

        let cover_url = data
            .get("album")
            .and_then(|a| a.get("images"))
            .and_then(|i| i.as_array())
            .and_then(|arr| arr.first())
            .and_then(|img| img.get("url"))
            .and_then(|u| u.as_str())
            .map(String::from);

        Ok(SpotifyTrack {
            id: id.to_string(),
            name: name.to_string(),
            artists,
            album,
            album_id,
            duration_ms: data
                .get("duration_ms")
                .and_then(|d| d.as_u64())
                .unwrap_or(0),
            track_number: data
                .get("track_number")
                .and_then(|t| t.as_u64())
                .unwrap_or(1) as u32,
            disc_number: data
                .get("disc_number")
                .and_then(|d| d.as_u64())
                .unwrap_or(1) as u32,
            isrc: data
                .get("external_ids")
                .and_then(|e| e.get("isrc"))
                .and_then(|i| i.as_str())
                .map(String::from),
            cover_url,
            release_date: data
                .get("album")
                .and_then(|a| a.get("release_date"))
                .and_then(|r| r.as_str())
                .map(String::from),
            is_explicit: data
                .get("explicit")
                .and_then(|e| e.as_bool())
                .unwrap_or(false),
        })
    }

    fn parse_single_album(&self, data: &serde_json::Value) -> Result<SpotifyAlbum, String> {
        let id = data
            .get("id")
            .and_then(|i| i.as_str())
            .ok_or("Missing album ID")?;
        let name = data
            .get("name")
            .and_then(|n| n.as_str())
            .ok_or("Missing album name")?;

        let artists: Vec<String> = data
            .get("artists")
            .and_then(|a| a.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|a| a.get("name").and_then(|n| n.as_str()))
                    .map(String::from)
                    .collect()
            })
            .unwrap_or_default();

        let cover_url = data
            .get("images")
            .and_then(|i| i.as_array())
            .and_then(|arr| arr.first())
            .and_then(|img| img.get("url"))
            .and_then(|u| u.as_str())
            .map(String::from);

        let tracks = data
            .get("tracks")
            .and_then(|t| t.get("items"))
            .and_then(|i| i.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|t| self.parse_single_track(t).ok())
                    .collect()
            })
            .unwrap_or_default();

        Ok(SpotifyAlbum {
            id: id.to_string(),
            name: name.to_string(),
            artists,
            cover_url,
            release_date: data
                .get("release_date")
                .and_then(|r| r.as_str())
                .map(String::from),
            total_tracks: data
                .get("total_tracks")
                .and_then(|t| t.as_u64())
                .unwrap_or(0) as u32,
            tracks,
        })
    }
}

impl Default for StreamingService {
    fn default() -> Self {
        Self::new()
    }
}
