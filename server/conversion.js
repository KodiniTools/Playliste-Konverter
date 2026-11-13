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
const {
  FFMPEG,
  FFPROBE,
  OUTPUT_FORMATS,
  DEFAULT_FORMAT,
  MAX_PARALLEL_ENCODES,
} = require('./config')
const { sessionDirPath, listInputFiles } = require('./sessions')
const {
  pickSampleRate,
  canStreamCopy,
  buildDecoderArgs,
  buildEncoderArgs,
  buildCopyArgs,
  buildSegmentArgs,
  parseFfmpegTime,
  displayName,
  probeAudio,
} = require('./audio')
const { PcmJoiner, outputDuration } = require('./transitions')
const { detectSilenceEdges, segmentFor, segmentLength, trackIndex } = require('./trim')
const { chapterTitle, computeChapters, writeChaptersFile } = require('./chapters')
const { createLimiter, canEncodeParallel, runPool } = require('./parallel')

// Encoder-Plätze für das parallele Kodieren, geteilt von allen Konvertierungen (P3)
const encodeSlots = createLimiter(MAX_PARALLEL_ENCODES)
const NO_TRANSITION = { type: 'none', seconds: 0 }

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

/**
 * Stream-Copy: alle Eingaben identisch kodiert → concat-Demuxer ohne Neukodierung.
 * progress false: der Aufrufer führt den Fortschritt selbst (paralleles Kodieren).
 */
async function runStreamCopy(session, dir, inputFiles, outputFile, { progress = true } = {}) {
  const concatPath = await writeConcatFile(dir, inputFiles)
  const proc = spawn(
    FFMPEG,
    buildCopyArgs({
      concatPath,
      outputFile,
      tags: session.tags,
      coverPath: session.coverPath,
      chaptersPath: session.chaptersPath,
    }),
  )
  session.proc = proc
  let stderrTail = ''
  const keepTail = (t) => (stderrTail = (stderrTail + t).slice(-8000))
  if (progress) trackProgress(proc, session, keepTail)
  else proc.stderr.on('data', (chunk) => keepTail(chunk.toString()))
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

/** ffmpeg-Lauf für ein Segment; der Prozess hängt an session.procs (Abbruch). */
async function runSegment(session, args, onTime = () => {}) {
  const proc = spawn(FFMPEG, args)
  session.procs.add(proc)
  let stderrTail = ''
  proc.stderr.on('data', (chunk) => {
    const text = chunk.toString()
    stderrTail = (stderrTail + text).slice(-2000)
    const seconds = parseFfmpegTime(text)
    if (seconds !== null) onTime(seconds)
  })
  const { code, error } = await waitForExit(proc)
  session.procs.delete(proc)
  return { ok: !error && code === 0, stderr: error ? error.message : stderrTail }
}

/**
 * Paralleles Kodieren (P3, siehe parallel.js): jeder Track wird in einem eigenen
 * ffmpeg-Prozess zu einem MP3-Segment, danach fügt der concat-Demuxer die
 * Segmente ohne Neukodierung zusammen und schreibt Tags, Cover und Kapitel.
 */
async function runParallelEncode(session, dir, inputFiles, probes, segments, outputFile) {
  const sampleRate = pickSampleRate(
    session.format,
    probes.map((p) => p.sampleRate),
  )
  const common = {
    sampleRate,
    bitrate: session.bitrate,
    outputChannels: session.channels === 1 ? 1 : 2,
  }
  const segDir = path.join(dir, 'segments')
  await fsp.mkdir(segDir, { recursive: true })
  session.procs = new Set()
  const segmentFiles = inputFiles.map((_, i) =>
    path.join(segDir, `seg_${String(i).padStart(4, '0')}.mp3`),
  )
  const expected = session.totalDuration
  const encoded = new Array(inputFiles.length).fill(0)
  const updateProgress = () => {
    if (!(expected > 0)) return
    const seconds = encoded.reduce((sum, value) => sum + value, 0)
    // 99 bleibt dem Zusammenfügen vorbehalten
    session.progress = Math.min(98, Math.max(1, Math.round((seconds / expected) * 100)))
  }

  const gapSeconds = session.transition.type === 'gap' ? session.transition.seconds : 0

  let failure = null
  try {
    await runPool({
      count: inputFiles.length,
      workers: MAX_PARALLEL_ENCODES,
      limiter: encodeSlots,
      shouldStop: () => session.cancelled || failure !== null,
      task: async (i) => {
        const result = await runSegment(
          session,
          buildSegmentArgs({
            ...common,
            inputFile: inputFiles[i],
            outputFile: segmentFiles[i],
            loudnorm: session.loudnorm,
            ...segments[i],
            // Pause (N4) als Stille am Ende jedes Tracks außer dem letzten
            padSeconds: i < inputFiles.length - 1 ? gapSeconds : 0,
          }),
          (seconds) => {
            encoded[i] = Math.max(encoded[i], seconds)
            updateProgress()
          },
        )
        if (result.ok || session.cancelled || failure) return
        failure = {
          ok: false,
          error: `„${displayName(inputFiles[i])}“ konnte nicht gelesen werden.`,
          errorCode: 'FILE_UNREADABLE',
          errorFile: displayName(inputFiles[i]),
          stderr: result.stderr,
        }
        // Die übrigen Encoder dieser Konvertierung laufen sonst umsonst weiter
        for (const proc of session.procs) proc.kill('SIGKILL')
      },
    })
    if (failure) return failure
    if (session.cancelled) return { ok: false }

    // Kapitel aus den tatsächlichen Segmentlängen (Encoder-Vorlauf je Segment;
    // die Pause steckt schon im Segment des Vortracks)
    const lengths = await Promise.all(
      segmentFiles.map(async (file) => (await probeAudio(FFPROBE, file)).duration),
    )
    await applyChapters(session, dir, inputFiles, lengths, NO_TRANSITION, { vorbis: false })
    if (session.cancelled) return { ok: false }

    // Leere Segmente (Track komplett weggeschnitten) auslassen: der concat-Demuxer
    // bricht an einer leeren Datei ab und liefert trotzdem Code 0.
    const parts = segmentFiles.filter((_, i) => lengths[i] > 0)
    if (parts.length === 0)
      return { ok: false, error: 'Keine Audiodaten zum Kodieren', errorCode: 'FFMPEG_FAILED' }

    session.progress = 99
    const joined = await runStreamCopy(session, dir, parts, outputFile, { progress: false })
    if (!joined.ok || session.cancelled) return joined
    // Der concat-Demuxer kann still kürzen – die Ausgabe muss alle Segmente enthalten
    const total = lengths.reduce((sum, value) => sum + value, 0)
    const written = (await probeAudio(FFPROBE, outputFile)).duration
    if (written < total - Math.max(1, total * 0.001))
      return {
        ok: false,
        error: `Zusammenfügen unvollständig (${written.toFixed(1)} s von ${total.toFixed(1)} s)`,
        errorCode: 'FFMPEG_FAILED',
      }
    return joined
  } finally {
    session.procs = null
    await fsp.rm(segDir, { recursive: true, force: true }).catch(() => {})
  }
}

/**
 * Gesamtdauer und Kapitel je Track (N2) setzen: in der Datei und für die
 * Tracklist der App. `lengths` sind die Längen der Tracks in der Ausgabe.
 */
async function applyChapters(session, dir, inputFiles, lengths, transition, { vorbis }) {
  session.totalDuration = outputDuration(lengths, transition)
  session.chapters = computeChapters(
    lengths,
    inputFiles.map((file) => session.titles?.[trackIndex(file)] ?? chapterTitle(displayName(file))),
    transition,
  )
  session.chaptersPath = await writeChaptersFile(dir, session.chapters, { vorbis })
}

/** Eine Datei in einheitliches PCM dekodieren und über den Joiner in den Encoder schreiben. */
async function decodeInto(session, inputFile, segment, sampleRate, joiner) {
  const dec = spawn(
    FFMPEG,
    buildDecoderArgs(inputFile, sampleRate, { loudnorm: session.loudnorm, ...segment }),
  )
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
async function runReencode(session, inputFiles, probes, segments, fmt, outputFile) {
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
      chaptersPath: session.chaptersPath,
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
  for (const [i, file] of inputFiles.entries()) {
    if (session.cancelled || encoder.exitCode !== null) break
    const result = await decodeInto(session, file, segments[i], sampleRate, joiner)
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
 * Abschnitt je Track: manuelles Trimmen aus der App und auf Wunsch die Stille
 * am Rand (N9). Die Trim-Angaben sind nach Upload-Reihenfolge indiziert.
 */
async function trackSegments(session, inputFiles, probes) {
  const segments = []
  for (const [i, file] of inputFiles.entries()) {
    const trim = session.tracks?.[trackIndex(file)] ?? null
    let edges = null
    if (session.trimSilence && !session.cancelled) {
      edges = await detectSilenceEdges(FFMPEG, file, probes[i].duration, (proc) => {
        session.decoder = proc
      })
      session.decoder = null
    }
    segments.push(segmentFor(probes[i].duration, trim, edges))
  }
  return segments
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
    const segments = await trackSegments(session, inputFiles, probes)
    const lengths = probes.map((p, i) => segmentLength(p.duration, segments[i]))
    await applyChapters(session, dir, inputFiles, lengths, session.transition, {
      vorbis: fmt.codec === 'libvorbis',
    })
    // Während der Analyse abgebrochen: nichts mehr starten
    if (session.cancelled) return

    session.status = 'converting'
    session.progress = Math.max(session.progress || 0, 1)

    // Mono gewünscht: Kopieren nur, wenn die Eingaben schon Mono sind.
    // Übergänge (N4), Lautheit (N5) und Trimmen (N9) brauchen immer die Neukodierung.
    const streamCopy =
      canStreamCopy(probes, fmt.streamCopyCodec) &&
      (session.channels !== 1 || probes.every((p) => p.channels === 1)) &&
      session.transition.type === 'none' &&
      !session.loudnorm &&
      segments.every((seg) => seg.start === 0 && seg.duration === null)
    // Paralleles Kodieren je Track (P3): nur MP3, nicht bei Crossfade
    const parallel =
      !streamCopy &&
      canEncodeParallel({
        codec: fmt.codec,
        transitionType: session.transition.type,
        trackCount: inputFiles.length,
        limit: MAX_PARALLEL_ENCODES,
      })
    session.mode = streamCopy ? 'copy' : parallel ? 'parallel' : 'reencode'
    let result
    if (streamCopy) result = await runStreamCopy(session, dir, inputFiles, outputFile)
    else if (parallel)
      result = await runParallelEncode(session, dir, inputFiles, probes, segments, outputFile)
    else result = await runReencode(session, inputFiles, probes, segments, fmt, outputFile)

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
    session.procs = null
  }
}

module.exports = { runConversion, logFailure }
