'use strict'

/**
 * Audio-Hilfen für die Konvertierung (reine Funktionen + ffprobe).
 *
 * Warum nicht einfach der concat-Demuxer? Er übernimmt Codec und Parameter der
 * ERSTEN Datei. Bei gemischten Eingaben (MP3 + WAV, 44,1 + 48 kHz, Mono +
 * Stereo) werden spätere Dateien falsch dekodiert oder verworfen – ffmpeg endet
 * trotzdem mit Code 0, die Playlist ist dann einfach kürzer. Deshalb:
 * - Stream-Copy (schnell, verlustfrei) nur, wenn ALLE Eingaben in Codec,
 *   Samplerate und Kanalzahl übereinstimmen und dem Ausgabe-Codec entsprechen.
 * - Sonst wird jede Datei einzeln in ein einheitliches PCM (Float, Stereo,
 *   feste Samplerate) dekodiert und nacheinander in EINEN Encoder gestreamt.
 */

const { spawn } = require('child_process')

const PCM_FORMAT = 'f32le'
const CHANNELS = 2
const DEFAULT_RATE = 44100
// Samplerates, die ohne Resampling übernommen werden (mp3/vorbis können beide)
const KEEP_RATES = [44100, 48000]

/**
 * Samplerate der Ausgabe. Opus arbeitet intern immer mit 48 kHz; sonst wird eine
 * gemeinsame Rate der Eingaben (44,1/48 kHz) übernommen, alles andere → 44,1 kHz.
 * @param {string} format  'webm' | 'mp3' | 'ogg'
 * @param {number[]} inputRates
 */
function pickSampleRate(format, inputRates) {
  if (format === 'webm') return 48000
  const first = inputRates[0]
  const allSame = inputRates.length > 0 && inputRates.every((r) => r === first)
  return allSame && KEEP_RATES.includes(first) ? first : DEFAULT_RATE
}

/**
 * Stream-Copy ist nur sicher, wenn alle Eingaben identisch kodiert sind.
 * @param {{ codec: string, sampleRate: number, channels: number }[]} probes
 * @param {string|undefined} expectedCodec  Codec des Ausgabeformats
 */
function canStreamCopy(probes, expectedCodec) {
  if (!expectedCodec || probes.length === 0) return false
  const [first] = probes
  return probes.every(
    (p) =>
      p.codec === expectedCodec &&
      p.sampleRate > 0 &&
      p.sampleRate === first.sampleRate &&
      p.channels > 0 &&
      p.channels === first.channels,
  )
}

/** ffmpeg-Argumente: eine Datei → einheitliches PCM auf stdout. */
function buildDecoderArgs(inputFile, sampleRate) {
  return [
    '-hide_banner',
    '-nostdin',
    '-v',
    'error',
    '-i',
    inputFile,
    '-map',
    '0:a:0',
    '-vn',
    '-f',
    PCM_FORMAT,
    '-ac',
    String(CHANNELS),
    '-ar',
    String(sampleRate),
    'pipe:1',
  ]
}

/** ffmpeg-Argumente: PCM von stdin → Ausgabedatei im Zielformat. */
function buildEncoderArgs({ codec, bitrate, sampleRate, outputFile }) {
  return [
    '-hide_banner',
    '-f',
    PCM_FORMAT,
    '-ar',
    String(sampleRate),
    '-ac',
    String(CHANNELS),
    '-i',
    'pipe:0',
    '-c:a',
    codec,
    '-b:a',
    `${bitrate}k`,
    '-threads',
    '0',
    '-y',
    outputFile,
  ]
}

/** ffmpeg-Argumente für Stream-Copy über den concat-Demuxer (nur Audio). */
function buildCopyArgs({ concatPath, outputFile }) {
  return [
    '-hide_banner',
    '-nostdin',
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    concatPath,
    '-map',
    '0:a',
    '-c:a',
    'copy',
    '-y',
    outputFile,
  ]
}

/** Letzte ffmpeg-Zeitangabe (time=HH:MM:SS.xx) in Sekunden, sonst null. */
function parseFfmpegTime(text) {
  const matches = String(text).match(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/g)
  if (!matches) return null
  const m = matches[matches.length - 1].match(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/)
  return parseInt(m[1], 10) * 3600 + parseInt(m[2], 10) * 60 + parseFloat(m[3])
}

/** Gespeicherter Dateiname ohne Reihenfolge-Präfix: "0003_Track.wav" → "Track.wav". */
function displayName(filePath) {
  return String(filePath)
    .split(/[\\/]/)
    .pop()
    .replace(/^\d{4}_/, '')
}

/**
 * Codec, Samplerate, Kanäle und Dauer der ersten Audiospur.
 * @returns {Promise<{ codec: string, sampleRate: number, channels: number, duration: number }>}
 */
function probeAudio(ffprobe, filePath) {
  return new Promise((resolve) => {
    const proc = spawn(ffprobe, [
      '-v',
      'error',
      '-select_streams',
      'a:0',
      '-show_entries',
      'stream=codec_name,sample_rate,channels:format=duration',
      '-of',
      'json',
      filePath,
    ])
    let out = ''
    proc.stdout.on('data', (d) => (out += d.toString()))
    const empty = { codec: '', sampleRate: 0, channels: 0, duration: 0 }
    proc.on('error', () => resolve(empty))
    proc.on('close', () => {
      try {
        const data = JSON.parse(out)
        const stream = data.streams?.[0] || {}
        const duration = parseFloat(data.format?.duration)
        resolve({
          codec: stream.codec_name || '',
          sampleRate: parseInt(stream.sample_rate, 10) || 0,
          channels: parseInt(stream.channels, 10) || 0,
          duration: Number.isFinite(duration) ? duration : 0,
        })
      } catch {
        resolve(empty)
      }
    })
  })
}

module.exports = {
  pickSampleRate,
  canStreamCopy,
  buildDecoderArgs,
  buildEncoderArgs,
  buildCopyArgs,
  parseFfmpegTime,
  displayName,
  probeAudio,
}
