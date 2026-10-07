'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const {
  pickSampleRate,
  canStreamCopy,
  buildDecoderArgs,
  buildEncoderArgs,
  buildCopyArgs,
  parseFfmpegTime,
  displayName,
} = require('../audio')

const mp3 = (sampleRate = 44100, channels = 2) => ({
  codec: 'mp3',
  sampleRate,
  channels,
  duration: 3,
})

test('Stream-Copy nur bei identisch kodierten Eingaben im Ausgabe-Codec', () => {
  assert.equal(canStreamCopy([mp3(), mp3(), mp3()], 'mp3'), true)
  // MP3 + WAV gemischt (der gemeldete Fehler)
  assert.equal(
    canStreamCopy([mp3(), { codec: 'pcm_s16le', sampleRate: 44100, channels: 2 }], 'mp3'),
    false,
  )
  // nur MP3, aber unterschiedliche Samplerate oder Kanalzahl
  assert.equal(canStreamCopy([mp3(44100), mp3(48000)], 'mp3'), false)
  assert.equal(canStreamCopy([mp3(44100, 2), mp3(44100, 1)], 'mp3'), false)
  // falscher Ziel-Codec, leere Liste, unbekannte Werte
  assert.equal(canStreamCopy([mp3()], 'vorbis'), false)
  assert.equal(canStreamCopy([], 'mp3'), false)
  assert.equal(canStreamCopy([{ codec: 'mp3', sampleRate: 0, channels: 0 }], 'mp3'), false)
})

test('Samplerate: Opus immer 48 kHz, sonst gemeinsame Rate oder 44,1 kHz', () => {
  assert.equal(pickSampleRate('webm', [44100, 44100]), 48000)
  assert.equal(pickSampleRate('mp3', [48000, 48000]), 48000)
  assert.equal(pickSampleRate('mp3', [44100, 48000]), 44100)
  assert.equal(pickSampleRate('ogg', [96000]), 44100)
  assert.equal(pickSampleRate('mp3', []), 44100)
})

test('Decoder normalisiert auf PCM Stereo mit fester Rate, nur erste Audiospur', () => {
  const args = buildDecoderArgs('/tmp/a.wav', 44100)
  assert.deepEqual(args.slice(args.indexOf('-i'), args.indexOf('-i') + 2), ['-i', '/tmp/a.wav'])
  assert.ok(args.includes('-vn'))
  assert.deepEqual(args.slice(args.indexOf('-map'), args.indexOf('-map') + 2), ['-map', '0:a:0'])
  assert.deepEqual(args.slice(-7), ['-f', 'f32le', '-ac', '2', '-ar', '44100', 'pipe:1'])
})

test('Encoder liest dasselbe PCM von stdin und schreibt das Zielformat', () => {
  const args = buildEncoderArgs({
    codec: 'libmp3lame',
    bitrate: 192,
    sampleRate: 44100,
    outputFile: '/tmp/o.mp3',
  })
  assert.deepEqual(args.slice(1, 9), ['-f', 'f32le', '-ar', '44100', '-ac', '2', '-i', 'pipe:0'])
  assert.ok(args.join(' ').includes('-c:a libmp3lame -b:a 192k'))
  assert.equal(args.at(-1), '/tmp/o.mp3')
})

test('Stream-Copy mappt nur Audio (keine Cover-Bilder)', () => {
  const args = buildCopyArgs({ concatPath: '/tmp/c.txt', outputFile: '/tmp/o.mp3' })
  assert.ok(args.join(' ').includes('-f concat -safe 0 -i /tmp/c.txt -map 0:a -c:a copy'))
})

test('parseFfmpegTime nimmt die letzte Zeitangabe', () => {
  assert.equal(parseFfmpegTime('size= 1kB time=00:00:01.50 bitrate= time=00:01:02.25'), 62.25)
  assert.equal(parseFfmpegTime('keine Zeit'), null)
})

test('displayName entfernt das Reihenfolge-Präfix', () => {
  assert.equal(displayName('/srv/temp/abc/0003_Rijeka_dobra.wav'), 'Rijeka_dobra.wav')
})
