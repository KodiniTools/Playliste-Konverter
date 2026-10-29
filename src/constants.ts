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

/**
 * KodiniTools-Apps, deren Dateien die App über die gemeinsame IndexedDB
 * übernimmt, wenn sie mit ?source=<id> geöffnet wird (N8).
 */
export const SHARED_SOURCES = ['audionormalizer', 'audiokonverter'] as const

export function isSharedSource(value: unknown): value is (typeof SHARED_SOURCES)[number] {
  return typeof value === 'string' && (SHARED_SOURCES as readonly string[]).includes(value)
}

// Ziele für die fertige Playlist (gleiche Domain). Sie lesen die Datei aus
// der gemeinsamen IndexedDB, wenn sie mit ?source=playlistkonverter öffnen.
export const MUSIC_PLAYER_SHARE_URL = '/ultimativer-musikplayer/app/?source=playlistkonverter'
// Landing-Seite leitet mit ?source selbst zur App weiter (N8)
export const NORMALIZER_SHARE_URL = '/audionormalisierer/?source=playlistkonverter'

export interface ShareTarget {
  id: 'player' | 'normalizer'
  url: string
  /** i18n-Schlüssel für Button und Werkzeugname */
  labelKey: string
  toolKey: string
}

export const SHARE_TARGETS: readonly ShareTarget[] = [
  {
    id: 'player',
    url: MUSIC_PLAYER_SHARE_URL,
    labelKey: 'download.shareToPlayer',
    toolKey: 'download.toolPlayer',
  },
  {
    id: 'normalizer',
    url: NORMALIZER_SHARE_URL,
    labelKey: 'download.shareToNormalizer',
    toolKey: 'download.toolNormalizer',
  },
]

// Unterstützte Ausgabeformate

export interface OutputFormatConfig {
  extension: string
  label: string
  description: string
  maxBitrate: number
  mimeType: string
}

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
} satisfies Record<string, OutputFormatConfig>

export type OutputFormatId = keyof typeof OUTPUT_FORMATS

/** Prüft, ob ein (z. B. gespeicherter) Wert ein bekanntes Ausgabeformat ist. */
export function isOutputFormat(value: unknown): value is OutputFormatId {
  return typeof value === 'string' && Object.hasOwn(OUTPUT_FORMATS, value)
}

// Verfügbare Bitraten
export interface BitrateOption {
  value: number
  label: string
  description: string
}

export const AVAILABLE_BITRATES: readonly BitrateOption[] = [
  { value: 64, label: '64 kbps', description: 'Niedrig' },
  { value: 128, label: '128 kbps', description: 'Standard' },
  { value: 192, label: '192 kbps', description: 'Hoch' },
  { value: 256, label: '256 kbps', description: 'Sehr hoch' },
  { value: 320, label: '320 kbps', description: 'Maximum' },
]

/** Cover-Bild (N6): JPEG oder PNG bis 5 MB, wie der Server es annimmt. */
export const MAX_COVER_SIZE = 5 * 1024 ** 2
export const COVER_ACCEPT = 'image/jpeg,image/png,.jpg,.jpeg,.png'

export function isAcceptedCover(file: { name: string; size: number }): boolean {
  return /\.(jpe?g|png)$/i.test(file.name) && file.size <= MAX_COVER_SIZE
}

/** Kanäle der Ausgabe: 2 = Stereo (Standard), 1 = Mono. */
export type ChannelCount = 1 | 2

/** Voreinstellungen für Laien (N11): setzen Format, Bitrate und Kanäle auf einmal. */
export interface QualityPreset {
  id: 'speech' | 'music' | 'archive'
  format: OutputFormatId
  bitrate: number
  channels: ChannelCount
}

export const QUALITY_PRESETS: readonly QualityPreset[] = [
  { id: 'speech', format: 'mp3', bitrate: 64, channels: 1 },
  { id: 'music', format: 'mp3', bitrate: 192, channels: 2 },
  { id: 'archive', format: 'mp3', bitrate: 320, channels: 2 },
]

/** Übergang zwischen den Tracks (N4); Grenzen wie server/transitions.js. */
export type TransitionType = 'none' | 'gap' | 'crossfade'
export const TRANSITION_TYPES: readonly TransitionType[] = ['none', 'gap', 'crossfade']
export const MIN_TRANSITION_SECONDS = 0.5
export const MAX_TRANSITION_SECONDS = 10
export const DEFAULT_TRANSITION_SECONDS = 2

// Akzeptierte Eingaben. Entscheidend ist wie beim Server (server/app.js) die
// Dateiendung, unabhängig von Groß-/Kleinschreibung; Browser melden den
// MIME-Typ uneinheitlich (audio/x-wav, audio/wave) oder gar nicht.
export const ACCEPTED_AUDIO_TYPES = [
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/vnd.wave',
  'audio/flac',
  'audio/x-flac',
  'audio/mp4',
  'audio/x-m4a',
  'audio/aac',
  'audio/ogg',
  'audio/opus',
]
export const ACCEPTED_AUDIO_EXTENSIONS = ['.mp3', '.wav', '.flac', '.m4a', '.aac', '.ogg', '.opus']

/** Wert für das accept-Attribut der Dateiauswahl. */
export const ACCEPT_ATTRIBUTE = [...ACCEPTED_AUDIO_EXTENSIONS, ...ACCEPTED_AUDIO_TYPES].join(',')

/** true, wenn der Server die Datei annimmt (erlaubte Endung, beliebige Schreibweise). */
export function isAcceptedAudioFile(file: { name: string }): boolean {
  const name = file.name.toLowerCase()
  return ACCEPTED_AUDIO_EXTENSIONS.some((extension) => name.endsWith(extension))
}
