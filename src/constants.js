// Upload-Timeout: 30 Minuten
export const UPLOAD_TIMEOUT = 30 * 60 * 1000

// Konvertierungs-Start-Timeout: 30 Sekunden
export const CONVERT_START_TIMEOUT = 30_000

// Status-Polling-Timeout pro Request: 10 Sekunden
export const STATUS_POLL_TIMEOUT = 10_000

// Maximale Playlist-Größe: 2 GB
export const MAX_PLAYLIST_SIZE = 2 * 1024 * 1024 * 1024

// Schwellenwerte für gestaffelte Größenwarnungen
export const SIZE_THRESHOLD_YELLOW = 1 * 1024 * 1024 * 1024 // 1 GB
export const SIZE_THRESHOLD_ORANGE = 1.6 * 1024 * 1024 * 1024 // 1.6 GB

// Unterstützte Ausgabeformate
export const OUTPUT_FORMATS = {
  webm: {
    extension: 'webm',
    label: 'WebM (Opus)',
    description: 'Kompakt, modern',
    maxBitrate: 256,
    mimeType: 'audio/webm',
  },
  mp3: {
    extension: 'mp3',
    label: 'MP3',
    description: 'Universell kompatibel',
    maxBitrate: 320,
    mimeType: 'audio/mpeg',
  },
  ogg: {
    extension: 'ogg',
    label: 'OGG (Vorbis)',
    description: 'Open Source',
    maxBitrate: 320,
    mimeType: 'audio/ogg',
  },
}

// Verfügbare Bitraten
export const AVAILABLE_BITRATES = [
  { value: 64, label: '64 kbps', description: 'Niedrig' },
  { value: 128, label: '128 kbps', description: 'Standard' },
  { value: 192, label: '192 kbps', description: 'Hoch' },
  { value: 256, label: '256 kbps', description: 'Sehr hoch' },
  { value: 320, label: '320 kbps', description: 'Maximum' },
]

// Akzeptierte Audio-MIME-Types und Dateiendungen
export const ACCEPTED_AUDIO_TYPES = ['audio/mpeg', 'audio/wav', 'audio/mp3']
export const ACCEPTED_AUDIO_EXTENSIONS = ['.mp3', '.wav']
