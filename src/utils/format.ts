/**
 * Format seconds to MM:SS or HH:MM:SS
 */
export function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '0:00';
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Format total duration to human readable string
 */
export function formatDuration(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '0m';
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

/**
 * Format file size to human readable string
 */
export function formatFileSize(bytes: number): string {
  if (!bytes || isNaN(bytes)) return '0 B';
  
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let unitIndex = 0;
  let size = bytes;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(unitIndex > 0 ? 1 : 0)} ${units[unitIndex]}`;
}

/**
 * Format sample rate to display string
 */
export function formatSampleRate(sampleRate: number): string {
  if (sampleRate >= 1000) {
    return `${(sampleRate / 1000).toFixed(1)}kHz`;
  }
  return `${sampleRate}Hz`;
}

/**
 * Format audio quality badge
 */
export function formatAudioQuality(bitDepth: number, sampleRate: number): string {
  return `${bitDepth}bit/${formatSampleRate(sampleRate)}`;
}

/**
 * Check if track is hi-res
 */
export function isHiRes(bitDepth: number, sampleRate: number): boolean {
  return bitDepth >= 24 || sampleRate > 48000;
}

/**
 * Format track number
 */
export function formatTrackNumber(trackNumber: number | null, discNumber: number | null): string {
  if (trackNumber === null) return '';
  if (discNumber && discNumber > 1) {
    return `${discNumber}.${trackNumber.toString().padStart(2, '0')}`;
  }
  return trackNumber.toString().padStart(2, '0');
}
