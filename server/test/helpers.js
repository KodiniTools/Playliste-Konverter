'use strict'

/** Gemeinsame Helfer für Integrationstests: echter Server-Prozess mit Temp-Ordner. */
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const net = require('node:net')

const SERVER = path.join(__dirname, '..', 'server.js')

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

/**
 * Startet server.js auf einem freien Port und wartet auf /health.
 * @param {Record<string, string>} [env]
 */
async function startServer(env = {}) {
  const port = await freePort()
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plk-test-'))
  const proc = spawn(process.execPath, [SERVER], {
    env: { ...process.env, PORT: String(port), TEMP_DIR: tempDir, MIN_FREE_SPACE: '0', ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
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
    port,
    tempDir,
    proc,
    stop() {
      proc.kill('SIGKILL')
      fs.rmSync(tempDir, { recursive: true, force: true })
    },
  }
}

module.exports = { SERVER, freePort, startServer }
