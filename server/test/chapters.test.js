'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const {
  chapterTitle,
  sanitizeTitles,
  computeChapters,
  escapeMetadata,
  buildFfmetadata,
  buildChapterArgs,
} = require('../chapters')
const { buildEncoderArgs, buildCopyArgs } = require('../audio')

const none = { type: 'none', seconds: 0 }

test('chapterTitle entfernt die Endung', () => {
  assert.equal(chapterTitle('01 Intro.mp3'), '01 Intro')
  assert.equal(chapterTitle('ohne'), 'ohne')
  assert.equal(chapterTitle('.mp3'), 'Track')
})

test('sanitizeTitles: Originalnamen ohne Endung, ungültig → null', () => {
  assert.deepEqual(sanitizeTitles('x'), [])
  assert.deepEqual(sanitizeTitles(['Song; Teil 2.mp3', 7, '  ', 'a\nb.wav']), [
    'Song; Teil 2',
    null,
    null,
    'a b',
  ])
})

test('Kapitel folgen den Tracklängen, Pausen und Überblendungen', () => {
  assert.deepEqual(computeChapters([10, 20, 5], ['a', 'b', 'c'], none), [
    { title: 'a', start: 0, end: 10 },
    { title: 'b', start: 10, end: 30 },
    { title: 'c', start: 30, end: 35 },
  ])
  // Pause zählt zum vorigen Kapitel
  assert.deepEqual(
    computeChapters([10, 20], ['a', 'b'], { type: 'gap', seconds: 2 }).map((c) => c.start),
    [0, 12],
  )
  // Crossfade: nächstes Kapitel beginnt mit der Einblendung, höchstens Länge des kürzeren Tracks
  assert.deepEqual(
    computeChapters([10, 20, 1], ['a', 'b', 'c'], { type: 'crossfade', seconds: 3 }).map(
      (c) => c.start,
    ),
    [0, 7, 26],
  )
  // leere (komplett weggeschnittene) Tracks erzeugen kein Kapitel
  assert.equal(computeChapters([10, 0, 5], ['a', 'b', 'c'], none).length, 2)
})

test('ffmetadata maskiert Sonderzeichen und rechnet in Millisekunden', () => {
  assert.equal(escapeMetadata('A=B;C#D\\E\nF'), 'A\\=B\\;C\\#D\\\\E\\\nF')
  const text = buildFfmetadata([{ title: 'Intro', start: 0, end: 1.5 }])
  assert.equal(text, ';FFMETADATA1\n[CHAPTER]\nTIMEBASE=1/1000\nSTART=0\nEND=1500\ntitle=Intro\n')
})

test('Vorbis: Kapitel als globale CHAPTERxxx-Kommentare', () => {
  const text = buildFfmetadata(
    [
      { title: 'Intro', start: 0, end: 62.5 },
      { title: 'Teil; 2', start: 3725.25, end: 4000 },
    ],
    { vorbis: true },
  )
  assert.equal(
    text,
    ';FFMETADATA1\nCHAPTER001=00:00:00.000\nCHAPTER001NAME=Intro\n' +
      'CHAPTER002=01:02:05.250\nCHAPTER002NAME=Teil\\; 2\n',
  )
  const args = buildEncoderArgs({
    codec: 'libvorbis',
    bitrate: 192,
    sampleRate: 44100,
    outputFile: '/tmp/o.ogg',
    chaptersPath: '/tmp/ch.txt',
  }).join(' ')
  assert.ok(args.includes('-map_metadata 1') && !args.includes('-map_chapters'))
})

test('Kapitel-Eingabe steht hinter dem Cover und wird per -map_chapters gewählt', () => {
  assert.deepEqual(buildChapterArgs(null, 1), { input: [], output: [] })
  const base = { codec: 'libmp3lame', bitrate: 192, sampleRate: 44100, outputFile: '/tmp/o.mp3' }
  const withCover = buildEncoderArgs({
    ...base,
    coverPath: '/tmp/c.jpg',
    chaptersPath: '/tmp/ch.txt',
  }).join(' ')
  assert.ok(withCover.includes('-i /tmp/c.jpg -f ffmetadata -i /tmp/ch.txt'))
  assert.ok(withCover.includes('-map_chapters 2'))
  const plain = buildEncoderArgs({ ...base, chaptersPath: '/tmp/ch.txt' }).join(' ')
  assert.ok(plain.includes('-map_chapters 1'))
  const copy = buildCopyArgs({
    concatPath: '/tmp/c.txt',
    outputFile: '/tmp/o.mp3',
    chaptersPath: '/tmp/ch.txt',
  }).join(' ')
  assert.ok(copy.includes('-f ffmetadata -i /tmp/ch.txt') && copy.includes('-map_chapters 1'))
})
