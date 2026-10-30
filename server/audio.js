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
const { buildMetadataArgs, buildCoverArgs } = require('./metadata')
const { buildChapterArgs } = require('./chapters')

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

// Lautheitsangleichung (N5): einpassig auf -16 LUFS, Spitzen max. -1,5 dBTP
const LOUDNORM_FILTER = 'loudnorm=I=-16:TP=-1.5:LRA=11'

/**
 * ffmpeg-Argumente: eine Datei → einheitliches PCM auf stdout.
 * loudnorm gleicht die Lautheit jedes Tracks an (N5); start/duration schneiden
 * den Track zu (N9, duration null = bis zum Ende).
 */
function buildDecoderArgs(
  inputFile,
  sampleRate,
  { loudnorm = false, start = 0, duration = null } = {},
) {
  return [
    '-hide_banner',
    '-nostdin',
    '-v',
    'error',
    ...(start > 0 ? ['-ss', String(start)] : []),
    '-i',
    inputFile,
    ...(duration !== null ? ['-t', String(duration)] : []),
    '-map',
    '0:a:0',
    '-vn',
    ...(loudnorm ? ['-af', LOUDNORM_FILTER] : []),
    '-f',
    PCM_FORMAT,
    '-ac',
    String(CHANNELS),
    '-ar',
    String(sampleRate),
    'pipe:1',
  ]
}

/**
 * ffmpeg-Argumente: PCM von stdin → Ausgabedatei im Zielformat.
 * outputChannels 1 mischt das Stereo-PCM zu Mono herunter (N11); tags und
 * coverPath (nur MP3) schreiben Titel/Künstler/Album und das Cover (N6),
 * chaptersPath die Kapitel (N2).
 */
function buildEncoderArgs({
  codec,
  bitrate,
  sampleRate,
  outputFile,
  outputChannels = CHANNELS,
  tags,
  coverPath,
  chaptersPath = null,
}) {
  const cover = buildCoverArgs(coverPath)
  const chapters = buildChapterArgs(chaptersPath, coverPath ? 2 : 1, {
    vorbis: codec === 'libvorbis',
  })
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
    ...cover.input,
    ...chapters.input,
    ...(coverPath ? ['-map', '0:a'] : []),
    ...cover.output,
    ...chapters.output,
    '-ac',
    String(outputChannels),
    '-c:a',
    codec,
    '-b:a',
    `${bitrate}k`,
    ...buildMetadataArgs(tags),
    '-threads',
    '0',
    '-y',
    outputFile,
  ]
}

/**
 * ffmpeg-Argumente für Stream-Copy über den concat-Demuxer (nur Audio).
 * Der Demuxer übernimmt keine Tags der Eingaben; eigene Tags und Cover (N6)
 * sowie die Kapitel (N2) kommen dazu.
 */
function buildCopyArgs({ concatPath, outputFile, tags, coverPath, chaptersPath = null }) {
  const cover = buildCoverArgs(coverPath)
  const chapters = buildChapterArgs(chaptersPath, coverPath ? 2 : 1)
  return [
    '-hide_banner',
    '-nostdin',
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    concatPath,
    ...cover.input,
    ...chapters.input,
    '-map',
    '0:a',
    ...cover.output,
    ...chapters.output,
    '-c:a',
    'copy',
    ...buildMetadataArgs(tags),
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
  LOUDNORM_FILTER,
  buildEncoderArgs,
  buildCopyArgs,
  parseFfmpegTime,
  displayName,
  probeAudio,
}
