'use strict'

/**
 * Trimmen pro Track und Stille am Rand (N9).
 *
 * Start/Ende kommen aus der App (Sekunden, je Track in Upload-Reihenfolge).
 * Die Stille am Anfang und Ende wird vorab mit silencedetect gesucht und dann
 * genauso wie ein manuelles Trimmen per -ss/-t im Decoder umgesetzt. Das braucht
 * einen zusätzlichen Dekodierlauf, aber keinen Puffer (anders als areverse).
 */

const { spawn } = require('child_process')

const MAX_TRACKS = 1000
const SILENCE_THRESHOLD = '-50dB'
const SILENCE_MIN_SECONDS = 0.2
// Toleranz für „beginnt bei 0“ bzw. „reicht bis zum Ende“ (Encoder-Versatz bei MP3)
const EDGE_TOLERANCE = 0.15

const roundMs = (value) => Math.round(value * 1000) / 1000

/**
 * Trim-Angaben aus dem Request prüfen.
 * @returns {({ start: number, end: number|null } | null)[]}  null = nicht getrimmt
 */
function sanitizeTracks(input) {
  if (!Array.isArray(input)) return []
  return input.slice(0, MAX_TRACKS).map((track) => {
    if (!track || typeof track !== 'object') return null
    const start = Number(track.start)
    const end = track.end == null ? null : Number(track.end)
    const cleanStart = Number.isFinite(start) && start > 0 ? roundMs(start) : 0
    const cleanEnd = end !== null && Number.isFinite(end) && end > cleanStart ? roundMs(end) : null
    return cleanStart === 0 && cleanEnd === null ? null : { start: cleanStart, end: cleanEnd }
  })
}

/**
 * silencedetect-Ausgabe auswerten: Ende der Stille am Anfang und Beginn der
 * Stille am Schluss.
 * @returns {{ start: number, end: number|null }}  end null = keine Stille am Ende
 */
function parseSilenceEdges(stderr, duration) {
  const events = []
  for (const m of String(stderr).matchAll(/silence_(start|end): (-?[\d.]+)/g)) {
    events.push({ kind: m[1], at: Math.max(0, parseFloat(m[2])) })
  }
  let start = 0
  let end = null
  const first = events[0]
  if (first?.kind === 'start' && first.at <= EDGE_TOLERANCE) {
    const close = events[1]
    // Kein Ende: die ganze Datei ist still
    start = close?.kind === 'end' ? close.at : duration
  }
  const last = events[events.length - 1]
  if (last?.kind === 'start' && last.at > start) end = last.at
  if (last?.kind === 'end' && duration > 0 && last.at >= duration - EDGE_TOLERANCE) {
    const open = events[events.length - 2]
    if (open?.kind === 'start' && open.at > start) end = open.at
  }
  return { start: roundMs(start), end: end === null ? null : roundMs(end) }
}

/**
 * Stille am Rand einer Datei suchen (eigener ffmpeg-Lauf).
 * onSpawn bekommt den Prozess, damit ein Abbruch ihn beenden kann.
 */
function detectSilenceEdges(ffmpeg, filePath, duration, onSpawn = () => {}) {
  return new Promise((resolve) => {
    const proc = spawn(ffmpeg, [
      '-hide_banner',
      '-nostdin',
      '-i',
      filePath,
      '-map',
      '0:a:0',
      '-af',
      `silencedetect=noise=${SILENCE_THRESHOLD}:d=${SILENCE_MIN_SECONDS}`,
      '-f',
      'null',
      '-',
    ])
    onSpawn(proc)
    let stderr = ''
    proc.stderr.on('data', (d) => {
      const text = d.toString()
      // nur die silencedetect-Zeilen behalten
      for (const line of text.split('\n')) if (line.includes('silence_')) stderr += line + '\n'
    })
    proc.on('error', () => resolve({ start: 0, end: null }))
    proc.on('close', (code) =>
      resolve(code === 0 ? parseSilenceEdges(stderr, duration) : { start: 0, end: null }),
    )
  })
}

/**
 * Abschnitt eines Tracks aus manuellem Trimmen und Stille-Rändern.
 * @param {number} duration  Dauer laut ffprobe (0 = unbekannt)
 * @param {{ start: number, end: number|null } | null} trim
 * @param {{ start: number, end: number|null } | null} edges
 * @returns {{ start: number, duration: number|null }}  duration null = bis zum Ende
 */
function segmentFor(duration, trim, edges) {
  let start = Math.max(trim?.start ?? 0, edges?.start ?? 0)
  const ends = [trim?.end, edges?.end].filter((v) => typeof v === 'number')
  let end = ends.length > 0 ? Math.min(...ends) : null
  if (duration > 0) {
    start = Math.min(start, duration)
    if (end !== null && end >= duration) end = null
  }
  if (end === null) return { start, duration: null }
  return { start, duration: Math.max(0, roundMs(end - start)) }
}

/** Länge eines Abschnitts in Sekunden (für Fortschritt). */
function segmentLength(duration, segment) {
  if (segment.duration !== null) return segment.duration
  return Math.max(0, duration - segment.start)
}

/** Track-Index aus dem gespeicherten Dateinamen („0003_Name.mp3“ → 3). */
function trackIndex(filePath) {
  const name = String(filePath).split(/[\\/]/).pop()
  return parseInt(name.slice(0, 4), 10)
}

module.exports = {
  sanitizeTracks,
  parseSilenceEdges,
  detectSilenceEdges,
  segmentFor,
  segmentLength,
  trackIndex,
  MAX_TRACKS,
}
