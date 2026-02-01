// On-demand Hi-Res streaming service
// Integrates with multiple sources: Tidal, Qobuz, Amazon via song.link

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use reqwest::Client;
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};

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
    pub async fn get_streaming_urls(&self, spotify_track_id: &str, region: Option<&str>) -> Result<StreamingURLs, String> {
        let spotify_url = format!("https://open.spotify.com/track/{}", spotify_track_id);
        let mut api_url = format!(
            "https://api.song.link/v1-alpha.1/links?url={}",
            urlencoding::encode(&spotify_url)
        );
        
        if let Some(r) = region {
            api_url.push_str(&format!("&userCountry={}", r));
        }

        let response = self.client
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
    pub async fn get_tidal_stream(&self, tidal_url: &str, quality: StreamQuality) -> Result<StreamInfo, String> {
        // Extract track ID from Tidal URL
        let track_id = self.extract_tidal_track_id(tidal_url)?;
        
        let quality_param = match quality {
            StreamQuality::HiRes | StreamQuality::HiResLossless => "HI_RES_LOSSLESS",
            StreamQuality::Lossless => "LOSSLESS",
            StreamQuality::Standard => "HIGH",
        };

        // Try multiple Tidal API endpoints (from hifi-api)
        let apis = vec![
            "https://tidal.401658.xyz",
            "https://tidal.cidfrxm.workers.dev",
        ];

        for api_base in apis {
            let api_url = format!("{}/track?id={}&quality={}", api_base, track_id, quality_param);
            
            match self.client.get(&api_url).send().await {
                Ok(response) if response.status().is_success() => {
                    let data: serde_json::Value = response.json().await
                        .map_err(|e| format!("Failed to parse Tidal response: {}", e))?;

                    // Check for manifest-based response (BTS format)
                    if let Some(manifest) = data.get("manifest").and_then(|m| m.as_str()) {
                        let decoded = BASE64.decode(manifest)
                            .map_err(|e| format!("Failed to decode manifest: {}", e))?;
                        let manifest_json: serde_json::Value = serde_json::from_slice(&decoded)
                            .map_err(|e| format!("Failed to parse manifest: {}", e))?;
                        
                        if let Some(urls) = manifest_json.get("urls").and_then(|u| u.as_array()) {
                            if let Some(url) = urls.first().and_then(|u| u.as_str()) {
                                return Ok(StreamInfo {
                                    url: url.to_string(),
                                    quality,
                                    format: "FLAC".to_string(),
                                    sample_rate: Some(96000),
                                    bit_depth: Some(24),
                                    source: StreamSource::Tidal,
                                });
                            }
                        }
                    }

                    // Check for direct URL response
                    if let Some(url) = data.get("url").and_then(|u| u.as_str()) {
                        let sample_rate = data.get("sampleRate").and_then(|s| s.as_u64()).map(|s| s as u32);
                        let bit_depth = data.get("bitDepth").and_then(|b| b.as_u64()).map(|b| b as u32);
                        
                        return Ok(StreamInfo {
                            url: url.to_string(),
                            quality,
                            format: data.get("codec").and_then(|c| c.as_str()).unwrap_or("FLAC").to_string(),
                            sample_rate,
                            bit_depth,
                            source: StreamSource::Tidal,
                        });
                    }
                }
                _ => continue,
            }
        }

        Err("Failed to get Tidal stream from all APIs".to_string())
    }

    /// Get a direct stream URL from Qobuz
    pub async fn get_qobuz_stream(&self, isrc: &str, quality: StreamQuality) -> Result<StreamInfo, String> {
        // First search for the track by ISRC
        let search_url = format!(
            "https://www.qobuz.com/api.json/0.2/track/search?query={}&limit=1",
            urlencoding::encode(isrc)
        );

        let search_response = self.client.get(&search_url).send().await
            .map_err(|e| format!("Qobuz search failed: {}", e))?;
        
        let search_data: serde_json::Value = search_response.json().await
            .map_err(|e| format!("Failed to parse Qobuz search: {}", e))?;

        let track_id = search_data
            .get("tracks")
            .and_then(|t| t.get("items"))
            .and_then(|i| i.as_array())
            .and_then(|a| a.first())
            .and_then(|t| t.get("id"))
            .and_then(|id| id.as_i64())
            .ok_or_else(|| "Track not found on Qobuz".to_string())?;

        let quality_code = match quality {
            StreamQuality::HiRes | StreamQuality::HiResLossless => "27", // Max quality
            StreamQuality::Lossless => "6",
            StreamQuality::Standard => "5",
        };

        // Try multiple Qobuz stream APIs
        let apis = vec![
            format!("https://dab.yeet.su/api/stream?trackId={}&quality={}", track_id, quality_code),
            format!("https://dabmusic.xyz/api/stream?trackId={}&quality={}", track_id, quality_code),
            format!("https://qobuz.squid.wtf/api/download-music?track_id={}&quality={}", track_id, quality_code),
        ];

        for api_url in apis {
            match self.client.get(&api_url).send().await {
                Ok(response) if response.status().is_success() => {
                    let data: serde_json::Value = response.json().await
                        .map_err(|e| format!("Failed to parse Qobuz response: {}", e))?;

                    if let Some(url) = data.get("url").and_then(|u| u.as_str()) {
                        return Ok(StreamInfo {
                            url: url.to_string(),
                            quality,
                            format: "FLAC".to_string(),
                            sample_rate: data.get("sampling_rate").and_then(|s| s.as_f64()).map(|s| (s * 1000.0) as u32),
                            bit_depth: data.get("bit_depth").and_then(|b| b.as_u64()).map(|b| b as u32),
                            source: StreamSource::Qobuz,
                        });
                    }
                }
                _ => continue,
            }
        }

        Err("Failed to get Qobuz stream from all APIs".to_string())
    }

    /// Get a direct stream URL from Amazon Music
    pub async fn get_amazon_stream(&self, amazon_url: &str) -> Result<StreamInfo, String> {
        let api_url = format!(
            "https://amazon.afkarxyz.fun/convert?url={}",
            urlencoding::encode(amazon_url)
        );

        let response = self.client.get(&api_url).send().await
            .map_err(|e| format!("Amazon API failed: {}", e))?;

        let data: serde_json::Value = response.json().await
            .map_err(|e| format!("Failed to parse Amazon response: {}", e))?;

        let success = data.get("success").and_then(|s| s.as_bool()).unwrap_or(false);
        if !success {
            return Err("Amazon API returned failure".to_string());
        }

        let direct_link = data
            .get("data")
            .and_then(|d| d.get("direct_link"))
            .and_then(|l| l.as_str())
            .ok_or_else(|| "No direct link in Amazon response".to_string())?;

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
    pub async fn get_best_stream(
        &self,
        spotify_track_id: &str,
        isrc: Option<&str>,
        region: Option<&str>,
    ) -> Result<StreamInfo, String> {
        // Get streaming URLs from song.link
        let urls = self.get_streaming_urls(spotify_track_id, region).await?;
        
        let quality = if self.prefer_hires {
            StreamQuality::HiResLossless
        } else {
            StreamQuality::Lossless
        };

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
    pub async fn search_spotify(&self, query: &str, limit: u32) -> Result<SpotifySearchResult, String> {
        // Use Spotify's public search endpoint
        let search_url = format!(
            "https://api.spotify.com/v1/search?q={}&type=track,album&limit={}",
            urlencoding::encode(query),
            limit
        );

        // Get access token first
        let token = self.get_spotify_token().await?;

        let response = self.client
            .get(&search_url)
            .header("Authorization", format!("Bearer {}", token))
            .send()
            .await
            .map_err(|e| format!("Spotify search failed: {}", e))?;

        let data: serde_json::Value = response.json().await
            .map_err(|e| format!("Failed to parse Spotify response: {}", e))?;

        let tracks = self.parse_spotify_tracks(&data);
        let albums = self.parse_spotify_albums(&data);

        Ok(SpotifySearchResult { tracks, albums })
    }

    /// Get Spotify track metadata by ID
    pub async fn get_spotify_track(&self, track_id: &str) -> Result<SpotifyTrack, String> {
        let token = self.get_spotify_token().await?;
        
        let url = format!("https://api.spotify.com/v1/tracks/{}", track_id);
        
        let response = self.client
            .get(&url)
            .header("Authorization", format!("Bearer {}", token))
            .send()
            .await
            .map_err(|e| format!("Failed to fetch track: {}", e))?;

        let data: serde_json::Value = response.json().await
            .map_err(|e| format!("Failed to parse track: {}", e))?;

        self.parse_single_track(&data)
    }

    /// Get Spotify album with all tracks
    pub async fn get_spotify_album(&self, album_id: &str) -> Result<SpotifyAlbum, String> {
        let token = self.get_spotify_token().await?;
        
        let url = format!("https://api.spotify.com/v1/albums/{}", album_id);
        
        let response = self.client
            .get(&url)
            .header("Authorization", format!("Bearer {}", token))
            .send()
            .await
            .map_err(|e| format!("Failed to fetch album: {}", e))?;

        let data: serde_json::Value = response.json().await
            .map_err(|e| format!("Failed to parse album: {}", e))?;

        self.parse_single_album(&data)
    }

    // Helper methods

    async fn get_spotify_token(&self) -> Result<String, String> {
        // Get anonymous token from Spotify's open endpoint
        let response = self.client
            .get("https://open.spotify.com/get_access_token?reason=transport&productType=web_player")
            .send()
            .await
            .map_err(|e| format!("Failed to get Spotify token: {}", e))?;

        let data: serde_json::Value = response.json().await
            .map_err(|e| format!("Failed to parse token response: {}", e))?;

        data.get("accessToken")
            .and_then(|t| t.as_str())
            .map(String::from)
            .ok_or_else(|| "No access token in response".to_string())
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
        
        if let Some(items) = data.get("tracks").and_then(|t| t.get("items")).and_then(|i| i.as_array()) {
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
        
        if let Some(items) = data.get("albums").and_then(|a| a.get("items")).and_then(|i| i.as_array()) {
            for item in items {
                if let Ok(album) = self.parse_single_album(item) {
                    albums.push(album);
                }
            }
        }
        
        albums
    }

    fn parse_single_track(&self, data: &serde_json::Value) -> Result<SpotifyTrack, String> {
        let id = data.get("id").and_then(|i| i.as_str()).ok_or("Missing track ID")?;
        let name = data.get("name").and_then(|n| n.as_str()).ok_or("Missing track name")?;
        
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
            duration_ms: data.get("duration_ms").and_then(|d| d.as_u64()).unwrap_or(0),
            track_number: data.get("track_number").and_then(|t| t.as_u64()).unwrap_or(1) as u32,
            disc_number: data.get("disc_number").and_then(|d| d.as_u64()).unwrap_or(1) as u32,
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
            is_explicit: data.get("explicit").and_then(|e| e.as_bool()).unwrap_or(false),
        })
    }

    fn parse_single_album(&self, data: &serde_json::Value) -> Result<SpotifyAlbum, String> {
        let id = data.get("id").and_then(|i| i.as_str()).ok_or("Missing album ID")?;
        let name = data.get("name").and_then(|n| n.as_str()).ok_or("Missing album name")?;

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
            release_date: data.get("release_date").and_then(|r| r.as_str()).map(String::from),
            total_tracks: data.get("total_tracks").and_then(|t| t.as_u64()).unwrap_or(0) as u32,
            tracks,
        })
    }
}

impl Default for StreamingService {
    fn default() -> Self {
        Self::new()
    }
}
