'use strict'

/**
 * Server-Sent Events: /api/events/:id liefert Status-Änderungen bis done,
 * zeigt die Warteschlangen-Position und meldet abgebrochene Sessions als "gone".
 */
const test = require('node:test')
const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { startServer } = require('./helpers')

const HAS_FFMPEG =
  spawnSync('ffmpeg', ['-version']).status === 0 && spawnSync('ffprobe', ['-version']).status === 0

function makeWav(dir, name, seconds, source = 'sine=frequency=440') {
  const file = path.join(dir, name)
  spawnSync('ffmpeg', [
    '-v',
    'error',
    '-y',
    '-f',
    'lavfi',
    '-i',
    `${source}:duration=${seconds}`,
    '-ac',
    '2',
    file,
  ])
  return file
}

async function uploadFile(base, file) {
  const form = new FormData()
  form.append('files[]', new Blob([fs.readFileSync(file)]), path.basename(file))
  form.append('order[]', '0')
  form.append('chunk_index', '0')
  const res = await fetch(`${base}/api/upload`, { method: 'POST', body: form })
  assert.equal(res.status, 200)
  return (await res.json()).session_id
}

function startConvert(base, sessionId) {
  return fetch(`${base}/api/convert`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, format: 'mp3', bitrate: 128 }),
  })
}

/** SSE-Stream lesen, bis er endet oder stopWhen(event) true liefert. */
async function readEvents(url, { stopWhen = () => false, timeout = 30_000 } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  const res = await fetch(url, { signal: controller.signal })
  const events = []
  if (!res.ok) {
    clearTimeout(timer)
    return { res, events }
  }
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    for await (const chunk of res.body) {
      buffer += decoder.decode(chunk, { stream: true })
      let idx
      while ((idx = buffer.indexOf('\n\n')) >= 0) {
        const block = buffer.slice(0, idx)
        buffer = buffer.slice(idx + 2)
        const type = /^event: (.+)$/m.exec(block)?.[1]
        const data = /^data: (.+)$/m.exec(block)?.[1]
        if (!type) continue
        const event = { type, data: data ? JSON.parse(data) : null }
        events.push(event)
        if (stopWhen(event)) {
          controller.abort()
          return { res, events }
        }
      }
    }
  } catch (err) {
    if (err.name !== 'AbortError') throw err
  } finally {
    clearTimeout(timer)
  }
  return { res, events }
}

test('Events: unbekannte Session 404, ungültige ID 400', async (t) => {
  const srv = await startServer()
  t.after(() => srv.stop())
  assert.equal((await fetch(`${srv.base}/api/events/${'b'.repeat(32)}`)).status, 404)
  assert.equal((await fetch(`${srv.base}/api/events/kaputt`)).status, 400)
})

test(
  'Events: Fortschritt bis done, Stream endet danach',
  { skip: !HAS_FFMPEG && 'ffmpeg/ffprobe nicht installiert' },
  async (t) => {
    const srv = await startServer()
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'plk-sse-'))
    t.after(() => {
      srv.stop()
      fs.rmSync(work, { recursive: true, force: true })
    })

    const id = await uploadFile(srv.base, makeWav(work, 'a.wav', 3))
    const stream = readEvents(`${srv.base}/api/events/${id}`)
    assert.equal((await startConvert(srv.base, id)).status, 200)
    const { res, events } = await stream

    assert.match(res.headers.get('content-type'), /text\/event-stream/)
    assert.equal(res.headers.get('x-accel-buffering'), 'no')
    const statuses = events.map((e) => e.data.status)
    assert.equal(statuses.at(-1), 'done')
    assert.ok(events.at(-1).data.file_size > 0)
    assert.equal(events.at(-1).data.progress, 100)
    // Nur Änderungen werden gesendet
    const payloads = events.map((e) => JSON.stringify(e.data))
    assert.equal(new Set(payloads).size, payloads.length)
  },
)

test(
  'Events: Warteschlangen-Position und "gone" nach Abbruch',
  { skip: !HAS_FFMPEG && 'ffmpeg/ffprobe nicht installiert' },
  async (t) => {
    const srv = await startServer({ MAX_CONCURRENT: '1' })
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'plk-sse-'))
    t.after(() => {
      srv.stop()
      fs.rmSync(work, { recursive: true, force: true })
    })

    // Erster Job belegt den einzigen Slot lange
    const longId = await uploadFile(srv.base, makeWav(work, 'long.wav', 600, 'anoisesrc=r=44100'))
    await startConvert(srv.base, longId)
    const waitingId = await uploadFile(srv.base, makeWav(work, 'b.wav', 1))
    await startConvert(srv.base, waitingId)

    const { events: queued } = await readEvents(`${srv.base}/api/events/${waitingId}`, {
      stopWhen: (e) => e.data?.status === 'queued',
    })
    assert.equal(queued.at(-1).data.queue_position, 1)

    // Abbruch der wartenden Session beendet ihren Stream mit "gone"
    const stream = readEvents(`${srv.base}/api/events/${waitingId}`)
    await new Promise((r) => setTimeout(r, 300))
    await fetch(`${srv.base}/api/cancel/${waitingId}`, { method: 'POST' })
    const { events } = await stream
    assert.equal(events.at(-1).type, 'gone')

    await fetch(`${srv.base}/api/cancel/${longId}`, { method: 'POST' })
  },
)
