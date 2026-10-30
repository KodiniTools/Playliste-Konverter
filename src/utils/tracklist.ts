import type { Chapter } from '../api/converter'

/**
 * Tracklist der fertigen Playlist als Text, CUE-Sheet, M3U, PLS oder JSON (N2).
 * Die Zeiten kommen vom Server (Kapitel), berücksichtigen also Zuschnitt,
 * Stille am Rand und Übergänge.
 */

/** Startzeit für die Textliste: m:ss, ab einer Stunde h:mm:ss. */
export function tracklistTime(seconds: number): string {
  const total = Math.floor(seconds)
  const hours = Math.floor(total / 3600)
  const mins = Math.floor((total % 3600) / 60)
  const secs = String(total % 60).padStart(2, '0')
  return hours > 0 ? `${hours}:${String(mins).padStart(2, '0')}:${secs}` : `${mins}:${secs}`
}

/** CUE-Zeit mm:ss:ff (75 Frames pro Sekunde; Minuten dürfen über 99 gehen). */
export function cueTime(seconds: number): string {
  const frames = Math.round(seconds * 75)
  const mins = Math.floor(frames / (75 * 60))
  const secs = Math.floor(frames / 75) % 60
  const rest = frames % 75
  return [mins, secs, rest].map((n) => String(n).padStart(2, '0')).join(':')
}

/** Anführungszeichen und Zeilenumbrüche sind im CUE-Sheet nicht erlaubt. */
function cueText(value: string): string {
  return value.replace(/"/g, "'").replace(/[\r\n]+/g, ' ')
}

export function buildTracklistText(chapters: readonly Chapter[]): string {
  return chapters.map((c) => `${tracklistTime(c.start)} ${c.title}`).join('\n') + '\n'
}

export interface CueOptions {
  fileName: string
  title?: string
  performer?: string
}

export function buildCueSheet(chapters: readonly Chapter[], options: CueOptions): string {
  const type = /\.mp3$/i.test(options.fileName) ? 'MP3' : 'WAVE'
  const lines: string[] = []
  if (options.performer) lines.push(`PERFORMER "${cueText(options.performer)}"`)
  if (options.title) lines.push(`TITLE "${cueText(options.title)}"`)
  lines.push(`FILE "${cueText(options.fileName)}" ${type}`)
  chapters.forEach((chapter, i) => {
    lines.push(
      `  TRACK ${String(i + 1).padStart(2, '0')} AUDIO`,
      `    TITLE "${cueText(chapter.title)}"`,
      `    INDEX 01 ${cueTime(chapter.start)}`,
    )
  })
  return lines.join('\r\n') + '\r\n'
}

/** Zeilenumbrüche würden M3U/PLS-Einträge zerreißen. */
function lineText(value: string): string {
  return value.replace(/[\r\n]+/g, ' ')
}

const chapterSeconds = (chapter: Chapter) => Math.max(0, chapter.end - chapter.start)
const baseName = (fileName: string) => fileName.replace(/\.[^.]+$/, '')
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g

/**
 * Originaldatei je Kapitel. Der Server bildet die Titel aus den Dateinamen
 * (Steuerzeichen weg, max. 200 Zeichen, ohne Endung) und lässt Kapitel ohne
 * Länge weg; deshalb wird der Reihe nach verglichen statt per Index.
 * Ohne Treffer gilt der Kapiteltitel.
 */
export function sourceFileNames(
  chapters: readonly Chapter[],
  fileNames: readonly string[],
): string[] {
  let next = 0
  return chapters.map((chapter) => {
    for (let i = next; i < fileNames.length; i++) {
      const name = fileNames[i] ?? ''
      const title = baseName(name.replace(CONTROL_CHARS, ' ').trim().slice(0, 200))
      if (title === chapter.title) {
        next = i + 1
        return name
      }
    }
    return chapter.title
  })
}

export interface PlaylistOptions {
  /** Datei je Kapitel (siehe sourceFileNames), gleiche Reihenfolge wie die Kapitel. */
  files: readonly string[]
  title?: string
}

/** Extended M3U (UTF-8) mit #EXTINF: Dauer in Sekunden und Titel je Track. */
export function buildM3u(chapters: readonly Chapter[], options: PlaylistOptions): string {
  const lines = ['#EXTM3U', '#EXTENC:UTF-8']
  if (options.title) lines.push(`#PLAYLIST:${lineText(options.title)}`)
  chapters.forEach((chapter, i) => {
    lines.push(
      `#EXTINF:${Math.round(chapterSeconds(chapter))},${lineText(chapter.title)}`,
      lineText(options.files[i] ?? chapter.title),
    )
  })
  return lines.join('\n') + '\n'
}

/** PLS Version 2 (INI-Format, CRLF). */
export function buildPls(chapters: readonly Chapter[], options: PlaylistOptions): string {
  const lines = ['[playlist]']
  chapters.forEach((chapter, i) => {
    const n = i + 1
    lines.push(
      `File${n}=${lineText(options.files[i] ?? chapter.title)}`,
      `Title${n}=${lineText(chapter.title)}`,
      `Length${n}=${Math.round(chapterSeconds(chapter))}`,
    )
  })
  lines.push(`NumberOfEntries=${chapters.length}`, 'Version=2')
  return lines.join('\r\n') + '\r\n'
}

export interface JsonTracklistOptions extends PlaylistOptions {
  /** Name der fertigen Playlist-Datei, z. B. „Sommer Mix.mp3“. */
  fileName: string
  performer?: string
}

const roundMs = (value: number) => Math.round(value * 1000) / 1000

/** Tracklist als JSON: Playlist-Datei plus Start, Ende und Dauer je Track (Sekunden). */
export function buildTracklistJson(
  chapters: readonly Chapter[],
  options: JsonTracklistOptions,
): string {
  const last = chapters[chapters.length - 1]
  const data = {
    title: options.title ?? null,
    performer: options.performer ?? null,
    file: options.fileName,
    duration: last ? roundMs(last.end) : 0,
    tracks: chapters.map((chapter, i) => ({
      number: i + 1,
      title: chapter.title,
      file: options.files[i] ?? chapter.title,
      start: roundMs(chapter.start),
      end: roundMs(chapter.end),
      duration: roundMs(chapterSeconds(chapter)),
      startTime: tracklistTime(chapter.start),
    })),
  }
  return JSON.stringify(data, null, 2) + '\n'
}
