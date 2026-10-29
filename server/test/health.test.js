'use strict'

/**
 * Betrieb: /health meldet ffmpeg- und Speicherzustand ohne Interna preiszugeben;
 * fehlgeschlagene Konvertierungen landen mit stderr-Ende im Log.
 */
const test = require('node:test')
const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const { startServer } = require('./helpers')
const { logFailure } = require('../conversion')

const HAS_FFMPEG = spawnSync('ffmpeg', ['-version']).status === 0

test(
  'Health: ok mit Zählern und Checks, ohne Versionen oder Byte-Zahlen',
  { skip: !HAS_FFMPEG && 'ffmpeg nicht installiert' },
  async (t) => {
    const srv = await startServer()
    t.after(() => srv.stop())

    const body = await (await fetch(`${srv.base}/health`)).json()
    assert.equal(body.status, 'ok')
    assert.deepEqual(body.checks, { ffmpeg: true, storage: true })
    assert.equal(body.running, 0)
    assert.equal(body.queued, 0)
    assert.equal(body.sessions, 0)
    assert.doesNotMatch(JSON.stringify(body), /version|\d+\.\d+\.\d+|bytes/i)
  },
)

test('Health: degraded bei fehlendem ffmpeg', async (t) => {
  const srv = await startServer({ FFMPEG_PATH: '/nicht/vorhanden/ffmpeg' })
  t.after(() => srv.stop())

  const res = await fetch(`${srv.base}/health`)
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.status, 'degraded')
  assert.equal(body.checks.ffmpeg, false)
})

test('Health: degraded, wenn die Platzreserve unterschritten ist', async (t) => {
  const srv = await startServer({ MIN_FREE_SPACE: '1000000T' })
  t.after(() => srv.stop())

  const body = await (await fetch(`${srv.base}/health`)).json()
  assert.equal(body.status, 'degraded')
  assert.equal(body.checks.storage, false)
})

test('logFailure schreibt Session, Modus, Format und stderr-Ende ins Log', (t) => {
  const lines = []
  t.mock.method(console, 'error', (msg) => lines.push(msg))
  const session = { id: 'a'.repeat(32), mode: 'reencode', format: 'mp3', bitrate: 192 }
  logFailure(session, 'FFmpeg-Fehler (Code 1)', 'x'.repeat(5000) + 'ENDE')

  assert.equal(lines.length, 1)
  assert.match(lines[0], /Session a{32} fehlgeschlagen \(reencode, mp3 192 kbps\): FFmpeg-Fehler/)
  assert.match(lines[0], /ENDE$/)
  assert.ok(lines[0].length < 2300, 'stderr wird auf 2000 Zeichen gekürzt')
})
