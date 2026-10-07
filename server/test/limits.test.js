'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const os = require('node:os')
const {
  parseBytes,
  hasRoomFor,
  exceedsPlaylistLimit,
  availableBytes,
  formatGB,
} = require('../limits')

const GiB = 1024 ** 3

test('parseBytes liest Einheiten binär und fällt bei Unsinn zurück', () => {
  assert.equal(parseBytes('5G', 0), 5 * GiB)
  assert.equal(parseBytes('20g', 0), 20 * GiB)
  assert.equal(parseBytes('512M', 0), 512 * 1024 ** 2)
  assert.equal(parseBytes('1.5G', 0), 1.5 * GiB)
  assert.equal(parseBytes('5GB', 0), 5 * GiB)
  assert.equal(parseBytes('5GiB', 0), 5 * GiB)
  assert.equal(parseBytes('1048576', 0), 1048576)
  assert.equal(parseBytes(' 2 G ', 0), 2 * GiB)
  assert.equal(parseBytes(undefined, 42), 42)
  assert.equal(parseBytes('', 42), 42)
  assert.equal(parseBytes('fünf', 42), 42)
  assert.equal(parseBytes('-5G', 42), 42)
})

test('hasRoomFor hält die Reserve ein', () => {
  assert.equal(hasRoomFor({ available: 30 * GiB, incoming: 5 * GiB, reserve: 20 * GiB }), true)
  assert.equal(hasRoomFor({ available: 25 * GiB, incoming: 5 * GiB, reserve: 20 * GiB }), true)
  assert.equal(hasRoomFor({ available: 24 * GiB, incoming: 5 * GiB, reserve: 20 * GiB }), false)
  assert.equal(hasRoomFor({ available: 19 * GiB, incoming: 0, reserve: 20 * GiB }), false)
  assert.equal(hasRoomFor({ available: 30 * GiB, incoming: -1, reserve: 20 * GiB }), true)
})

test('exceedsPlaylistLimit erlaubt genau das Limit, nicht mehr', () => {
  assert.equal(exceedsPlaylistLimit({ current: 4 * GiB, incoming: GiB, max: 5 * GiB }), false)
  assert.equal(exceedsPlaylistLimit({ current: 4 * GiB, incoming: GiB + 1, max: 5 * GiB }), true)
  assert.equal(exceedsPlaylistLimit({ current: 0, incoming: 0, max: 5 * GiB }), false)
})

test('availableBytes misst die Partition', async () => {
  const bytes = await availableBytes(os.tmpdir())
  assert.ok(Number.isFinite(bytes) && bytes > 0)
})

test('formatGB', () => {
  assert.equal(formatGB(5 * GiB), '5 GB')
  assert.equal(formatGB(2.5 * GiB), '2.5 GB')
})
