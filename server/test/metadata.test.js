'use strict'

/** N6: Dateiname, Tags und Cover – reine Funktionen. */
const test = require('node:test')
const assert = require('node:assert/strict')
const {
  sanitizeTags,
  sanitizeOutputName,
  contentDisposition,
  buildMetadataArgs,
  buildCoverArgs,
  coverExtension,
} = require('../metadata')
const { buildEncoderArgs, buildCopyArgs } = require('../audio')

test('Tags: nur bekannte Felder, Strings, ohne Steuerzeichen, gekürzt', () => {
  assert.deepEqual(
    sanitizeTags({ title: ' Mein Mix\n', artist: 42, album: 'A'.repeat(300), genre: 'x' }),
    { title: 'Mein Mix', album: 'A'.repeat(200) },
  )
  assert.deepEqual(sanitizeTags(null), {})
  assert.deepEqual(sanitizeTags({ title: '   ' }), {})
})

test('Dateiname: keine Pfade oder Sonderzeichen, nie leer', () => {
  assert.equal(sanitizeOutputName('Mein Mix – Teil 2'), 'Mein Mix – Teil 2')
  assert.equal(sanitizeOutputName('../../etc/passwd'), '_.._etc_passwd')
  assert.equal(sanitizeOutputName('a:b*c?"d<e>f|g'), 'a_b_c__d_e_f_g')
  assert.equal(sanitizeOutputName('...'), 'playlist')
  assert.equal(sanitizeOutputName(''), 'playlist')
  assert.equal(sanitizeOutputName(undefined), 'playlist')
  assert.equal(sanitizeOutputName('x'.repeat(150)).length, 100)
})

test('Content-Disposition mit ASCII-Fallback und UTF-8-Namen', () => {
  assert.equal(
    contentDisposition('Mix – Teil 2.mp3'),
    `attachment; filename="Mix _ Teil 2.mp3"; filename*=UTF-8''Mix%20%E2%80%93%20Teil%202.mp3`,
  )
})

test('Metadaten- und Cover-Argumente', () => {
  assert.deepEqual(buildMetadataArgs({ title: 'T', album: 'A' }), [
    '-metadata',
    'title=T',
    '-metadata',
    'album=A',
  ])
  assert.deepEqual(buildMetadataArgs(undefined), [])
  assert.deepEqual(buildCoverArgs(null), { input: [], output: [] })
  assert.deepEqual(buildCoverArgs('/s/cover.jpg').input, ['-i', '/s/cover.jpg'])
  assert.equal(coverExtension('Bild.JPEG'), 'jpg')
  assert.equal(coverExtension('b.png'), 'png')
  assert.equal(coverExtension('b.gif'), null)
})

test('Encoder: Cover als zweite Eingabe, Audio explizit gemappt, Tags vor der Ausgabe', () => {
  const args = buildEncoderArgs({
    codec: 'libmp3lame',
    bitrate: 192,
    sampleRate: 44100,
    outputFile: '/o.mp3',
    tags: { title: 'T' },
    coverPath: '/c.jpg',
  }).join(' ')
  assert.ok(args.includes('-i pipe:0 -i /c.jpg -map 0:a -map 1:v -c:v copy'))
  assert.ok(args.includes('-metadata title=T -threads'))
  assert.ok(args.endsWith('/o.mp3'))
})

test('Stream-Copy: eigene Tags setzen', () => {
  const args = buildCopyArgs({
    concatPath: '/c.txt',
    outputFile: '/o.mp3',
    tags: { artist: 'K' },
  }).join(' ')
  assert.ok(args.includes('-c:a copy -metadata artist=K -y /o.mp3'))
})
