/**
 * Reihenfolge und Duplikate der Playlist (N7). Reine Funktionen: Sie geben
 * neue Arrays zurück und verändern die Eingabe nicht.
 */

interface NamedItem {
  name: string
  size: number
}

export type SortMode = 'name' | 'trackNumber' | 'reverse' | 'shuffle'

export const SORT_MODES: readonly SortMode[] = ['name', 'trackNumber', 'reverse', 'shuffle']

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

/** Name ohne Dateiendung. */
function baseName(name: string): string {
  return name.replace(/\.[^.]+$/, '')
}

/**
 * Tracknummer aus dem Dateinamen: zuerst eine führende Zahl („03 Titel“,
 * „1-Intro“), sonst eine eigenständige ein- bis dreistellige Zahl
 * („Album - 07 - Titel“, „Track 12“). Jahreszahlen (4 Stellen) zählen nicht.
 */
export function trackNumberOf(name: string): number | null {
  const base = baseName(name)
  const leading = /^\s*(\d{1,3})(?!\d)/.exec(base)
  if (leading?.[1]) return Number(leading[1])
  const standalone = /(?:^|[\s._\-([])(\d{1,3})(?=$|[\s._\-)\]])/.exec(base)
  return standalone?.[1] ? Number(standalone[1]) : null
}

/** A–Z, Zahlen natürlich sortiert („Track 2“ vor „Track 10“), ohne Groß/Klein. */
export function sortByName<T extends NamedItem>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => collator.compare(a.name, b.name))
}

/** Nach Tracknummer; Dateien ohne Nummer behalten ihre Reihenfolge am Ende. */
export function sortByTrackNumber<T extends NamedItem>(items: readonly T[]): T[] {
  return items
    .map((item, index) => ({ item, index, number: trackNumberOf(item.name) }))
    .sort((a, b) => {
      if (a.number === null || b.number === null) {
        if (a.number === b.number) return a.index - b.index
        return a.number === null ? 1 : -1
      }
      return a.number - b.number || a.index - b.index
    })
    .map(({ item }) => item)
}

/** Fisher-Yates; `random` ist für Tests austauschbar. */
export function shuffle<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    const swap = result[i] as T
    result[i] = result[j] as T
    result[j] = swap
  }
  return result
}

export function sortItems<T extends NamedItem>(items: readonly T[], mode: SortMode): T[] {
  switch (mode) {
    case 'name':
      return sortByName(items)
    case 'trackNumber':
      return sortByTrackNumber(items)
    case 'reverse':
      return [...items].reverse()
    case 'shuffle':
      return shuffle(items)
  }
}

/** Gleicher Name und gleiche Größe gelten als dieselbe Datei. */
export function duplicateKey(item: NamedItem): string {
  return `${item.name.toLowerCase()}\u0000${item.size}`
}
