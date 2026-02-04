import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import { listen } from "@tauri-apps/api/event";
import { clsx } from "clsx";
import { useGradient } from "../contexts/GradientContext";
import { useStreamingStore } from "../stores/streamingStore";
import type { SpotifyCredentials } from "../types/streaming";

interface FFmpegStatus {
  installed: boolean;
  path: string | null;
  version: string | null;
}

interface FFmpegProgress {
  stage: string;
  progress: number;
  message: string;
}

export default function SettingsPage() {
  const [audioDevices, setAudioDevices] = useState<string[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>("");
  const [exclusiveMode, setExclusiveMode] = useState(false);
  const [replayGain, setReplayGain] = useState(false);

  // Spotify credentials
  const [spotifyClientId, setSpotifyClientId] = useState("");
  const [spotifyClientSecret, setSpotifyClientSecret] = useState("");
  const [spotifyCredentialsSaved, setSpotifyCredentialsSaved] = useState(false);
  const [showSpotifySecret, setShowSpotifySecret] = useState(false);

  // FFmpeg state
  const [ffmpegStatus, setFfmpegStatus] = useState<FFmpegStatus | null>(null);
  const [ffmpegDownloading, setFfmpegDownloading] = useState(false);
  const [ffmpegProgress, setFfmpegProgress] = useState<FFmpegProgress | null>(
    null,
  );

  // Cache/Data management state
  const [cacheInfo, setCacheInfo] = useState<{
    cache_size: number;
    music_size: number;
  } | null>(null);
  const [clearing, setClearing] = useState<"cache" | "library" | null>(null);

  // Use streaming store for credentials management
  const { setCredentials, clearCredentials } = useStreamingStore();

  const { gradientEnabled, setGradientEnabled, intensity, setIntensity } =
    useGradient();

  useEffect(() => {
    loadAudioDevices();
    loadSpotifyCredentials();
    loadFfmpegStatus();
    loadCacheInfo();

    // Listen for FFmpeg download progress
    const unlisten = listen<FFmpegProgress>(
      "ffmpeg-download-progress",
      (event) => {
        setFfmpegProgress(event.payload);
        if (event.payload.stage === "Complete") {
          setFfmpegDownloading(false);
          loadFfmpegStatus();
        }
      },
    );

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const loadCacheInfo = async () => {
    try {
      const info = await invoke<{ cache_size: number; music_size: number }>(
        "get_cache_info",
      );
      setCacheInfo(info);
    } catch (error) {
      console.error("Failed to get cache info:", error);
    }
  };

  const loadFfmpegStatus = async () => {
    try {
      const status = await invoke<FFmpegStatus>("get_ffmpeg_status");
      setFfmpegStatus(status);
    } catch (error) {
      console.error("Failed to get FFmpeg status:", error);
    }
  };

  const handleDownloadFfmpeg = async () => {
    setFfmpegDownloading(true);
    setFfmpegProgress({
      stage: "Starting",
      progress: 0,
      message: "Preparing download...",
    });
    try {
      await invoke<string>("download_ffmpeg");
    } catch (error) {
      console.error("Failed to download FFmpeg:", error);
      setFfmpegProgress({
        stage: "Error",
        progress: 0,
        message: String(error),
      });
      setFfmpegDownloading(false);
    }
  };

  const handleUninstallFfmpeg = async () => {
    try {
      await invoke("uninstall_ffmpeg");
      await loadFfmpegStatus();
    } catch (error) {
      console.error("Failed to uninstall FFmpeg:", error);
    }
  };

  const loadAudioDevices = async () => {
    try {
      const devices = await invoke<string[]>("get_audio_devices");
      setAudioDevices(devices);
      if (devices.length > 0 && !selectedDevice) {
        setSelectedDevice(devices[0]);
      }
    } catch (error) {
      console.error("Failed to load audio devices:", error);
    }
  };

  const loadSpotifyCredentials = async () => {
    try {
      const creds = await invoke<SpotifyCredentials | null>(
        "get_spotify_credentials",
      );
      if (creds && creds.client_id) {
        setSpotifyClientId(creds.client_id);
        setSpotifyClientSecret(creds.client_secret);
        setSpotifyCredentialsSaved(true);
      }
    } catch (error) {
      console.error("Failed to load Spotify credentials:", error);
    }
  };

  const handleSaveSpotifyCredentials = async () => {
    try {
      await setCredentials(spotifyClientId, spotifyClientSecret);
      setSpotifyCredentialsSaved(true);
    } catch (error) {
      console.error("Failed to save Spotify credentials:", error);
    }
  };

  const handleClearSpotifyCredentials = async () => {
    try {
      await clearCredentials();
      setSpotifyClientId("");
      setSpotifyClientSecret("");
      setSpotifyCredentialsSaved(false);
    } catch (error) {
      console.error("Failed to clear Spotify credentials:", error);
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const handleClearCache = async () => {
    if (
      !confirm(
        "Are you sure you want to delete all stream cache? This action cannot be undone.",
      )
    ) {
      return;
    }
    setClearing("cache");
    try {
      await invoke("clear_stream_cache");
      await loadCacheInfo();
    } catch (error) {
      console.error("Failed to clear cache:", error);
    } finally {
      setClearing(null);
    }
  };

  const handleClearLibrary = async () => {
    if (
      !confirm(
        "Are you sure you want to delete ALL downloaded music and library data? This action cannot be undone.",
      )
    ) {
      return;
    }
    setClearing("library");
    try {
      await invoke("clear_music_library");
      await loadCacheInfo();
    } catch (error) {
      console.error("Failed to clear library:", error);
    } finally {
      setClearing(null);
    }
  };

  const handleDeviceChange = async (device: string) => {
    setSelectedDevice(device);
    try {
      await invoke("set_audio_device", { deviceName: device });
    } catch (error) {
      console.error("Failed to set audio device:", error);
    }
  };

  return (
    <div className="p-6 pb-28 max-w-3xl">
      <h1 className="text-2xl font-bold text-text-primary mb-8">Settings</h1>

      {/* Audio Settings */}
      <section className="mb-10">
        <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
          <span>🎵</span>
          Audio
        </h2>
        <div className="space-y-6">
          {/* Output Device */}
          <div className="bg-amoled-card rounded-xl p-4 border border-amoled-border">
            <label className="block text-sm font-medium text-text-primary mb-2">
              Output Device
            </label>
            <select
              value={selectedDevice}
              onChange={(e) => handleDeviceChange(e.target.value)}
              className="w-full px-4 py-2 bg-amoled-elevated text-text-primary rounded-lg border border-amoled-border focus:border-accent-primary focus:outline-none"
            >
              {audioDevices.map((device) => (
                <option key={device} value={device}>
                  {device}
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs text-text-muted">
              Select the audio output device for playback
            </p>
          </div>

          {/* Exclusive Mode */}
          <div className="bg-amoled-card rounded-xl p-4 border border-amoled-border">
            <div className="flex items-center justify-between">
              <div>
                <label className="block text-sm font-medium text-text-primary">
                  Exclusive Mode (WASAPI)
                </label>
                <p className="text-xs text-text-muted mt-1">
                  Bypass Windows audio mixer for bit-perfect output
                </p>
              </div>
              <Toggle checked={exclusiveMode} onChange={setExclusiveMode} />
            </div>
          </div>

          {/* ReplayGain */}
          <div className="bg-amoled-card rounded-xl p-4 border border-amoled-border">
            <div className="flex items-center justify-between">
              <div>
                <label className="block text-sm font-medium text-text-primary">
                  ReplayGain
                </label>
                <p className="text-xs text-text-muted mt-1">
                  Normalize volume across tracks
                </p>
              </div>
              <Toggle checked={replayGain} onChange={setReplayGain} />
            </div>
          </div>
        </div>
      </section>

      {/* Streaming Settings */}
      <section className="mb-10">
        <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
          <span>🌐</span>
          Streaming (SpotiFlac)
        </h2>
        <div className="space-y-6">
          {/* Spotify API Credentials */}
          <div className="bg-amoled-card rounded-xl p-4 border border-amoled-border">
            <div className="mb-4">
              <label className="block text-sm font-medium text-text-primary mb-1">
                Spotify Developer Credentials
              </label>
              <p className="text-xs text-text-muted">
                Required for online search. Get your free credentials from{" "}
                <a
                  href="https://developer.spotify.com/dashboard"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent-primary hover:underline"
                >
                  Spotify Developer Dashboard
                </a>
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs text-text-secondary mb-1">
                  Client ID
                </label>
                <input
                  type="text"
                  value={spotifyClientId}
                  onChange={(e) => {
                    setSpotifyClientId(e.target.value);
                    setSpotifyCredentialsSaved(false);
                  }}
                  placeholder="Enter your Spotify Client ID"
                  className="w-full px-4 py-2 bg-amoled-elevated text-text-primary rounded-lg border border-amoled-border focus:border-accent-primary focus:outline-none text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-text-secondary mb-1">
                  Client Secret
                </label>
                <div className="relative">
                  <input
                    type={showSpotifySecret ? "text" : "password"}
                    value={spotifyClientSecret}
                    onChange={(e) => {
                      setSpotifyClientSecret(e.target.value);
                      setSpotifyCredentialsSaved(false);
                    }}
                    placeholder="Enter your Spotify Client Secret"
                    className="w-full px-4 py-2 pr-20 bg-amoled-elevated text-text-primary rounded-lg border border-amoled-border focus:border-accent-primary focus:outline-none text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSpotifySecret(!showSpotifySecret)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-text-muted hover:text-text-secondary"
                  >
                    {showSpotifySecret ? "Hide" : "Show"}
                  </button>
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleSaveSpotifyCredentials}
                  disabled={
                    !spotifyClientId ||
                    !spotifyClientSecret ||
                    spotifyCredentialsSaved
                  }
                  className={clsx(
                    "flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                    spotifyCredentialsSaved
                      ? "bg-green-600/20 text-green-400 cursor-default"
                      : !spotifyClientId || !spotifyClientSecret
                        ? "bg-amoled-elevated text-text-muted cursor-not-allowed"
                        : "bg-accent-primary text-black hover:bg-accent-secondary",
                  )}
                >
                  {spotifyCredentialsSaved ? "✓ Saved" : "Save Credentials"}
                </button>
                {spotifyCredentialsSaved && (
                  <button
                    onClick={handleClearSpotifyCredentials}
                    className="px-4 py-2 rounded-lg text-sm font-medium bg-red-600/20 text-red-400 hover:bg-red-600/30 transition-colors"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {/* How to get credentials */}
            <details className="mt-4">
              <summary className="text-xs text-accent-primary cursor-pointer hover:underline">
                How to get Spotify API credentials
              </summary>
              <ol className="mt-2 text-xs text-text-muted space-y-1 list-decimal list-inside">
                <li>
                  Go to{" "}
                  <a
                    href="https://developer.spotify.com/dashboard"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent-primary hover:underline"
                  >
                    developer.spotify.com/dashboard
                  </a>
                </li>
                <li>Log in with your Spotify account (free account works)</li>
                <li>Click "Create app"</li>
                <li>Fill in any name and description, accept terms</li>
                <li>Copy the Client ID and Client Secret</li>
                <li>Paste them above and click Save</li>
              </ol>
            </details>
          </div>

          {/* Info about streaming */}
          <div className="bg-amoled-card rounded-xl p-4 border border-amoled-border">
            <div className="flex items-start gap-3">
              <span className="text-xl">ℹ️</span>
              <div className="text-xs text-text-secondary">
                <p className="mb-2">
                  <strong className="text-text-primary">How it works:</strong>{" "}
                  Search uses Spotify's API, but actual FLAC audio streams come
                  from Tidal, Qobuz, or Amazon Music via public APIs.
                </p>
                <p>
                  No Tidal/Qobuz/Amazon account needed. Audio quality: up to{" "}
                  <span className="text-accent-primary">
                    24-bit/192kHz FLAC
                  </span>
                  .
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FFmpeg Settings */}
      <section className="mb-10">
        <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
          <span>🎬</span>
          FFmpeg
        </h2>
        <div className="space-y-4">
          <div className="bg-amoled-card rounded-xl p-4 border border-amoled-border">
            <div className="flex items-center justify-between mb-4">
              <div>
                <label className="block text-sm font-medium text-text-primary">
                  FFmpeg Status
                </label>
                <p className="text-xs text-text-muted mt-1">
                  Required for hi-res DASH streams from Tidal
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={clsx(
                    "w-2 h-2 rounded-full",
                    ffmpegStatus?.installed ? "bg-green-500" : "bg-red-500",
                  )}
                />
                <span className="text-sm text-text-secondary">
                  {ffmpegStatus?.installed ? "Installed" : "Not Installed"}
                </span>
              </div>
            </div>

            {ffmpegStatus?.installed && ffmpegStatus.version && (
              <div className="mb-4 p-3 bg-amoled-elevated rounded-lg">
                <p className="text-xs text-text-muted mb-1">Version</p>
                <p className="text-sm text-text-primary font-mono">
                  {ffmpegStatus.version}
                </p>
                {ffmpegStatus.path && (
                  <>
                    <p className="text-xs text-text-muted mt-2 mb-1">
                      Location
                    </p>
                    <p className="text-xs text-text-secondary font-mono break-all">
                      {ffmpegStatus.path}
                    </p>
                  </>
                )}
              </div>
            )}

            {ffmpegDownloading && ffmpegProgress && (
              <div className="mb-4">
                <div className="flex justify-between text-xs mb-2">
                  <span className="text-text-secondary">
                    {ffmpegProgress.stage}
                  </span>
                  <span className="text-accent-primary">
                    {ffmpegProgress.progress > 0
                      ? `${ffmpegProgress.progress.toFixed(0)}%`
                      : ""}
                  </span>
                </div>
                <div className="h-2 bg-amoled-elevated rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent-primary transition-all duration-300"
                    style={{ width: `${ffmpegProgress.progress}%` }}
                  />
                </div>
                <p className="text-xs text-text-muted mt-2">
                  {ffmpegProgress.message}
                </p>
              </div>
            )}

            <div className="flex gap-2">
              {!ffmpegStatus?.installed ? (
                <button
                  onClick={handleDownloadFfmpeg}
                  disabled={ffmpegDownloading}
                  className={clsx(
                    "flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                    ffmpegDownloading
                      ? "bg-amoled-elevated text-text-muted cursor-not-allowed"
                      : "bg-accent-primary text-black hover:bg-accent-secondary",
                  )}
                >
                  {ffmpegDownloading
                    ? "Downloading..."
                    : "Download FFmpeg (~100MB)"}
                </button>
              ) : (
                <button
                  onClick={handleUninstallFfmpeg}
                  className="flex-1 px-4 py-2 rounded-lg text-sm font-medium bg-red-600/20 text-red-400 hover:bg-red-600/30 transition-colors"
                >
                  Uninstall FFmpeg
                </button>
              )}
            </div>
          </div>

          {/* Info about FFmpeg */}
          <div className="bg-amoled-card rounded-xl p-4 border border-amoled-border">
            <div className="flex items-start gap-3">
              <span className="text-xl">ℹ️</span>
              <div className="text-xs text-text-secondary">
                <p className="mb-2">
                  <strong className="text-text-primary">Why FFmpeg?</strong>{" "}
                  Some Tidal hi-res streams use DASH format which requires
                  FFmpeg to convert to FLAC.
                </p>
                <p>
                  FFmpeg is downloaded from the official{" "}
                  <a
                    href="https://github.com/BtbN/FFmpeg-Builds"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent-primary hover:underline"
                  >
                    FFmpeg-Builds
                  </a>{" "}
                  and stored in the app's local data folder.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Data Management */}
      <section className="mb-10">
        <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
          <span>🗄️</span>
          Data Management
        </h2>
        <div className="space-y-4">
          {/* Cache Info */}
          <div className="bg-amoled-card rounded-xl p-4 border border-amoled-border">
            <div className="mb-4">
              <label className="block text-sm font-medium text-text-primary">
                Storage Usage
              </label>
              <p className="text-xs text-text-muted mt-1">
                Manage cached streams and downloaded music
              </p>
            </div>

            <div className="space-y-3 mb-4">
              <div className="flex items-center justify-between p-3 bg-amoled-elevated rounded-lg">
                <div>
                  <p className="text-sm text-text-primary">Stream Cache</p>
                  <p className="text-xs text-text-muted">
                    Temporary streaming files
                  </p>
                </div>
                <span className="text-sm text-text-secondary font-mono">
                  {cacheInfo ? formatBytes(cacheInfo.cache_size) : "—"}
                </span>
              </div>
              <div className="flex items-center justify-between p-3 bg-amoled-elevated rounded-lg">
                <div>
                  <p className="text-sm text-text-primary">Downloaded Music</p>
                  <p className="text-xs text-text-muted">Saved FLAC files</p>
                </div>
                <span className="text-sm text-text-secondary font-mono">
                  {cacheInfo ? formatBytes(cacheInfo.music_size) : "—"}
                </span>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleClearCache}
                disabled={clearing !== null}
                className={clsx(
                  "flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                  clearing === "cache"
                    ? "bg-amoled-elevated text-text-muted cursor-not-allowed"
                    : "bg-yellow-600/20 text-yellow-400 hover:bg-yellow-600/30",
                )}
              >
                {clearing === "cache" ? "Clearing..." : "Clear Cache"}
              </button>
              <button
                onClick={handleClearLibrary}
                disabled={clearing !== null}
                className={clsx(
                  "flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                  clearing === "library"
                    ? "bg-amoled-elevated text-text-muted cursor-not-allowed"
                    : "bg-red-600/20 text-red-400 hover:bg-red-600/30",
                )}
              >
                {clearing === "library" ? "Clearing..." : "Delete All Music"}
              </button>
            </div>
          </div>

          {/* Warning */}
          <div className="bg-amoled-card rounded-xl p-4 border border-red-900/50">
            <div className="flex items-start gap-3">
              <span className="text-xl">⚠️</span>
              <div className="text-xs text-text-secondary">
                <p className="mb-2">
                  <strong className="text-red-400">Warning:</strong> "Delete All
                  Music" will remove all downloaded FLAC files and clear the
                  music library database.
                </p>
                <p>
                  "Clear Cache" only removes temporary streaming files used
                  during playback.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Appearance Settings */}
      <section className="mb-10">
        <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
          <span>🎨</span>
          Appearance
        </h2>
        <div className="space-y-6">
          {/* Gradient Background */}
          <div className="bg-amoled-card rounded-xl p-4 border border-amoled-border">
            <div className="flex items-center justify-between mb-4">
              <div>
                <label className="block text-sm font-medium text-text-primary">
                  Animated Gradient Background
                </label>
                <p className="text-xs text-text-muted mt-1">
                  Extract colors from album art for dynamic backgrounds
                </p>
              </div>
              <Toggle checked={gradientEnabled} onChange={setGradientEnabled} />
            </div>

            {gradientEnabled && (
              <div>
                <label className="block text-sm font-medium text-text-primary mb-2">
                  Gradient Intensity
                </label>
                <input
                  type="range"
                  min="0.1"
                  max="1"
                  step="0.1"
                  value={intensity}
                  onChange={(e) => setIntensity(parseFloat(e.target.value))}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-text-muted mt-1">
                  <span>Subtle</span>
                  <span>Vibrant</span>
                </div>
              </div>
            )}
          </div>

          {/* Pure AMOLED */}
          <div className="bg-amoled-card rounded-xl p-4 border border-amoled-border">
            <div className="flex items-center justify-between">
              <div>
                <label className="block text-sm font-medium text-text-primary">
                  Pure AMOLED Mode
                </label>
                <p className="text-xs text-text-muted mt-1">
                  True black #000000 backgrounds
                </p>
              </div>
              <Toggle checked={true} onChange={() => {}} />
            </div>
          </div>
        </div>
      </section>

      {/* About */}
      <section>
        <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
          <span>ℹ️</span>
          About
        </h2>
        <div className="bg-amoled-card rounded-xl p-4 border border-amoled-border">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-accent-primary to-accent-secondary flex items-center justify-center">
              <span className="text-3xl">♪</span>
            </div>
            <div>
              <h3 className="font-semibold text-text-primary">HiFlac</h3>
              <p className="text-sm text-text-secondary">Version 1.0.0</p>
              <p className="text-xs text-text-muted mt-1">
                High-Resolution Audio Player
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
}

function Toggle({ checked, onChange }: ToggleProps) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={clsx(
        "relative w-11 h-6 rounded-full transition-colors",
        checked ? "bg-accent-primary" : "bg-amoled-hover",
      )}
    >
      <span
        className={clsx(
          "absolute top-1 w-4 h-4 bg-white rounded-full transition-transform",
          checked ? "left-6" : "left-1",
        )}
      />
    </button>
  );
}
