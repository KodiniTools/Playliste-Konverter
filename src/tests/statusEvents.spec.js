/**
 * Konvertierungs-Status per Server-Sent Events, mit Polling als Fallback:
 * Warteschlangen-Position, Abschluss, verschwundene Session, Verbindungsfehler
 * und keine überlappenden Status-Abfragen.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { mount } from '@vue/test-utils'
import i18n from '../i18n'

const SESSION = 'c'.repeat(32)

vi.mock('../api/converter', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    uploadFiles: vi.fn(),
    startConversion: vi.fn(),
    fetchStatus: vi.fn(),
    cancelSession: vi.fn(),
  }
})

const api = await import('../api/converter')
const { useConverterStore } = await import('../stores/converter')
const ConversionProgress = (await import('../components/ConversionProgress.vue')).default

/** Minimaler EventSource-Ersatz, der Events von Hand auslöst. */
class FakeEventSource {
  static instances = []
  constructor(url) {
    this.url = url
    this.listeners = {}
    this.closed = false
    this.onerror = null
    FakeEventSource.instances.push(this)
  }
  addEventListener(type, fn) {
    this.listeners[type] = fn
  }
  emit(type, data) {
    this.listeners[type]?.({ data: JSON.stringify(data) })
  }
  fail() {
    this.onerror?.(new Event('error'))
  }
  close() {
    this.closed = true
  }
}

async function startConverting() {
  api.uploadFiles.mockResolvedValue({ data: { session_id: SESSION } })
  api.startConversion.mockResolvedValue({ data: {} })
  const store = useConverterStore()
  store.addFiles([new File(['x'], 'a.mp3', { type: 'audio/mpeg' })])
  await store.convert()
  return store
}

describe('Status per SSE', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.useFakeTimers()
    FakeEventSource.instances = []
    vi.stubGlobal('EventSource', FakeEventSource)
    i18n.global.locale.value = 'de'
  })

  afterEach(() => {
    useConverterStore().reset()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('abonniert /events und übernimmt Warteschlange, Fortschritt und Abschluss', async () => {
    const store = await startConverting()
    const source = FakeEventSource.instances[0]
    expect(source.url).toBe(`/api/events/${SESSION}`)

    source.emit('status', { status: 'queued', progress: 0, queue_position: 2 })
    expect(store.queuePosition).toBe(2)

    source.emit('status', { status: 'converting', progress: 40 })
    expect(store.queuePosition).toBe(0)
    expect(store.status).toBe('converting')

    source.emit('status', { status: 'done', progress: 100, file_size: 1234 })
    expect(store.status).toBe('done')
    expect(store.outputFileSize).toBe(1234)
    expect(store.downloadUrl).toBe(`/api/download/${SESSION}`)
    expect(source.closed).toBe(true)
    expect(api.fetchStatus).not.toHaveBeenCalled()
  })

  it('zeigt die Warteschlangen-Position in der Fortschrittsanzeige', async () => {
    const store = await startConverting()
    FakeEventSource.instances[0].emit('status', {
      status: 'queued',
      progress: 0,
      queue_position: 3,
    })
    const wrapper = mount(ConversionProgress, { global: { plugins: [i18n] } })
    expect(wrapper.text()).toContain('In der Warteschlange – Position 3')
    expect(store.totalProgress).toBe(30)
    wrapper.unmount()
  })

  it('Server-Fehler aus dem Stream wird angezeigt', async () => {
    const store = await startConverting()
    FakeEventSource.instances[0].emit('status', {
      status: 'error',
      error: '„b.wav“ konnte nicht gelesen werden.',
      error_code: 'FILE_UNREADABLE',
      error_file: 'b.wav',
    })
    expect(store.status).toBe('error')
    expect(store.errorMessage).toBe(i18n.global.t('error.fileUnreadable', { name: 'b.wav' }))
    expect(store.errorMessage).toContain('„b.wav“')
  })

  it('"gone" (Session auf dem Server weg) beendet mit Fehler', async () => {
    const store = await startConverting()
    FakeEventSource.instances[0].emit('gone', {})
    expect(store.status).toBe('error')
    expect(FakeEventSource.instances[0].closed).toBe(true)
  })

  it('Verbindungsfehler: schließt den Stream und pollt weiter', async () => {
    api.fetchStatus.mockResolvedValue({ data: { status: 'done', progress: 100, file_size: 9 } })
    const store = await startConverting()
    const source = FakeEventSource.instances[0]

    source.fail()
    expect(source.closed).toBe(true)
    await vi.advanceTimersByTimeAsync(1000)

    expect(api.fetchStatus).toHaveBeenCalledTimes(1)
    expect(store.status).toBe('done')
  })
})

describe('Polling ohne EventSource', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.stubGlobal('EventSource', undefined)
  })

  afterEach(() => {
    useConverterStore().reset()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('startet die nächste Abfrage erst nach der Antwort (keine Überlappung)', async () => {
    let resolve
    api.fetchStatus.mockImplementation(() => new Promise((r) => (resolve = r)))
    const store = await startConverting()

    await vi.advanceTimersByTimeAsync(5000)
    expect(api.fetchStatus).toHaveBeenCalledTimes(1)

    resolve({ data: { status: 'converting', progress: 10 } })
    await vi.advanceTimersByTimeAsync(1000)
    expect(api.fetchStatus).toHaveBeenCalledTimes(2)
    expect(store.status).toBe('converting')
  })
})
