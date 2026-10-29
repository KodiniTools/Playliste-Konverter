'use strict'

/**
 * Health-Check: Dienst läuft, ffmpeg ist aufrufbar, Temp-Partition hat noch die
 * Platzreserve. Antwortet immer mit 200; "status" ist "ok" oder "degraded".
 * Es werden bewusst keine Versionen oder Byte-Zahlen veröffentlicht (/health ist
 * über nginx öffentlich erreichbar) – die ffmpeg-Version steht im pm2-Log.
 */
const { spawnSync } = require('child_process')
const { FFMPEG, TEMP_DIR, MIN_FREE_SPACE } = require('./config')
const { availableBytes, hasRoomFor } = require('./limits')
const { sessions } = require('./sessions')
const { queueStats } = require('./queue')

let ffmpegVersion // undefined = noch nicht geprüft, null = nicht aufrufbar

/** Erste Zeile von `ffmpeg -version` auswerten; null, wenn ffmpeg fehlt. */
function detectFfmpegVersion() {
  const result = spawnSync(FFMPEG, ['-version'], { timeout: 5000, encoding: 'utf8' })
  if (result.status !== 0 || !result.stdout) return null
  const match = /ffmpeg version (\S+)/.exec(result.stdout)
  return match ? match[1] : 'unbekannt'
}

function getFfmpegVersion() {
  if (ffmpegVersion === undefined) ffmpegVersion = detectFfmpegVersion()
  return ffmpegVersion
}

/** Beim Start einmal prüfen und ins Log schreiben. */
function logFfmpegVersion() {
  const version = getFfmpegVersion()
  if (version) {
    // eslint-disable-next-line no-console
    console.log(`ffmpeg ${version} gefunden (${FFMPEG})`)
  } else {
    // eslint-disable-next-line no-console
    console.error(`ffmpeg nicht aufrufbar (${FFMPEG}) – Konvertierungen werden fehlschlagen`)
  }
}

async function healthReport() {
  const { running, queued } = queueStats()
  let storage // true/false; null = Messung fehlgeschlagen
  try {
    const available = await availableBytes(TEMP_DIR)
    storage = hasRoomFor({ available, incoming: 0, reserve: MIN_FREE_SPACE })
  } catch {
    storage = null
  }
  const ffmpeg = getFfmpegVersion() !== null
  return {
    status: ffmpeg && storage !== false ? 'ok' : 'degraded',
    running,
    queued,
    sessions: sessions.size,
    checks: { ffmpeg, storage },
  }
}

module.exports = { healthReport, logFfmpegVersion, detectFfmpegVersion }
