'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const {
  sanitizeTracks,
  parseSilenceEdges,
  segmentFor,
  segmentLength,
  trackIndex,
} = require('../trim')
const { buildDecoderArgs } = require('../audio')

test('sanitizeTracks: nur gültige Bereiche, sonst null', () => {
  assert.deepEqual(sanitizeTracks('x'), [])
  assert.deepEqual(
    sanitizeTracks([
      { start: 1.23456, end: 5 },
      null,
      { start: 0, end: null },
      { start: -3, end: 2 },
      { start: 4, end: 2 },
      { start: 'abc' },
    ]),
    [{ start: 1.235, end: 5 }, null, null, { start: 0, end: 2 }, { start: 4, end: null }, null],
  )
  assert.equal(sanitizeTracks(new Array(5000).fill(null)).length, 1000)
})

test('parseSilenceEdges: Stille am Anfang und Ende, nicht in der Mitte', () => {
  const log = [
    'size=0kB time=00:00:00.00 [silencedetect @ 0x1] silence_start: 0',
    '[silencedetect @ 0x1] silence_end: 1.00002 | silence_duration: 1.00002',
    '[silencedetect @ 0x1] silence_start: 2.5',
    '[silencedetect @ 0x1] silence_end: 2.9 | silence_duration: 0.4',
    '[silencedetect @ 0x1] silence_start: 3',
    '[silencedetect @ 0x1] silence_end: 4 | silence_duration: 1',
  ].join('\n')
  assert.deepEqual(parseSilenceEdges(log, 4.049), { start: 1, end: 3 })
  // ältere ffmpeg-Versionen melden am Dateiende kein silence_end
  assert.deepEqual(parseSilenceEdges('silence_start: 3.5', 5), { start: 0, end: 3.5 })
  // keine Stille
  assert.deepEqual(parseSilenceEdges('', 5), { start: 0, end: null })
  // ganze Datei still → leerer Abschnitt
  assert.deepEqual(parseSilenceEdges('silence_start: 0', 5), { start: 5, end: null })
})

test('segmentFor kombiniert Trimmen und Stille-Ränder', () => {
  assert.deepEqual(segmentFor(10, null, null), { start: 0, duration: null })
  assert.deepEqual(segmentFor(10, { start: 2, end: 8 }, null), { start: 2, duration: 6 })
  assert.deepEqual(segmentFor(10, { start: 2, end: null }, { start: 3, end: 9 }), {
    start: 3,
    duration: 6,
  })
  // Ende hinter der Datei = bis zum Ende; Start hinter der Datei = leer
  assert.deepEqual(segmentFor(10, { start: 1, end: 30 }, null), { start: 1, duration: null })
  assert.deepEqual(segmentFor(10, { start: 12, end: null }, null), { start: 10, duration: null })
  assert.equal(segmentLength(10, { start: 10, duration: null }), 0)
  assert.equal(segmentLength(10, { start: 2, duration: 3 }), 3)
  // Dauer unbekannt: Angaben unverändert übernehmen
  assert.deepEqual(segmentFor(0, { start: 2, end: 5 }, null), { start: 2, duration: 3 })
})

test('trackIndex liest die Upload-Reihenfolge aus dem Dateinamen', () => {
  assert.equal(trackIndex('/srv/temp/abc/0003_Song.mp3'), 3)
})

test('Decoder schneidet mit -ss vor und -t nach der Eingabe', () => {
  const args = buildDecoderArgs('/tmp/a.wav', 44100, { start: 1.5, duration: 2 })
  assert.ok(args.indexOf('-ss') < args.indexOf('-i'))
  assert.equal(args[args.indexOf('-ss') + 1], '1.5')
  assert.ok(args.indexOf('-t') > args.indexOf('-i'))
  assert.equal(args[args.indexOf('-t') + 1], '2')
  const plain = buildDecoderArgs('/tmp/a.wav', 44100)
  assert.ok(!plain.includes('-ss') && !plain.includes('-t'))
})
