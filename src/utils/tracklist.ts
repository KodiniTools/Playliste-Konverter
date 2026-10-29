import type { Chapter } from '../api/converter'

/**
 * Tracklist der fertigen Playlist als Text oder CUE-Sheet (N2).
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
