'use strict'

/**
 * Abbrechen auf dem Server: POST /api/cancel/:id gibt Dateien und den
 * Konvertierungs-Slot frei; ein danach eintreffender Upload legt die Session
 * nicht wieder an. Der Slot-Test braucht ffmpeg/ffprobe und wird sonst übersprungen.
 */
const test = require('node:test')
const assert = require('node:assert/strict')
const { spawn, spawnSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const net = require('node:net')

const SERVER = path.join(__dirname, '..', 'server.js')
const HAS_FFMPEG =
  spawnSync('ffmpeg', ['-version']).status === 0 && spawnSync('ffprobe', ['-version']).status === 0

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address()
      srv.close(() => resolve(port))
    })
    srv.on('error', reject)
  })
}

async function startServer(env = {}) {
  const port = await freePort()
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plk-cancel-'))
  const proc = spawn(process.execPath, [SERVER], {
    env: { ...process.env, PORT: String(port), TEMP_DIR: tempDir, MIN_FREE_SPACE: '0', ...env },
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
  return {
    base,
    tempDir,
    stop() {
      proc.kill('SIGKILL')
      fs.rmSync(tempDir, { recursive: true, force: true })
    },
  }
}

function upload(base, { body, name = 'track.wav', sessionId, index = 0 }) {
  const form = new FormData()
  form.append('files[]', new Blob([body]), name)
  form.append('order[]', String(index))
  form.append('chunk_index', String(index))
  if (sessionId) form.append('session_id', sessionId)
  return fetch(`${base}/api/upload`, { method: 'POST', body: form })
}

function cancel(base, sessionId) {
  return fetch(`${base}/api/cancel/${sessionId}`, { method: 'POST' })
}

function startConvert(base, sessionId) {
  return fetch(`${base}/api/convert`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, format: 'mp3', bitrate: 128 }),
  })
}

function listFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const full = path.join(dir, d.name)
    return d.isDirectory() ? listFiles(full) : [full]
  })
}

test('Cancel entfernt Session und Dateien, späterer Upload wird mit 410 abgelehnt', async (t) => {
  const srv = await startServer()
  t.after(() => srv.stop())

  const first = await upload(srv.base, { body: Buffer.alloc(1024) })
  assert.equal(first.status, 200)
  const { session_id: sessionId } = await first.json()
  assert.ok(listFiles(srv.tempDir).length > 0)

  const res = await cancel(srv.base, sessionId)
  assert.equal(res.status, 204)
  assert.deepEqual(listFiles(srv.tempDir), [])
  assert.equal((await fetch(`${srv.base}/api/status/${sessionId}`)).status, 404)

  // Ein beim Abbrechen noch laufender Upload darf die Session nicht neu anlegen
  const late = await upload(srv.base, { body: Buffer.alloc(1024), sessionId, index: 1 })
  assert.equal(late.status, 410)
  assert.equal((await late.json()).code, 'SESSION_CANCELLED')
  assert.deepEqual(listFiles(srv.tempDir), [])

  // Idempotent
  assert.equal((await cancel(srv.base, sessionId)).status, 204)
})

test('Cancel mit ungültiger Session-ID: 400', async (t) => {
  const srv = await startServer()
  t.after(() => srv.stop())
  assert.equal((await cancel(srv.base, 'nicht-hex')).status, 400)
})

test(
  'Cancel beendet laufendes ffmpeg und gibt den Slot frei',
  { skip: !HAS_FFMPEG && 'ffmpeg/ffprobe nicht installiert' },
  async (t) => {
    const srv = await startServer({ MAX_CONCURRENT: '1' })
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'plk-cancel-in-'))
    t.after(() => {
      srv.stop()
      fs.rmSync(work, { recursive: true, force: true })
    })

    // Lange WAV, damit die Neukodierung sicher noch läuft
    const longWav = path.join(work, 'long.wav')
    spawnSync('ffmpeg', [
      '-v',
      'error',
      '-y',
      '-f',
      'lavfi',
      '-i',
      'anoisesrc=d=600:r=44100',
      '-ac',
      '2',
      longWav,
    ])
    const shortWav = path.join(work, 'short.wav')
    spawnSync('ffmpeg', [
      '-v',
      'error',
      '-y',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:duration=1',
      '-ac',
      '2',
      shortWav,
    ])

    const a = await upload(srv.base, { body: fs.readFileSync(longWav), name: 'long.wav' })
    const { session_id: longId } = await a.json()
    assert.equal((await startConvert(srv.base, longId)).status, 200)

    // Warten, bis der einzige Slot belegt ist
    for (let i = 0; i < 50; i++) {
      const st = await (await fetch(`${srv.base}/api/status/${longId}`)).json()
      if (st.status === 'converting') break
      await new Promise((r) => setTimeout(r, 100))
    }
    assert.equal((await (await fetch(`${srv.base}/health`)).json()).running, 1)

    assert.equal((await cancel(srv.base, longId)).status, 204)

    // Zweiter Job muss den freien Slot bekommen und fertig werden
    const b = await upload(srv.base, { body: fs.readFileSync(shortWav), name: 'short.wav' })
    const { session_id: shortId } = await b.json()
    assert.equal((await startConvert(srv.base, shortId)).status, 200)
    let status
    for (let i = 0; i < 100; i++) {
      status = await (await fetch(`${srv.base}/api/status/${shortId}`)).json()
      if (status.status === 'done' || status.status === 'error') break
      await new Promise((r) => setTimeout(r, 100))
    }
    assert.equal(status.status, 'done')
    assert.ok(!fs.existsSync(path.join(srv.tempDir, longId)))
  },
)
