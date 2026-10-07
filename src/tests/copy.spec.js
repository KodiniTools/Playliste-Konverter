/**
 * Texte versprechen nur, was der Code durchsetzt: keine Dateianzahl (es gibt
 * keine), das Gesamtlimit aus constants.js.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import i18n from '../i18n'
import { MAX_PLAYLIST_SIZE } from '../constants'

const ROOT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (file) => readFileSync(join(ROOT_DIR, file), 'utf8')
const SOURCES = ['index.html', 'faq.html', 'funktion.html', 'src/i18n/index.js']
const gb = MAX_PLAYLIST_SIZE / 1024 ** 3

describe('Texte zu Limits', () => {
  it.each(SOURCES)('%s nennt keine feste Dateianzahl', (file) => {
    expect(read(file)).not.toMatch(
      /(?:bis zu|up to|max\.|maximal)\s*\d+\s*(?:Audio-Tracks|audio tracks|MP3|Dateien|files|Tracks)/i,
    )
  })

  it('Untertitel der App nennt das Gesamtlimit (DE/EN)', () => {
    const { messages } = i18n.global
    expect(messages.value.de.app.subtitle).toContain(`${gb} GB`)
    expect(messages.value.en.app.subtitle).toContain(`${gb} GB`)
  })

  it('Landing-Seite nennt das Gesamtlimit (DE/EN)', () => {
    const html = read('index.html')
    expect(html).toContain(`MP3- oder WAV-Dateien bis ${gb} GB`)
    expect(html).toContain(`MP3 or WAV files up to ${gb} GB`)
  })
})
