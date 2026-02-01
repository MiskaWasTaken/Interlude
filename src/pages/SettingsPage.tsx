import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { clsx } from 'clsx';
import { useGradient } from '../contexts/GradientContext';

export default function SettingsPage() {
  const [audioDevices, setAudioDevices] = useState<string[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>('');
  const [exclusiveMode, setExclusiveMode] = useState(false);
  const [replayGain, setReplayGain] = useState(false);
  
  const { gradientEnabled, setGradientEnabled, intensity, setIntensity } = useGradient();

  useEffect(() => {
    loadAudioDevices();
  }, []);

  const loadAudioDevices = async () => {
    try {
      const devices = await invoke<string[]>('get_audio_devices');
      setAudioDevices(devices);
      if (devices.length > 0 && !selectedDevice) {
        setSelectedDevice(devices[0]);
      }
    } catch (error) {
      console.error('Failed to load audio devices:', error);
    }
  };

  const handleDeviceChange = async (device: string) => {
    setSelectedDevice(device);
    try {
      await invoke('set_audio_device', { deviceName: device });
    } catch (error) {
      console.error('Failed to set audio device:', error);
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
        'relative w-11 h-6 rounded-full transition-colors',
        checked ? 'bg-accent-primary' : 'bg-amoled-hover'
      )}
    >
      <span
        className={clsx(
          'absolute top-1 w-4 h-4 bg-white rounded-full transition-transform',
          checked ? 'left-6' : 'left-1'
        )}
      />
    </button>
  );
}
