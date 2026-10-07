'use strict'

/**
 * Integrationstest: echter Server-Prozess mit kleinen Limits in einem
 * Temp-Ordner. Prüft 413 (Sitzung/Datei zu groß), 507 (Reserve) und dass
 * abgelehnte Uploads keine Dateien hinterlassen.
 */
const test = require('node:test')
const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const net = require('node:net')

const SERVER = path.join(__dirname, '..', 'server.js')
const MiB = 1024 ** 2

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

async function startServer(env) {
  const port = await freePort()
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plk-test-'))
  const proc = spawn(process.execPath, [SERVER], {
    env: { ...process.env, PORT: String(port), TEMP_DIR: tempDir, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const base = `http://127.0.0.1:${port}`
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(`${base}/health`)
      if (res.ok) break
    } catch {
      /* noch nicht bereit */
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

function upload(base, { bytes, name = 'track.wav', sessionId, index = 0 }) {
  const form = new FormData()
  form.append('files[]', new Blob([Buffer.alloc(bytes)]), name)
  form.append('order[]', String(index))
  form.append('chunk_index', String(index))
  if (sessionId) form.append('session_id', sessionId)
  return fetch(`${base}/api/upload`, { method: 'POST', body: form })
}

/** Alle Dateien unter dir (rekursiv). */
function listFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const full = path.join(dir, d.name)
    return d.isDirectory() ? listFiles(full) : [full]
  })
}

test('Sitzung: Uploads bis zum Limit gehen durch, darüber 413 und Aufräumen', async (t) => {
  const srv = await startServer({ MAX_PLAYLIST_SIZE: '3M', MIN_FREE_SPACE: '0' })
  t.after(() => srv.stop())

  const first = await upload(srv.base, { bytes: 2 * MiB, index: 0 })
  assert.equal(first.status, 200)
  const { session_id: sessionId } = await first.json()

  const second = await upload(srv.base, { bytes: MiB, sessionId, index: 1 })
  assert.equal(second.status, 200) // genau 3 MB = Limit

  const third = await upload(srv.base, { bytes: 1, sessionId, index: 2 })
  assert.equal(third.status, 413)
  const body = await third.json()
  assert.equal(body.code, 'PLAYLIST_TOO_LARGE')
  assert.equal(body.max_bytes, 3 * MiB)

  // Abgelehnte Sitzung ist komplett freigegeben, keine Upload-Reste
  assert.deepEqual(listFiles(srv.tempDir), [])
  const convert = await fetch(`${srv.base}/api/convert`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, format: 'mp3', bitrate: 192 }),
  })
  assert.equal(convert.status, 404)
})

test('Einzelner Upload über dem Sitzungslimit wird abgelehnt, ohne Sitzung anzulegen', async (t) => {
  const srv = await startServer({ MAX_PLAYLIST_SIZE: '1M', MIN_FREE_SPACE: '0' })
  t.after(() => srv.stop())

  const res = await upload(srv.base, { bytes: MiB + 1 })
  assert.equal(res.status, 413)
  assert.equal((await res.json()).code, 'PLAYLIST_TOO_LARGE')
  assert.deepEqual(listFiles(srv.tempDir), [])
})

test('Datei über dem Limit pro Datei: 413 FILE_TOO_LARGE als JSON statt HTML-500', async (t) => {
  const srv = await startServer({ MAX_FILE_SIZE: '1M', MIN_FREE_SPACE: '0' })
  t.after(() => srv.stop())

  const res = await upload(srv.base, { bytes: 2 * MiB })
  assert.equal(res.status, 413)
  assert.match(res.headers.get('content-type'), /application\/json/)
  const body = await res.json()
  assert.equal(body.code, 'FILE_TOO_LARGE')
  assert.equal(body.max_bytes, MiB)
  assert.deepEqual(listFiles(srv.tempDir), [])
})

test('Reserve unterschritten: 507, nichts wird geschrieben', async (t) => {
  // Reserve größer als jede reale Platte
  const srv = await startServer({ MAX_PLAYLIST_SIZE: '5G', MIN_FREE_SPACE: '1000000T' })
  t.after(() => srv.stop())

  // Groß genug, dass der Body beim Antworten noch nicht vollständig gesendet ist
  const res = await upload(srv.base, { bytes: 64 * MiB })
  assert.equal(res.status, 507)
  assert.equal((await res.json()).code, 'INSUFFICIENT_STORAGE')
  assert.deepEqual(listFiles(srv.tempDir), [])
})

test('Ungültige Werte in der Umgebung fallen auf die Standards zurück', async (t) => {
  const srv = await startServer({ MAX_PLAYLIST_SIZE: 'viel', MIN_FREE_SPACE: 'kaum' })
  t.after(() => srv.stop())

  // Standard-Reserve 20 GB: je nach Testmaschine 200 oder 507 – aber nie 413/500
  const res = await upload(srv.base, { bytes: 1024 })
  assert.ok([200, 507].includes(res.status), `Status ${res.status}`)
})

test('Nur MP3/WAV werden angenommen (bestehendes Verhalten bleibt)', async (t) => {
  const srv = await startServer({ MAX_PLAYLIST_SIZE: '5M', MIN_FREE_SPACE: '0' })
  t.after(() => srv.stop())

  const res = await upload(srv.base, { bytes: 1024, name: 'bild.png' })
  assert.equal(res.status, 400)
  assert.deepEqual(listFiles(srv.tempDir), [])
})
