/**
 * Weitergabe der konvertierten Playlist an den Ultimativen Musikplayer.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import i18n from '../i18n'
import DownloadButton from '../components/DownloadButton.vue'
import { useConverterStore } from '../stores/converter'
import { useToastStore } from '../stores/toast'
import { MUSIC_PLAYER_SHARE_URL } from '../constants'
import { replaceSharedFiles } from '../utils/sharedFileRepository'

vi.mock('../utils/sharedFileRepository', () => ({
  replaceSharedFiles: vi.fn(() => Promise.resolve()),
}))

let pinia
let playerWindow

function fakeResponse(blob, status = 200) {
  return { ok: status >= 200 && status < 300, status, blob: () => Promise.resolve(blob) }
}

function mountButton() {
  return mount(DownloadButton, { global: { plugins: [pinia, i18n] } })
}

beforeEach(() => {
  localStorage.clear()
  pinia = createPinia()
  setActivePinia(pinia)
  i18n.global.locale.value = 'de'
  const store = useConverterStore()
  store.downloadUrl = '/api/download/abc'
  store.outputFormat = 'mp3'

  playerWindow = { opener: {}, location: { href: 'about:blank' }, close: vi.fn() }
  vi.spyOn(window, 'open').mockReturnValue(playerWindow)
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(fakeResponse(new Blob(['x'], { type: 'audio/mpeg' })))),
  )
  replaceSharedFiles.mockClear()
  replaceSharedFiles.mockImplementation(() => Promise.resolve())
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('DownloadButton – An Musikplayer weitergeben', () => {
  it('zeigt die neue Option', () => {
    const btn = mountButton().get('[data-testid="share-to-player"]')
    expect(btn.text()).toBe('An Ultimativen Musikplayer weitergeben')
  })

  it('legt die Playlist in der gemeinsamen IndexedDB ab und öffnet den Player', async () => {
    const wrapper = mountButton()
    await wrapper.get('[data-testid="share-to-player"]').trigger('click')
    await flushPromises()

    expect(fetch).toHaveBeenCalledWith('/api/download/abc')
    expect(replaceSharedFiles).toHaveBeenCalledTimes(1)
    const [records] = replaceSharedFiles.mock.calls[0]
    expect(records).toHaveLength(1)
    expect(records[0].name).toBe('playlist.mp3')
    expect(records[0].mimeType).toBe('audio/mpeg')
    expect(records[0].blob).toBeInstanceOf(Blob)

    expect(window.open).toHaveBeenCalledWith('about:blank', '_blank')
    expect(playerWindow.opener).toBeNull()
    expect(playerWindow.location.href).toBe(MUSIC_PLAYER_SHARE_URL)
  })

  it('lädt die Datei nur einmal (Server löscht die Session nach dem Download)', async () => {
    const wrapper = mountButton()
    const btn = wrapper.get('[data-testid="share-to-player"]')
    await btn.trigger('click')
    await flushPromises()
    await btn.trigger('click')
    await flushPromises()

    expect(fetch).toHaveBeenCalledTimes(1)
    expect(replaceSharedFiles).toHaveBeenCalledTimes(2)
  })

  it('schließt den Tab und meldet einen Fehler, wenn der Download scheitert', async () => {
    fetch.mockImplementation(() => Promise.resolve(fakeResponse(null, 404)))
    const wrapper = mountButton()
    await wrapper.get('[data-testid="share-to-player"]').trigger('click')
    await flushPromises()

    expect(replaceSharedFiles).not.toHaveBeenCalled()
    expect(playerWindow.close).toHaveBeenCalled()
    const toast = useToastStore()
    expect(toast.toasts.at(-1)).toMatchObject({ type: 'error' })
    expect(wrapper.get('[data-testid="share-to-player"]').attributes('disabled')).toBeUndefined()
  })

  it('navigiert im selben Tab, wenn der Popup-Blocker das Öffnen verhindert', async () => {
    window.open.mockReturnValue(null)
    const assigned = []
    const original = window.location
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        set href(v) {
          assigned.push(v)
        },
      },
    })
    try {
      const wrapper = mountButton()
      await wrapper.get('[data-testid="share-to-player"]').trigger('click')
      await flushPromises()
      expect(assigned).toEqual([MUSIC_PLAYER_SHARE_URL])
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: original })
    }
  })
})
