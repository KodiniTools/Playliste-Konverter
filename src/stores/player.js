import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { useConverterStore } from './converter'
import { useToastStore } from './toast'
import i18n from '../i18n'
import { readPref, writePref } from '../utils/storage'

/**
 * Zentraler Audio-Player-Store.
 *
 * Ersetzt die frühere, pro-Track eingebettete Wiedergabe-Steuerung durch
 * einen einzelnen, dauerhaft sichtbaren Sticky-Player am unteren Rand.
 * Alle Komponenten (Track-Liste + Sticky-Player) teilen sich diesen Zustand.
 *
 * Wiedergabe über EIN wiederverwendetes Audio-Element: Ein Trackwechsel setzt
 * nur dessen src neu und startet sofort. Browser mit strenger Autoplay-Regel
 * (Safari/iOS) geben ein Element nach dem ersten Klick frei; ein pro Track neu
 * erzeugtes Element verliert diese Freigabe (u. a. beim automatischen Weiter).
 * isPlaying folgt dem echten Zustand des Elements (play/pause-Events,
 * abgelehntes play()-Promise) statt optimistisch auf true zu bleiben.
 */
export const usePlayerStore = defineStore('player', () => {
  const converter = useConverterStore()
  const toast = useToastStore()

  // Der aktuell geladene/ausgewählte Track (ID) und Wiedergabe-Status
  const currentId = ref(null)
  const isPlaying = ref(false)
  const progress = ref(0) // aktuelle Position in Sekunden
  const duration = ref(0) // Gesamtlänge in Sekunden

  // Lautstärke (0-1), unter eigenem Schlüssel persistiert und immer geprüft:
  // ein Wert außerhalb 0-1 lässt das Setzen am Audio-Element werfen (IndexSizeError)
  const volume = ref(normalizeVolume(readPref('playerVolume')))

  // Nicht-reaktives Audio-Element (einmal erzeugt) + Object-URL-Cache
  let audioElement = null
  const audioObjectUrls = new Map()

  // Zählt Ladevorgänge hoch; Fehler älterer Ladevorgänge werden ignoriert
  let loadToken = 0
  let reportedErrorToken = -1

  const currentTrack = computed(() => converter.files.find((f) => f.id === currentId.value) || null)

  const currentIndex = computed(() => converter.files.findIndex((f) => f.id === currentId.value))

  const hasTrack = computed(() => currentTrack.value !== null)

  function getAudioUrl(item) {
    if (!audioObjectUrls.has(item.id)) {
      audioObjectUrls.set(item.id, URL.createObjectURL(item.file))
    }
    return audioObjectUrls.get(item.id)
  }

  function hasSource() {
    return Boolean(audioElement && audioElement.getAttribute('src'))
  }

  /**
   * isPlaying aus dem tatsächlichen Zustand des Elements ableiten. Ein Element
   * mit Medienfehler spielt nie – Chrome lässt paused nach einem Quellfehler
   * auf false stehen.
   */
  function syncPlaying() {
    isPlaying.value = Boolean(
      audioElement && !audioElement.paused && !audioElement.ended && !audioElement.error,
    )
  }

  function reportError(token, key, params) {
    if (reportedErrorToken === token) return
    reportedErrorToken = token
    toast.error(i18n.global.t(key, params))
  }

  function onEnded() {
    // Automatisch zum nächsten Track wechseln, sonst stoppen
    if (!next()) {
      isPlaying.value = false
      progress.value = 0
    }
  }

  function onMediaError() {
    if (!hasSource()) return
    isPlaying.value = false
    reportError(loadToken, 'player.playError', { name: currentTrack.value?.name ?? '' })
  }

  function getAudio() {
    if (audioElement) return audioElement
    const audio = new Audio()
    audio.preload = 'auto'
    audio.volume = volume.value
    audio.addEventListener('timeupdate', () => {
      progress.value = audio.currentTime
    })
    audio.addEventListener('loadedmetadata', () => {
      duration.value = Number.isFinite(audio.duration) ? audio.duration : 0
    })
    audio.addEventListener('play', syncPlaying)
    audio.addEventListener('pause', syncPlaying)
    audio.addEventListener('ended', onEnded)
    audio.addEventListener('error', onMediaError)
    audioElement = audio
    return audio
  }

  /** play() starten und ein abgelehntes Promise sauber behandeln. */
  function startPlayback(token) {
    const audio = audioElement
    const trackName = currentTrack.value?.name ?? ''
    isPlaying.value = true // sofortiges Feedback; Events/Promise korrigieren

    const onRejected = (err) => {
      // Ein neuerer Track hat übernommen oder src/pause hat play() abgelöst
      if (token !== loadToken || err?.name === 'AbortError') return
      // Wiedergabe ist gescheitert: Element anhalten, damit Zustand und Anzeige stimmen
      if (!audio.paused) audio.pause()
      isPlaying.value = false
      if (err?.name === 'NotAllowedError') {
        reportError(token, 'player.playBlocked')
      } else {
        reportError(token, 'player.playError', { name: trackName })
      }
    }

    try {
      const result = audio.play()
      if (result && typeof result.then === 'function') {
        result.then(() => {
          if (token === loadToken) syncPlaying()
        }, onRejected)
      }
    } catch (err) {
      onRejected(err)
    }
  }

  /** Lädt einen Track in das (einzige) Audio-Element und startet sofort. */
  function load(item) {
    const audio = getAudio()
    const token = ++loadToken

    currentId.value = item.id
    progress.value = 0
    duration.value = 0

    audio.src = getAudioUrl(item)
    startPlayback(token)
  }

  /**
   * Play/Pause-Umschaltung für einen bestimmten Track (Track-Liste-Button).
   * - Läuft der Track bereits: pausieren.
   * - Ist er pausiert/ausgewählt: fortsetzen.
   * - Sonst (anderer Track, auch während einer Wiedergabe): sofort wechseln und abspielen.
   */
  function toggle(item) {
    if (currentId.value === item.id && hasSource()) {
      if (isPlaying.value) {
        pause()
      } else {
        resume()
      }
    } else {
      load(item)
    }
  }

  /** Play/Pause des aktuell geladenen Tracks (Sticky-Player-Button). */
  function togglePlayPause() {
    if (!currentTrack.value) {
      // Nichts geladen: ersten Track der Playlist starten
      if (converter.files.length > 0) load(converter.files[0])
      return
    }
    if (!hasSource()) {
      load(currentTrack.value)
      return
    }
    if (isPlaying.value) {
      pause()
    } else {
      resume()
    }
  }

  function pause() {
    if (audioElement) audioElement.pause()
    isPlaying.value = false
  }

  function resume() {
    if (hasSource()) {
      startPlayback(loadToken)
    } else if (currentTrack.value) {
      load(currentTrack.value)
    }
  }

  function stop() {
    loadToken++
    if (audioElement) {
      audioElement.pause()
      audioElement.removeAttribute('src')
      audioElement.load()
    }
    currentId.value = null
    isPlaying.value = false
    progress.value = 0
    duration.value = 0
  }

  function seek(time) {
    if (audioElement && Number.isFinite(time)) {
      audioElement.currentTime = time
      progress.value = time
    }
  }

  function setVolume(value) {
    const safe = normalizeVolume(value, volume.value)
    volume.value = safe
    writePref('playerVolume', safe)
    if (audioElement) audioElement.volume = safe
  }

  /** Wechselt zum nächsten Track. Gibt false zurück, wenn keiner folgt. */
  function next() {
    const idx = currentIndex.value
    if (idx === -1 || idx >= converter.files.length - 1) return false
    load(converter.files[idx + 1])
    return true
  }

  /** Wechselt zum vorherigen Track. Gibt false zurück, wenn keiner davor liegt. */
  function previous() {
    const idx = currentIndex.value
    if (idx <= 0) return false
    load(converter.files[idx - 1])
    return true
  }

  // Aufräumen, wenn Tracks entfernt werden
  watch(
    () => converter.files.map((f) => f.id),
    (ids) => {
      const idSet = new Set(ids)

      // Wiedergabe stoppen, wenn der aktuelle Track entfernt wurde
      if (currentId.value !== null && !idSet.has(currentId.value)) {
        stop()
      }

      // Object-URLs für entfernte Tracks freigeben
      for (const [id, url] of audioObjectUrls) {
        if (!idSet.has(id)) {
          URL.revokeObjectURL(url)
          audioObjectUrls.delete(id)
        }
      }
    },
  )

  return {
    currentId,
    isPlaying,
    progress,
    duration,
    volume,
    currentTrack,
    currentIndex,
    hasTrack,
    toggle,
    togglePlayPause,
    pause,
    resume,
    stop,
    seek,
    setVolume,
    next,
    previous,
  }
})

export const DEFAULT_VOLUME = 0.7

/**
 * Lautstärke auf den gültigen Bereich 0-1 bringen. Ungültige oder fremde Werte
 * (z. B. 80 aus einem anderen Tool) → Fallback; 0 (stumm) bleibt erhalten.
 */
export function normalizeVolume(value, fallback = DEFAULT_VOLUME) {
  const n = typeof value === 'number' ? value : parseFloat(value)
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : fallback
}
