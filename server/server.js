'use strict'

/**
 * Playlist Konverter – Server-seitiger Konvertierungsdienst
 * ---------------------------------------------------------
 * Läuft als dauerhafter Node-Prozess unter pm2 (wie die übrigen Kodini-Tools)
 * und ersetzt die fragile PHP/Queue-Worker-Lösung. Der Prozess hält den Job im
 * Speicher und verfolgt den echten ffmpeg-Fortschritt – dadurch bleibt die
 * Konvertierung nicht mehr bei ~96 % stehen.
 *
 * Module:
 *   config.js     – Umgebungsvariablen und Formate
 *   sessions.js   – In-Memory-Sessions, Sitzungsordner, Datei-Helfer
 *   conversion.js – ffmpeg-Pipeline (Stream-Copy oder Neukodierung, siehe audio.js)
 *   queue.js      – Warteschlange und Begrenzung paralleler Konvertierungen
 *   lifecycle.js  – Abbruch, Aufräumen nach Download und nach Ablauf
 *   health.js     – Health-Check
 *   app.js        – Express-Routen (API-Übersicht dort)
 */

const fs = require('fs')
const { formatGB } = require('./limits')
const { PORT, TEMP_DIR, MAX_PLAYLIST_SIZE, MIN_FREE_SPACE } = require('./config')
const { periodicCleanup } = require('./lifecycle')
const { logFfmpegVersion } = require('./health')
const app = require('./app')

// --- Start -----------------------------------------------------------------
fs.mkdirSync(TEMP_DIR, { recursive: true })
logFfmpegVersion()
setInterval(periodicCleanup, 15 * 60 * 1000)

app.listen(PORT, '127.0.0.1', (err) => {
  // Express 5 meldet Listen-Fehler (z. B. Port belegt) hier statt per Exception:
  // beenden, damit pm2 neu startet statt einen Prozess ohne Port laufen zu lassen.
  if (err) {
    // eslint-disable-next-line no-console
    console.error('Server konnte nicht starten:', err.message)
    process.exit(1)
  }
  // eslint-disable-next-line no-console
  console.log(
    `Playlist Konverter Server läuft auf http://127.0.0.1:${PORT} (temp: ${TEMP_DIR}, ` +
      `max. Playlist ${formatGB(MAX_PLAYLIST_SIZE)}, Reserve ${formatGB(MIN_FREE_SPACE)})`,
  )
})
