/**
 * i18n-Schlüssel bleiben vollständig und benutzt: DE und EN haben dieselben
 * Schlüssel, und jeder Schlüssel kommt im App-Code vor. Dynamisch gebildete
 * Schlüssel (format.<id>.description, bitrate.<kbps>) gelten über ihr Präfix.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import i18n from '../i18n'

const SRC_DIR = join(dirname(fileURLToPath(import.meta.url)), '..')
const CODE_DIRS = ['', 'components', 'stores', 'utils', 'api']
const DYNAMIC_PREFIXES = ['format.', 'bitrate.']

function flatKeys(obj, prefix = '') {
  return Object.entries(obj).flatMap(([key, value]) =>
    typeof value === 'object' && value !== null
      ? flatKeys(value, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  )
}

function readCode() {
  return CODE_DIRS.flatMap((dir) => {
    const full = join(SRC_DIR, dir)
    return readdirSync(full)
      .filter((file) => /\.(vue|ts)$/.test(file) && !file.endsWith('.d.ts'))
      .map((file) => readFileSync(join(full, file), 'utf8'))
  }).join('\n')
}

describe('i18n-Schlüssel', () => {
  // Rohdateien lesen: im Bundle sind die Übersetzungen vorkompiliert
  const raw = (locale) =>
    JSON.parse(readFileSync(join(SRC_DIR, 'i18n', 'locales', `${locale}.json`), 'utf8'))
  const de = flatKeys(raw('de')).sort()
  const en = flatKeys(raw('en')).sort()

  it('DE und EN haben dieselben Schlüssel', () => {
    expect(en).toEqual(de)
  })

  it('jeder Schlüssel wird im App-Code verwendet', () => {
    const code = readCode()
    const unused = de.filter(
      (key) =>
        !DYNAMIC_PREFIXES.some((prefix) => key.startsWith(prefix)) && !code.includes(`'${key}'`),
    )
    expect(unused).toEqual([])
  })
})

describe('vue-i18n (Composition-Modus)', () => {
  it('läuft im Composition-Modus und interpoliert Parameter', () => {
    expect(i18n.mode).toBe('composition')
    const { t, locale } = i18n.global
    const previous = locale.value
    locale.value = 'en'
    expect(t('download.button', { name: 'Mix.mp3' })).toBe('Download “Mix.mp3”')
    locale.value = previous
  })

  it('fällt bei unbekannter Sprache auf Deutsch zurück', () => {
    const { t, locale } = i18n.global
    const previous = locale.value
    locale.value = 'fr'
    expect(t('fileList.removeAll')).toBe('Alle entfernen')
    locale.value = previous
  })
})
