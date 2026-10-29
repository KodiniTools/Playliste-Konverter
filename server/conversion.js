'use strict'

/**
 * Eine Session konvertieren: Stream-Copy bei identisch kodierten Eingaben,
 * sonst Decoder→Encoder-Pipeline (siehe audio.js). Fortschritt, Status und
 * Fehler landen direkt im Session-Objekt.
 */
const { spawn } = require('child_process')
const fs = require('fs')
const fsp = require('fs/promises')
const path = require('path')
const { FFMPEG, FFPROBE, OUTPUT_FORMATS, DEFAULT_FORMAT } = require('./config')
const { sessionDirPath, listInputFiles } = require('./sessions')
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
const { PcmJoiner, outputDuration } = require('./transitions')

/** concat.txt für den ffmpeg concat-Demuxer schreiben (nur Stream-Copy-Pfad). */
async function writeConcatFile(dir, inputFiles) {
  const concatPath = path.join(dir, 'concat.txt')
  const lines = inputFiles.map((f) => `file '${f.replace(/'/g, "'\\''")}'`)
  await fsp.writeFile(concatPath, lines.join('\n') + '\n', 'utf8')
  return concatPath
}

/** Fortschritt aus der ffmpeg-Zeit (time=…) relativ zur Gesamtdauer. */
function trackProgress(proc, session, onStderr) {
  proc.stderr.on('data', (chunk) => {
    const text = chunk.toString()
    onStderr(text)
    const seconds = parseFfmpegTime(text)
    if (seconds === null) return
    if (session.totalDuration > 0) {
      session.progress = Math.min(
        99,
        Math.max(1, Math.round((seconds / session.totalDuration) * 100)),
      )
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
  const proc = spawn(
    FFMPEG,
    buildCopyArgs({ concatPath, outputFile, tags: session.tags, coverPath: session.coverPath }),
  )
  session.proc = proc
  let stderrTail = ''
  trackProgress(proc, session, (t) => (stderrTail = (stderrTail + t).slice(-8000)))
  const { code, error } = await waitForExit(proc)
  session.proc = null
  if (error)
    return {
      ok: false,
      error: 'FFmpeg konnte nicht gestartet werden: ' + error.message,
      errorCode: 'FFMPEG_FAILED',
    }
  if (code !== 0)
    return {
      ok: false,
      error: 'FFmpeg-Fehler (Code ' + code + ')',
      errorCode: 'FFMPEG_FAILED',
      stderr: stderrTail,
    }
  return { ok: true }
}

/** Eine Datei in einheitliches PCM dekodieren und über den Joiner in den Encoder schreiben. */
async function decodeInto(session, inputFile, sampleRate, joiner) {
  const dec = spawn(FFMPEG, buildDecoderArgs(inputFile, sampleRate, { loudnorm: session.loudnorm }))
  session.decoder = dec
  let stderrTail = ''
  dec.stderr.on('data', (d) => (stderrTail = (stderrTail + d.toString()).slice(-2000)))
  const [{ code, error }] = await Promise.all([
    waitForExit(dec),
    joiner.addTrack(dec.stdout).catch(() => {}),
  ])
  session.decoder = null
  return { ok: !error && code === 0, stderr: stderrTail }
}

/**
 * Neukodierung: jede Datei einzeln dekodieren (beliebige Codecs, Samplerates,
 * Kanalzahlen) und nacheinander in EINEN Encoder streamen. Kein Zwischenspeicher
 * auf der Platte, keine Grenze bei der Anzahl der Dateien.
 */
async function runReencode(session, inputFiles, probes, fmt, outputFile) {
  const sampleRate = pickSampleRate(
    session.format,
    probes.map((p) => p.sampleRate),
  )
  const encoder = spawn(
    FFMPEG,
    buildEncoderArgs({
      codec: fmt.codec,
      bitrate: session.bitrate,
      sampleRate,
      outputFile,
      outputChannels: session.channels === 1 ? 1 : 2,
      tags: session.tags,
      // Cover trägt nur MP3 (ID3); bei WebM/OGG bleibt es weg
      coverPath: fmt.codec === 'libmp3lame' ? session.coverPath : null,
    }),
  )
  session.proc = encoder
  let stderrTail = ''
  trackProgress(encoder, session, (t) => (stderrTail = (stderrTail + t).slice(-8000)))
  // Stirbt der Encoder, schreibt der Decoder ins Leere (EPIPE): nicht abstürzen,
  // das Ergebnis kommt über den Exit-Code des Encoders.
  encoder.stdin.on('error', () => {})
  const encoderExit = waitForExit(encoder)
  // Pause oder Crossfade zwischen den Tracks (N4)
  const joiner = new PcmJoiner(encoder.stdin, { sampleRate, transition: session.transition })

  let failure = null
  for (const file of inputFiles) {
    if (session.cancelled || encoder.exitCode !== null) break
    const result = await decodeInto(session, file, sampleRate, joiner)
    if (!result.ok && !session.cancelled) {
      failure = {
        ok: false,
        error: `„${displayName(file)}“ konnte nicht gelesen werden.`,
        errorCode: 'FILE_UNREADABLE',
        errorFile: displayName(file),
        stderr: result.stderr,
      }
      break
    }
  }

  if (failure) encoder.kill('SIGKILL')
  else {
    await joiner.finish()
    encoder.stdin.end()
  }

  const { code, error } = await encoderExit
  session.proc = null
  if (failure) return failure
  if (error)
    return {
      ok: false,
      error: 'FFmpeg konnte nicht gestartet werden: ' + error.message,
      errorCode: 'FFMPEG_FAILED',
    }
  if (code !== 0)
    return {
      ok: false,
      error: 'FFmpeg-Fehler (Code ' + code + ')',
      errorCode: 'FFMPEG_FAILED',
      stderr: stderrTail,
    }
  return { ok: true }
}

/**
 * Fehlgeschlagene Konvertierung ins pm2-Log schreiben (inkl. ffmpeg-stderr-Ende),
 * damit sich Nutzerberichte nachvollziehen lassen.
 */
function logFailure(session, message, details) {
  const tail = details ? String(details).slice(-2000) : ''
  // eslint-disable-next-line no-console
  console.error(
    `[convert] Session ${session.id} fehlgeschlagen (${session.mode || 'vor Start'}, ` +
      `${session.format} ${session.bitrate} kbps): ${message}` +
      (tail ? `\n${tail}` : ''),
  )
}

async function runConversion(session) {
  session.transition ??= { type: 'none', seconds: 0 }
  try {
    const dir = sessionDirPath(session.id)
    const inputFiles = await listInputFiles(dir)
    if (inputFiles.length === 0) {
      session.status = 'error'
      session.error = 'Keine Dateien zum Konvertieren'
      session.errorCode = 'NO_FILES'
      return
    }

    const fmt = OUTPUT_FORMATS[session.format] || OUTPUT_FORMATS[DEFAULT_FORMAT]
    const outputFile = path.join(dir, 'playlist.' + fmt.extension)

    const probes = []
    for (const file of inputFiles) probes.push(await probeAudio(FFPROBE, file))
    session.totalDuration = outputDuration(
      probes.map((p) => p.duration),
      session.transition,
    )
    // Während der Analyse abgebrochen: nichts mehr starten
    if (session.cancelled) return

    session.status = 'converting'
    session.progress = Math.max(session.progress || 0, 1)

    // Mono gewünscht: Kopieren nur, wenn die Eingaben schon Mono sind.
    // Übergänge (N4) und Lautheit (N5) brauchen immer die Neukodierung.
    const streamCopy =
      canStreamCopy(probes, fmt.streamCopyCodec) &&
      (session.channels !== 1 || probes.every((p) => p.channels === 1)) &&
      session.transition.type === 'none' &&
      !session.loudnorm
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
      session.errorCode = result.errorCode || 'FFMPEG_FAILED'
      session.errorFile = result.errorFile || null
      logFailure(session, session.error, result.stderr)
    }
  } catch (err) {
    session.status = 'error'
    session.error = 'Interner Fehler: ' + err.message
    session.errorCode = 'INTERNAL'
    logFailure(session, session.error, err.stack)
  } finally {
    session.proc = null
    session.decoder = null
  }
}

module.exports = { runConversion, logFailure }
