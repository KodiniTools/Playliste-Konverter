/**
 * Eingabedateien (F3, F11) und Seitentitel (F12): Endungen ohne Rücksicht auf
 * Groß-/Kleinschreibung wie beim Server, eindeutige Track-IDs, passender Titel.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createPinia, setActivePinia } from 'pinia'
import { ACCEPT_ATTRIBUTE, ACCEPTED_AUDIO_EXTENSIONS, isAcceptedAudioFile } from '../constants'
import { useConverterStore } from '../stores/converter'

const ROOT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

describe('isAcceptedAudioFile', () => {
  it.each([
    'a.mp3',
    'B.MP3',
    'c.Wav',
    'track.final.WAV',
    'd.flac',
    'e.M4A',
    'f.aac',
    'g.ogg',
    'h.Opus',
  ])('nimmt %s an', (name) => {
    expect(isAcceptedAudioFile({ name })).toBe(true)
  })

  it.each(['a.png', 'a.wma', 'mp3', 'a.mp3.txt', 'a', 'a.flac.zip'])('lehnt %s ab', (name) => {
    expect(isAcceptedAudioFile({ name })).toBe(false)
  })

  it('accept-Attribut nennt Endungen und die WAV-Varianten der Browser', () => {
    for (const value of ['.mp3', '.wav', 'audio/mpeg', 'audio/x-wav', 'audio/wave']) {
      expect(ACCEPT_ATTRIBUTE.split(',')).toContain(value)
    }
  })
})

describe('Eingabeformate App = Server (N1)', () => {
  it('erlaubt dieselben Endungen wie server/config.js', () => {
    const require = createRequire(import.meta.url)
    const { INPUT_EXTENSIONS } = require('../../server/config.js')
    expect(ACCEPTED_AUDIO_EXTENSIONS.map((e) => e.slice(1)).sort()).toEqual(
      [...INPUT_EXTENSIONS].sort(),
    )
  })
})

describe('converter.addFiles', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('nimmt Großbuchstaben-Endungen ohne MIME-Typ an (SONG.MP3)', () => {
    const store = useConverterStore()
    store.addFiles([new File(['x'], 'SONG.MP3', { type: '' }), new File(['x'], 'b.WAV')])
    expect(store.files.map((f) => f.name)).toEqual(['SONG.MP3', 'b.WAV'])
  })

  it('lehnt Dateien ab, die der Server ablehnen würde, auch mit Audio-MIME-Typ', () => {
    const store = useConverterStore()
    store.addFiles([new File(['x'], 'ohne-endung', { type: 'audio/mpeg' })])
    expect(store.files).toEqual([])
  })

  it('vergibt eindeutige IDs, auch bei zwei Hinzufügungen in derselben Millisekunde', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000)
    const store = useConverterStore()
    store.addFiles([new File(['x'], 'a.mp3'), new File(['x'], 'b.mp3')])
    store.addFiles([new File(['x'], 'c.mp3')])
    const ids = store.files.map((f) => f.id)
    expect(new Set(ids).size).toBe(3)
    vi.restoreAllMocks()
  })
})

describe('app.html', () => {
  const html = readFileSync(join(ROOT_DIR, 'app.html'), 'utf8')

  it('hat einen Titel ohne „WebM“-Fixierung und eine Meta-Description', () => {
    const title = html.match(/<title>([^<]*)<\/title>/)?.[1] ?? ''
    expect(title).toContain('Playlist Konverter')
    expect(title).not.toMatch(/WebM/)
    expect(html).toMatch(/<meta name="description" content="[^"]+MP3[^"]+">/)
  })
})
