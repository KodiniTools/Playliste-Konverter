/**
 * N10: Abgebrochene Uploads wiederholen und fortsetzen.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import axios from 'axios'
import i18n from '../i18n'
import { uploadFiles, fetchReceived } from '../api/converter'
import { isRetryableUploadError } from '../utils/errors'

vi.mock('axios', () => ({ default: { post: vi.fn() } }))

const networkError = () => Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' })
const httpError = (status) => Object.assign(new Error(`HTTP ${status}`), { response: { status } })

function form(names) {
  const data = new FormData()
  names.forEach((name, i) => {
    data.append('files[]', new File(['x'.repeat(10)], name))
    data.append('order[]', String(i))
  })
  return data
}

/** Gesendete Positionen und Session-IDs der axios-Aufrufe. */
const posts = () =>
  axios.post.mock.calls.map(([, body]) => ({
    order: body.get('order[]'),
    session: body.get('session_id'),
  }))

beforeEach(() => {
  axios.post.mockReset()
  vi.stubGlobal('fetch', vi.fn())
})
afterEach(() => vi.unstubAllGlobals())

describe('isRetryableUploadError', () => {
  it('Netzwerk und vorübergehende Serverfehler ja, Ablehnungen und Abbruch nein', () => {
    expect(isRetryableUploadError(networkError())).toBe(true)
    expect(isRetryableUploadError(httpError(502))).toBe(true)
    expect(isRetryableUploadError(httpError(429))).toBe(true)
    expect(isRetryableUploadError(httpError(413))).toBe(false)
    expect(isRetryableUploadError(httpError(410))).toBe(false)
    expect(isRetryableUploadError(new DOMException('x', 'AbortError'))).toBe(false)
  })
})

describe('uploadFiles mit Wiederholung', () => {
  const options = (extra = {}) => ({
    signal: new AbortController().signal,
    onUploadProgress: vi.fn(),
    retryDelays: [0, 0, 0],
    ...extra,
  })

  it('wiederholt eine Datei nach Verbindungsabbruch und meldet die Versuche', async () => {
    axios.post
      .mockResolvedValueOnce({ data: { session_id: 's1' } })
      .mockRejectedValueOnce(networkError())
      .mockResolvedValueOnce({ data: { session_id: 's1' } })
    fetch.mockResolvedValue(new Response(JSON.stringify({ received: [0] })))
    const onRetry = vi.fn()
    const opts = options({ onRetry })
    const res = await uploadFiles(form(['a.mp3', 'b.mp3']), opts)

    expect(res.data.session_id).toBe('s1')
    expect(posts()).toEqual([
      { order: '0', session: null },
      { order: '1', session: 's1' },
      { order: '1', session: 's1' },
    ])
    expect(onRetry).toHaveBeenCalledWith({ attempt: 1, max: 3, fileName: 'b.mp3' })
    expect(opts.onUploadProgress).toHaveBeenLastCalledWith({ loaded: 20, total: 20 })
  })

  it('überspringt die Wiederholung, wenn die Datei trotz Fehler angekommen ist', async () => {
    axios.post
      .mockResolvedValueOnce({ data: { session_id: 's1' } })
      .mockRejectedValueOnce(httpError(504))
    fetch.mockResolvedValue(new Response(JSON.stringify({ received: [0, 1] })))
    await uploadFiles(form(['a.mp3', 'b.mp3']), options())
    expect(axios.post).toHaveBeenCalledTimes(2)
    expect(fetch).toHaveBeenCalledWith(expect.stringMatching(/\/upload\/s1$/), expect.anything())
  })

  it('gibt nach allen Versuchen auf und wirft den letzten Fehler', async () => {
    axios.post.mockRejectedValue(networkError())
    await expect(uploadFiles(form(['a.mp3']), options())).rejects.toMatchObject({
      code: 'ERR_NETWORK',
    })
    expect(axios.post).toHaveBeenCalledTimes(4)
  })

  it('Ablehnungen (z. B. 413) werden nicht wiederholt', async () => {
    axios.post.mockRejectedValue(httpError(413))
    await expect(uploadFiles(form(['a.mp3']), options())).rejects.toMatchObject({
      response: { status: 413 },
    })
    expect(axios.post).toHaveBeenCalledTimes(1)
  })

  it('Abbrechen während der Wartezeit beendet sofort', async () => {
    axios.post.mockRejectedValue(networkError())
    const controller = new AbortController()
    const pending = uploadFiles(form(['a.mp3']), {
      signal: controller.signal,
      onUploadProgress: vi.fn(),
      retryDelays: [60_000],
    })
    await flushPromises()
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('Fortsetzen: nutzt die Session und sendet nur fehlende Dateien', async () => {
    axios.post.mockResolvedValue({ data: { session_id: 's9' } })
    const onSessionId = vi.fn()
    const opts = options({ sessionId: 's9', skip: new Set([0, 2]), onSessionId })
    const res = await uploadFiles(form(['a.mp3', 'b.mp3', 'c.mp3']), opts)
    expect(res.data.session_id).toBe('s9')
    expect(posts()).toEqual([{ order: '1', session: 's9' }])
    expect(onSessionId).not.toHaveBeenCalled()
    expect(opts.onUploadProgress).toHaveBeenLastCalledWith({ loaded: 30, total: 30 })
  })

  it('fetchReceived liefert die Positionen als Menge', async () => {
    fetch.mockResolvedValue(new Response(JSON.stringify({ received: [0, 3] })))
    expect([...(await fetchReceived('s1'))]).toEqual([0, 3])
  })
})

describe('Fortsetzen im Store und in der App', () => {
  let store
  let api

  beforeEach(async () => {
    vi.resetModules()
    vi.doMock('../api/converter', async (importOriginal) => ({
      ...(await importOriginal()),
      uploadFiles: vi.fn(),
      fetchReceived: vi.fn(),
      startConversion: vi.fn(),
      cancelSession: vi.fn(),
      subscribeStatus: vi.fn(() => () => {}),
    }))
    api = await import('../api/converter')
    const { useConverterStore } = await import('../stores/converter')
    setActivePinia(createPinia())
    i18n.global.locale.value = 'de'
    store = useConverterStore()
    store.files = ['a.mp3', 'b.mp3'].map((name, id) => ({
      id,
      name,
      size: 10,
      file: new File(['x'], name),
    }))
  })
  afterEach(() => vi.doUnmock('../api/converter'))

  async function failUpload() {
    api.uploadFiles.mockImplementationOnce(async (_form, opts) => {
      opts.onSessionId('s1')
      opts.onRetry({ attempt: 1, max: 4, fileName: 'b.mp3' })
      expect(store.uploadRetry).toEqual({ attempt: 1, max: 4, fileName: 'b.mp3' })
      throw networkError()
    })
    await store.convert()
  }

  it('Verbindungsabbruch: Fehler mit „fortsetzen“, Fortsetzen lädt nur den Rest', async () => {
    await failUpload()
    expect(store.status).toBe('error')
    expect(store.canResume).toBe(true)
    expect(store.uploadRetry).toBeNull()
    expect(store.errorMessage).toContain('fortsetzen')

    api.fetchReceived.mockResolvedValue(new Set([0]))
    api.uploadFiles.mockResolvedValue({ data: { session_id: 's1' } })
    api.startConversion.mockResolvedValue({ data: {} })
    await store.resumeUpload()

    const [, opts] = api.uploadFiles.mock.calls[1]
    expect(opts.sessionId).toBe('s1')
    expect([...opts.skip]).toEqual([0])
    expect(api.startConversion).toHaveBeenCalledWith('s1', expect.anything(), expect.anything())
    expect(store.canResume).toBe(false)
  })

  it('abgelaufene Session: Hinweis, kein weiteres Fortsetzen', async () => {
    await failUpload()
    api.fetchReceived.mockRejectedValue(httpError(404))
    await store.resumeUpload()
    expect(store.canResume).toBe(false)
    expect(store.errorMessage).toContain('nicht mehr vorhanden')
    expect(api.uploadFiles).toHaveBeenCalledTimes(1)
  })

  it('andere Fehler (z. B. zu groß) sind nicht fortsetzbar', async () => {
    api.uploadFiles.mockImplementationOnce(async (_form, opts) => {
      opts.onSessionId('s1')
      throw httpError(413)
    })
    await store.convert()
    expect(store.canResume).toBe(false)
  })

  it('Zurücksetzen oder geänderte Playlist geben die Server-Session frei', async () => {
    await failUpload()
    store.files = store.files.slice(1)
    await flushPromises()
    expect(store.canResume).toBe(false)
    expect(api.cancelSession).toHaveBeenCalledWith('s1')

    await failUpload()
    store.resetJob()
    expect(api.cancelSession).toHaveBeenCalledTimes(2)
  })

  it('App zeigt den Button „Upload fortsetzen“', async () => {
    await failUpload()
    const { default: App } = await import('../App.vue')
    const wrapper = mount(App, {
      global: { plugins: [i18n], stubs: { StickyPlayer: true, FileUploader: true } },
    })
    const button = wrapper.get('[data-testid="resume-upload"]')
    expect(button.text()).toBe('Upload fortsetzen')
    api.fetchReceived.mockResolvedValue(new Set())
    api.uploadFiles.mockResolvedValue({ data: { session_id: 's1' } })
    api.startConversion.mockResolvedValue({ data: {} })
    await button.trigger('click')
    await flushPromises()
    expect(api.fetchReceived).toHaveBeenCalledWith('s1')
    wrapper.unmount()
  })
})

describe('ConversionProgress', () => {
  it('zeigt den laufenden Wiederholversuch', async () => {
    setActivePinia(createPinia())
    const { useConverterStore } = await import('../stores/converter')
    const { default: ConversionProgress } = await import('../components/ConversionProgress.vue')
    const store = useConverterStore()
    store.status = 'uploading'
    store.uploadRetry = { attempt: 2, max: 4, fileName: 'a.mp3' }
    const wrapper = mount(ConversionProgress, { global: { plugins: [i18n] } })
    expect(wrapper.get('[data-testid="upload-retry"]').text()).toBe(
      'Verbindung unterbrochen, neuer Versuch 2 von 4 …',
    )
  })
})
