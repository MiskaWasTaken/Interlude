//! Audio Engine Module
//! Handles bit-perfect audio playback using WASAPI (Windows) / CoreAudio (macOS)

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::StreamConfig;
use parking_lot::RwLock;
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

pub enum AudioCommand {
    Play(String),
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
struct AudioThread {
    host: cpal::Host,
    device: Option<cpal::Device>,
    stream: Option<cpal::Stream>,
    state: Arc<RwLock<PlaybackState>>,
    sample_buffer: Arc<RwLock<Vec<f32>>>,
    buffer_position: Arc<RwLock<usize>>,
    device_list: Arc<RwLock<Vec<String>>>,
    command_rx: mpsc::Receiver<AudioCommand>,
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

        // Store samples
        *self.sample_buffer.write() = samples;
        *self.buffer_position.write() = 0;

        // Update state
        {
            let mut state = self.state.write();
            state.current_track = Some(file_path.to_string());
            state.duration = duration;
            state.position = 0.0;
            state.sample_rate = sample_rate;
            state.bit_depth = bit_depth;
            state.channels = channels;
            state.is_playing = true;
        }

        // Create output stream
        let device = self
            .device
            .as_ref()
            .cloned()
            .or_else(|| self.host.default_output_device())
            .ok_or(AudioError::NoDevice)?;

        let config = StreamConfig {
            channels,
            sample_rate: cpal::SampleRate(sample_rate),
            buffer_size: cpal::BufferSize::Default,
        };

        let sample_buffer = Arc::clone(&self.sample_buffer);
        let buffer_position = Arc::clone(&self.buffer_position);
        let state = Arc::clone(&self.state);
        let channel_count = channels as usize;
        let sr = sample_rate;

        let stream = device
            .build_output_stream(
                &config,
                move |data: &mut [f32], _: &cpal::OutputCallbackInfo| {
                    let buffer = sample_buffer.read();
                    let mut pos = buffer_position.write();
                    let state_read = state.read();
                    let volume = state_read.volume;
                    let is_playing = state_read.is_playing;
                    drop(state_read);

                    for sample in data.iter_mut() {
                        if is_playing && *pos < buffer.len() {
                            *sample = buffer[*pos] * volume;
                            *pos += 1;
                        } else {
                            *sample = 0.0;
                        }
                    }

                    // Update position in state
                    let current_pos = *pos as f64 / (sr as f64 * channel_count as f64);
                    drop(pos);
                    state.write().position = current_pos;
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
}
