// Upload-Timeout: 30 Minuten
export const UPLOAD_TIMEOUT = 30 * 60 * 1000

// Konvertierungs-Start-Timeout: 30 Sekunden
export const CONVERT_START_TIMEOUT = 30_000

// Status-Polling-Timeout pro Request: 10 Sekunden
export const STATUS_POLL_TIMEOUT = 10_000

// Maximale Playlist-Größe: 5 GB, damit 50 WAV-Tracks à ~100 MB (≈10 Min.) passen.
// Der Server prüft keine Gesamtgröße (nur 500 MB pro Datei); Temp-Speicher pro
// Sitzung = Uploads + Ausgabe, bis zu 3 Konvertierungen parallel.
export const MAX_PLAYLIST_SIZE = 5 * 1024 * 1024 * 1024

// Schwellenwerte für gestaffelte Größenwarnungen (50 % und 80 % des Limits)
export const SIZE_THRESHOLD_YELLOW = 2.5 * 1024 * 1024 * 1024 // 2.5 GB
export const SIZE_THRESHOLD_ORANGE = 4 * 1024 * 1024 * 1024 // 4 GB

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
