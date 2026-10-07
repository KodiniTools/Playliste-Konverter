/**
 * Player-Store: Trackwechsel startet sofort auf EINEM Audio-Element,
 * isPlaying folgt dem echten Wiedergabezustand, Fehler werden gemeldet.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { usePlayerStore } from '../stores/player'
import { useConverterStore } from '../stores/converter'
import { useToastStore } from '../stores/toast'
import i18n from '../i18n'

/**
 * Nachbau des HTMLAudioElement-Verhaltens, das der Store nutzt:
 * - neues src während einer laufenden Wiedergabe → paused, offenes play() mit AbortError
 * - play() liefert ein Promise; Verhalten per FakeAudio.nextPlay steuerbar
 * - Events werden wie im Browser asynchron (Microtask) ausgelöst
 */
class FakeAudio extends EventTarget {
  static instances = []
  static nextPlay = null // null = erfolgreich, sonst Error-Name für die Ablehnung

  constructor() {
    super()
    this.paused = true
    this.ended = false
    this.error = null
    this.currentTime = 0
    this.duration = NaN
    this.volume = 1
    this.preload = ''
    this.attrs = {}
    this.playCalls = 0
    this.pending = null
    FakeAudio.instances.push(this)
  }

  set src(value) {
    if (this.pending) {
      const { reject } = this.pending
      this.pending = null
      reject(Object.assign(new Error('interrupted'), { name: 'AbortError' }))
    }
    this.paused = true
    this.error = null // neuer Ladevorgang setzt einen alten Medienfehler zurück
    this.attrs.src = value
  }

  get src() {
    return this.attrs.src ?? ''
  }

  getAttribute(name) {
    return this.attrs[name] ?? null
  }

  removeAttribute(name) {
    delete this.attrs[name]
  }

  load() {}

  fire(type) {
    queueMicrotask(() => this.dispatchEvent(new Event(type)))
  }

  play() {
    this.playCalls++
    const failWith = FakeAudio.nextPlay
    FakeAudio.nextPlay = null
    return new Promise((resolve, reject) => {
      this.pending = { resolve, reject }
      queueMicrotask(() => {
        if (!this.pending) return
        this.pending = null
        if (failWith) {
          this.paused = true
          reject(Object.assign(new Error(failWith), { name: failWith }))
          return
        }
        this.paused = false
        this.fire('play')
        resolve()
      })
    })
  }

  pause() {
    if (this.pending) {
      const { reject } = this.pending
      this.pending = null
      reject(Object.assign(new Error('paused'), { name: 'AbortError' }))
    }
    if (!this.paused) {
      this.paused = true
      this.fire('pause')
    }
  }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

function setup(count = 3) {
  const converter = useConverterStore()
  converter.files = Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    name: `Track ${i + 1}.wav`,
    size: 1000,
    file: new Blob(['x']),
  }))
  return { converter, player: usePlayerStore(), toast: useToastStore() }
}

describe('Player-Store', () => {
  beforeEach(() => {
    localStorage.clear()
    FakeAudio.instances = []
    FakeAudio.nextPlay = null
    vi.stubGlobal('Audio', FakeAudio)
    // jsdom kennt keine Object-URLs: für den Test direkt bereitstellen
    let n = 0
    URL.createObjectURL = vi.fn(() => `blob:track-${++n}`)
    URL.revokeObjectURL = vi.fn()
    setActivePinia(createPinia())
    i18n.global.locale.value = 'de'
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('wechselt während der Wiedergabe sofort zum angeklickten Track', async () => {
    const { converter, player } = setup()
    player.toggle(converter.files[0])
    await flush()
    expect(player.isPlaying).toBe(true)

    player.toggle(converter.files[2])
    expect(player.currentId).toBe(3)
    expect(player.isPlaying).toBe(true)
    await flush()

    const [audio] = FakeAudio.instances
    expect(FakeAudio.instances).toHaveLength(1) // ein Element, nur src gewechselt
    expect(audio.src).toBe('blob:track-2')
    expect(audio.paused).toBe(false)
    expect(audio.playCalls).toBe(2)
    expect(player.isPlaying).toBe(true)
  })

  it('übersteht schnelles Umschalten: das abgebrochene play() stört den neuen Track nicht', async () => {
    const { converter, player, toast } = setup()
    player.toggle(converter.files[0])
    player.toggle(converter.files[1]) // bevor play() von Track 1 aufgelöst ist
    await flush()
    expect(player.currentId).toBe(2)
    expect(player.isPlaying).toBe(true)
    expect(toast.toasts).toHaveLength(0)
  })

  it('pausiert und setzt fort, wenn derselbe Track erneut angeklickt wird', async () => {
    const { converter, player } = setup()
    player.toggle(converter.files[0])
    await flush()
    player.toggle(converter.files[0])
    await flush()
    expect(player.isPlaying).toBe(false)
    player.toggle(converter.files[0])
    await flush()
    expect(player.isPlaying).toBe(true)
    expect(FakeAudio.instances[0].src).toBe('blob:track-1')
  })

  it('zeigt kein „läuft“, wenn der Browser die Wiedergabe ablehnt, und meldet es', async () => {
    const { converter, player, toast } = setup()
    FakeAudio.nextPlay = 'NotSupportedError'
    player.toggle(converter.files[1])
    await flush()
    expect(player.isPlaying).toBe(false)
    expect(toast.toasts).toHaveLength(1)
    expect(toast.toasts[0].type).toBe('error')
    expect(toast.toasts[0].message).toContain('Track 2.wav')
  })

  it('bleibt nicht auf „läuft“, wenn der Browser nach einem Quellfehler paused=false lässt (Chrome)', async () => {
    const { converter, player, toast } = setup()
    player.toggle(converter.files[0])
    await flush()
    player.toggle(converter.files[2])
    const [audio] = FakeAudio.instances
    // Chrome: play() setzt paused=false, dann error-Event, dann Ablehnung mit NotSupportedError
    audio.play = function () {
      this.playCalls++
      this.paused = false
      return new Promise((resolve, reject) => {
        queueMicrotask(() => {
          this.error = { code: 4 }
          this.dispatchEvent(new Event('error'))
          reject(Object.assign(new Error('no source'), { name: 'NotSupportedError' }))
        })
      })
    }
    player.toggle(converter.files[1])
    await flush()
    expect(player.isPlaying).toBe(false)
    expect(audio.paused).toBe(true)
    expect(toast.toasts).toHaveLength(1)
  })

  it('meldet eine Autoplay-Sperre mit eigenem Hinweis', async () => {
    const { converter, player, toast } = setup()
    FakeAudio.nextPlay = 'NotAllowedError'
    player.toggle(converter.files[0])
    await flush()
    expect(player.isPlaying).toBe(false)
    expect(toast.toasts[0].message).toBe(i18n.global.t('player.playBlocked'))
  })

  it('meldet einen Medienfehler (error-Event) nur einmal pro Ladevorgang', async () => {
    const { converter, player, toast } = setup()
    player.toggle(converter.files[0])
    await flush()
    const [audio] = FakeAudio.instances
    audio.dispatchEvent(new Event('error'))
    audio.dispatchEvent(new Event('error'))
    expect(player.isPlaying).toBe(false)
    expect(toast.toasts).toHaveLength(1)
  })

  it('spielt am Ende automatisch den nächsten Track auf demselben Element', async () => {
    const { converter, player } = setup()
    player.toggle(converter.files[0])
    await flush()
    const [audio] = FakeAudio.instances
    audio.paused = true
    audio.dispatchEvent(new Event('ended'))
    expect(player.currentId).toBe(2)
    await flush()
    expect(player.isPlaying).toBe(true)
    expect(FakeAudio.instances).toHaveLength(1)
    expect(audio.src).toBe('blob:track-2')
  })

  it('stoppt am Ende des letzten Tracks', async () => {
    const { converter, player } = setup(1)
    player.toggle(converter.files[0])
    await flush()
    FakeAudio.instances[0].dispatchEvent(new Event('ended'))
    expect(player.isPlaying).toBe(false)
    expect(player.progress).toBe(0)
  })

  it('stoppt und gibt die URL frei, wenn der laufende Track entfernt wird', async () => {
    const { converter, player } = setup()
    player.toggle(converter.files[0])
    await flush()
    converter.files = converter.files.slice(1)
    await flush()
    expect(player.currentId).toBe(null)
    expect(player.isPlaying).toBe(false)
    expect(FakeAudio.instances[0].getAttribute('src')).toBe(null)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:track-1')
  })

  it('Sticky-Player: Play ohne Auswahl startet den ersten Track', async () => {
    const { player } = setup()
    player.togglePlayPause()
    await flush()
    expect(player.currentId).toBe(1)
    expect(player.isPlaying).toBe(true)
  })
})
