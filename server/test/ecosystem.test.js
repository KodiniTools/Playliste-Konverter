'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const ecosystem = require('../ecosystem.config.cjs')
const { parallelEncodeLimit } = require('../parallel')

test('pm2-Konfiguration: MAX_CONCURRENT ist für den 8-Kern-Server gesetzt', () => {
  const [app] = ecosystem.apps
  assert.equal(app.name, 'playlistkonverter-server')
  // config.js liest den Wert mit parseInt – er muss eine ganze Zahl >= 1 sein
  const value = parseInt(String(app.env.MAX_CONCURRENT), 10)
  assert.equal(String(value), String(app.env.MAX_CONCURRENT))
  assert.equal(value, 4)
})

test('pm2-Konfiguration: MAX_PARALLEL_ENCODES ergibt ein gültiges Limit', () => {
  const [app] = ecosystem.apps
  // parallelEncodeLimit fällt bei ungültigen Werten still auf Kerne − 2 zurück
  assert.equal(parallelEncodeLimit(String(app.env.MAX_PARALLEL_ENCODES), 2), 6)
})

test('config.js übernimmt MAX_CONCURRENT aus der Umgebung', () => {
  const key = require.resolve('../config')
  const before = process.env.MAX_CONCURRENT
  delete require.cache[key]
  process.env.MAX_CONCURRENT = '4'
  try {
    assert.equal(require('../config').MAX_CONCURRENT, 4)
  } finally {
    if (before === undefined) delete process.env.MAX_CONCURRENT
    else process.env.MAX_CONCURRENT = before
    delete require.cache[key]
  }
})
