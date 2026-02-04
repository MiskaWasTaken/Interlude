// FFmpeg Manager Module
// Handles downloading, installing, and managing FFmpeg for the app

use reqwest::Client;
use std::fs::{self, File};
use std::io::{self, Write};
use std::path::PathBuf;
use std::process::Command;
use zip::ZipArchive;

/// FFmpeg installation status
#[derive(Debug, Clone, serde::Serialize)]
pub struct FFmpegStatus {
    pub installed: bool,
    pub path: Option<String>,
    pub version: Option<String>,
}

/// FFmpeg download progress
#[derive(Debug, Clone, serde::Serialize)]
pub struct FFmpegProgress {
    pub stage: String,
    pub progress: u32, // 0-100
    pub message: String,
}

/// FFmpeg manager for the app
pub struct FFmpegManager {
    app_dir: PathBuf,
    ffmpeg_dir: PathBuf,
}

impl FFmpegManager {
    pub fn new() -> Self {
        let app_dir = dirs::data_local_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("HiFlac");

        let ffmpeg_dir = app_dir.join("ffmpeg");

        // Ensure directories exist
        fs::create_dir_all(&app_dir).ok();
        fs::create_dir_all(&ffmpeg_dir).ok();

        Self {
            app_dir,
            ffmpeg_dir,
        }
    }

    /// Get path to ffmpeg executable
    pub fn ffmpeg_path(&self) -> PathBuf {
        if cfg!(windows) {
            self.ffmpeg_dir.join("ffmpeg.exe")
        } else {
            self.ffmpeg_dir.join("ffmpeg")
        }
    }

    /// Get path to ffprobe executable
    pub fn ffprobe_path(&self) -> PathBuf {
        if cfg!(windows) {
            self.ffmpeg_dir.join("ffprobe.exe")
        } else {
            self.ffmpeg_dir.join("ffprobe")
        }
    }

    /// Check if FFmpeg is installed (either bundled or system)
    pub fn check_status(&self) -> FFmpegStatus {
        // First check our bundled ffmpeg
        let bundled_path = self.ffmpeg_path();
        if bundled_path.exists() {
            if let Some(version) = self.get_version(&bundled_path) {
                return FFmpegStatus {
                    installed: true,
                    path: Some(bundled_path.to_string_lossy().to_string()),
                    version: Some(version),
                };
            }
        }

        // Check system PATH
        if let Ok(output) = Command::new("ffmpeg").arg("-version").output() {
            if output.status.success() {
                let version_str = String::from_utf8_lossy(&output.stdout);
                let version = version_str.lines().next().map(|s| s.to_string());
                return FFmpegStatus {
                    installed: true,
                    path: Some("ffmpeg".to_string()),
                    version,
                };
            }
        }

        // Check common Windows locations
        let common_paths = vec![
            "C:\\ffmpeg\\bin\\ffmpeg.exe",
            "C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe",
            "C:\\Program Files (x86)\\ffmpeg\\bin\\ffmpeg.exe",
        ];

        for path in common_paths {
            let path = PathBuf::from(path);
            if path.exists() {
                if let Some(version) = self.get_version(&path) {
                    return FFmpegStatus {
                        installed: true,
                        path: Some(path.to_string_lossy().to_string()),
                        version: Some(version),
                    };
                }
            }
        }

        FFmpegStatus {
            installed: false,
            path: None,
            version: None,
        }
    }

    /// Get FFmpeg version from executable
    fn get_version(&self, path: &PathBuf) -> Option<String> {
        let output = Command::new(path).arg("-version").output().ok()?;

        if output.status.success() {
            let version_str = String::from_utf8_lossy(&output.stdout);
            // Extract version number from first line
            let first_line = version_str.lines().next()?;
            // Format: "ffmpeg version N.N.N-..."
            if let Some(version_part) = first_line.split_whitespace().nth(2) {
                return Some(
                    version_part
                        .split('-')
                        .next()
                        .unwrap_or(version_part)
                        .to_string(),
                );
            }
        }
        None
    }

    /// Get the best ffmpeg path (bundled first, then system)
    pub fn get_ffmpeg_path(&self) -> Result<String, String> {
        let status = self.check_status();
        if status.installed {
            Ok(status.path.unwrap())
        } else {
            Err("FFmpeg not installed. Please download FFmpeg from Settings.".to_string())
        }
    }

    /// Download and install FFmpeg
    pub async fn download_ffmpeg<F>(&self, progress_callback: F) -> Result<String, String>
    where
        F: Fn(FFmpegProgress) + Send + Sync,
    {
        progress_callback(FFmpegProgress {
            stage: "Preparing".to_string(),
            progress: 0,
            message: "Preparing to download FFmpeg...".to_string(),
        });

        // FFmpeg download URLs (using BtbN builds - well-maintained Windows builds)
        let download_url = if cfg!(windows) {
            "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip"
        } else if cfg!(target_os = "macos") {
            "https://evermeet.cx/ffmpeg/getrelease/zip"
        } else {
            return Err(
                "Unsupported operating system. Please install FFmpeg manually.".to_string(),
            );
        };

        progress_callback(FFmpegProgress {
            stage: "Downloading".to_string(),
            progress: 5,
            message: "Downloading FFmpeg...".to_string(),
        });

        // Download the file
        let client = Client::builder()
            .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) HiFlac/1.0")
            .timeout(std::time::Duration::from_secs(300))
            .build()
            .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

        let response = client
            .get(download_url)
            .send()
            .await
            .map_err(|e| format!("Failed to download FFmpeg: {}", e))?;

        if !response.status().is_success() {
            return Err(format!(
                "Failed to download FFmpeg: HTTP {}",
                response.status()
            ));
        }

        let total_size = response.content_length().unwrap_or(0);
        let mut downloaded: u64 = 0;

        // Create temp file for download
        let temp_path = self.app_dir.join("ffmpeg_download.zip");
        let mut file =
            File::create(&temp_path).map_err(|e| format!("Failed to create temp file: {}", e))?;

        // Download with progress
        let bytes = response
            .bytes()
            .await
            .map_err(|e| format!("Failed to read response: {}", e))?;

        downloaded = bytes.len() as u64;
        file.write_all(&bytes)
            .map_err(|e| format!("Failed to write file: {}", e))?;

        let progress_pct = if total_size > 0 {
            ((downloaded as f64 / total_size as f64) * 50.0) as u32 + 5
        } else {
            55
        };

        progress_callback(FFmpegProgress {
            stage: "Downloading".to_string(),
            progress: progress_pct,
            message: format!("Downloaded {:.1} MB", downloaded as f64 / (1024.0 * 1024.0)),
        });

        drop(file);

        progress_callback(FFmpegProgress {
            stage: "Extracting".to_string(),
            progress: 60,
            message: "Extracting FFmpeg...".to_string(),
        });

        // Extract the zip file
        self.extract_ffmpeg(&temp_path)?;

        progress_callback(FFmpegProgress {
            stage: "Extracting".to_string(),
            progress: 90,
            message: "Cleaning up...".to_string(),
        });

        // Clean up temp file
        fs::remove_file(&temp_path).ok();

        // Verify installation
        let status = self.check_status();
        if !status.installed {
            return Err("FFmpeg extraction failed. Please try again.".to_string());
        }

        progress_callback(FFmpegProgress {
            stage: "Complete".to_string(),
            progress: 100,
            message: format!(
                "FFmpeg {} installed successfully!",
                status.version.unwrap_or_default()
            ),
        });

        Ok(status.path.unwrap())
    }

    /// Extract FFmpeg from zip file
    fn extract_ffmpeg(&self, zip_path: &PathBuf) -> Result<(), String> {
        let file = File::open(zip_path).map_err(|e| format!("Failed to open zip file: {}", e))?;

        let mut archive =
            ZipArchive::new(file).map_err(|e| format!("Failed to read zip file: {}", e))?;

        // Find and extract ffmpeg and ffprobe executables
        for i in 0..archive.len() {
            let mut file = archive
                .by_index(i)
                .map_err(|e| format!("Failed to read zip entry: {}", e))?;

            let file_name = file.name().to_string();

            // Look for ffmpeg.exe and ffprobe.exe (Windows) or ffmpeg/ffprobe (Unix)
            let is_ffmpeg = file_name.ends_with("ffmpeg.exe") || file_name.ends_with("/ffmpeg");
            let is_ffprobe = file_name.ends_with("ffprobe.exe") || file_name.ends_with("/ffprobe");

            if is_ffmpeg || is_ffprobe {
                let out_name = if is_ffmpeg {
                    if cfg!(windows) {
                        "ffmpeg.exe"
                    } else {
                        "ffmpeg"
                    }
                } else {
                    if cfg!(windows) {
                        "ffprobe.exe"
                    } else {
                        "ffprobe"
                    }
                };

                let out_path = self.ffmpeg_dir.join(out_name);
                let mut out_file = File::create(&out_path)
                    .map_err(|e| format!("Failed to create output file: {}", e))?;

                io::copy(&mut file, &mut out_file)
                    .map_err(|e| format!("Failed to extract file: {}", e))?;

                // Set executable permission on Unix
                #[cfg(unix)]
                {
                    use std::os::unix::fs::PermissionsExt;
                    let mut perms = out_file.metadata().unwrap().permissions();
                    perms.set_mode(0o755);
                    fs::set_permissions(&out_path, perms).ok();
                }

                println!("[FFmpeg] Extracted: {:?}", out_path);
            }
        }

        Ok(())
    }

    /// Uninstall bundled FFmpeg
    pub fn uninstall(&self) -> Result<(), String> {
        if self.ffmpeg_dir.exists() {
            fs::remove_dir_all(&self.ffmpeg_dir)
                .map_err(|e| format!("Failed to remove FFmpeg directory: {}", e))?;
            fs::create_dir_all(&self.ffmpeg_dir).ok();
        }
        Ok(())
    }
}

/// Global FFmpeg manager instance
lazy_static::lazy_static! {
    pub static ref FFMPEG_MANAGER: FFmpegManager = FFmpegManager::new();
}

/// Get the best available FFmpeg path
pub fn get_ffmpeg_path() -> Result<String, String> {
    FFMPEG_MANAGER.get_ffmpeg_path()
}

/// Check if FFmpeg is installed
pub fn is_ffmpeg_installed() -> bool {
    FFMPEG_MANAGER.check_status().installed
}
