//! Audio Engine Module
//! Handles bit-perfect audio playback using WASAPI (Windows) / CoreAudio (macOS)

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::StreamConfig;
use parking_lot::RwLock;
use rubato::{FftFixedIn, Resampler};
use std::path::Path;
use std::sync::mpsc;
use std::sync::Arc;
use std::thread;
use symphonia::core::audio::{AudioBufferRef, Signal};
use symphonia::core::codecs::{DecoderOptions, CODEC_TYPE_NULL};
use symphonia::core::formats::FormatOptions;
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum AudioError {
    #[error("Failed to initialize audio host")]
    HostInit,
    #[error("No audio device available")]
    NoDevice,
    #[error("Failed to get device config: {0}")]
    DeviceConfig(String),
    #[error("Failed to build stream: {0}")]
    StreamBuild(String),
    #[error("Failed to decode audio: {0}")]
    Decode(String),
    #[error("File not found: {0}")]
    FileNotFound(String),
    #[error("Unsupported format")]
    UnsupportedFormat,
}

#[derive(Clone, Debug, serde::Serialize)]
pub struct PlaybackState {
    pub is_playing: bool,
    pub current_track: Option<String>,
    pub position: f64,
    pub duration: f64,
    pub volume: f32,
    pub sample_rate: u32,
    pub bit_depth: u16,
    pub channels: u16,
    pub shuffle: bool,
    pub repeat_mode: RepeatMode,
    pub track_finished: bool, // Set to true when playback reaches end of track
}

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize, PartialEq)]
pub enum RepeatMode {
    Off,
    One,
    All,
}

impl Default for RepeatMode {
    fn default() -> Self {
        RepeatMode::Off
    }
}

#[allow(dead_code)]
pub enum AudioCommand {
    Play(String),
    AppendSamples(String), // Append audio from file to current buffer (for gapless)
    Pause,
    Resume,
    Stop,
    Seek(f64),
    SetVolume(f32),
    SetDevice(String),
    Shutdown,
}

/// Thread-safe audio engine that delegates actual playback to a dedicated thread
/// This is necessary because cpal::Stream is not Send/Sync
#[allow(dead_code)]
pub struct AudioEngine {
    state: Arc<RwLock<PlaybackState>>,
    command_tx: mpsc::Sender<AudioCommand>,
    sample_buffer: Arc<RwLock<Vec<f32>>>,
    buffer_position: Arc<RwLock<usize>>,
    device_list: Arc<RwLock<Vec<String>>>,
}

// Explicitly implement Send and Sync for AudioEngine since it only contains thread-safe types
unsafe impl Send for AudioEngine {}
unsafe impl Sync for AudioEngine {}

impl AudioEngine {
    pub fn new() -> Result<Self, AudioError> {
        let state = Arc::new(RwLock::new(PlaybackState {
            is_playing: false,
            current_track: None,
            position: 0.0,
            duration: 0.0,
            volume: 1.0,
            sample_rate: 44100,
            bit_depth: 16,
            channels: 2,
            shuffle: false,
            repeat_mode: RepeatMode::Off,
            track_finished: false,
        }));

        let sample_buffer = Arc::new(RwLock::new(Vec::new()));
        let buffer_position = Arc::new(RwLock::new(0));
        let device_list = Arc::new(RwLock::new(Vec::new()));

        // Create channel for commands
        let (command_tx, command_rx) = mpsc::channel::<AudioCommand>();

        // Clone Arcs for the audio thread
        let state_clone = Arc::clone(&state);
        let sample_buffer_clone = Arc::clone(&sample_buffer);
        let buffer_position_clone = Arc::clone(&buffer_position);
        let device_list_clone = Arc::clone(&device_list);

        // Spawn dedicated audio thread (owns the non-Send Stream)
        thread::spawn(move || {
            AudioThread::new(
                state_clone,
                sample_buffer_clone,
                buffer_position_clone,
                device_list_clone,
                command_rx,
            )
            .run();
        });

        Ok(Self {
            state,
            command_tx,
            sample_buffer,
            buffer_position,
            device_list,
        })
    }

    pub fn get_devices(&self) -> Vec<String> {
        self.device_list.read().clone()
    }

    pub fn set_device(&mut self, device_name: &str) -> Result<(), AudioError> {
        self.command_tx
            .send(AudioCommand::SetDevice(device_name.to_string()))
            .map_err(|_| AudioError::HostInit)?;
        Ok(())
    }

    pub fn play(&mut self, file_path: &str) -> Result<(), AudioError> {
        self.command_tx
            .send(AudioCommand::Play(file_path.to_string()))
            .map_err(|_| AudioError::HostInit)?;
        Ok(())
    }

    /// Append audio samples from a file to the current buffer (for gapless playback)
    pub fn append_samples(&mut self, file_path: &str) -> Result<(), AudioError> {
        self.command_tx
            .send(AudioCommand::AppendSamples(file_path.to_string()))
            .map_err(|_| AudioError::HostInit)?;
        Ok(())
    }

    pub fn pause(&mut self) {
        let _ = self.command_tx.send(AudioCommand::Pause);
    }

    pub fn resume(&mut self) {
        let _ = self.command_tx.send(AudioCommand::Resume);
    }

    pub fn stop(&mut self) {
        let _ = self.command_tx.send(AudioCommand::Stop);
    }

    pub fn seek(&mut self, position: f64) {
        let _ = self.command_tx.send(AudioCommand::Seek(position));
    }

    pub fn set_volume(&mut self, volume: f32) {
        let _ = self.command_tx.send(AudioCommand::SetVolume(volume));
    }

    pub fn get_state(&self) -> PlaybackState {
        self.state.read().clone()
    }

    pub fn set_shuffle(&mut self, enabled: bool) {
        self.state.write().shuffle = enabled;
    }

    pub fn set_repeat_mode(&mut self, mode: RepeatMode) {
        self.state.write().repeat_mode = mode;
    }
}

/// Internal audio thread that owns the non-Send cpal::Stream
#[allow(dead_code)]
struct AudioThread {
    host: cpal::Host,
    device: Option<cpal::Device>,
    stream: Option<cpal::Stream>,
    state: Arc<RwLock<PlaybackState>>,
    sample_buffer: Arc<RwLock<Vec<f32>>>,
    buffer_position: Arc<RwLock<usize>>,
    device_list: Arc<RwLock<Vec<String>>>,
    command_rx: mpsc::Receiver<AudioCommand>,
    output_sample_rate: Option<u32>, // The sample rate the stream is outputting at
    output_channels: Option<u16>,    // The channel count the stream is outputting
}

impl AudioThread {
    fn new(
        state: Arc<RwLock<PlaybackState>>,
        sample_buffer: Arc<RwLock<Vec<f32>>>,
        buffer_position: Arc<RwLock<usize>>,
        device_list: Arc<RwLock<Vec<String>>>,
        command_rx: mpsc::Receiver<AudioCommand>,
    ) -> Self {
        // Initialize audio host on this thread
        #[cfg(target_os = "windows")]
        let host =
            cpal::host_from_id(cpal::HostId::Wasapi).unwrap_or_else(|_| cpal::default_host());

        #[cfg(not(target_os = "windows"))]
        let host = cpal::default_host();

        let device = host.default_output_device();

        // Populate device list
        if let Ok(devices) = host.output_devices() {
            let names: Vec<String> = devices.filter_map(|d| d.name().ok()).collect();
            *device_list.write() = names;
        }

        Self {
            host,
            device,
            stream: None,
            state,
            sample_buffer,
            buffer_position,
            device_list,
            command_rx,
            output_sample_rate: None,
            output_channels: None,
        }
    }

    fn run(mut self) {
        loop {
            match self.command_rx.recv() {
                Ok(AudioCommand::Play(path)) => {
                    if let Err(e) = self.play_internal(&path) {
                        log::error!("Playback error: {}", e);
                    }
                }
                Ok(AudioCommand::AppendSamples(path)) => {
                    if let Err(e) = self.append_samples_internal(&path) {
                        log::error!("Append samples error: {}", e);
                    }
                }
                Ok(AudioCommand::Pause) => {
                    self.state.write().is_playing = false;
                }
                Ok(AudioCommand::Resume) => {
                    self.state.write().is_playing = true;
                }
                Ok(AudioCommand::Stop) => {
                    self.stop_internal();
                }
                Ok(AudioCommand::Seek(position)) => {
                    self.seek_internal(position);
                }
                Ok(AudioCommand::SetVolume(volume)) => {
                    self.state.write().volume = volume.clamp(0.0, 1.0);
                }
                Ok(AudioCommand::SetDevice(name)) => {
                    self.set_device_internal(&name);
                }
                Ok(AudioCommand::Shutdown) | Err(_) => {
                    break;
                }
            }
        }
    }

    fn set_device_internal(&mut self, device_name: &str) {
        if let Ok(devices) = self.host.output_devices() {
            self.device = devices
                .filter(|d| d.name().map(|n| n == device_name).unwrap_or(false))
                .next();
        }
    }

    fn stop_internal(&mut self) {
        self.stream = None;
        let mut state = self.state.write();
        state.is_playing = false;
        state.position = 0.0;
        state.current_track = None;
    }

    fn seek_internal(&mut self, position: f64) {
        let state = self.state.read();
        let sample_rate = state.sample_rate;
        let channels = state.channels;
        drop(state);

        let sample_position = (position * sample_rate as f64 * channels as f64) as usize;
        *self.buffer_position.write() = sample_position;
        self.state.write().position = position;
    }

    fn play_internal(&mut self, file_path: &str) -> Result<(), AudioError> {
        // Stop any current playback
        self.stop_internal();

        let path = Path::new(file_path);
        if !path.exists() {
            return Err(AudioError::FileNotFound(file_path.to_string()));
        }

        // Open the media source
        let file =
            std::fs::File::open(path).map_err(|e| AudioError::FileNotFound(e.to_string()))?;

        let mss = MediaSourceStream::new(Box::new(file), Default::default());

        // Create a hint to help the format registry
        let mut hint = Hint::new();
        if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
            hint.with_extension(ext);
        }

        // Probe the media source
        let format_opts = FormatOptions::default();
        let metadata_opts = MetadataOptions::default();
        let probed = symphonia::default::get_probe()
            .format(&hint, mss, &format_opts, &metadata_opts)
            .map_err(|e| AudioError::Decode(e.to_string()))?;

        let mut format = probed.format;

        // Find the first audio track
        let track = format
            .tracks()
            .iter()
            .find(|t| t.codec_params.codec != CODEC_TYPE_NULL)
            .ok_or(AudioError::UnsupportedFormat)?;

        let track_id = track.id;

        // Get audio parameters
        let sample_rate = track.codec_params.sample_rate.unwrap_or(44100);
        let channels = track
            .codec_params
            .channels
            .map(|c| c.count() as u16)
            .unwrap_or(2);
        let bit_depth = track.codec_params.bits_per_sample.unwrap_or(16) as u16;

        log::info!(
            "Decoded audio: {}Hz, {} channels, {}-bit, codec: {:?}",
            sample_rate,
            channels,
            bit_depth,
            track.codec_params.codec
        );

        // Calculate duration
        let duration = track
            .codec_params
            .n_frames
            .map(|frames| frames as f64 / sample_rate as f64)
            .unwrap_or(0.0);

        // Create decoder
        let dec_opts = DecoderOptions::default();
        let mut decoder = symphonia::default::get_codecs()
            .make(&track.codec_params, &dec_opts)
            .map_err(|e| AudioError::Decode(e.to_string()))?;

        // Decode all samples into buffer (for simplicity - production would stream)
        let mut samples: Vec<f32> = Vec::new();

        loop {
            let packet = match format.next_packet() {
                Ok(packet) => packet,
                Err(symphonia::core::errors::Error::IoError(_)) => break,
                Err(e) => {
                    log::warn!("Error reading packet: {}", e);
                    break;
                }
            };

            if packet.track_id() != track_id {
                continue;
            }

            match decoder.decode(&packet) {
                Ok(decoded) => {
                    // Convert to f32 samples
                    match decoded {
                        AudioBufferRef::F32(buf) => {
                            for frame in 0..buf.frames() {
                                for ch in 0..buf.spec().channels.count() {
                                    samples.push(buf.chan(ch)[frame]);
                                }
                            }
                        }
                        AudioBufferRef::S16(buf) => {
                            for frame in 0..buf.frames() {
                                for ch in 0..buf.spec().channels.count() {
                                    samples.push(buf.chan(ch)[frame] as f32 / 32768.0);
                                }
                            }
                        }
                        AudioBufferRef::S24(buf) => {
                            for frame in 0..buf.frames() {
                                for ch in 0..buf.spec().channels.count() {
                                    let sample = buf.chan(ch)[frame].0;
                                    samples.push(sample as f32 / 8388608.0);
                                }
                            }
                        }
                        AudioBufferRef::S32(buf) => {
                            for frame in 0..buf.frames() {
                                for ch in 0..buf.spec().channels.count() {
                                    samples.push(buf.chan(ch)[frame] as f32 / 2147483648.0);
                                }
                            }
                        }
                        _ => {}
                    }
                }
                Err(e) => {
                    log::warn!("Decode error: {}", e);
                }
            }
        }

        // Create output stream first to determine output sample rate
        let device = self
            .device
            .as_ref()
            .cloned()
            .or_else(|| self.host.default_output_device())
            .ok_or(AudioError::NoDevice)?;

        // Log device name
        if let Ok(name) = device.name() {
            log::info!("[Audio] Device: {}", name);
            println!("[Audio] Device: {}", name);
        }

        // Find the best supported configuration - prioritize EXACT match first, then highest quality
        // ONLY resample when absolutely necessary
        let config = {
            let supported_configs: Vec<_> = device
                .supported_output_configs()
                .map_err(|e| AudioError::DeviceConfig(e.to_string()))?
                .collect();

            // Log ALL supported configurations for debugging
            println!("=== Device Supported Configurations ===");
            for (i, cfg) in supported_configs.iter().enumerate() {
                println!(
                    "  Config {}: {}ch, {}-{}Hz, {:?}",
                    i,
                    cfg.channels(),
                    cfg.min_sample_rate().0,
                    cfg.max_sample_rate().0,
                    cfg.sample_format()
                );
            }
            println!("=== End Device Configs ===");
            println!(
                "[Audio] Source audio: {}Hz, {} channels",
                sample_rate, channels
            );

            // First, try to find exact match for file's sample rate and channels
            let exact_match = supported_configs.iter().find(|c| {
                c.channels() == channels
                    && c.min_sample_rate().0 <= sample_rate
                    && c.max_sample_rate().0 >= sample_rate
            });

            if let Some(_config_range) = exact_match {
                // Use the file's exact sample rate - NO RESAMPLING NEEDED
                println!(
                    "[Audio] ✓ EXACT MATCH: Device supports {}Hz/{}ch - NO resampling!",
                    sample_rate, channels
                );
                StreamConfig {
                    channels,
                    sample_rate: cpal::SampleRate(sample_rate),
                    buffer_size: cpal::BufferSize::Default,
                }
            } else {
                // Try with 2 channels if file has different channel count
                let stereo_match = supported_configs.iter().find(|c| {
                    c.channels() == 2
                        && c.min_sample_rate().0 <= sample_rate
                        && c.max_sample_rate().0 >= sample_rate
                });

                if let Some(_config_range) = stereo_match {
                    println!(
                        "[Audio] ✓ Sample rate match with stereo: {}Hz/2ch",
                        sample_rate
                    );
                    StreamConfig {
                        channels: 2,
                        sample_rate: cpal::SampleRate(sample_rate),
                        buffer_size: cpal::BufferSize::Default,
                    }
                } else {
                    // No exact sample rate match - find the HIGHEST rate the device supports
                    let best_config = supported_configs
                        .iter()
                        .filter(|c| c.channels() == channels || c.channels() == 2)
                        .max_by_key(|c| c.max_sample_rate().0);

                    if let Some(config_range) = best_config {
                        let best_rate = config_range.max_sample_rate().0;
                        let best_channels = config_range.channels();
                        println!(
                            "[Audio] ✗ RESAMPLING NEEDED: {}Hz -> {}Hz (device max: {}Hz/{}ch)",
                            sample_rate, best_rate, best_rate, best_channels
                        );
                        StreamConfig {
                            channels: best_channels,
                            sample_rate: cpal::SampleRate(best_rate),
                            buffer_size: cpal::BufferSize::Default,
                        }
                    } else {
                        // Last resort: use device default
                        println!("[Audio] No suitable config, using device default");
                        let default_config = device
                            .default_output_config()
                            .map_err(|e| AudioError::DeviceConfig(e.to_string()))?;
                        StreamConfig {
                            channels: default_config.channels(),
                            sample_rate: default_config.sample_rate(),
                            buffer_size: cpal::BufferSize::Default,
                        }
                    }
                }
            }
        };

        let output_sample_rate = config.sample_rate.0;
        let output_channels = config.channels;

        // Store the output format for use by append_samples
        self.output_sample_rate = Some(output_sample_rate);
        self.output_channels = Some(output_channels);

        println!(
            "[Audio] Final: Source {}Hz/{}ch -> Output {}Hz/{}ch",
            sample_rate, channels, output_sample_rate, output_channels
        );

        // Resample if sample rates differ
        let final_samples = if sample_rate != output_sample_rate {
            println!(
                "[Audio] ⚡ RESAMPLING: {}Hz -> {}Hz",
                sample_rate, output_sample_rate
            );
            resample_audio(&samples, channels as usize, sample_rate, output_sample_rate)?
        } else {
            println!("[Audio] ✓ NO RESAMPLING NEEDED ({}Hz)", sample_rate);
            samples
        };

        // Handle channel conversion if needed
        let final_samples = if channels != output_channels {
            println!(
                "[Audio] Converting channels: {}ch -> {}ch",
                channels, output_channels
            );
            convert_channels(&final_samples, channels as usize, output_channels as usize)
        } else {
            final_samples
        };

        // Calculate duration based on resampled audio
        let resampled_duration =
            final_samples.len() as f64 / (output_sample_rate as f64 * output_channels as f64);

        // Store samples
        *self.sample_buffer.write() = final_samples;
        *self.buffer_position.write() = 0;

        // Update state
        {
            let mut state = self.state.write();
            state.current_track = Some(file_path.to_string());
            state.duration = resampled_duration;
            state.position = 0.0;
            state.sample_rate = output_sample_rate;
            state.bit_depth = bit_depth;
            state.channels = output_channels;
            state.is_playing = true;
            state.track_finished = false;
        }

        let sample_buffer = Arc::clone(&self.sample_buffer);
        let buffer_position = Arc::clone(&self.buffer_position);
        let state = Arc::clone(&self.state);
        let channel_count = output_channels as usize;
        let sr = output_sample_rate;

        let stream = device
            .build_output_stream(
                &config,
                move |data: &mut [f32], _: &cpal::OutputCallbackInfo| {
                    let buffer = sample_buffer.read();
                    let mut pos = buffer_position.write();
                    let state_read = state.read();
                    let volume = state_read.volume;
                    let is_playing = state_read.is_playing;
                    let was_playing = is_playing;
                    drop(state_read);

                    let mut finished_this_frame = false;

                    for sample in data.iter_mut() {
                        if is_playing && *pos < buffer.len() {
                            *sample = buffer[*pos] * volume;
                            *pos += 1;
                        } else {
                            *sample = 0.0;
                            // Detect when we've reached the end of the buffer
                            if was_playing && *pos >= buffer.len() && !buffer.is_empty() {
                                finished_this_frame = true;
                            }
                        }
                    }

                    // Update position in state
                    let current_pos = *pos as f64 / (sr as f64 * channel_count as f64);
                    drop(pos);

                    let mut state_write = state.write();
                    state_write.position = current_pos;

                    // Set track_finished flag when playback reaches end
                    if finished_this_frame && !state_write.track_finished {
                        state_write.track_finished = true;
                        state_write.is_playing = false;
                        log::info!("Track playback finished");
                    }
                },
                |err| {
                    log::error!("Audio stream error: {}", err);
                },
                None,
            )
            .map_err(|e: cpal::BuildStreamError| AudioError::StreamBuild(e.to_string()))?;

        stream
            .play()
            .map_err(|e: cpal::PlayStreamError| AudioError::StreamBuild(e.to_string()))?;
        self.stream = Some(stream);

        Ok(())
    }

    /// Append samples from a file to the existing buffer (for gapless chunk transitions)
    fn append_samples_internal(&mut self, file_path: &str) -> Result<(), AudioError> {
        let path = Path::new(file_path);
        if !path.exists() {
            return Err(AudioError::FileNotFound(file_path.to_string()));
        }

        // Get the output format we need to resample to
        let output_sample_rate = self.output_sample_rate.ok_or_else(|| {
            AudioError::Decode(
                "No output sample rate set - play_internal must be called first".to_string(),
            )
        })?;
        let output_channels = self.output_channels.ok_or_else(|| {
            AudioError::Decode(
                "No output channels set - play_internal must be called first".to_string(),
            )
        })?;

        log::info!("Appending samples from: {}", file_path);

        // Open and decode the file
        let file =
            std::fs::File::open(path).map_err(|e| AudioError::FileNotFound(e.to_string()))?;

        let mss = MediaSourceStream::new(Box::new(file), Default::default());

        let mut hint = Hint::new();
        if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
            hint.with_extension(ext);
        }

        let format_opts = FormatOptions::default();
        let metadata_opts = MetadataOptions::default();
        let probed = symphonia::default::get_probe()
            .format(&hint, mss, &format_opts, &metadata_opts)
            .map_err(|e| AudioError::Decode(e.to_string()))?;

        let mut format = probed.format;

        let track = format
            .tracks()
            .iter()
            .find(|t| t.codec_params.codec != CODEC_TYPE_NULL)
            .ok_or(AudioError::UnsupportedFormat)?;

        let track_id = track.id;

        // Extract source sample rate and channels from the file
        let source_sample_rate = track.codec_params.sample_rate.unwrap_or(output_sample_rate);
        let source_channels = track
            .codec_params
            .channels
            .map(|c| c.count() as u16)
            .unwrap_or(output_channels);

        println!(
            "[Audio] Chunk: {}Hz/{}ch -> Output: {}Hz/{}ch",
            source_sample_rate, source_channels, output_sample_rate, output_channels
        );

        let dec_opts = DecoderOptions::default();
        let mut decoder = symphonia::default::get_codecs()
            .make(&track.codec_params, &dec_opts)
            .map_err(|e| AudioError::Decode(e.to_string()))?;

        // Decode all samples
        let mut new_samples: Vec<f32> = Vec::new();

        loop {
            let packet = match format.next_packet() {
                Ok(packet) => packet,
                Err(symphonia::core::errors::Error::IoError(_)) => break,
                Err(e) => {
                    log::warn!("Error reading packet: {}", e);
                    break;
                }
            };

            if packet.track_id() != track_id {
                continue;
            }

            match decoder.decode(&packet) {
                Ok(decoded) => match decoded {
                    AudioBufferRef::F32(buf) => {
                        for frame in 0..buf.frames() {
                            for ch in 0..buf.spec().channels.count() {
                                new_samples.push(buf.chan(ch)[frame]);
                            }
                        }
                    }
                    AudioBufferRef::S16(buf) => {
                        for frame in 0..buf.frames() {
                            for ch in 0..buf.spec().channels.count() {
                                new_samples.push(buf.chan(ch)[frame] as f32 / 32768.0);
                            }
                        }
                    }
                    AudioBufferRef::S24(buf) => {
                        for frame in 0..buf.frames() {
                            for ch in 0..buf.spec().channels.count() {
                                let sample = buf.chan(ch)[frame].0;
                                new_samples.push(sample as f32 / 8388608.0);
                            }
                        }
                    }
                    AudioBufferRef::S32(buf) => {
                        for frame in 0..buf.frames() {
                            for ch in 0..buf.spec().channels.count() {
                                new_samples.push(buf.chan(ch)[frame] as f32 / 2147483648.0);
                            }
                        }
                    }
                    _ => {}
                },
                Err(e) => {
                    log::warn!("Decode error: {}", e);
                }
            }
        }

        println!(
            "[Audio] Chunk decoded: {} samples at {}Hz",
            new_samples.len(),
            source_sample_rate
        );

        // Resample if source sample rate differs from output sample rate
        let resampled_samples = if source_sample_rate != output_sample_rate {
            println!(
                "[Audio] ⚡ RESAMPLING CHUNK: {}Hz -> {}Hz",
                source_sample_rate, output_sample_rate
            );
            resample_audio(
                &new_samples,
                source_channels as usize,
                source_sample_rate,
                output_sample_rate,
            )?
        } else {
            println!(
                "[Audio] ✓ CHUNK NO RESAMPLE: {}Hz matches output",
                source_sample_rate
            );
            new_samples
        };

        // Convert channels if needed
        let final_samples = if source_channels != output_channels {
            println!(
                "[Audio] Converting chunk channels: {}ch -> {}ch",
                source_channels, output_channels
            );
            convert_channels(
                &resampled_samples,
                source_channels as usize,
                output_channels as usize,
            )
        } else {
            resampled_samples
        };

        // Append to existing buffer
        {
            let mut buffer = self.sample_buffer.write();
            let old_len = buffer.len();
            buffer.extend(final_samples.iter());
            println!(
                "[Audio] Appended {} samples (buffer: {} -> {})",
                final_samples.len(),
                old_len,
                buffer.len()
            );
        }

        // Update duration in state
        {
            let buffer = self.sample_buffer.read();
            let new_duration =
                buffer.len() as f64 / (output_sample_rate as f64 * output_channels as f64);
            drop(buffer);

            let mut state = self.state.write();
            state.duration = new_duration;
            // Reset track_finished flag since we have more audio
            state.track_finished = false;
            state.is_playing = true;
        }

        Ok(())
    }
}
/// Resample audio from one sample rate to another using high-quality sinc interpolation
fn resample_audio(
    samples: &[f32],
    channels: usize,
    from_rate: u32,
    to_rate: u32,
) -> Result<Vec<f32>, AudioError> {
    if channels == 0 || samples.is_empty() {
        return Ok(Vec::new());
    }

    let num_frames = samples.len() / channels;

    // Deinterleave samples into separate channels
    let mut channel_data: Vec<Vec<f32>> = vec![Vec::with_capacity(num_frames); channels];
    for (i, sample) in samples.iter().enumerate() {
        channel_data[i % channels].push(*sample);
    }

    // Create resampler
    let mut resampler = FftFixedIn::<f32>::new(
        from_rate as usize,
        to_rate as usize,
        1024, // chunk size
        2,    // sub chunks
        channels,
    )
    .map_err(|e| AudioError::Decode(format!("Failed to create resampler: {}", e)))?;

    // Process in chunks
    let chunk_size = resampler.input_frames_next();
    let mut resampled_channels: Vec<Vec<f32>> = vec![Vec::new(); channels];

    let mut pos = 0;
    while pos < num_frames {
        let end = (pos + chunk_size).min(num_frames);
        let frames_in_chunk = end - pos;

        // Prepare input chunk (pad with zeros if needed)
        let input: Vec<Vec<f32>> = channel_data
            .iter()
            .map(|ch| {
                let mut chunk: Vec<f32> = ch[pos..end].to_vec();
                // Pad with zeros if this is the last chunk and it's smaller than chunk_size
                while chunk.len() < chunk_size {
                    chunk.push(0.0);
                }
                chunk
            })
            .collect();

        // Resample
        match resampler.process(&input, None) {
            Ok(output) => {
                for (ch_idx, ch_data) in output.into_iter().enumerate() {
                    resampled_channels[ch_idx].extend(ch_data);
                }
            }
            Err(e) => {
                log::warn!("Resampling error at frame {}: {}", pos, e);
            }
        }

        pos += frames_in_chunk;
    }

    // Interleave resampled channels back together
    let output_frames = resampled_channels.get(0).map(|c| c.len()).unwrap_or(0);
    let mut result = Vec::with_capacity(output_frames * channels);

    for frame in 0..output_frames {
        for ch in 0..channels {
            if frame < resampled_channels[ch].len() {
                result.push(resampled_channels[ch][frame]);
            } else {
                result.push(0.0);
            }
        }
    }

    log::info!(
        "Resampled {} frames from {}Hz to {}Hz -> {} frames",
        num_frames,
        from_rate,
        to_rate,
        output_frames
    );

    Ok(result)
}

/// Convert audio between different channel counts
fn convert_channels(samples: &[f32], from_channels: usize, to_channels: usize) -> Vec<f32> {
    if from_channels == to_channels || from_channels == 0 {
        return samples.to_vec();
    }

    let num_frames = samples.len() / from_channels;
    let mut result = Vec::with_capacity(num_frames * to_channels);

    for frame in 0..num_frames {
        let frame_start = frame * from_channels;

        if to_channels < from_channels {
            // Downmix: average channels
            if to_channels == 1 && from_channels == 2 {
                // Stereo to mono
                let left = samples[frame_start];
                let right = samples[frame_start + 1];
                result.push((left + right) / 2.0);
            } else if to_channels == 2 && from_channels > 2 {
                // Multi-channel to stereo (simple downmix)
                let left = samples[frame_start];
                let right = if from_channels > 1 {
                    samples[frame_start + 1]
                } else {
                    left
                };
                result.push(left);
                result.push(right);
            } else {
                // Generic downmix: take first to_channels
                for ch in 0..to_channels {
                    result.push(samples[frame_start + ch]);
                }
            }
        } else {
            // Upmix: duplicate channels
            if from_channels == 1 && to_channels == 2 {
                // Mono to stereo
                let mono = samples[frame_start];
                result.push(mono);
                result.push(mono);
            } else {
                // Generic upmix: copy existing, fill rest with zeros
                for ch in 0..to_channels {
                    if ch < from_channels {
                        result.push(samples[frame_start + ch]);
                    } else {
                        result.push(0.0);
                    }
                }
            }
        }
    }

    result
}
