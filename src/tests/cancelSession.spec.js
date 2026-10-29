/**
 * Abbrechen gibt die Session auch auf dem Server frei (POST /api/cancel/:id):
 * beim Klick auf „Abbrechen“ während Upload oder Konvertierung und beim
 * Schließen des Tabs – nicht aber im Leerlauf oder aus dem Back-Forward-Cache.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const SESSION = 'a'.repeat(32)

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

/** Upload, der erst durch Abbrechen endet; die Session-ID kommt sofort. */
function pendingUpload(_formData, { signal, onSessionId }) {
  onSessionId(SESSION)
  return new Promise((_, reject) => {
    signal.addEventListener('abort', () => {
      reject(Object.assign(new Error('canceled'), { name: 'CanceledError' }))
    })
  })
}

function pagehide(persisted) {
  const event = new Event('pagehide')
  Object.defineProperty(event, 'persisted', { value: persisted })
  window.dispatchEvent(event)
}

function storeWithFile() {
  const store = useConverterStore()
  store.addFiles([new File(['x'], 'a.mp3', { type: 'audio/mpeg' })])
  return store
}

describe('Abbrechen auf dem Server', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('während des Uploads: Session-ID ist schon bekannt und wird freigegeben', async () => {
    api.uploadFiles.mockImplementation(pendingUpload)
    const store = storeWithFile()
    const running = store.convert()
    expect(store.status).toBe('uploading')

    store.cancel()
    await running

    expect(api.cancelSession).toHaveBeenCalledTimes(1)
    expect(api.cancelSession).toHaveBeenCalledWith(SESSION)
    expect(store.status).toBe('idle')
  })

  it('während der Konvertierung: Session wird freigegeben', async () => {
    vi.useFakeTimers()
    api.uploadFiles.mockResolvedValue({ data: { session_id: SESSION } })
    api.startConversion.mockResolvedValue({ data: {} })
    api.fetchStatus.mockResolvedValue({ data: { status: 'converting', progress: 10 } })
    const store = storeWithFile()
    await store.convert()
    expect(store.status).toBe('converting')

    store.cancel()
    expect(api.cancelSession).toHaveBeenCalledWith(SESSION)
  })

  it('Tab schließen während des Uploads gibt die Session frei', () => {
    api.uploadFiles.mockImplementation(pendingUpload)
    const store = storeWithFile()
    store.convert()

    pagehide(false)
    expect(api.cancelSession).toHaveBeenCalledWith(SESSION)
    store.reset()
  })

  it('Back-Forward-Cache (persisted) lässt den Vorgang weiterlaufen', () => {
    api.uploadFiles.mockImplementation(pendingUpload)
    const store = storeWithFile()
    store.convert()

    pagehide(true)
    expect(api.cancelSession).not.toHaveBeenCalled()
    store.reset()
  })

  it('im Leerlauf wird nichts an den Server geschickt', () => {
    const store = storeWithFile()
    store.cancel()
    pagehide(false)
    expect(api.cancelSession).not.toHaveBeenCalled()
  })
})

describe('cancelSession', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('nutzt sendBeacon mit der Cancel-URL', async () => {
    const { cancelSession } = await vi.importActual('../api/converter')
    const sendBeacon = vi.fn(() => true)
    vi.stubGlobal('navigator', { sendBeacon })
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    cancelSession(SESSION)
    expect(sendBeacon).toHaveBeenCalledWith(`/api/cancel/${SESSION}`)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('fällt ohne sendBeacon auf fetch mit keepalive zurück und schluckt Fehler', async () => {
    const { cancelSession } = await vi.importActual('../api/converter')
    vi.stubGlobal('navigator', {})
    const fetchSpy = vi.fn(() => Promise.reject(new Error('offline')))
    vi.stubGlobal('fetch', fetchSpy)

    expect(() => cancelSession(SESSION)).not.toThrow()
    expect(fetchSpy).toHaveBeenCalledWith(`/api/cancel/${SESSION}`, {
      method: 'POST',
      keepalive: true,
    })
  })
})
