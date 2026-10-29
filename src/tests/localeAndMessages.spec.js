/**
 * Gesperrter oder fremd beschriebener Speicher (F5) und übersetzte Meldungen (F7):
 * Die App startet auch ohne localStorage, nimmt nur de/en an und zeigt Toasts
 * in der gewählten Sprache.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import i18n, { normalizeLocale } from '../i18n'
import { readSharedPref } from '../utils/storage'
import { useUIStore } from '../stores/ui'
import { useConverterStore } from '../stores/converter'
import { useToastStore } from '../stores/toast'

function blockStorage() {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new DOMException('blockiert', 'SecurityError')
  })
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('blockiert', 'SecurityError')
  })
}

describe('Gespeicherte Sprache/Theme (F5)', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
    setActivePinia(createPinia())
  })
  afterEach(() => vi.restoreAllMocks())

  it('normalizeLocale nimmt nur de und en an', () => {
    expect(normalizeLocale('en')).toBe('en')
    expect(normalizeLocale('de')).toBe('de')
    expect(normalizeLocale('fr')).toBe('de')
    expect(normalizeLocale(null)).toBe('de')
  })

  it('gesperrter Speicher: readSharedPref liefert null statt zu werfen', () => {
    blockStorage()
    expect(readSharedPref('locale')).toBeNull()
  })

  it('gesperrter Speicher: UI-Store startet mit Deutsch und Light', () => {
    blockStorage()
    const ui = useUIStore()
    expect(ui.locale).toBe('de')
    expect(ui.theme).toBe('light')
  })

  it('i18n-Modul lässt sich bei gesperrtem Speicher laden', async () => {
    blockStorage()
    vi.resetModules()
    const fresh = await import('../i18n')
    expect(fresh.default.global.locale.value).toBe('de')
  })

  it('fremder Wert eines anderen Tools ("fr") ergibt Deutsch und lang="de"', async () => {
    localStorage.setItem('locale', 'fr')
    const ui = useUIStore()
    await nextTick()
    expect(ui.locale).toBe('de')
    expect(document.documentElement.getAttribute('lang')).toBe('de')
  })

  it('locale-changed-Event mit unbekannter Sprache wird auf Deutsch abgebildet', async () => {
    localStorage.setItem('locale', 'en')
    const ui = useUIStore()
    window.dispatchEvent(new CustomEvent('locale-changed', { detail: { locale: 'xx' } }))
    expect(ui.locale).toBe('de')
  })
})

describe('Übersetzte Meldungen des Converter-Stores (F7)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    i18n.global.locale.value = 'en'
  })
  afterEach(() => {
    i18n.global.locale.value = 'de'
  })

  const messages = () => useToastStore().toasts.map((toast) => toast.message)

  it('Hinzufügen, Überspringen und Entfernen auf Englisch, mit Plural', () => {
    const store = useConverterStore()
    store.addFiles([new File(['x'], 'a.mp3'), new File(['x'], 'b.wav'), new File(['x'], 'c.ogg')])
    store.removeFile(store.files[0].id)
    store.removeAllFiles()
    expect(messages()).toEqual([
      '2 files added',
      '1 file skipped (MP3/WAV only)',
      '“a.mp3” removed',
      '1 file removed',
    ])
  })

  it('Deutsch: Singular und Plural', () => {
    i18n.global.locale.value = 'de'
    const store = useConverterStore()
    store.addFiles([new File(['x'], 'a.mp3')])
    store.addFiles([new File(['x'], 'b.mp3'), new File(['x'], 'c.mp3')])
    expect(messages()).toEqual(['1 Datei hinzugefügt', '2 Dateien hinzugefügt'])
  })

  it('Konvertieren ohne Dateien meldet den Fehler auf Englisch', async () => {
    const store = useConverterStore()
    await store.convert()
    expect(store.errorMessage).toBe('No files selected.')
  })
})
