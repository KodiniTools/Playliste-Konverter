'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const ecosystem = require('../ecosystem.config.cjs')

test('pm2-Konfiguration: MAX_CONCURRENT ist für den 8-Kern-Server gesetzt', () => {
  const [app] = ecosystem.apps
  assert.equal(app.name, 'playlistkonverter-server')
  // config.js liest den Wert mit parseInt – er muss eine ganze Zahl >= 1 sein
  const value = parseInt(String(app.env.MAX_CONCURRENT), 10)
  assert.equal(String(value), String(app.env.MAX_CONCURRENT))
  assert.equal(value, 4)
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
