/**
 * probeDuration wirft nie: unlesbar → null, Metadaten → Dauer.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { probeDuration } from '../utils/audioDuration'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function stubAudio(event, duration) {
  vi.stubGlobal(
    'Audio',
    class extends EventTarget {
      duration = duration
      removeAttribute() {}
      load() {
        // Freigeben löst wie im Browser erneut "error" aus
        queueMicrotask(() => this.dispatchEvent(new Event('error')))
      }
      set src(_value) {
        queueMicrotask(() => this.dispatchEvent(new Event(event)))
      }
    },
  )
  URL.createObjectURL = vi.fn(() => 'blob:x')
  URL.revokeObjectURL = vi.fn()
}

describe('probeDuration', () => {
  it('liefert die Dauer aus den Metadaten und gibt die URL frei', async () => {
    stubAudio('loadedmetadata', 187.5)
    await expect(probeDuration(new Blob(['x']))).resolves.toBe(187.5)
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1)
  })

  it('Fehler beim Lesen → null', async () => {
    stubAudio('error', NaN)
    await expect(probeDuration(new Blob(['x']))).resolves.toBeNull()
  })

  it('unendliche Dauer (Stream) → null', async () => {
    stubAudio('loadedmetadata', Infinity)
    await expect(probeDuration(new Blob(['x']))).resolves.toBeNull()
  })
})
