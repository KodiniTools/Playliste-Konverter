'use strict'

/** Konfiguration des Dienstes (Umgebungsvariablen mit Standardwerten). */
const path = require('path')
const { parseBytes } = require('./limits')

const PORT = parseInt(process.env.PORT || '9016', 10)
const TEMP_DIR = process.env.TEMP_DIR || path.join(__dirname, 'temp')
const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg'
const FFPROBE = process.env.FFPROBE_PATH || 'ffprobe'
const MAX_CONCURRENT = parseInt(process.env.MAX_CONCURRENT || '3', 10)
const MAX_FILE_SIZE = parseBytes(process.env.MAX_FILE_SIZE, 500 * 1024 ** 2) // 500 MB pro Datei
const MAX_FILES = 200
// Gesamtgröße pro Sitzung – gleicher Wert wie MAX_PLAYLIST_SIZE der App (src/constants.js)
const MAX_PLAYLIST_SIZE = parseBytes(process.env.MAX_PLAYLIST_SIZE, 5 * 1024 ** 3)
// Freier Platz, der auf der Partition des Temp-Ordners immer bleiben muss
const MIN_FREE_SPACE = parseBytes(process.env.MIN_FREE_SPACE, 20 * 1024 ** 3)
const SESSION_MAX_AGE = 60 * 60 * 1000 // 1 Stunde

// Erlaubte Eingabe-Endungen (gleiche Liste wie ACCEPTED_AUDIO_EXTENSIONS der App)
const INPUT_EXTENSIONS = ['mp3', 'wav', 'flac', 'm4a', 'aac', 'ogg', 'opus']

// Stream-Copy (streamCopyCodec) nur für MP3: MP3-Frames sind unabhängig. Bei
// Vorbis und Opus trägt jede Datei eigene Codec-Header, die der concat-Demuxer
// nicht übernimmt – solche Eingaben (seit OGG/OPUS erlaubt sind) werden neu kodiert.
const OUTPUT_FORMATS = {
  webm: {
    extension: 'webm',
    mime: 'audio/webm',
    codec: 'libopus',
    maxBitrate: 256,
  },
  mp3: {
    extension: 'mp3',
    mime: 'audio/mpeg',
    codec: 'libmp3lame',
    maxBitrate: 320,
    streamCopyCodec: 'mp3',
  },
  ogg: {
    extension: 'ogg',
    mime: 'audio/ogg',
    codec: 'libvorbis',
    maxBitrate: 320,
  },
}
const DEFAULT_FORMAT = 'mp3'
const DEFAULT_BITRATE = 192
const AVAILABLE_BITRATES = [64, 128, 192, 256, 320]

module.exports = {
  PORT,
  TEMP_DIR,
  FFMPEG,
  FFPROBE,
  MAX_CONCURRENT,
  MAX_FILE_SIZE,
  MAX_FILES,
  MAX_PLAYLIST_SIZE,
  MIN_FREE_SPACE,
  SESSION_MAX_AGE,
  OUTPUT_FORMATS,
  INPUT_EXTENSIONS,
  DEFAULT_FORMAT,
  DEFAULT_BITRATE,
  AVAILABLE_BITRATES,
}
