'use strict'

/**
 * Übergänge zwischen Tracks (N4) im Neukodierungs-Pfad.
 *
 * Alle Decoder liefern dasselbe PCM (f32le, Stereo, feste Rate) nacheinander an
 * EINEN Encoder. Der PcmJoiner sitzt dazwischen:
 * - Pause: zwischen zwei Tracks Stille (Nullen) schreiben.
 * - Crossfade: das Ende jedes Tracks zurückhalten und mit dem Anfang des
 *   nächsten überblenden (gleiche Leistung: cos/sin-Kurve).
 * Speicherbedarf: höchstens die Crossfade-Länge plus ein Chunk pro Track.
 */

const BYTES_PER_SAMPLE = 4
const CHANNELS = 2
const FRAME_BYTES = BYTES_PER_SAMPLE * CHANNELS
const SILENCE_CHUNK = Buffer.alloc(64 * 1024)

const TRANSITIONS = ['none', 'gap', 'crossfade']
const MIN_TRANSITION_SECONDS = 0.5
const MAX_TRANSITION_SECONDS = 10
const DEFAULT_TRANSITION_SECONDS = 2

/**
 * Übergang aus dem Request prüfen: unbekannt → keiner, Sekunden auf
 * 0,5–10 begrenzt und auf halbe Sekunden gerundet.
 * @returns {{ type: 'none'|'gap'|'crossfade', seconds: number }}
 */
function sanitizeTransition(type, seconds) {
  if (!TRANSITIONS.includes(type) || type === 'none') return { type: 'none', seconds: 0 }
  let value = Number(seconds)
  if (!Number.isFinite(value)) value = DEFAULT_TRANSITION_SECONDS
  value = Math.round(value * 2) / 2
  value = Math.min(MAX_TRANSITION_SECONDS, Math.max(MIN_TRANSITION_SECONDS, value))
  return { type, seconds: value }
}

/** Sekunden → Bytes ganzer Frames. */
function secondsToBytes(seconds, sampleRate) {
  return Math.round(seconds * sampleRate) * FRAME_BYTES
}

/**
 * Ausgang (fadeOut) und Eingang (fadeIn) überblenden. fadeIn darf kürzer sein
 * (nächster Track kürzer als die Überblendung); der Rest des Ausgangs blendet
 * dann allein aus.
 */
function crossfade(fadeOut, fadeIn) {
  const frames = fadeOut.length / FRAME_BYTES
  const out = Buffer.alloc(fadeOut.length)
  for (let frame = 0; frame < frames; frame++) {
    const t = ((frame + 0.5) / frames) * (Math.PI / 2)
    const gainOut = Math.cos(t)
    const gainIn = Math.sin(t)
    for (let ch = 0; ch < CHANNELS; ch++) {
      const offset = frame * FRAME_BYTES + ch * BYTES_PER_SAMPLE
      const a = fadeOut.readFloatLE(offset)
      const b = offset + BYTES_PER_SAMPLE <= fadeIn.length ? fadeIn.readFloatLE(offset) : 0
      out.writeFloatLE(a * gainOut + b * gainIn, offset)
    }
  }
  return out
}

/**
 * In den Encoder schreiben und bei vollem Puffer auf „drain“ warten. Ist der
 * Encoder schon weg, wird verworfen (sein Exit-Code meldet den Fehler).
 */
function writeTo(sink, chunk) {
  if (chunk.length === 0 || sink.destroyed || sink.writableEnded) return Promise.resolve()
  if (sink.write(chunk)) return Promise.resolve()
  return new Promise((resolve) => {
    const done = () => {
      sink.off('drain', done)
      sink.off('close', done)
      sink.off('error', done)
      resolve()
    }
    sink.on('drain', done)
    sink.on('close', done)
    sink.on('error', done)
  })
}

class PcmJoiner {
  /**
   * @param {import('stream').Writable} sink  stdin des Encoders
   * @param {{ sampleRate: number, transition?: { type: string, seconds: number } }} options
   */
  constructor(sink, { sampleRate, transition = { type: 'none', seconds: 0 } }) {
    this.sink = sink
    this.gapBytes = transition.type === 'gap' ? secondsToBytes(transition.seconds, sampleRate) : 0
    this.fadeBytes =
      transition.type === 'crossfade' ? secondsToBytes(transition.seconds, sampleRate) : 0
    this.tracks = 0
    /** zurückgehaltenes Ende des vorigen Tracks (Crossfade) */
    this.tail = Buffer.alloc(0)
  }

  async writeSilence(bytes) {
    for (let left = bytes; left > 0; left -= SILENCE_CHUNK.length) {
      await writeTo(this.sink, SILENCE_CHUNK.subarray(0, Math.min(left, SILENCE_CHUNK.length)))
    }
  }

  /** Einen Track (PCM-Stream eines Decoders) vollständig übernehmen. */
  async addTrack(readable) {
    if (this.tracks++ > 0 && this.gapBytes > 0) await this.writeSilence(this.gapBytes)

    // Anfang sammeln, bis er die Länge des zurückgehaltenen Endes erreicht
    const headBytes = this.tail.length
    const head = []
    let headLength = 0
    // Rest des Tracks; die letzten fadeBytes bleiben für den nächsten zurück
    const queue = []
    let queued = 0

    for await (const data of readable) {
      let chunk = data
      if (headLength < headBytes) {
        const take = Math.min(chunk.length, headBytes - headLength)
        head.push(chunk.subarray(0, take))
        headLength += take
        chunk = chunk.subarray(take)
        if (headLength === headBytes) await this.flushCrossfade(Buffer.concat(head))
        if (chunk.length === 0) continue
      }
      if (this.fadeBytes === 0) {
        await writeTo(this.sink, chunk)
        continue
      }
      queue.push(chunk)
      queued += chunk.length
      while (queue.length > 0 && queued - queue[0].length >= this.fadeBytes) {
        const first = queue.shift()
        queued -= first.length
        await writeTo(this.sink, first)
      }
    }

    // Track kürzer als die Überblendung: mit dem vorhandenen Anfang mischen
    if (headLength < headBytes) await this.flushCrossfade(Buffer.concat(head))

    const rest = Buffer.concat(queue)
    const keep = Math.min(rest.length, this.fadeBytes)
    await writeTo(this.sink, rest.subarray(0, rest.length - keep))
    this.tail = Buffer.from(rest.subarray(rest.length - keep))
  }

  async flushCrossfade(head) {
    if (this.tail.length === 0) return
    await writeTo(this.sink, crossfade(this.tail, head))
    this.tail = Buffer.alloc(0)
  }

  /** Ende des letzten Tracks ausgeben. */
  async finish() {
    await writeTo(this.sink, this.tail)
    this.tail = Buffer.alloc(0)
  }
}

/** Länge der Ausgabe in Sekunden (für den Fortschritt). */
function outputDuration(durations, transition) {
  const total = durations.reduce((sum, d) => sum + d, 0)
  const joins = Math.max(0, durations.length - 1)
  if (transition.type === 'gap') return total + joins * transition.seconds
  if (transition.type === 'crossfade') return Math.max(0, total - joins * transition.seconds)
  return total
}

module.exports = {
  PcmJoiner,
  sanitizeTransition,
  outputDuration,
  crossfade,
  FRAME_BYTES,
  TRANSITIONS,
  MIN_TRANSITION_SECONDS,
  MAX_TRANSITION_SECONDS,
}
