'use strict'

/**
 * Kapitel und Tracklist (N2).
 *
 * Aus den Abschnittslängen der Tracks und dem Übergang ergeben sich die
 * Startzeiten in der fertigen Datei. Die Kapitel landen per ffmetadata-Datei
 * in der Ausgabe (MP3: ID3-CHAP, WebM: Matroska, OGG/Opus: Kapitel-Kommentare)
 * und gehen mit dem Status an die App, die daraus .txt/.cue erzeugt.
 * Vorbis bekommt die Kommentare CHAPTERxxx/CHAPTERxxxNAME direkt als globale
 * Metadaten, weil ffmpeg dort aus [CHAPTER]-Blöcken nichts schreibt.
 */

const fsp = require('fs/promises')
const path = require('path')

const roundMs = (value) => Math.round(value * 1000) / 1000
const MAX_TITLE_LENGTH = 200
const MAX_TITLES = 1000
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g

/** Kapiteltitel aus einem Dateinamen: Endung weg. */
function chapterTitle(fileName) {
  return String(fileName).replace(/\.[^.]+$/, '') || 'Track'
}

/**
 * Originalnamen der Tracks aus der App (der Upload speichert nur bereinigte
 * Dateinamen). Ungültige Einträge → null, dann gilt der gespeicherte Name.
 * @returns {(string|null)[]}
 */
function sanitizeTitles(input) {
  if (!Array.isArray(input)) return []
  return input.slice(0, MAX_TITLES).map((value) => {
    if (typeof value !== 'string') return null
    const clean = value.replace(CONTROL_CHARS, ' ').trim().slice(0, MAX_TITLE_LENGTH)
    return clean ? chapterTitle(clean) : null
  })
}

/**
 * @param {number[]} lengths  Länge jedes Tracks in der Ausgabe (Sekunden)
 * @param {string[]} titles
 * @param {{ type: string, seconds: number }} transition
 * @returns {{ title: string, start: number, end: number }[]}
 */
function computeChapters(lengths, titles, transition) {
  const chapters = []
  let position = 0
  for (let i = 0; i < lengths.length; i++) {
    const start = position
    position += lengths[i]
    if (i < lengths.length - 1) {
      if (transition.type === 'gap') position += transition.seconds
      if (transition.type === 'crossfade') {
        // Überblendung höchstens so lang wie der kürzere der beiden Tracks
        position -= Math.min(transition.seconds, lengths[i], lengths[i + 1])
      }
    }
    chapters.push({ title: titles[i], start: roundMs(start), end: roundMs(start + lengths[i]) })
  }
  // Kapitel enden, wo das nächste beginnt (bei Pausen: Pause gehört zum Vortrack)
  for (let i = 0; i < chapters.length - 1; i++) chapters[i].end = chapters[i + 1].start
  return chapters.filter((c) => c.end > c.start)
}

/** Sonderzeichen für ffmetadata maskieren (=, ;, #, \ und Zeilenumbrüche). */
function escapeMetadata(value) {
  return String(value).replace(/[=;#\\\n]/g, (c) => '\\' + c)
}

/** Sekunden → HH:MM:SS.mmm (Vorbis-Kapitelkommentar). */
function vorbisTime(seconds) {
  const ms = Math.round(seconds * 1000)
  const pad = (n, width = 2) => String(n).padStart(width, '0')
  return `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor(ms / 60000) % 60)}:${pad(
    Math.floor(ms / 1000) % 60,
  )}.${pad(ms % 1000, 3)}`
}

/**
 * @param {{ title: string, start: number, end: number }[]} chapters
 * @param {{ vorbis?: boolean }} options  vorbis: Kapitel als globale Kommentare
 */
function buildFfmetadata(chapters, { vorbis = false } = {}) {
  const lines = [';FFMETADATA1']
  if (vorbis) {
    chapters.forEach((chapter, i) => {
      const key = `CHAPTER${String(i + 1).padStart(3, '0')}`
      lines.push(
        `${key}=${vorbisTime(chapter.start)}`,
        `${key}NAME=${escapeMetadata(chapter.title)}`,
      )
    })
    return lines.join('\n') + '\n'
  }
  for (const chapter of chapters) {
    lines.push(
      '[CHAPTER]',
      'TIMEBASE=1/1000',
      `START=${Math.round(chapter.start * 1000)}`,
      `END=${Math.round(chapter.end * 1000)}`,
      `title=${escapeMetadata(chapter.title)}`,
    )
  }
  return lines.join('\n') + '\n'
}

/** ffmetadata-Datei schreiben; bei weniger als zwei Kapiteln keine Datei. */
async function writeChaptersFile(dir, chapters, { vorbis = false } = {}) {
  if (chapters.length < 2) return null
  const file = path.join(dir, 'chapters.txt')
  await fsp.writeFile(file, buildFfmetadata(chapters, { vorbis }), 'utf8')
  return file
}

/**
 * ffmpeg-Argumente für die Kapitel-Datei als weitere Eingabe.
 * @param {string|null} chaptersPath
 * @param {number} inputIndex  Index dieser Eingabe in der ffmpeg-Befehlszeile
 * @param {{ vorbis?: boolean }} options  vorbis: globale Kommentare übernehmen
 */
function buildChapterArgs(chaptersPath, inputIndex, { vorbis = false } = {}) {
  if (!chaptersPath) return { input: [], output: [] }
  return {
    input: ['-f', 'ffmetadata', '-i', chaptersPath],
    output: [vorbis ? '-map_metadata' : '-map_chapters', String(inputIndex)],
  }
}

module.exports = {
  chapterTitle,
  sanitizeTitles,
  computeChapters,
  escapeMetadata,
  buildFfmetadata,
  writeChaptersFile,
  buildChapterArgs,
}
