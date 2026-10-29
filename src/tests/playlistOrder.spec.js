/**
 * N7: Sortieren (A–Z, Tracknummer, Umkehren, Zufall) und Duplikate.
 */
import { describe, expect, it } from 'vitest'
import {
  duplicateKey,
  shuffle,
  sortByName,
  sortByTrackNumber,
  sortItems,
  trackNumberOf,
} from '../utils/playlistOrder'

const items = (...names) => names.map((name) => ({ name, size: 1 }))
const names = (list) => list.map((item) => item.name)

describe('trackNumberOf', () => {
  it.each([
    ['03 Titel.mp3', 3],
    ['1-Intro.wav', 1],
    ['Album - 07 - Titel.mp3', 7],
    ['Track 12.mp3', 12],
    ['Song (4).mp3', 4],
    ['Mix 2024.mp3', null],
    ['Titel.mp3', null],
    ['10.mp3', 10],
  ])('%s → %s', (name, expected) => {
    expect(trackNumberOf(name)).toBe(expected)
  })
})

describe('Sortieren', () => {
  it('A–Z natürlich und ohne Groß/Klein', () => {
    expect(names(sortByName(items('Track 10.mp3', 'track 2.mp3', 'Abba.mp3')))).toEqual([
      'Abba.mp3',
      'track 2.mp3',
      'Track 10.mp3',
    ])
  })

  it('nach Tracknummer; ohne Nummer stabil am Ende', () => {
    const input = items('Bonus.mp3', 'B - 02.mp3', 'Outro.mp3', 'A - 01.mp3', '10 Zehn.mp3')
    expect(names(sortByTrackNumber(input))).toEqual([
      'A - 01.mp3',
      'B - 02.mp3',
      '10 Zehn.mp3',
      'Bonus.mp3',
      'Outro.mp3',
    ])
  })

  it('Umkehren und Eingabe bleibt unverändert', () => {
    const input = items('a', 'b', 'c')
    expect(names(sortItems(input, 'reverse'))).toEqual(['c', 'b', 'a'])
    expect(names(input)).toEqual(['a', 'b', 'c'])
  })

  it('Zufall ist eine Permutation (deterministisch mit festem random)', () => {
    const input = items('a', 'b', 'c', 'd')
    const result = shuffle(input, () => 0)
    expect(names(result)).toEqual(['b', 'c', 'd', 'a'])
    expect(names(result).sort()).toEqual(['a', 'b', 'c', 'd'])
  })
})

describe('duplicateKey', () => {
  it('gleicher Name (ohne Groß/Klein) und gleiche Größe', () => {
    expect(duplicateKey({ name: 'A.mp3', size: 5 })).toBe(duplicateKey({ name: 'a.mp3', size: 5 }))
    expect(duplicateKey({ name: 'a.mp3', size: 5 })).not.toBe(
      duplicateKey({ name: 'a.mp3', size: 6 }),
    )
  })
})
