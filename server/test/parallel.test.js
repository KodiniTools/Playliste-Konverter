'use strict'

/**
 * Paralleles Kodieren (P3): reine Helfer aus parallel.js und Ende-zu-Ende mit
 * echtem Server. Die ffmpeg-Tests werden ohne ffmpeg/ffprobe übersprungen.
 */
const test = require('node:test')
const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { parallelEncodeLimit, createLimiter, canEncodeParallel, runPool } = require('../parallel')
const { buildSegmentArgs, LOUDNORM_FILTER } = require('../audio')
const { startServer } = require('./helpers')

const HAS_FFMPEG =
  spawnSync('ffmpeg', ['-version']).status === 0 && spawnSync('ffprobe', ['-version']).status === 0
const SKIP = { skip: !HAS_FFMPEG && 'ffmpeg/ffprobe nicht installiert' }
const SECONDS = 2
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// --- Reine Helfer ------------------------------------------------------------

test('parallelEncodeLimit: Kerne minus 2 als Standard, ungültige Werte fallen zurück', () => {
  assert.equal(parallelEncodeLimit(undefined, 8), 6)
  assert.equal(parallelEncodeLimit('', 8), 6)
  assert.equal(parallelEncodeLimit(undefined, 4), 2)
  assert.equal(parallelEncodeLimit(undefined, 2), 1)
  assert.equal(parallelEncodeLimit(undefined, 1), 1)
  assert.equal(parallelEncodeLimit(undefined, 64), 16)
  assert.equal(parallelEncodeLimit('3', 8), 3)
  assert.equal(parallelEncodeLimit(' 1 ', 8), 1)
  assert.equal(parallelEncodeLimit('99', 8), 16)
  for (const bad of ['0', '-2', '2.5', 'viele', 'NaN']) {
    assert.equal(parallelEncodeLimit(bad, 8), 6, bad)
  }
})

test('canEncodeParallel: nur MP3, nicht bei Crossfade, ab zwei Tracks und Limit 2', () => {
  const ok = { codec: 'libmp3lame', transitionType: 'none', trackCount: 2, limit: 2 }
  assert.equal(canEncodeParallel(ok), true)
  assert.equal(canEncodeParallel({ ...ok, transitionType: 'gap' }), true)
  assert.equal(canEncodeParallel({ ...ok, transitionType: 'crossfade' }), false)
  assert.equal(canEncodeParallel({ ...ok, codec: 'libopus' }), false)
  assert.equal(canEncodeParallel({ ...ok, codec: 'libvorbis' }), false)
  assert.equal(canEncodeParallel({ ...ok, trackCount: 1 }), false)
  assert.equal(canEncodeParallel({ ...ok, limit: 1 }), false)
})

test('createLimiter: höchstens max gleichzeitig, Vergabe in Ankunftsreihenfolge', async () => {
  const limiter = createLimiter(2)
  const a = await limiter.acquire()
  const b = await limiter.acquire()
  const order = []
  const c = limiter.acquire().then((release) => (order.push('c'), release))
  const d = limiter.acquire().then((release) => (order.push('d'), release))
  await sleep(5)
  assert.deepEqual(limiter.stats(), { active: 2, waiting: 2 })
  assert.deepEqual(order, [])

  a()
  a() // doppelte Freigabe darf keinen zweiten Platz freigeben
  const releaseC = await c
  await sleep(5)
  assert.deepEqual(order, ['c'])
  assert.deepEqual(limiter.stats(), { active: 2, waiting: 1 })

  b()
  const releaseD = await d
  assert.deepEqual(order, ['c', 'd'])
  releaseC()
  releaseD()
  assert.deepEqual(limiter.stats(), { active: 0, waiting: 0 })
})

test('runPool: alle Aufgaben, begrenzt durch Worker und gemeinsamen Limiter', async () => {
  const limiter = createLimiter(2)
  let active = 0
  let peak = 0
  const done = []
  await runPool({
    count: 7,
    workers: 5,
    limiter,
    shouldStop: () => false,
    task: async (i) => {
      peak = Math.max(peak, ++active)
      await sleep(5)
      active--
      done.push(i)
    },
  })
  assert.equal(peak, 2)
  assert.deepEqual(
    done.sort((x, y) => x - y),
    [0, 1, 2, 3, 4, 5, 6],
  )
  assert.deepEqual(limiter.stats(), { active: 0, waiting: 0 })
})

test('runPool: startet nach Stopp nichts mehr und gibt Plätze auch bei Fehlern frei', async () => {
  const limiter = createLimiter(2)
  let stop = false
  const started = []
  await runPool({
    count: 10,
    workers: 2,
    limiter,
    shouldStop: () => stop,
    task: async (i) => {
      started.push(i)
      await sleep(5)
      if (i === 1) stop = true
    },
  })
  assert.ok(started.length <= 3, `gestartet: ${started}`)
  assert.deepEqual(limiter.stats(), { active: 0, waiting: 0 })

  await assert.rejects(
    runPool({
      count: 2,
      workers: 1,
      limiter,
      shouldStop: () => false,
      task: async () => {
        throw new Error('kaputt')
      },
    }),
    /kaputt/,
  )
  assert.deepEqual(limiter.stats(), { active: 0, waiting: 0 })
})

test('Segment-Argumente: gleiche Kette wie Decoder + Encoder, Dauer vor der Eingabe', () => {
  const base = { inputFile: '/tmp/a.wav', outputFile: '/tmp/seg.mp3', sampleRate: 44100 }
  const plain = buildSegmentArgs({ ...base, bitrate: 192 })
  assert.ok(!plain.includes('-ss') && !plain.includes('-t'))
  assert.equal(plain[plain.indexOf('-af') + 1], 'aresample=44100,aformat=channel_layouts=stereo')
  assert.deepEqual(plain.slice(plain.indexOf('-map'), plain.indexOf('-map') + 2), ['-map', '0:a:0'])
  assert.deepEqual(plain.slice(plain.indexOf('-ac'), plain.indexOf('-ac') + 2), ['-ac', '2'])
  assert.deepEqual(plain.slice(plain.indexOf('-c:a'), plain.indexOf('-c:a') + 4), [
    '-c:a',
    'libmp3lame',
    '-b:a',
    '192k',
  ])
  assert.equal(plain.at(-1), '/tmp/seg.mp3')

  const full = buildSegmentArgs({
    ...base,
    bitrate: 128,
    outputChannels: 1,
    loudnorm: true,
    start: 1.5,
    duration: 10,
    padSeconds: 2,
  })
  // -ss und -t als Eingabe-Optionen: -t als Ausgabe-Option würde die Pause abschneiden
  assert.ok(full.indexOf('-ss') < full.indexOf('-i') && full.indexOf('-t') < full.indexOf('-i'))
  assert.equal(full[full.indexOf('-ss') + 1], '1.5')
  assert.equal(full[full.indexOf('-t') + 1], '10')
  // Stille erst NACH der Lautheitsangleichung
  assert.equal(
    full[full.indexOf('-af') + 1],
    `${LOUDNORM_FILTER},aresample=44100,aformat=channel_layouts=stereo,apad=pad_dur=2`,
  )
  assert.deepEqual(full.slice(full.indexOf('-ac'), full.indexOf('-ac') + 2), ['-ac', '1'])
})

// --- Ende-zu-Ende ------------------------------------------------------------

function ffmpeg(args) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', ...args])
  if (r.status !== 0) throw new Error(r.stderr.toString())
}

function makeTone(dir, name, freq, { rate = 44100, channels = 2, seconds = SECONDS } = {}) {
  const file = path.join(dir, name)
  ffmpeg([
    '-f',
    'lavfi',
    '-i',
    `sine=frequency=${freq}:sample_rate=${rate}:duration=${seconds}`,
    '-ac',
    String(channels),
    ...(name.endsWith('.mp3') ? ['-b:a', '192k'] : []),
    file,
  ])
  return file
}

function makeNoise(dir, name, seconds) {
  const file = path.join(dir, name)
  ffmpeg(['-f', 'lavfi', '-i', `anoisesrc=d=${seconds}:r=44100`, '-ac', '2', file])
  return file
}

function probe(file, entries) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', entries, '-of', 'json', file])
  return JSON.parse(r.stdout.toString())
}

const duration = (file) => parseFloat(probe(file, 'format=duration').format.duration)

/** Dominante Frequenz im Fenster [from, from + length] Sekunden (Nulldurchgänge). */
function frequencyAt(file, from, length) {
  const r = spawnSync(
    'ffmpeg',
    ['-v', 'error', '-i', file, '-f', 's16le', '-ac', '1', '-ar', '8000', '-'],
    { maxBuffer: 64 * 1024 * 1024 },
  )
  const pcm = new Int16Array(r.stdout.buffer, r.stdout.byteOffset, r.stdout.length / 2)
  const start = Math.round(from * 8000)
  const end = Math.min(pcm.length, start + Math.round(length * 8000))
  let crossings = 0
  for (let j = start + 1; j < end; j++) if (pcm[j - 1] < 0 !== pcm[j] < 0) crossings++
  return Math.round(crossings / 2 / ((end - start) / 8000))
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

async function download(base, sessionId, target) {
  const res = await fetch(`${base}/api/download/${sessionId}`)
  assert.equal(res.status, 200)
  fs.writeFileSync(target, Buffer.from(await res.arrayBuffer()))
  return target
}

/** ffmpeg-Kindprozesse des Servers. */
function ffmpegChildren(pid) {
  const r = spawnSync('pgrep', ['-P', String(pid), 'ffmpeg'])
  return r.stdout.toString().split('\n').filter(Boolean)
}

function workDir(t) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'plk-par-'))
  t.after(() => fs.rmSync(work, { recursive: true, force: true }))
  return work
}

/**
 * Server erst NACH dem Erzeugen der Testdateien starten: sonst liegt die
 * Verbindung des Health-Checks so lange brach, dass der Server sie schließt
 * (Keep-Alive 5 s), während der erste Upload sie wiederverwendet.
 */
async function server(t, env) {
  const srv = await startServer(env)
  t.after(() => srv.stop())
  return srv
}

test(
  'P3: Tracks parallel kodiert – vollständig, in Reihenfolge, Kapitel stimmen',
  SKIP,
  async (t) => {
    const work = workDir(t)
    const freqs = [300, 400, 500, 600, 700, 800, 900]
    const files = freqs.map((freq, i) =>
      makeTone(work, `t${i}.${i % 2 ? 'wav' : 'mp3'}`, freq, {
        rate: i % 3 === 0 ? 48000 : 44100,
        channels: i === 4 ? 1 : 2,
      }),
    )

    const srv = await server(t, { MAX_PARALLEL_ENCODES: '3' })
    const sessionId = await uploadAll(srv.base, files)
    await startConvert(srv.base, sessionId)
    const status = await waitForEnd(srv.base, sessionId)
    assert.equal(status.status, 'done', JSON.stringify(status))
    assert.equal(status.progress, 100)

    const out = await download(srv.base, sessionId, path.join(work, 'out.mp3'))
    const info = probe(out, 'stream=codec_name,sample_rate,channels:format=duration')
    assert.equal(info.streams[0].codec_name, 'mp3')
    assert.equal(info.streams[0].sample_rate, '44100')
    assert.equal(info.streams[0].channels, 2)

    // Jeder Übergang kostet nur den Encoder-Vorlauf (unter 0,1 s), nichts fehlt
    const total = freqs.length * SECONDS
    const outDuration = parseFloat(info.format.duration)
    assert.ok(outDuration >= total - 0.05 && outDuration < total + freqs.length * 0.1, outDuration)

    // Kapitel zeigen auf die tatsächlichen Trackanfänge: kurz dahinter klingt der Track
    assert.equal(status.chapters.length, freqs.length)
    status.chapters.forEach((chapter, i) => {
      assert.ok(Math.abs(chapter.start - i * SECONDS) < (i + 1) * 0.1, `Kapitel ${i}`)
      const measured = frequencyAt(out, chapter.start + 0.3, 1.2)
      assert.ok(Math.abs(measured - freqs[i]) <= 15, `Track ${i + 1}: ${measured} Hz`)
    })

    // Segmente sind Zwischenergebnisse und bleiben nicht liegen
    assert.ok(!fs.existsSync(path.join(srv.tempDir, sessionId, 'segments')))
  },
)

test('P3: Pause zwischen den Tracks steckt als Stille im Segment (N4)', SKIP, async (t) => {
  const work = workDir(t)
  const files = [
    makeTone(work, 'a.wav', 400),
    makeTone(work, 'b.mp3', 600),
    makeTone(work, 'c.wav', 800),
  ]
  const srv = await server(t, { MAX_PARALLEL_ENCODES: '2' })
  const sessionId = await uploadAll(srv.base, files)
  await startConvert(srv.base, sessionId, { transition: 'gap', transition_seconds: 1 })
  const status = await waitForEnd(srv.base, sessionId)
  assert.equal(status.status, 'done', JSON.stringify(status))

  const out = await download(srv.base, sessionId, path.join(work, 'gap.mp3'))
  // 3 Tracks + 2 Pausen; keine Pause nach dem letzten Track
  const outDuration = duration(out)
  assert.ok(outDuration >= 8 - 0.05 && outDuration < 8.3, outDuration)
  assert.deepEqual(
    status.chapters.map((c) => Math.round(c.start)),
    [0, 3, 6],
  )
  // In der Pause ist Stille, davor und danach die Töne
  assert.equal(frequencyAt(out, 2.3, 0.5), 0)
  assert.ok(Math.abs(frequencyAt(out, 3.4, 1.2) - 600) <= 15)
  assert.equal(frequencyAt(out, 5.3, 0.5), 0)
})

for (const limit of ['3', '1']) {
  test(
    `Komplett weggeschnittener Track fehlt, die übrigen bleiben vollständig (Limit ${limit})`,
    SKIP,
    async (t) => {
      const work = workDir(t)
      const files = [
        makeTone(work, 'a.wav', 400),
        makeTone(work, 'b.wav', 600),
        makeTone(work, 'c.mp3', 800),
      ]
      const srv = await server(t, { MAX_PARALLEL_ENCODES: limit })
      const sessionId = await uploadAll(srv.base, files)
      // Start hinter dem Ende: vom zweiten Track bleibt nichts übrig
      await startConvert(srv.base, sessionId, { tracks: [null, { start: 99 }, null] })
      const status = await waitForEnd(srv.base, sessionId)
      assert.equal(status.status, 'done', JSON.stringify(status))
      const out = await download(srv.base, sessionId, path.join(work, 'cut.mp3'))
      const outDuration = duration(out)
      assert.ok(outDuration > 3.9 && outDuration < 4.3, outDuration)
      assert.ok(Math.abs(frequencyAt(out, 0.3, 1.2) - 400) <= 15)
      assert.ok(Math.abs(frequencyAt(out, 2.5, 1.2) - 800) <= 15)
      assert.deepEqual(
        status.chapters.map((c) => c.title),
        ['a', 'c'],
      )
    },
  )
}

test(
  'P3 aus (MAX_PARALLEL_ENCODES=1): bisheriger Ein-Encoder-Weg ohne Versatz',
  SKIP,
  async (t) => {
    const work = workDir(t)
    const files = [
      makeTone(work, 'a.wav', 400),
      makeTone(work, 'b.mp3', 600),
      makeTone(work, 'c.wav', 800),
    ]
    const srv = await server(t, { MAX_PARALLEL_ENCODES: '1' })
    const sessionId = await uploadAll(srv.base, files)
    await startConvert(srv.base, sessionId)
    const status = await waitForEnd(srv.base, sessionId)
    assert.equal(status.status, 'done', JSON.stringify(status))
    // Kapitel aus den Eingabelängen: der Ein-Encoder-Weg fügt lückenlos zusammen
    assert.deepEqual(
      status.chapters.map((c) => Math.round(c.start * 10) / 10),
      [0, 2, 4],
    )
    const out = await download(srv.base, sessionId, path.join(work, 'one.mp3'))
    assert.ok(Math.abs(duration(out) - 6) < 0.1)
  },
)

test(
  'P3: defekte Datei bricht ab, nennt die Datei und beendet die übrigen Encoder',
  SKIP,
  async (t) => {
    const work = workDir(t)
    const bad = path.join(work, 'kaputt.wav')
    fs.writeFileSync(bad, Buffer.alloc(4096, 7))
    const files = [makeNoise(work, 'lang1.wav', 300), bad, makeNoise(work, 'lang2.wav', 300)]
    const srv = await server(t, { MAX_PARALLEL_ENCODES: '3' })
    const sessionId = await uploadAll(srv.base, files)
    await startConvert(srv.base, sessionId)
    const status = await waitForEnd(srv.base, sessionId)
    assert.equal(status.status, 'error')
    assert.equal(status.error_code, 'FILE_UNREADABLE')
    assert.equal(status.error_file, 'kaputt.wav')
    await sleep(200)
    assert.deepEqual(ffmpegChildren(srv.proc.pid), [])
    assert.ok(!fs.existsSync(path.join(srv.tempDir, sessionId, 'segments')))
  },
)

test('P3: Abbrechen beendet alle Track-Encoder und gibt die Plätze frei', SKIP, async (t) => {
  const work = workDir(t)
  const long = [0, 1, 2].map((i) => makeNoise(work, `lang${i}.wav`, 600))
  const srv = await server(t, { MAX_PARALLEL_ENCODES: '2' })
  const longId = await uploadAll(srv.base, long)
  await startConvert(srv.base, longId)
  for (let i = 0; i < 50 && ffmpegChildren(srv.proc.pid).length < 2; i++) await sleep(100)
  assert.equal(ffmpegChildren(srv.proc.pid).length, 2)

  assert.equal((await fetch(`${srv.base}/api/cancel/${longId}`, { method: 'POST' })).status, 204)
  await sleep(300)
  assert.deepEqual(ffmpegChildren(srv.proc.pid), [])
  assert.ok(!fs.existsSync(path.join(srv.tempDir, longId)))

  // Beide Encoder-Plätze sind wieder frei: der nächste Job läuft parallel durch
  const short = [makeTone(work, 'a.wav', 400), makeTone(work, 'b.wav', 600)]
  const shortId = await uploadAll(srv.base, short)
  await startConvert(srv.base, shortId)
  const status = await waitForEnd(srv.base, shortId)
  assert.equal(status.status, 'done', JSON.stringify(status))
})
