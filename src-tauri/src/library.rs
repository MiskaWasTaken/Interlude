//! Library Scanner Module
//! Scans folders for audio files and extracts metadata

use crate::database::Track;
use lofty::{Accessor, AudioFile, Probe, TaggedFileExt};
use std::path::{Path, PathBuf};
use walkdir::WalkDir;
use blake3::Hasher;
use std::fs::File;
use std::io::Read;

const SUPPORTED_EXTENSIONS: &[&str] = &["flac", "wav", "alac", "m4a", "aiff", "aif", "mp3", "ogg", "opus"];

pub struct LibraryScanner {
    scanning: bool,
}

impl LibraryScanner {
    pub fn new() -> Self {
        Self { scanning: false }
    }

    pub fn is_scanning(&self) -> bool {
        self.scanning
    }

    pub fn scan_folder(&mut self, folder_path: &Path) -> Vec<Track> {
        self.scanning = true;
        let mut tracks = Vec::new();

        for entry in WalkDir::new(folder_path)
            .follow_links(true)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            let path = entry.path();
            
            if !path.is_file() {
                continue;
            }

            let extension = path
                .extension()
                .and_then(|e| e.to_str())
                .map(|e| e.to_lowercase());

            if let Some(ext) = extension {
                if SUPPORTED_EXTENSIONS.contains(&ext.as_str()) {
                    if let Some(track) = self.extract_metadata(path) {
                        tracks.push(track);
                    }
                }
            }
        }

        self.scanning = false;
        tracks
    }

    fn extract_metadata(&self, path: &Path) -> Option<Track> {
        let tagged_file = Probe::open(path).ok()?.read().ok()?;
        
        let properties = tagged_file.properties();
        let tag = tagged_file.primary_tag()
            .or_else(|| tagged_file.first_tag());

        let file_path = path.to_string_lossy().to_string();
        let file_hash = self.compute_file_hash(path).unwrap_or_default();
        
        // Get file metadata
        let metadata = std::fs::metadata(path).ok()?;
        let file_size = metadata.len() as i64;

        // Extract format
        let format = path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_uppercase())
            .unwrap_or_else(|| "UNKNOWN".to_string());

        // Extract audio properties
        let duration = properties.duration().as_secs_f64();
        let sample_rate = properties.sample_rate().unwrap_or(44100) as i32;
        let bit_depth = properties.bit_depth().unwrap_or(16) as i32;
        let channels = properties.channels().unwrap_or(2) as i32;

        // Extract tags
        let (title, artist, album, album_artist, track_number, disc_number, year, genre) = 
            if let Some(tag) = tag {
                (
                    tag.title().map(|s| s.to_string()).unwrap_or_else(|| {
                        path.file_stem()
                            .and_then(|s| s.to_str())
                            .unwrap_or("Unknown")
                            .to_string()
                    }),
                    tag.artist().map(|s| s.to_string()).unwrap_or_else(|| "Unknown Artist".to_string()),
                    tag.album().map(|s| s.to_string()).unwrap_or_else(|| "Unknown Album".to_string()),
                    None, // Album artist requires specific tag access
                    tag.track().map(|t| t as i32),
                    tag.disk().map(|d| d as i32),
                    tag.year().map(|y| y as i32),
                    tag.genre().map(|g| g.to_string()),
                )
            } else {
                (
                    path.file_stem()
                        .and_then(|s| s.to_str())
                        .unwrap_or("Unknown")
                        .to_string(),
                    "Unknown Artist".to_string(),
                    "Unknown Album".to_string(),
                    None,
                    None,
                    None,
                    None,
                    None,
                )
            };

        // Check for embedded artwork
        let has_artwork = tag
            .map(|t| !t.pictures().is_empty())
            .unwrap_or(false);

        Some(Track {
            id: 0,
            file_path,
            file_hash,
            title,
            artist,
            album,
            album_artist,
            track_number,
            disc_number,
            year,
            genre,
            duration,
            sample_rate,
            bit_depth,
            channels,
            file_size,
            format,
            has_artwork,
            play_count: 0,
            last_played: None,
            date_added: chrono_now(),
            is_favorite: false,
        })
    }

    fn compute_file_hash(&self, path: &Path) -> Option<String> {
        let mut file = File::open(path).ok()?;
        let mut hasher = Hasher::new();
        
        // Read first 64KB for hash (fast, catches file changes)
        let mut buffer = [0u8; 65536];
        let bytes_read = file.read(&mut buffer).ok()?;
        hasher.update(&buffer[..bytes_read]);
        
        Some(hasher.finalize().to_hex().to_string())
    }

    pub fn extract_artwork(&self, path: &Path) -> Option<Vec<u8>> {
        let tagged_file = Probe::open(path).ok()?.read().ok()?;
        let tag = tagged_file.primary_tag()
            .or_else(|| tagged_file.first_tag())?;

        let picture = tag.pictures().first()?;
        Some(picture.data().to_vec())
    }

    pub fn find_lrc_file(&self, track_path: &Path) -> Option<PathBuf> {
        let lrc_path = track_path.with_extension("lrc");
        if lrc_path.exists() {
            return Some(lrc_path);
        }

        // Try lowercase
        let parent = track_path.parent()?;
        let stem = track_path.file_stem()?.to_str()?;
        
        for entry in std::fs::read_dir(parent).ok()? {
            let entry = entry.ok()?;
            let name = entry.file_name();
            let name_str = name.to_string_lossy();
            
            if name_str.to_lowercase() == format!("{}.lrc", stem.to_lowercase()) {
                return Some(entry.path());
            }
        }

        None
    }
}

fn chrono_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    format!("{}", duration.as_secs())
}
