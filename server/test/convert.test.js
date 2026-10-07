'use strict'

/**
 * Ende-zu-Ende: echter Server, echte ffmpeg-Läufe. Gemischte Eingaben (MP3/WAV,
 * 44,1/48 kHz, Mono/Stereo, 16/24 Bit) müssen VOLLSTÄNDIG und in der richtigen
 * Reihenfolge in der Ausgabe landen. Jeder Track hat einen eigenen Ton; geprüft
 * werden Gesamtdauer und die Tonhöhe jedes Abschnitts.
 * Wird übersprungen, wenn ffmpeg/ffprobe nicht installiert sind.
 */
const test = require('node:test')
const assert = require('node:assert/strict')
const { spawnSync, spawn } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const net = require('node:net')

const SERVER = path.join(__dirname, '..', 'server.js')
const HAS_FFMPEG =
  spawnSync('ffmpeg', ['-version']).status === 0 && spawnSync('ffprobe', ['-version']).status === 0
const SECONDS = 2

function freePort() {
  return new Promise((resolve) => {
    const srv = net.createServer()
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address()
      srv.close(() => resolve(port))
    })
  })
}

function ffmpeg(args) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', ...args])
  if (r.status !== 0) throw new Error(r.stderr.toString())
}

/** Testdatei mit Sinuston erzeugen. */
function makeTrack(dir, name, { freq, ext, rate = 44100, channels = 2, codec }) {
  const file = path.join(dir, name)
  const audioCodec = codec || (ext === 'mp3' ? 'libmp3lame' : 'pcm_s16le')
  ffmpeg([
    '-f',
    'lavfi',
    '-i',
    `sine=frequency=${freq}:sample_rate=${rate}:duration=${SECONDS}`,
    '-ac',
    String(channels),
    '-c:a',
    audioCodec,
    ...(ext === 'mp3' ? ['-b:a', '192k'] : []),
    file,
  ])
  return file
}

function duration(file) {
  const r = spawnSync('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'csv=p=0',
    file,
  ])
  return parseFloat(r.stdout.toString())
}

/** Dominante Frequenz je Abschnitt über Nulldurchgänge (Mono, 8 kHz). */
function segmentFrequencies(file, count) {
  const r = spawnSync(
    'ffmpeg',
    ['-v', 'error', '-i', file, '-f', 's16le', '-ac', '1', '-ar', '8000', '-'],
    {
      maxBuffer: 64 * 1024 * 1024,
    },
  )
  const pcm = new Int16Array(r.stdout.buffer, r.stdout.byteOffset, r.stdout.length / 2)
  const seg = 8000 * SECONDS
  const result = []
  for (let i = 0; i < count; i++) {
    // Ränder auslassen (Encoder-Versatz, Übergänge)
    const from = i * seg + 2000
    const to = (i + 1) * seg - 2000
    let crossings = 0
    for (let j = from + 1; j < Math.min(to, pcm.length); j++) {
      if (pcm[j - 1] < 0 !== pcm[j] < 0) crossings++
    }
    result.push(Math.round(crossings / 2 / ((to - from) / 8000)))
  }
  return result
}

async function startServer(tempDir) {
  const port = await freePort()
  const proc = spawn(process.execPath, [SERVER], {
    env: { ...process.env, PORT: String(port), TEMP_DIR: tempDir, MIN_FREE_SPACE: '0' },
    stdio: 'ignore',
  })
  const base = `http://127.0.0.1:${port}`
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`${base}/health`)).ok) break
    } catch {
      /* startet noch */
    }
    await new Promise((r) => setTimeout(r, 100))
  }
  return { base, stop: () => proc.kill('SIGKILL') }
}

/** Wie die App: eine Datei pro Request, dann convert, Status pollen, download. */
async function convertViaServer(base, files, format = 'mp3', bitrate = 192) {
  let sessionId
  for (let i = 0; i < files.length; i++) {
    const form = new FormData()
    form.append('files[]', new Blob([fs.readFileSync(files[i])]), path.basename(files[i]))
    form.append('order[]', String(i))
    form.append('chunk_index', String(i))
    if (sessionId) form.append('session_id', sessionId)
    const res = await fetch(`${base}/api/upload`, { method: 'POST', body: form })
    assert.equal(res.status, 200)
    sessionId = (await res.json()).session_id
  }
  const conv = await fetch(`${base}/api/convert`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, format, bitrate }),
  })
  assert.equal(conv.status, 200)
  let status
  for (let i = 0; i < 300; i++) {
    status = await (await fetch(`${base}/api/status/${sessionId}`)).json()
    if (status.status === 'done' || status.status === 'error') break
    await new Promise((r) => setTimeout(r, 100))
  }
  return { sessionId, status }
}

async function download(base, sessionId, target) {
  const res = await fetch(`${base}/api/download/${sessionId}`)
  assert.equal(res.status, 200)
  fs.writeFileSync(target, Buffer.from(await res.arrayBuffer()))
  return target
}

test(
  'gemischte MP3/WAV-Playlist: alle Tracks vollständig und in Reihenfolge',
  { skip: !HAS_FFMPEG && 'ffmpeg fehlt' },
  async (t) => {
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'plk-conv-'))
    const srv = await startServer(path.join(work, 'temp'))
    t.after(() => {
      srv.stop()
      fs.rmSync(work, { recursive: true, force: true })
    })

    // Muster aus der Fehlermeldung: MP3, MP3, MP3, WAV, WAV, MP3, WAV … plus Varianten
    const specs = [
      { ext: 'mp3' },
      { ext: 'mp3' },
      { ext: 'mp3' },
      { ext: 'wav' },
      { ext: 'wav', rate: 48000, codec: 'pcm_s24le' },
      { ext: 'mp3' },
      { ext: 'wav', channels: 1 },
      { ext: 'mp3', rate: 48000 },
      { ext: 'wav', rate: 22050 },
      { ext: 'mp3' },
    ]
    const freqs = specs.map((_, i) => 300 + i * 100)
    const files = specs.map((spec, i) =>
      makeTrack(work, `track${String(i).padStart(2, '0')}.${spec.ext}`, {
        ...spec,
        freq: freqs[i],
      }),
    )
    const inputTotal = files.reduce((sum, f) => sum + duration(f), 0)

    const { sessionId, status } = await convertViaServer(srv.base, files)
    assert.equal(status.status, 'done', JSON.stringify(status))

    const out = await download(srv.base, sessionId, path.join(work, 'out.mp3'))
    const outDuration = duration(out)
    assert.ok(
      Math.abs(outDuration - inputTotal) < 0.5,
      `Ausgabe ${outDuration}s, Eingaben ${inputTotal}s`,
    )

    const measured = segmentFrequencies(out, files.length)
    measured.forEach((f, i) =>
      assert.ok(Math.abs(f - freqs[i]) <= 15, `Track ${i + 1}: ${f} Hz statt ${freqs[i]} Hz`),
    )
  },
)

test(
  'identische MP3s laufen weiter verlustfrei per Stream-Copy',
  { skip: !HAS_FFMPEG && 'ffmpeg fehlt' },
  async (t) => {
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'plk-copy-'))
    const srv = await startServer(path.join(work, 'temp'))
    t.after(() => {
      srv.stop()
      fs.rmSync(work, { recursive: true, force: true })
    })

    const files = [0, 1, 2].map((i) =>
      makeTrack(work, `t${i}.mp3`, { ext: 'mp3', freq: 400 + i * 200 }),
    )
    const inputBytes = files.reduce((sum, f) => sum + fs.statSync(f).size, 0)
    const { sessionId, status } = await convertViaServer(srv.base, files, 'mp3', 192)
    assert.equal(status.status, 'done')
    const out = await download(srv.base, sessionId, path.join(work, 'out.mp3'))
    // Stream-Copy: Ausgabe ≈ Summe der Eingaben (keine Neukodierung)
    assert.ok(
      Math.abs(fs.statSync(out).size - inputBytes) < 4096,
      'Ausgabe sollte kopiert, nicht neu kodiert sein',
    )
    assert.deepEqual(
      segmentFrequencies(out, 3).map((f) => Math.round(f / 100) * 100),
      [400, 600, 800],
    )
  },
)

test('WebM (Opus) aus gemischten Eingaben', { skip: !HAS_FFMPEG && 'ffmpeg fehlt' }, async (t) => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'plk-webm-'))
  const srv = await startServer(path.join(work, 'temp'))
  t.after(() => {
    srv.stop()
    fs.rmSync(work, { recursive: true, force: true })
  })

  const files = [
    makeTrack(work, 'a.wav', { ext: 'wav', freq: 500 }),
    makeTrack(work, 'b.mp3', { ext: 'mp3', freq: 700, rate: 48000 }),
  ]
  const { sessionId, status } = await convertViaServer(srv.base, files, 'webm', 128)
  assert.equal(status.status, 'done', JSON.stringify(status))
  const out = await download(srv.base, sessionId, path.join(work, 'out.webm'))
  assert.ok(Math.abs(duration(out) - 2 * SECONDS) < 0.5)
})

test(
  'kaputte Datei: Fehler mit Dateiname statt stiller kürzerer Playlist',
  { skip: !HAS_FFMPEG && 'ffmpeg fehlt' },
  async (t) => {
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'plk-bad-'))
    const srv = await startServer(path.join(work, 'temp'))
    t.after(() => {
      srv.stop()
      fs.rmSync(work, { recursive: true, force: true })
    })

    const good = makeTrack(work, 'gut.mp3', { ext: 'mp3', freq: 440 })
    const bad = path.join(work, 'kaputt.wav')
    fs.writeFileSync(bad, Buffer.alloc(4096, 7))
    const { status } = await convertViaServer(srv.base, [good, bad])
    assert.equal(status.status, 'error')
    assert.match(status.error, /kaputt\.wav/)
  },
)
