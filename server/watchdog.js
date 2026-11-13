'use strict'

/**
 * Watchdog für hängende ffmpeg-Prozesse.
 *
 * Ein ffmpeg, das weder endet noch vorankommt (z. B. ein Decoder, der am
 * Dateiende stehen bleibt), würde seinen Konvertierungs-Slot und seinen
 * Encoder-Platz für immer belegen. Der Watchdog beendet einen Prozess, der
 * länger als die Frist kein Lebenszeichen gibt; der Aufrufer meldet dann einen
 * Fehler statt ewig zu warten.
 */

const DEFAULT_STALL_SECONDS = 120
const MAX_STALL_SECONDS = 3600

/**
 * Frist in Millisekunden aus FFMPEG_STALL_TIMEOUT (Sekunden). 0 schaltet den
 * Watchdog ab; fehlende oder ungültige Werte ergeben den Standard.
 * @param {string|undefined} value
 */
function stallTimeoutMs(value) {
  const fallback = DEFAULT_STALL_SECONDS * 1000
  if (value === undefined || value === null || String(value).trim() === '') return fallback
  const seconds = Number(String(value).trim())
  if (!Number.isFinite(seconds) || seconds < 0) return fallback
  return Math.round(Math.min(MAX_STALL_SECONDS, seconds) * 1000)
}

/**
 * Prozess überwachen: bleibt `touch()` länger als `timeoutMs` aus, wird er mit
 * SIGKILL beendet. `stalled` sagt danach, dass der Watchdog zugeschlagen hat.
 * @param {import('child_process').ChildProcess} proc
 * @param {number} timeoutMs  0 = keine Überwachung
 * @param {() => void} [onStall]  z. B. weitere Prozesse derselben Pipeline beenden
 */
function watchStall(proc, timeoutMs, onStall = () => {}) {
  let timer = null
  const state = {
    stalled: false,
    /** Lebenszeichen: Frist beginnt neu. */
    touch() {
      if (timeoutMs <= 0 || state.stalled) return
      clearTimeout(timer)
      timer = setTimeout(() => {
        state.stalled = true
        try {
          proc.kill('SIGKILL')
        } catch {
          /* Prozess ist schon weg */
        }
        onStall()
      }, timeoutMs)
    },
    stop() {
      clearTimeout(timer)
      timer = null
    },
  }
  proc.once('close', state.stop)
  proc.once('error', state.stop)
  state.touch()
  return state
}

module.exports = { stallTimeoutMs, watchStall, DEFAULT_STALL_SECONDS }
