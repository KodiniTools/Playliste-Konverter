/**
 * Dauer einer Audiodatei im Browser ermitteln (N3), ohne sie hochzuladen:
 * ein unsichtbares Audio-Element liest nur die Metadaten.
 */

/** Höchstens so lange auf die Metadaten warten (sonst null). */
const PROBE_TIMEOUT_MS = 15_000

/**
 * Dauer in Sekunden oder null, wenn der Browser die Datei nicht lesen kann.
 * Wirft nie.
 */
export function probeDuration(file: Blob): Promise<number | null> {
  return new Promise((resolve) => {
    let url: string
    try {
      url = URL.createObjectURL(file)
    } catch {
      resolve(null)
      return
    }
    const audio = new Audio()
    audio.preload = 'metadata'
    let done = false

    const finish = (value: number | null) => {
      // Das Freigeben (load ohne src) löst selbst wieder "error" aus
      if (done) return
      done = true
      clearTimeout(timer)
      audio.removeAttribute('src')
      audio.load()
      URL.revokeObjectURL(url)
      resolve(value)
    }

    const timer = setTimeout(() => finish(null), PROBE_TIMEOUT_MS)
    audio.addEventListener('loadedmetadata', () => {
      finish(Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : null)
    })
    audio.addEventListener('error', () => finish(null))
    audio.src = url
  })
}
