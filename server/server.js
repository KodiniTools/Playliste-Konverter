'use strict'

/**
 * Playlist Konverter – Server-seitiger Konvertierungsdienst
 * ---------------------------------------------------------
 * Läuft als dauerhafter Node-Prozess unter pm2 (wie die übrigen Kodini-Tools)
 * und ersetzt die fragile PHP/Queue-Worker-Lösung. Der Prozess hält den Job im
 * Speicher und verfolgt den echten ffmpeg-Fortschritt – dadurch bleibt die
 * Konvertierung nicht mehr bei ~96 % stehen.
 *
 * API (hinter nginx unter /playlistkonverter/api/ gemountet):
 *   POST /api/upload         – eine Datei pro Request (files[]), Session-basiert
 *   POST /api/convert        – startet die Konvertierung (session_id, format, bitrate)
 *   GET  /api/status/:id     – { status, progress, file_size?, error? }
 *   GET  /api/download/:id   – liefert die fertige Datei und räumt die Session auf
 *   GET  /health             – Health-Check für pm2/nginx
 *
 * Zusammenfügen: Stream-Copy nur bei identisch kodierten Eingaben, sonst jede
 * Datei einzeln dekodieren und in einen Encoder streamen (siehe audio.js).
 */

const express = require('express')
const cors = require('cors')
const multer = require('multer')
const { spawn } = require('child_process')
const fs = require('fs')
const fsp = require('fs/promises')
const path = require('path')
const crypto = require('crypto')
const {
  parseBytes,
  hasRoomFor,
  exceedsPlaylistLimit,
  availableBytes,
  formatGB,
} = require('./limits')
const {
  pickSampleRate,
  canStreamCopy,
  buildDecoderArgs,
  buildEncoderArgs,
  buildCopyArgs,
  parseFfmpegTime,
  displayName,
  probeAudio,
} = require('./audio')

// --- Konfiguration ---------------------------------------------------------
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

const OUTPUT_FORMATS = {
  webm: { extension: 'webm', mime: 'audio/webm', codec: 'libopus', maxBitrate: 256, streamCopyCodec: 'opus' },
  mp3: { extension: 'mp3', mime: 'audio/mpeg', codec: 'libmp3lame', maxBitrate: 320, streamCopyCodec: 'mp3' },
  ogg: { extension: 'ogg', mime: 'audio/ogg', codec: 'libvorbis', maxBitrate: 320, streamCopyCodec: 'vorbis' },
}
const DEFAULT_FORMAT = 'mp3'
const DEFAULT_BITRATE = 192
const AVAILABLE_BITRATES = [64, 128, 192, 256, 320]

// --- Hilfsfunktionen -------------------------------------------------------
function isValidSessionId(id) {
  return typeof id === 'string' && /^[a-f0-9]{32}$/.test(id)
}

function sanitizeFilename(name) {
  return path.basename(String(name)).replace(/[^a-zA-Z0-9._-]/g, '_')
}

function sessionDirPath(sessionId) {
  return path.join(TEMP_DIR, sessionId)
}

/** In-Memory-Zustand aller bekannten Sessions. */
const sessions = new Map()

function getSession(sessionId) {
  return sessions.get(sessionId)
}

// --- Concurrency-Limiter (max. gleichzeitige ffmpeg-Prozesse) --------------
let running = 0
const waiting = []
function acquireSlot() {
  return new Promise((resolve) => {
    if (running < MAX_CONCURRENT) {
      running++
      resolve()
    } else {
      waiting.push(resolve)
    }
  })
}
function releaseSlot() {
  running = Math.max(0, running - 1)
  if (waiting.length > 0 && running < MAX_CONCURRENT) {
    running++
    const next = waiting.shift()
    next()
  }
}

/** Alle Input-Dateien einer Session in korrekter Reihenfolge (0000_, 0001_, …). */
async function listInputFiles(dir) {
  let entries = []
  try {
    entries = await fsp.readdir(dir)
  } catch {
    return []
  }
  return entries
    .filter((f) => /^\d{4}_/.test(f))
    .sort()
    .map((f) => path.join(dir, f))
}

/** concat.txt für den ffmpeg concat-Demuxer schreiben (nur Stream-Copy-Pfad). */
async function writeConcatFile(dir, inputFiles) {
  const concatPath = path.join(dir, 'concat.txt')
  const lines = inputFiles.map((f) => `file '${f.replace(/'/g, "'\\''")}'`)
  await fsp.writeFile(concatPath, lines.join('\n') + '\n', 'utf8')
  return concatPath
}

// --- Konvertierung ---------------------------------------------------------

/** Fortschritt aus der ffmpeg-Zeit (time=…) relativ zur Gesamtdauer. */
function trackProgress(proc, session, onStderr) {
  proc.stderr.on('data', (chunk) => {
    const text = chunk.toString()
    onStderr(text)
    const seconds = parseFfmpegTime(text)
    if (seconds === null) return
    if (session.totalDuration > 0) {
      session.progress = Math.min(99, Math.max(1, Math.round((seconds / session.totalDuration) * 100)))
    } else {
      session.progress = Math.min(95, (session.progress || 0) + 1)
    }
  })
}

/** Wartet auf das Ende eines Prozesses; Startfehler (ENOENT …) zählen als Fehler. */
function waitForExit(proc) {
  return new Promise((resolve) => {
    let done = false
    const finish = (code, error) => {
      if (done) return
      done = true
      resolve({ code, error })
    }
    proc.on('error', (err) => finish(-1, err))
    proc.on('close', (code) => finish(code))
  })
}

/** Stream-Copy: alle Eingaben identisch kodiert → concat-Demuxer ohne Neukodierung. */
async function runStreamCopy(session, dir, inputFiles, outputFile) {
  const concatPath = await writeConcatFile(dir, inputFiles)
  const proc = spawn(FFMPEG, buildCopyArgs({ concatPath, outputFile }))
  session.proc = proc
  let stderrTail = ''
  trackProgress(proc, session, (t) => (stderrTail = (stderrTail + t).slice(-8000)))
  const { code, error } = await waitForExit(proc)
  session.proc = null
  if (error) return { ok: false, error: 'FFmpeg konnte nicht gestartet werden: ' + error.message }
  if (code !== 0) return { ok: false, error: 'FFmpeg-Fehler (Code ' + code + ')', stderr: stderrTail }
  return { ok: true }
}

/** Eine Datei in einheitliches PCM dekodieren und in den Encoder schreiben. */
async function decodeInto(session, inputFile, sampleRate, sink) {
  const dec = spawn(FFMPEG, buildDecoderArgs(inputFile, sampleRate))
  session.decoder = dec
  let stderrTail = ''
  dec.stderr.on('data', (d) => (stderrTail = (stderrTail + d.toString()).slice(-2000)))
  dec.stdout.pipe(sink, { end: false })
  const { code, error } = await waitForExit(dec)
  session.decoder = null
  return { ok: !error && code === 0, stderr: stderrTail }
}

/**
 * Neukodierung: jede Datei einzeln dekodieren (beliebige Codecs, Samplerates,
 * Kanalzahlen) und nacheinander in EINEN Encoder streamen. Kein Zwischenspeicher
 * auf der Platte, keine Grenze bei der Anzahl der Dateien.
 */
async function runReencode(session, inputFiles, probes, fmt, outputFile) {
  const sampleRate = pickSampleRate(session.format, probes.map((p) => p.sampleRate))
  const encoder = spawn(
    FFMPEG,
    buildEncoderArgs({ codec: fmt.codec, bitrate: session.bitrate, sampleRate, outputFile }),
  )
  session.proc = encoder
  let stderrTail = ''
  trackProgress(encoder, session, (t) => (stderrTail = (stderrTail + t).slice(-8000)))
  // Stirbt der Encoder, schreibt der Decoder ins Leere (EPIPE): nicht abstürzen,
  // das Ergebnis kommt über den Exit-Code des Encoders.
  encoder.stdin.on('error', () => {})
  const encoderExit = waitForExit(encoder)

  let failure = null
  for (const file of inputFiles) {
    if (session.cancelled || encoder.exitCode !== null) break
    const result = await decodeInto(session, file, sampleRate, encoder.stdin)
    if (!result.ok && !session.cancelled) {
      failure = {
        ok: false,
        error: `„${displayName(file)}“ konnte nicht gelesen werden.`,
        stderr: result.stderr,
      }
      break
    }
  }

  if (failure) encoder.kill('SIGKILL')
  else encoder.stdin.end()

  const { code, error } = await encoderExit
  session.proc = null
  if (failure) return failure
  if (error) return { ok: false, error: 'FFmpeg konnte nicht gestartet werden: ' + error.message }
  if (code !== 0) return { ok: false, error: 'FFmpeg-Fehler (Code ' + code + ')', stderr: stderrTail }
  return { ok: true }
}

async function runConversion(session) {
  try {
    const dir = sessionDirPath(session.id)
    const inputFiles = await listInputFiles(dir)
    if (inputFiles.length === 0) {
      session.status = 'error'
      session.error = 'Keine Dateien zum Konvertieren'
      return
    }

    const fmt = OUTPUT_FORMATS[session.format] || OUTPUT_FORMATS[DEFAULT_FORMAT]
    const outputFile = path.join(dir, 'playlist.' + fmt.extension)

    const probes = []
    for (const file of inputFiles) probes.push(await probeAudio(FFPROBE, file))
    session.totalDuration = probes.reduce((sum, p) => sum + p.duration, 0)

    session.status = 'converting'
    session.progress = Math.max(session.progress || 0, 1)

    const streamCopy = canStreamCopy(probes, fmt.streamCopyCodec)
    session.mode = streamCopy ? 'copy' : 'reencode'
    const result = streamCopy
      ? await runStreamCopy(session, dir, inputFiles, outputFile)
      : await runReencode(session, inputFiles, probes, fmt, outputFile)

    if (session.cancelled) return
    if (result.ok && fs.existsSync(outputFile)) {
      session.status = 'done'
      session.progress = 100
      session.fileSize = fs.statSync(outputFile).size
      session.outputFile = outputFile
    } else {
      session.status = 'error'
      session.error = result.error || 'Ausgabedatei fehlt'
      session.stderr = result.stderr
    }
  } catch (err) {
    session.status = 'error'
    session.error = 'Interner Fehler: ' + err.message
  } finally {
    session.proc = null
    session.decoder = null
    releaseSlot()
    processQueue()
  }
}

// --- Job-Queue (innerhalb des Prozesses) -----------------------------------
const jobQueue = []
function enqueueJob(session) {
  session.status = 'queued'
  session.progress = 0
  jobQueue.push(session.id)
  processQueue()
}

function processQueue() {
  if (jobQueue.length === 0) return
  if (running >= MAX_CONCURRENT) return
  const sessionId = jobQueue.shift()
  const session = sessions.get(sessionId)
  if (!session) {
    processQueue()
    return
  }
  // runConversion fängt alle Fehler selbst und gibt den Slot im finally frei
  acquireSlot().then(() => runConversion(session))
}

// --- Express-App -----------------------------------------------------------
const app = express()
app.use(cors())
app.use(express.json())

// Multer: Uploads temporär in TEMP_DIR ablegen.
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, TEMP_DIR),
    filename: (req, file, cb) => cb(null, 'up_' + crypto.randomBytes(12).toString('hex')),
  }),
  limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILES },
})

app.get('/health', (req, res) => {
  res.json({ status: 'ok', running, queued: jobQueue.length })
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
      return res.status(400).json({ error: 'Keine Dateien hochgeladen' })
    }

    // Session bestimmen oder neu anlegen.
    let sessionId = req.body.session_id
    if (sessionId !== undefined && !isValidSessionId(sessionId)) {
      await cleanupTmpUploads(files)
      return res.status(400).json({ error: 'Ungültige Session-ID' })
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
    const orderRaw = req.body['order[]'] ?? req.body.order
    const orderList = Array.isArray(orderRaw) ? orderRaw : orderRaw !== undefined ? [orderRaw] : []
    const chunkIndex = req.body.chunk_index !== undefined ? parseInt(req.body.chunk_index, 10) : null

    const stored = []
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const ext = path.extname(file.originalname).toLowerCase().replace('.', '')
      if (!['mp3', 'wav'].includes(ext)) {
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
      return res.status(400).json({ error: 'Keine gültigen Audio-Dateien' })
    }

    return res.json({
      success: true,
      session_id: sessionId,
      file_count: session.files.length,
      chunk_index: chunkIndex,
    })
  } catch (err) {
    return res.status(500).json({ error: 'Upload fehlgeschlagen: ' + err.message })
  }
})

// --- Convert --------------------------------------------------------------
app.post('/api/convert', async (req, res) => {
  try {
    const sessionId = req.body.session_id || ''
    if (!isValidSessionId(sessionId)) {
      return res.status(400).json({ error: 'Ungültige Session-ID' })
    }

    const session = sessions.get(sessionId)
    const dir = sessionDirPath(sessionId)
    if (!session || !fs.existsSync(dir)) {
      return res.status(404).json({ error: 'Session nicht gefunden' })
    }

    if (session.status === 'converting' || session.status === 'queued') {
      return res.status(409).json({ error: 'Konvertierung läuft bereits' })
    }

    // Format validieren.
    let format = req.body.format
    if (!OUTPUT_FORMATS[format]) format = DEFAULT_FORMAT

    // Bitrate validieren + auf Format-Maximum begrenzen.
    let bitrate = parseInt(req.body.bitrate, 10)
    if (!AVAILABLE_BITRATES.includes(bitrate)) bitrate = DEFAULT_BITRATE
    const maxBitrate = OUTPUT_FORMATS[format].maxBitrate
    if (bitrate > maxBitrate) bitrate = maxBitrate

    const inputFiles = await listInputFiles(dir)
    if (inputFiles.length === 0) {
      return res.status(400).json({ error: 'Keine Dateien zum Konvertieren' })
    }

    session.format = format
    session.bitrate = bitrate
    session.extension = OUTPUT_FORMATS[format].extension
    session.error = null
    session.fileSize = null

    enqueueJob(session)

    return res.json({
      success: true,
      message: 'Konvertierung gestartet',
      format,
      bitrate,
      queue_position: jobQueue.indexOf(sessionId) + 1,
    })
  } catch (err) {
    return res.status(500).json({ error: 'Konvertierung fehlgeschlagen: ' + err.message })
  }
})

// --- Status ---------------------------------------------------------------
app.get('/api/status/:id', (req, res) => {
  const sessionId = req.params.id
  if (!isValidSessionId(sessionId)) {
    return res.status(400).json({ error: 'Ungültige Session-ID' })
  }
  const session = sessions.get(sessionId)
  if (!session) {
    return res.status(404).json({ error: 'Session nicht gefunden' })
  }

  const response = {
    status: session.status,
    progress: session.progress || 0,
    error: session.error || null,
  }
  if (session.fileSize != null) response.file_size = session.fileSize
  const queuePos = jobQueue.indexOf(sessionId)
  if (queuePos >= 0) response.queue_position = queuePos + 1
  return res.json(response)
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
  res.setHeader('Content-Disposition', `attachment; filename="playlist.${fmt.extension}"`)
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

// --- Cleanup ---------------------------------------------------------------
async function safeUnlink(p) {
  try {
    await fsp.unlink(p)
  } catch {
    /* ignore */
  }
}

async function cleanupTmpUploads(files) {
  await Promise.all((files || []).map((f) => safeUnlink(f.path)))
}

async function removeSession(sessionId) {
  const session = sessions.get(sessionId)
  if (session) session.cancelled = true
  for (const proc of [session?.decoder, session?.proc]) {
    if (!proc) continue
    try {
      proc.kill('SIGKILL')
    } catch {
      /* ignore */
    }
  }
  sessions.delete(sessionId)
  const idx = jobQueue.indexOf(sessionId)
  if (idx >= 0) jobQueue.splice(idx, 1)
  await fsp.rm(sessionDirPath(sessionId), { recursive: true, force: true }).catch(() => {})
}

/** Periodischer Cleanup: alte Sessions (> 1 h) entfernen. */
async function periodicCleanup() {
  const now = Date.now()
  for (const [id, session] of sessions) {
    if (now - session.createdAt > SESSION_MAX_AGE) {
      await removeSession(id)
    }
  }
  // Verwaiste Verzeichnisse (z. B. nach Neustart) ebenfalls entfernen.
  try {
    const dirs = await fsp.readdir(TEMP_DIR, { withFileTypes: true })
    for (const d of dirs) {
      if (!d.isDirectory()) continue
      if (sessions.has(d.name)) continue
      const full = path.join(TEMP_DIR, d.name)
      try {
        const stat = await fsp.stat(full)
        if (now - stat.mtimeMs > SESSION_MAX_AGE) {
          await fsp.rm(full, { recursive: true, force: true })
        }
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
}

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

// --- Start -----------------------------------------------------------------
fs.mkdirSync(TEMP_DIR, { recursive: true })
setInterval(periodicCleanup, 15 * 60 * 1000)

app.listen(PORT, '127.0.0.1', () => {
  // eslint-disable-next-line no-console
  console.log(
    `Playlist Konverter Server läuft auf http://127.0.0.1:${PORT} (temp: ${TEMP_DIR}, ` +
      `max. Playlist ${formatGB(MAX_PLAYLIST_SIZE)}, Reserve ${formatGB(MIN_FREE_SPACE)})`,
  )
})
