'use strict'

/**
 * Watchdog für hängende ffmpeg-Prozesse und parallele Analyse (P2).
 * Die Ende-zu-Ende-Tests ersetzen ffmpeg durch ein Skript, das bei bestimmten
 * Aufrufen hängen bleibt und sonst das echte ffmpeg startet.
 */
const test = require('node:test')
const assert = require('node:assert/strict')
const { spawn, spawnSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { stallTimeoutMs, watchStall } = require('../watchdog')
const { mapLimit } = require('../parallel')
const { startServer } = require('./helpers')

const HAS_FFMPEG =
  spawnSync('ffmpeg', ['-version']).status === 0 && spawnSync('ffprobe', ['-version']).status === 0
const SKIP = { skip: !HAS_FFMPEG && 'ffmpeg/ffprobe nicht installiert' }
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// --- Reine Helfer ------------------------------------------------------------

test('stallTimeoutMs: Sekunden aus der Umgebung, 0 = aus, Unsinn → Standard', () => {
  assert.equal(stallTimeoutMs(undefined), 120000)
  assert.equal(stallTimeoutMs(''), 120000)
  assert.equal(stallTimeoutMs('30'), 30000)
  assert.equal(stallTimeoutMs(' 1.5 '), 1500)
  assert.equal(stallTimeoutMs('0'), 0)
  assert.equal(stallTimeoutMs('99999'), 3600000)
  for (const bad of ['-1', 'bald', 'NaN', 'Infinity']) {
    assert.equal(stallTimeoutMs(bad), 120000, bad)
  }
})

function idleProcess() {
  return spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' })
}

function exited(proc) {
  return new Promise((resolve) => proc.once('close', (code, signal) => resolve(signal)))
}

test('watchStall: beendet einen Prozess ohne Lebenszeichen', async () => {
  const proc = idleProcess()
  let notified = 0
  const watch = watchStall(proc, 150, () => notified++)
  assert.equal(await exited(proc), 'SIGKILL')
  assert.equal(watch.stalled, true)
  assert.equal(notified, 1)
})

test('watchStall: Lebenszeichen verlängern die Frist, 0 schaltet ab', async () => {
  const proc = idleProcess()
  const watch = watchStall(proc, 200)
  for (let i = 0; i < 6; i++) {
    await sleep(80)
    watch.touch()
  }
  assert.equal(watch.stalled, false)
  assert.equal(proc.exitCode, null)
  watch.stop()

  const off = watchStall(proc, 0)
  await sleep(100)
  assert.equal(off.stalled, false)
  assert.equal(proc.signalCode, null)
  proc.kill('SIGKILL')
  await exited(proc)
})

test('watchStall: nach dem Ende des Prozesses passiert nichts mehr', async () => {
  const proc = spawn(process.execPath, ['-e', ''], { stdio: 'ignore' })
  let notified = 0
  const watch = watchStall(proc, 100, () => notified++)
  await exited(proc)
  await sleep(200)
  assert.equal(watch.stalled, false)
  assert.equal(notified, 0)
})

test('mapLimit: Ergebnisse in Eingabereihenfolge, höchstens limit gleichzeitig', async () => {
  let active = 0
  let peak = 0
  const result = await mapLimit([5, 1, 4, 2, 3, 0], 3, async (value, index) => {
    peak = Math.max(peak, ++active)
    await sleep(value * 5)
    active--
    return `${index}:${value}`
  })
  assert.deepEqual(result, ['0:5', '1:1', '2:4', '3:2', '4:3', '5:0'])
  assert.equal(peak, 3)
  assert.deepEqual(await mapLimit([], 3, async () => 1), [])
  await assert.rejects(
    mapLimit([1], 2, async () => {
      throw new Error('kaputt')
    }),
    /kaputt/,
  )
})

// --- Ende-zu-Ende ------------------------------------------------------------

function ffmpeg(args) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', ...args])
  if (r.status !== 0) throw new Error(r.stderr.toString())
}

/** Ton mit Stille davor und danach (Sekunden). */
function makeTone(dir, name, freq, { lead = 0, tail = 0 } = {}) {
  const file = path.join(dir, name)
  const filter = `adelay=${lead * 1000}|${lead * 1000},apad=pad_dur=${tail}`
  ffmpeg([
    '-f',
    'lavfi',
    '-i',
    `sine=frequency=${freq}:duration=2`,
    '-ac',
    '2',
    ...(lead || tail ? ['-af', filter] : []),
    file,
  ])
  return file
}

/**
 * ffmpeg-Ersatz: bleibt hängen, wenn die Argumente BEIDE Muster enthalten,
 * sonst startet er das echte ffmpeg.
 */
function fakeFfmpeg(dir, patternA, patternB) {
  const file = path.join(dir, 'ffmpeg-hang.sh')
  fs.writeFileSync(
    file,
    [
      '#!/bin/sh',
      'case "$*" in',
      `  *${patternA}*${patternB}*|*${patternB}*${patternA}*) exec sleep 600 ;;`,
      'esac',
      'exec ffmpeg "$@"',
      '',
    ].join('\n'),
    { mode: 0o755 },
  )
  return file
}

function workDir(t) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'plk-wd-'))
  t.after(() => fs.rmSync(work, { recursive: true, force: true }))
  return work
}

/** Server erst nach dem Erzeugen der Testdateien starten (siehe parallel.test.js). */
async function server(t, env) {
  const srv = await startServer(env)
  t.after(() => srv.stop())
  return srv
}

async function uploadAll(base, files) {
  let sessionId
  for (const [i, file] of files.entries()) {
    const form = new FormData()
    form.append('files[]', new Blob([fs.readFileSync(file)]), path.basename(file))
    form.append('order[]', String(i))
    form.append('chunk_index', String(i))
    if (sessionId) form.append('session_id', sessionId)
    const res = await fetch(`${base}/api/upload`, { method: 'POST', body: form })
    assert.equal(res.status, 200)
    sessionId = (await res.json()).session_id
  }
  return sessionId
}

async function startConvert(base, sessionId, extra = {}) {
  const res = await fetch(`${base}/api/convert`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, format: 'mp3', bitrate: 128, ...extra }),
  })
  assert.equal(res.status, 200)
}

async function waitForEnd(base, sessionId) {
  let status
  for (let i = 0; i < 300; i++) {
    status = await (await fetch(`${base}/api/status/${sessionId}`)).json()
    if (status.status === 'done' || status.status === 'error') break
    await sleep(100)
  }
  return status
}

async function outputDuration(base, sessionId, target) {
  const res = await fetch(`${base}/api/download/${sessionId}`)
  assert.equal(res.status, 200)
  fs.writeFileSync(target, Buffer.from(await res.arrayBuffer()))
  const r = spawnSync('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'csv=p=0',
    target,
  ])
  return parseFloat(r.stdout.toString())
}

/** Alle Kindprozesse des Servers (ffmpeg oder dessen Ersatz). */
function children(pid) {
  return spawnSync('pgrep', ['-P', String(pid)])
    .stdout.toString()
    .split('\n')
    .filter(Boolean)
}

async function health(base) {
  return (await fetch(`${base}/health`)).json()
}

test(
  'Watchdog: hängender Track-Encoder (parallel) endet mit Fehler statt ewig',
  SKIP,
  async (t) => {
    const work = workDir(t)
    const files = [0, 1, 2].map((i) => makeTone(work, `t${i}.wav`, 400 + i * 200))
    const srv = await server(t, {
      FFMPEG_PATH: fakeFfmpeg(work, 'libmp3lame', '0001_t1.wav'),
      FFMPEG_STALL_TIMEOUT: '1',
      MAX_PARALLEL_ENCODES: '3',
    })
    const sessionId = await uploadAll(srv.base, files)
    await startConvert(srv.base, sessionId)
    const status = await waitForEnd(srv.base, sessionId)
    assert.equal(status.status, 'error', JSON.stringify(status))
    assert.equal(status.error_code, 'FFMPEG_FAILED')
    assert.match(status.error, /t1\.wav/)
    await sleep(200)
    assert.deepEqual(children(srv.proc.pid), [])
    assert.equal((await health(srv.base)).running, 0)

    // Slot und Encoder-Plätze sind wieder frei: die nächste Konvertierung läuft durch
    const next = await uploadAll(srv.base, [files[0], files[2]])
    await startConvert(srv.base, next)
    assert.equal((await waitForEnd(srv.base, next)).status, 'done')
  },
)

test('Watchdog: hängender Decoder im Ein-Encoder-Weg (OGG) endet mit Fehler', SKIP, async (t) => {
  const work = workDir(t)
  const files = [0, 1].map((i) => makeTone(work, `t${i}.wav`, 400 + i * 200))
  const srv = await server(t, {
    FFMPEG_PATH: fakeFfmpeg(work, 'pipe:1', '0001_t1.wav'),
    FFMPEG_STALL_TIMEOUT: '1',
  })
  const sessionId = await uploadAll(srv.base, files)
  await startConvert(srv.base, sessionId, { format: 'ogg' })
  const status = await waitForEnd(srv.base, sessionId)
  assert.equal(status.status, 'error', JSON.stringify(status))
  assert.equal(status.error_code, 'FFMPEG_FAILED')
  assert.match(status.error, /t1\.wav/)
  await sleep(200)
  assert.deepEqual(children(srv.proc.pid), [])
  assert.equal((await health(srv.base)).running, 0)
})

test(
  'Watchdog: hängende Stille-Suche lässt den Track ungekürzt, der Rest läuft',
  SKIP,
  async (t) => {
    const work = workDir(t)
    // je 1 s Stille davor und danach: gekürzt 2 s, ungekürzt 4 s
    const files = [0, 1].map((i) =>
      makeTone(work, `t${i}.wav`, 400 + i * 200, { lead: 1, tail: 1 }),
    )
    const srv = await server(t, {
      FFMPEG_PATH: fakeFfmpeg(work, 'silencedetect', '0000_t0.wav'),
      FFMPEG_STALL_TIMEOUT: '1',
    })
    const sessionId = await uploadAll(srv.base, files)
    await startConvert(srv.base, sessionId, { trim_silence: true })
    const status = await waitForEnd(srv.base, sessionId)
    assert.equal(status.status, 'done', JSON.stringify(status))
    const seconds = await outputDuration(srv.base, sessionId, path.join(work, 'out.mp3'))
    assert.ok(Math.abs(seconds - 6) < 0.3, `Dauer ${seconds}`)
  },
)

test('P2: Stille-Suche läuft parallel, die Ränder gehören zum richtigen Track', SKIP, async (t) => {
  const work = workDir(t)
  // unterschiedlich viel Stille je Track; nach dem Kürzen bleiben je 2 s Ton
  const leads = [0.5, 2, 1, 3, 1.5]
  const files = leads.map((lead, i) =>
    makeTone(work, `t${i}.wav`, 400 + i * 100, { lead, tail: leads.at(-1 - i) }),
  )
  const srv = await server(t, { MAX_PARALLEL_ENCODES: '3' })
  const sessionId = await uploadAll(srv.base, files)
  await startConvert(srv.base, sessionId, { trim_silence: true })
  const status = await waitForEnd(srv.base, sessionId)
  assert.equal(status.status, 'done', JSON.stringify(status))
  const seconds = await outputDuration(srv.base, sessionId, path.join(work, 'out.mp3'))
  assert.ok(Math.abs(seconds - leads.length * 2) < 0.5, `Dauer ${seconds}`)
  // Kapitel im 2-s-Raster: kein Track hat die Ränder eines anderen bekommen
  status.chapters.forEach((chapter, i) =>
    assert.ok(Math.abs(chapter.start - i * 2) < 0.1 * (i + 1), `Kapitel ${i}: ${chapter.start}`),
  )
})

test('Abbrechen während der Stille-Suche beendet alle Analyse-Prozesse', SKIP, async (t) => {
  const work = workDir(t)
  const files = [0, 1, 2].map((i) => makeTone(work, `t${i}.wav`, 400 + i * 200))
  // jede Stille-Suche hängt; der Watchdog ist aus, nur der Abbruch räumt auf
  const srv = await server(t, {
    FFMPEG_PATH: fakeFfmpeg(work, 'silencedetect', '_t'),
    FFMPEG_STALL_TIMEOUT: '0',
    MAX_PARALLEL_ENCODES: '3',
  })
  const sessionId = await uploadAll(srv.base, files)
  await startConvert(srv.base, sessionId, { trim_silence: true })
  for (let i = 0; i < 50 && children(srv.proc.pid).length < 3; i++) await sleep(100)
  assert.equal(children(srv.proc.pid).length, 3)

  assert.equal((await fetch(`${srv.base}/api/cancel/${sessionId}`, { method: 'POST' })).status, 204)
  await sleep(300)
  assert.deepEqual(children(srv.proc.pid), [])
  assert.equal((await health(srv.base)).running, 0)
})
