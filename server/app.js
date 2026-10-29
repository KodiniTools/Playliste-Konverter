'use strict'

/**
 * Express-App mit allen Routen (ohne listen, siehe server.js).
 *
 * API (hinter nginx unter /playlistkonverter/api/ gemountet):
 *   POST /api/upload         – eine Datei pro Request (files[]), Session-basiert
 *   POST /api/convert        – startet die Konvertierung (session_id, format, bitrate,
 *                               channels?, tags? {title, artist, album}, filename?)
 *   GET  /api/status/:id     – { status, progress, file_size?, error?, error_code?, error_file?,
 *                               queue_position? }
 *   GET  /api/events/:id     – dieselben Daten als Server-Sent Events, bis done/error
 *   GET  /api/download/:id   – liefert die fertige Datei und räumt die Session auf
 *   POST /api/cancel/:id     – bricht ab: ffmpeg beenden, Slot und Dateien freigeben
 *   POST /api/cover/:id      – Cover-Bild (JPEG/PNG) für die MP3-Ausgabe (N6)
 *   GET  /health             – Health-Check für pm2/nginx
 */
const express = require('express')
const multer = require('multer')
const fs = require('fs')
const fsp = require('fs/promises')
const path = require('path')
const crypto = require('crypto')
const { hasRoomFor, exceedsPlaylistLimit, availableBytes, formatGB } = require('./limits')
const {
  TEMP_DIR,
  MAX_FILE_SIZE,
  MAX_FILES,
  MAX_PLAYLIST_SIZE,
  MIN_FREE_SPACE,
  OUTPUT_FORMATS,
  INPUT_EXTENSIONS,
  DEFAULT_FORMAT,
  DEFAULT_BITRATE,
  AVAILABLE_BITRATES,
} = require('./config')
const {
  sessions,
  cancelledIds,
  isValidSessionId,
  sanitizeFilename,
  sessionDirPath,
  listInputFiles,
  safeUnlink,
  cleanupTmpUploads,
} = require('./sessions')
const { enqueueJob, queuePosition } = require('./queue')
const { removeSession } = require('./lifecycle')
const { healthReport } = require('./health')
const {
  MAX_COVER_SIZE,
  sanitizeTags,
  sanitizeOutputName,
  contentDisposition,
  coverExtension,
} = require('./metadata')
const { sanitizeTransition } = require('./transitions')
const { sanitizeTracks } = require('./trim')

const app = express()
app.use(express.json())

// Multer: Uploads temporär in TEMP_DIR ablegen.
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, TEMP_DIR),
    filename: (req, file, cb) => cb(null, 'up_' + crypto.randomBytes(12).toString('hex')),
  }),
  limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILES },
})

// Cover-Bild (N6): ein Bild pro Request, eigenes kleines Limit
const coverUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, TEMP_DIR),
    filename: (req, file, cb) => cb(null, 'cv_' + crypto.randomBytes(12).toString('hex')),
  }),
  limits: { fileSize: MAX_COVER_SIZE, files: 1 },
}).single('cover')

app.get('/health', async (req, res) => {
  res.json(await healthReport())
})

// --- Upload ---------------------------------------------------------------

/**
 * Prüft vor dem Schreiben (also bevor multer die Datei annimmt), ob nach diesem
 * Upload noch MIN_FREE_SPACE frei bleibt. Content-Length enthält die Datei plus
 * etwas Multipart-Overhead – für die Reserve-Prüfung genau genug.
 * Schlägt statfs selbst fehl, wird nicht blockiert (nur geloggt): ein Messfehler
 * soll den Dienst nicht lahmlegen.
 */
async function ensureFreeSpace(req, res, next) {
  try {
    const incoming = parseInt(req.headers['content-length'] || '0', 10) || 0
    const available = await availableBytes(TEMP_DIR)
    if (!hasRoomFor({ available, incoming, reserve: MIN_FREE_SPACE })) {
      // Restlichen Body verwerfen (nicht speichern), damit der Browser die
      // Antwort sicher erhält statt eines Verbindungsabbruchs mitten im Upload.
      req.resume()
      return res.status(507).json({
        error: 'Der Server hat gerade zu wenig freien Speicher. Bitte später erneut versuchen.',
        code: 'INSUFFICIENT_STORAGE',
      })
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Speicherprüfung fehlgeschlagen:', err.message)
  }
  return next()
}

app.post('/api/upload', ensureFreeSpace, upload.any(), async (req, res) => {
  try {
    const files = req.files || []
    if (files.length === 0) {
      return res.status(400).json({ error: 'Keine Dateien hochgeladen', code: 'NO_FILES' })
    }

    // Session bestimmen oder neu anlegen.
    // Express 5: ohne passenden Body-Parser ist req.body undefined
    const body = req.body ?? {}
    let sessionId = body.session_id
    if (sessionId !== undefined && !isValidSessionId(sessionId)) {
      await cleanupTmpUploads(files)
      return res.status(400).json({ error: 'Ungültige Session-ID', code: 'INVALID_SESSION' })
    }
    if (sessionId && cancelledIds.has(sessionId)) {
      await cleanupTmpUploads(files)
      return res.status(410).json({ error: 'Vorgang wurde abgebrochen', code: 'SESSION_CANCELLED' })
    }
    if (!sessionId) {
      sessionId = crypto.randomBytes(16).toString('hex')
    }

    // Gesamtgröße der Sitzung prüfen, bevor etwas in den Sitzungsordner wandert.
    const existing = sessions.get(sessionId)
    const requestBytes = files.reduce((sum, f) => sum + (f.size || 0), 0)
    if (
      exceedsPlaylistLimit({
        current: existing?.totalBytes || 0,
        incoming: requestBytes,
        max: MAX_PLAYLIST_SIZE,
      })
    ) {
      await cleanupTmpUploads(files)
      // Die Sitzung kann nicht mehr fertig werden: bisherige Uploads sofort freigeben.
      if (existing) await removeSession(sessionId)
      return res.status(413).json({
        error: `Die Playlist überschreitet das Maximum von ${formatGB(MAX_PLAYLIST_SIZE)}.`,
        code: 'PLAYLIST_TOO_LARGE',
        max_bytes: MAX_PLAYLIST_SIZE,
      })
    }

    const dir = sessionDirPath(sessionId)
    await fsp.mkdir(dir, { recursive: true })

    let session = existing
    if (!session) {
      session = {
        id: sessionId,
        status: 'uploading',
        progress: 0,
        files: [],
        totalBytes: 0,
        createdAt: Date.now(),
        format: DEFAULT_FORMAT,
        bitrate: DEFAULT_BITRATE,
      }
      sessions.set(sessionId, session)
    }

    // Reihenfolge (order[]) und total_files auslesen.
    const orderRaw = body['order[]'] ?? body.order
    const orderList = Array.isArray(orderRaw) ? orderRaw : orderRaw !== undefined ? [orderRaw] : []
    const chunkIndex = body.chunk_index !== undefined ? parseInt(body.chunk_index, 10) : null

    const stored = []
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const ext = path.extname(file.originalname).toLowerCase().replace('.', '')
      if (!INPUT_EXTENSIONS.includes(ext)) {
        await safeUnlink(file.path)
        continue
      }

      let orderVal = orderList[i] !== undefined ? parseInt(orderList[i], 10) : chunkIndex
      if (!Number.isFinite(orderVal)) orderVal = session.files.length
      const prefix = String(orderVal).padStart(4, '0')
      const safeName = sanitizeFilename(file.originalname)
      const targetName = `${prefix}_${safeName}`
      const targetPath = path.join(dir, targetName)

      await fsp.rename(file.path, targetPath)
      session.files.push(targetName)
      session.totalBytes = (session.totalBytes || 0) + (file.size || 0)
      stored.push(targetName)
    }

    if (stored.length === 0) {
      return res.status(400).json({ error: 'Keine gültigen Audio-Dateien', code: 'NO_FILES' })
    }

    return res.json({
      success: true,
      session_id: sessionId,
      file_count: session.files.length,
      chunk_index: chunkIndex,
    })
  } catch (err) {
    return res
      .status(500)
      .json({ error: 'Upload fehlgeschlagen: ' + err.message, code: 'INTERNAL' })
  }
})

// --- Convert --------------------------------------------------------------
app.post('/api/convert', async (req, res) => {
  try {
    const body = req.body ?? {}
    const sessionId = body.session_id || ''
    if (!isValidSessionId(sessionId)) {
      return res.status(400).json({ error: 'Ungültige Session-ID', code: 'INVALID_SESSION' })
    }

    const session = sessions.get(sessionId)
    const dir = sessionDirPath(sessionId)
    if (!session || !fs.existsSync(dir)) {
      return res.status(404).json({ error: 'Session nicht gefunden', code: 'SESSION_NOT_FOUND' })
    }

    if (session.status === 'converting' || session.status === 'queued') {
      return res
        .status(409)
        .json({ error: 'Konvertierung läuft bereits', code: 'ALREADY_CONVERTING' })
    }

    // Format validieren.
    let format = body.format
    if (!OUTPUT_FORMATS[format]) format = DEFAULT_FORMAT

    // Bitrate validieren + auf Format-Maximum begrenzen.
    let bitrate = parseInt(body.bitrate, 10)
    if (!AVAILABLE_BITRATES.includes(bitrate)) bitrate = DEFAULT_BITRATE
    const maxBitrate = OUTPUT_FORMATS[format].maxBitrate
    if (bitrate > maxBitrate) bitrate = maxBitrate

    const inputFiles = await listInputFiles(dir)
    if (inputFiles.length === 0) {
      return res.status(400).json({ error: 'Keine Dateien zum Konvertieren', code: 'NO_FILES' })
    }

    session.format = format
    session.bitrate = bitrate
    // Tags und Dateiname der Ausgabe (N6), bereinigt
    session.tags = sanitizeTags(body.tags)
    session.outputName = sanitizeOutputName(body.filename)
    // Kanäle: 1 = Mono (Presets „Sprache“, N11), sonst Stereo
    session.channels = parseInt(body.channels, 10) === 1 ? 1 : 2
    // Pause/Crossfade zwischen Tracks (N4) und Lautheitsangleichung (N5)
    session.transition = sanitizeTransition(body.transition, body.transition_seconds)
    session.loudnorm = body.loudnorm === true
    // Trimmen pro Track und Stille am Rand (N9)
    session.tracks = sanitizeTracks(body.tracks)
    session.trimSilence = body.trim_silence === true
    session.error = null
    session.errorCode = null
    session.errorFile = null
    session.fileSize = null

    enqueueJob(session)

    return res.json({
      success: true,
      message: 'Konvertierung gestartet',
      format,
      bitrate,
      queue_position: queuePosition(sessionId),
    })
  } catch (err) {
    return res
      .status(500)
      .json({ error: 'Konvertierung fehlgeschlagen: ' + err.message, code: 'INTERNAL' })
  }
})

// --- Status ---------------------------------------------------------------
/** Status einer Session, wie ihn /status und /events ausliefern. */
function statusPayload(session) {
  const payload = {
    status: session.status,
    progress: session.progress || 0,
    error: session.error || null,
  }
  if (session.errorCode) payload.error_code = session.errorCode
  if (session.errorFile) payload.error_file = session.errorFile
  if (session.fileSize != null) payload.file_size = session.fileSize
  const queuePos = queuePosition(session.id)
  if (queuePos > 0) payload.queue_position = queuePos
  return payload
}

app.get('/api/status/:id', (req, res) => {
  const sessionId = req.params.id
  if (!isValidSessionId(sessionId)) {
    return res.status(400).json({ error: 'Ungültige Session-ID', code: 'INVALID_SESSION' })
  }
  const session = sessions.get(sessionId)
  if (!session) {
    return res.status(404).json({ error: 'Session nicht gefunden', code: 'SESSION_NOT_FOUND' })
  }
  return res.json(statusPayload(session))
})

// --- Events (Server-Sent Events) -------------------------------------------
const EVENT_INTERVAL = 500 // ms zwischen Zustandsprüfungen
const HEARTBEAT_INTERVAL = 15_000 // ms, hält Proxys die Verbindung offen

/**
 * Schickt bei jeder Änderung ein "status"-Event (gleiche Daten wie /status).
 * Endet nach done/error; verschwindet die Session (Abbruch), kommt ein
 * "gone"-Event. Der Client fällt bei Verbindungsfehlern auf Polling zurück.
 */
app.get('/api/events/:id', (req, res) => {
  const sessionId = req.params.id
  if (!isValidSessionId(sessionId)) {
    return res.status(400).json({ error: 'Ungültige Session-ID', code: 'INVALID_SESSION' })
  }
  if (!sessions.has(sessionId)) {
    return res.status(404).json({ error: 'Session nicht gefunden', code: 'SESSION_NOT_FOUND' })
  }

  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    // nginx: Antwort nicht puffern, Events sofort weitergeben
    'X-Accel-Buffering': 'no',
  })
  res.flushHeaders()

  let last = ''
  const finish = () => {
    clearInterval(ticker)
    clearInterval(heartbeat)
    res.end()
  }
  const tick = () => {
    const session = sessions.get(sessionId)
    if (!session) {
      res.write('event: gone\ndata: {}\n\n')
      return finish()
    }
    const data = JSON.stringify(statusPayload(session))
    if (data !== last) {
      last = data
      res.write(`event: status\ndata: ${data}\n\n`)
    }
    if (session.status === 'done' || session.status === 'error') finish()
  }
  const ticker = setInterval(tick, EVENT_INTERVAL)
  const heartbeat = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_INTERVAL)
  req.on('close', () => {
    clearInterval(ticker)
    clearInterval(heartbeat)
  })
  tick()
})

// --- Cover (N6) -------------------------------------------------------------
/**
 * Cover-Bild (JPEG/PNG, max. 5 MB) zur Session speichern; wird bei MP3 als
 * ID3-Bild eingebettet. Muss vor /api/convert kommen.
 */
app.post('/api/cover/:id', (req, res) => {
  const sessionId = req.params.id
  if (!isValidSessionId(sessionId)) {
    return res.status(400).json({ error: 'Ungültige Session-ID', code: 'INVALID_SESSION' })
  }
  coverUpload(req, res, async (err) => {
    const file = req.file
    try {
      if (err) {
        const tooLarge = err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE'
        return res
          .status(tooLarge ? 413 : 400)
          .json({ error: 'Cover abgelehnt', code: tooLarge ? 'COVER_TOO_LARGE' : 'INVALID_COVER' })
      }
      const session = sessions.get(sessionId)
      if (!session || !fs.existsSync(sessionDirPath(sessionId))) {
        return res.status(404).json({ error: 'Session nicht gefunden', code: 'SESSION_NOT_FOUND' })
      }
      if (session.status === 'converting' || session.status === 'queued') {
        return res
          .status(409)
          .json({ error: 'Konvertierung läuft bereits', code: 'ALREADY_CONVERTING' })
      }
      const ext = file && coverExtension(file.originalname)
      if (!ext) {
        return res.status(400).json({ error: 'Nur JPEG oder PNG', code: 'INVALID_COVER' })
      }
      const target = path.join(sessionDirPath(sessionId), `cover.${ext}`)
      await fsp.rename(file.path, target)
      session.coverPath = target
      return res.json({ success: true })
    } catch (e) {
      return res.status(500).json({ error: 'Cover fehlgeschlagen: ' + e.message, code: 'INTERNAL' })
    } finally {
      // Abgelehnte oder nicht verschobene Uploads entfernen
      if (file) await safeUnlink(file.path)
    }
  })
})

// --- Download -------------------------------------------------------------
app.get('/api/download/:id', (req, res) => {
  const sessionId = req.params.id
  if (!isValidSessionId(sessionId)) {
    return res.status(400).type('text/plain').send('Ungültige Session-ID')
  }
  const session = sessions.get(sessionId)
  const dir = sessionDirPath(sessionId)
  if (!session) {
    return res.status(404).type('text/plain').send('Session nicht gefunden')
  }

  const fmt = OUTPUT_FORMATS[session.format] || OUTPUT_FORMATS[DEFAULT_FORMAT]
  const outputFile = path.join(dir, 'playlist.' + fmt.extension)
  if (!fs.existsSync(outputFile)) {
    return res.status(404).type('text/plain').send('Datei nicht gefunden')
  }

  res.setHeader('Content-Type', fmt.mime)
  res.setHeader(
    'Content-Disposition',
    contentDisposition(`${session.outputName || 'playlist'}.${fmt.extension}`),
  )
  res.setHeader('Content-Length', fs.statSync(outputFile).size)

  const stream = fs.createReadStream(outputFile)
  stream.pipe(res)
  stream.on('error', () => {
    if (!res.headersSent) res.status(500).end()
  })
  // Nach erfolgreichem Download Session aufräumen.
  res.on('close', () => {
    if (res.writableFinished) {
      removeSession(sessionId).catch(() => {})
    }
  })
})

// --- Cancel ---------------------------------------------------------------
/**
 * Bricht eine Session ab: laufendes ffmpeg beenden (der Slot wird im finally von
 * runConversion frei), Queue-Eintrag und Dateien entfernen. Idempotent und ohne
 * Body, damit der Browser es auch per navigator.sendBeacon beim Schließen schickt.
 */
app.post('/api/cancel/:id', async (req, res) => {
  const sessionId = req.params.id
  if (!isValidSessionId(sessionId)) {
    return res.status(400).json({ error: 'Ungültige Session-ID', code: 'INVALID_SESSION' })
  }
  // Nur bekannte Sessions merken, damit beliebige IDs die Liste nicht füllen
  if (sessions.has(sessionId)) cancelledIds.set(sessionId, Date.now())
  await removeSession(sessionId)
  return res.status(204).end()
})

// --- Fehler aus multer (z. B. Datei > 500 MB) als JSON statt HTML-500 -------
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        error: `Eine Datei ist größer als ${MAX_FILE_SIZE / 1024 ** 2} MB.`,
        code: 'FILE_TOO_LARGE',
        max_bytes: MAX_FILE_SIZE,
      })
    }
    return res.status(400).json({ error: 'Upload abgelehnt: ' + err.message, code: err.code })
  }
  // eslint-disable-next-line no-console
  console.error(err)
  return res.status(500).json({ error: 'Interner Fehler', code: 'INTERNAL' })
})

module.exports = app
