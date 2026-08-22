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
 */

const express = require('express')
const cors = require('cors')
const multer = require('multer')
const { spawn } = require('child_process')
const fs = require('fs')
const fsp = require('fs/promises')
const path = require('path')
const crypto = require('crypto')

// --- Konfiguration ---------------------------------------------------------
const PORT = parseInt(process.env.PORT || '9016', 10)
const TEMP_DIR = process.env.TEMP_DIR || path.join(__dirname, 'temp')
const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg'
const FFPROBE = process.env.FFPROBE_PATH || 'ffprobe'
const MAX_CONCURRENT = parseInt(process.env.MAX_CONCURRENT || '3', 10)
const MAX_FILE_SIZE = 500 * 1024 * 1024 // 500 MB pro Datei
const MAX_FILES = 200
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

// --- ffprobe: Dauer / Codec ------------------------------------------------
function ffprobeValue(filePath, args) {
  return new Promise((resolve) => {
    const proc = spawn(FFPROBE, [
      '-v', 'error',
      ...args,
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath,
    ])
    let out = ''
    proc.stdout.on('data', (d) => (out += d.toString()))
    proc.on('error', () => resolve(''))
    proc.on('close', () => resolve(out.trim()))
  })
}

async function probeDuration(filePath) {
  const v = await ffprobeValue(filePath, ['-show_entries', 'format=duration'])
  const num = parseFloat(v)
  return Number.isFinite(num) ? num : 0
}

async function probeAudioCodec(filePath) {
  return ffprobeValue(filePath, ['-select_streams', 'a:0', '-show_entries', 'stream=codec_name'])
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

/** Prüft, ob Stream-Copy möglich ist (alle Inputs = Output-Codec). */
async function canStreamCopy(inputFiles, format) {
  const expected = OUTPUT_FORMATS[format]?.streamCopyCodec
  if (!expected) return false
  for (const file of inputFiles) {
    const codec = await probeAudioCodec(file)
    if (codec !== expected) return false
  }
  return true
}

/** concat.txt für den ffmpeg concat-Demuxer schreiben. */
async function writeConcatFile(dir, inputFiles) {
  const concatPath = path.join(dir, 'concat.txt')
  const lines = inputFiles.map((f) => `file '${f.replace(/'/g, "'\\''")}'`)
  await fsp.writeFile(concatPath, lines.join('\n') + '\n', 'utf8')
  return concatPath
}

// --- Konvertierung ---------------------------------------------------------
async function runConversion(session) {
  const dir = sessionDirPath(session.id)
  const inputFiles = await listInputFiles(dir)

  if (inputFiles.length === 0) {
    session.status = 'error'
    session.error = 'Keine Dateien zum Konvertieren'
    releaseSlot()
    return
  }

  const fmt = OUTPUT_FORMATS[session.format] || OUTPUT_FORMATS[DEFAULT_FORMAT]
  const outputFile = path.join(dir, 'playlist.' + fmt.extension)
  const concatPath = await writeConcatFile(dir, inputFiles)

  // Gesamtdauer für den Fortschritt bestimmen.
  let totalDuration = 0
  for (const file of inputFiles) {
    totalDuration += await probeDuration(file)
  }
  session.totalDuration = totalDuration

  const streamCopy = await canStreamCopy(inputFiles, session.format)

  const args = ['-f', 'concat', '-safe', '0', '-i', concatPath]
  if (streamCopy) {
    args.push('-c:a', 'copy')
  } else {
    args.push('-c:a', fmt.codec, '-b:a', session.bitrate + 'k', '-threads', '0')
  }
  args.push('-y', outputFile)

  session.status = 'converting'
  session.progress = Math.max(session.progress || 0, 1)

  const proc = spawn(FFMPEG, args)
  session.proc = proc

  let stderrTail = ''
  proc.stderr.on('data', (chunk) => {
    const text = chunk.toString()
    stderrTail = (stderrTail + text).slice(-8000)

    // FFmpeg-Zeit: time=00:01:23.45
    const matches = text.match(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/g)
    if (matches && matches.length > 0) {
      const last = matches[matches.length - 1]
      const m = last.match(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/)
      if (m) {
        const seconds = parseInt(m[1], 10) * 3600 + parseInt(m[2], 10) * 60 + parseFloat(m[3])
        if (totalDuration > 0) {
          session.progress = Math.min(99, Math.round((seconds / totalDuration) * 100))
        } else {
          session.progress = Math.min(95, (session.progress || 0) + 1)
        }
      }
    }
  })

  proc.on('error', (err) => {
    session.status = 'error'
    session.error = 'FFmpeg konnte nicht gestartet werden: ' + err.message
    session.proc = null
    releaseSlot()
    processQueue()
  })

  proc.on('close', (code) => {
    session.proc = null
    if (code === 0 && fs.existsSync(outputFile)) {
      let size = 0
      try {
        size = fs.statSync(outputFile).size
      } catch {
        size = 0
      }
      session.status = 'done'
      session.progress = 100
      session.fileSize = size
      session.outputFile = outputFile
    } else {
      session.status = 'error'
      session.error = 'FFmpeg-Fehler (Code ' + code + ')'
      session.stderr = stderrTail
    }
    releaseSlot()
    processQueue()
  })
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
  acquireSlot().then(() => {
    runConversion(session).catch((err) => {
      session.status = 'error'
      session.error = 'Interner Fehler: ' + err.message
      releaseSlot()
      processQueue()
    })
  })
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
app.post('/api/upload', upload.any(), async (req, res) => {
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

    const dir = sessionDirPath(sessionId)
    await fsp.mkdir(dir, { recursive: true })

    let session = sessions.get(sessionId)
    if (!session) {
      session = {
        id: sessionId,
        status: 'uploading',
        progress: 0,
        files: [],
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
  if (session?.proc) {
    try {
      session.proc.kill('SIGKILL')
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

// --- Start -----------------------------------------------------------------
fs.mkdirSync(TEMP_DIR, { recursive: true })
setInterval(periodicCleanup, 15 * 60 * 1000)

app.listen(PORT, '127.0.0.1', () => {
  // eslint-disable-next-line no-console
  console.log(`Playlist Konverter Server läuft auf http://127.0.0.1:${PORT} (temp: ${TEMP_DIR})`)
})
