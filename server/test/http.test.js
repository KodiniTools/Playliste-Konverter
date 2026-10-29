'use strict'

/**
 * HTTP-Verhalten unter Express 5 / multer 2: keine CORS-Freigabe für fremde
 * Websites, robuste Antworten ohne Body, Abbruch beim Start auf belegtem Port.
 */
const test = require('node:test')
const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const { SERVER, startServer } = require('./helpers')

test('Keine CORS-Header: fremde Websites dürfen Antworten nicht lesen', async (t) => {
  const srv = await startServer()
  t.after(() => srv.stop())

  const res = await fetch(`${srv.base}/health`, { headers: { Origin: 'https://example.com' } })
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('access-control-allow-origin'), null)

  const preflight = await fetch(`${srv.base}/api/upload`, {
    method: 'OPTIONS',
    headers: { Origin: 'https://example.com', 'Access-Control-Request-Method': 'POST' },
  })
  assert.equal(preflight.headers.get('access-control-allow-origin'), null)
})

test('convert ohne Body: 400 statt 500', async (t) => {
  const srv = await startServer()
  t.after(() => srv.stop())

  const res = await fetch(`${srv.base}/api/convert`, { method: 'POST' })
  assert.equal(res.status, 400)
  assert.equal((await res.json()).error, 'Ungültige Session-ID')
})

test('upload ohne Dateien: 400 statt 500', async (t) => {
  const srv = await startServer()
  t.after(() => srv.stop())

  const res = await fetch(`${srv.base}/api/upload`, { method: 'POST', body: new FormData() })
  assert.equal(res.status, 400)
})

test('Belegter Port: Prozess beendet sich mit Fehler', async (t) => {
  const srv = await startServer()
  t.after(() => srv.stop())

  const second = spawn(process.execPath, [SERVER], {
    env: { ...process.env, PORT: String(srv.port), TEMP_DIR: srv.tempDir },
    stdio: 'ignore',
  })
  const code = await new Promise((resolve) => {
    const timer = setTimeout(() => {
      second.kill('SIGKILL')
      resolve('läuft weiter')
    }, 5000)
    second.on('exit', (c) => {
      clearTimeout(timer)
      resolve(c)
    })
  })
  assert.equal(code, 1)
})
