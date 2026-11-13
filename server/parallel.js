'use strict'

/**
 * Paralleles Kodieren (P3): MP3 je Track getrennt kodieren und die Segmente
 * anschließend ohne Neukodierung zusammenfügen.
 *
 * Der MP3-Encoder (LAME) nutzt nur einen Kern. Im bisherigen Weg (ein Encoder
 * für die ganze Playlist) bleibt ein Mehrkern-Server deshalb fast ungenutzt.
 * Hier bekommt jeder Track einen eigenen ffmpeg-Prozess; wie viele gleichzeitig
 * laufen, begrenzt ein Limit über ALLE Konvertierungen (MAX_PARALLEL_ENCODES).
 *
 * Einschränkungen:
 * - Nur MP3: MP3-Segmente lassen sich verlustfrei aneinanderhängen. Vorbis und
 *   Opus tragen Codec-Header je Datei (siehe config.js).
 * - Nicht bei Crossfade: die Überblendung braucht das PCM beider Tracks.
 * - Jedes Segment trägt den Encoder-Vorlauf und das Auffüllen des letzten
 *   Frames (zusammen ca. 25–50 ms). Die Kapitel werden deshalb aus den
 *   tatsächlichen Segmentlängen berechnet.
 */

const os = require('os')

const MAX_LIMIT = 16

/**
 * Anzahl gleichzeitiger Track-Encoder. Ohne (gültige) Angabe: Kerne minus 2,
 * damit Node, nginx und die übrigen Tools Luft behalten. 1 schaltet das
 * parallele Kodieren ab.
 * @param {string|undefined} value  MAX_PARALLEL_ENCODES
 * @param {number} [cpus]
 */
function parallelEncodeLimit(value, cpus = os.availableParallelism()) {
  const fallback = Math.max(1, Math.min(MAX_LIMIT, cpus - 2))
  if (value === undefined || value === null || String(value).trim() === '') return fallback
  const parsed = Number(String(value).trim())
  if (!Number.isInteger(parsed) || parsed < 1) return fallback
  return Math.min(MAX_LIMIT, parsed)
}

/**
 * Zähl-Semaphor mit Warteschlange in Ankunftsreihenfolge. Mehrere
 * Konvertierungen teilen sich so die Encoder-Plätze, statt dass eine lange
 * Playlist alle Plätze bis zu ihrem Ende belegt.
 * @param {number} max
 */
function createLimiter(max) {
  let active = 0
  const waiting = []
  return {
    /** @returns {Promise<() => void>} Freigabe-Funktion (mehrfacher Aufruf ist harmlos) */
    acquire() {
      const grant = () => {
        active++
        let released = false
        return () => {
          if (released) return
          released = true
          active--
          const next = waiting.shift()
          if (next) next(grant())
        }
      }
      if (active < max) return Promise.resolve(grant())
      return new Promise((resolve) => waiting.push(resolve))
    },
    stats: () => ({ active, waiting: waiting.length }),
  }
}

/**
 * Kann diese Konvertierung je Track parallel kodiert werden?
 * @param {{ codec: string, transitionType: string, trackCount: number, limit: number }} params
 */
function canEncodeParallel({ codec, transitionType, trackCount, limit }) {
  return codec === 'libmp3lame' && transitionType !== 'crossfade' && trackCount >= 2 && limit >= 2
}

/**
 * Aufgaben 0..count-1 mit höchstens `workers` gleichzeitig ausführen. Jede
 * Aufgabe wartet zusätzlich auf einen Platz des gemeinsamen Limiters.
 * `shouldStop` beendet das Starten weiterer Aufgaben (Abbruch, Fehler).
 * @param {{
 *   count: number,
 *   workers: number,
 *   limiter: ReturnType<typeof createLimiter>,
 *   shouldStop: () => boolean,
 *   task: (index: number) => Promise<void>,
 * }} params
 */
async function runPool({ count, workers, limiter, shouldStop, task }) {
  let next = 0
  const worker = async () => {
    while (next < count && !shouldStop()) {
      const index = next++
      const release = await limiter.acquire()
      try {
        // Während des Wartens abgebrochen oder ein anderer Track fehlgeschlagen
        if (!shouldStop()) await task(index)
      } finally {
        release()
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(workers, count) }, worker))
}

module.exports = { parallelEncodeLimit, createLimiter, canEncodeParallel, runPool, MAX_LIMIT }
