/**
 * N11: Presets (Sprache/Musik/Archiv) und Mono; N8: Empfang geteilter Dateien
 * auch vom Audiokonverter.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import i18n from '../i18n'
import FormatSelector from '../components/FormatSelector.vue'
import { useConverterStore, normalizeChannels } from '../stores/converter'
import { isSharedSource } from '../constants'
import * as api from '../api/converter'

vi.mock('../api/converter', async (importOriginal) => ({
  ...(await importOriginal()),
  uploadFiles: vi.fn(),
  startConversion: vi.fn(),
  subscribeStatus: vi.fn(() => () => {}),
}))

let pinia

beforeEach(() => {
  localStorage.clear()
  pinia = createPinia()
  setActivePinia(pinia)
  i18n.global.locale.value = 'de'
  vi.clearAllMocks()
})

describe('Presets im Store', () => {
  it('Sprache setzt MP3, 64 kbps und Mono und wird als aktiv erkannt', () => {
    const store = useConverterStore()
    expect(store.activePreset).toBe('music')
    store.applyPreset('speech')
    expect([store.outputFormat, store.bitrate, store.channels]).toEqual(['mp3', 64, 1])
    expect(store.activePreset).toBe('speech')
    store.setBitrate(128)
    expect(store.activePreset).toBeNull()
  })

  it('Kanäle werden gespeichert und beim Lesen geprüft', () => {
    const store = useConverterStore()
    store.setChannels(1)
    expect(localStorage.getItem('playlistkonverter.channels')).toBe('1')
    setActivePinia(createPinia())
    expect(useConverterStore().channels).toBe(1)
    expect(normalizeChannels('7')).toBe(2)
    expect(normalizeChannels(null)).toBe(2)
  })

  it('convert schickt die Kanalzahl an den Server', async () => {
    api.uploadFiles.mockResolvedValue({ data: { session_id: 's1' } })
    api.startConversion.mockResolvedValue({ data: {} })
    const store = useConverterStore()
    store.files = [{ id: 1, name: 'a.mp3', size: 1, file: new File(['x'], 'a.mp3') }]
    store.applyPreset('speech')
    await store.convert()
    expect(api.startConversion).toHaveBeenCalledWith(
      's1',
      { format: 'mp3', bitrate: 64, channels: 1 },
      expect.anything(),
    )
    store.reset()
  })
})

describe('FormatSelector', () => {
  it('Preset-Buttons zeigen den aktiven Zustand, Mono-Schalter wirkt', async () => {
    const store = useConverterStore()
    const wrapper = mount(FormatSelector, { global: { plugins: [pinia, i18n] } })
    expect(wrapper.get('[data-preset="music"]').attributes('aria-pressed')).toBe('true')

    await wrapper.get('[data-preset="archive"]').trigger('click')
    expect(store.bitrate).toBe(320)
    expect(wrapper.get('[data-preset="archive"]').attributes('aria-pressed')).toBe('true')
    expect(wrapper.get('[data-preset="archive"]').text()).toContain('MP3 · 320 kbps · Stereo')

    await wrapper.get('[data-testid="mono"]').setValue(true)
    expect(store.channels).toBe(1)
    expect(wrapper.find('[aria-pressed="true"]').exists()).toBe(false)
  })
})

describe('Geteilte Quellen (N8)', () => {
  it.each([
    ['audionormalizer', true],
    ['audiokonverter', true],
    ['playlistkonverter', false],
    [null, false],
  ])('%s → %s', (source, expected) => {
    expect(isSharedSource(source)).toBe(expected)
  })

  it('Banner-Texte nennen geteilte statt normalisierte Dateien (Plural)', () => {
    expect(i18n.global.t('sharedFiles.loaded', 1)).toBe('1 geteilte Datei übernommen.')
    expect(i18n.global.t('sharedFiles.loading', 3)).toBe('3 geteilte Dateien werden geladen …')
  })
})

describe('App übernimmt Dateien vom Audiokonverter', () => {
  it('liest die IndexedDB bei ?source=audiokonverter', async () => {
    vi.resetModules()
    vi.doMock('../utils/sharedFileRepository', () => ({
      getSharedFiles: vi.fn(async () => [
        { blob: new Blob(['x']), name: 'konvertiert.mp3', mimeType: 'audio/mpeg' },
      ]),
      clearSharedFiles: vi.fn(async () => {}),
    }))
    window.history.replaceState(null, '', '/?source=audiokonverter')
    try {
      const { default: App } = await import('../App.vue')
      const { createPinia: freshPinia } = await import('pinia')
      const { default: freshI18n } = await import('../i18n')
      const { useConverterStore: freshStore } = await import('../stores/converter')
      const p = freshPinia()
      const wrapper = mount(App, { global: { plugins: [p, freshI18n] } })
      await flushPromises()
      expect(freshStore(p).files.map((f) => f.name)).toEqual(['konvertiert.mp3'])
      wrapper.unmount()
    } finally {
      window.history.replaceState(null, '', '/')
      vi.doUnmock('../utils/sharedFileRepository')
    }
  })
})
