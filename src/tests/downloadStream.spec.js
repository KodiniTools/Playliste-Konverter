/**
 * F10: Download per Dateidialog fließt direkt vom Server in die Datei, ohne die
 * ganze Ausgabe als Blob im Arbeitsspeicher zu halten. Die gespeicherte Datei
 * dient danach als Quelle für die Weitergabe an den Musikplayer.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import i18n from '../i18n'
import DownloadButton from '../components/DownloadButton.vue'
import { useConverterStore } from '../stores/converter'
import { replaceSharedFiles } from '../utils/sharedFileRepository'

vi.mock('../utils/sharedFileRepository', () => ({
  replaceSharedFiles: vi.fn(() => Promise.resolve()),
}))

let pinia
let written
let aborted
let handle

function streamResponse(chunks) {
  const encoder = new TextEncoder()
  return {
    ok: true,
    status: 200,
    body: new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
        controller.close()
      },
    }),
    blob: vi.fn(() => Promise.resolve(new Blob([chunks.join('')]))),
  }
}

function fakeHandle() {
  return {
    createWritable: vi.fn(async () => {
      const stream = new WritableStream({
        write(chunk) {
          written.push(typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk))
        },
        abort() {
          aborted = true
        },
      })
      // FileSystemWritableFileStream: write(Blob) wie im Browser unterstützen
      stream.write = async (data) => {
        written.push(data instanceof Blob ? await data.text() : String(data))
      }
      stream.close = async () => {}
      return stream
    }),
    getFile: vi.fn(async () => new File([written.join('')], 'playlist.mp3')),
  }
}

function mountButton() {
  return mount(DownloadButton, { global: { plugins: [pinia, i18n] } })
}

beforeEach(() => {
  pinia = createPinia()
  setActivePinia(pinia)
  i18n.global.locale.value = 'de'
  const store = useConverterStore()
  store.downloadUrl = '/api/download/abc'
  store.outputFormat = 'mp3'
  written = []
  aborted = false
  handle = fakeHandle()
  window.showSaveFilePicker = vi.fn(async () => handle)
  vi.spyOn(window, 'open').mockReturnValue({ opener: {}, location: { href: '' }, close: vi.fn() })
  replaceSharedFiles.mockClear()
})

afterEach(() => {
  delete window.showSaveFilePicker
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('DownloadButton – Speichern per Dateidialog (F10)', () => {
  it('streamt die Antwort in die Datei, ohne response.blob()', async () => {
    const response = streamResponse(['teil1-', 'teil2'])
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response),
    )
    const wrapper = mountButton()

    await wrapper.get('button').trigger('click')
    await flushPromises()

    expect(written.join('')).toBe('teil1-teil2')
    expect(response.blob).not.toHaveBeenCalled()
    expect(aborted).toBe(false)
  })

  it('Weitergabe danach nutzt die gespeicherte Datei statt erneut zu laden', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => streamResponse(['abc'])),
    )
    const wrapper = mountButton()

    await wrapper.get('button').trigger('click')
    await flushPromises()
    await wrapper.get('[data-testid="share-to-player"]').trigger('click')
    await flushPromises()

    expect(fetch).toHaveBeenCalledTimes(1)
    expect(handle.getFile).toHaveBeenCalled()
    const [records] = replaceSharedFiles.mock.calls[0]
    expect(await records[0].blob.text()).toBe('abc')
  })

  it('nach der Weitergabe schreibt der Download die vorhandene Datei', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => streamResponse(['xyz'])),
    )
    const wrapper = mountButton()

    await wrapper.get('[data-testid="share-to-player"]').trigger('click')
    await flushPromises()
    await wrapper.get('button').trigger('click')
    await flushPromises()

    // Das Schreiben des Blobs läuft asynchron (Blob.text)
    await vi.waitFor(() => expect(written.join('')).toBe('xyz'))
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('HTTP-Fehler bricht die Datei ab und fällt auf den direkten Link zurück', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 404, body: null })),
    )
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
      await wrapper.get('button').trigger('click')
      await flushPromises()
      expect(aborted).toBe(true)
      expect(assigned).toEqual(['/api/download/abc'])
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: original })
    }
  })
})
