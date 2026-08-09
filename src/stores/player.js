import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { useConverterStore } from './converter'

/**
 * Zentraler Audio-Player-Store.
 *
 * Ersetzt die frühere, pro-Track eingebettete Wiedergabe-Steuerung durch
 * einen einzelnen, dauerhaft sichtbaren Sticky-Player am unteren Rand.
 * Alle Komponenten (Track-Liste + Sticky-Player) teilen sich diesen Zustand.
 */
export const usePlayerStore = defineStore('player', () => {
  const converter = useConverterStore()

  // Der aktuell geladene/ausgewählte Track (ID) und Wiedergabe-Status
  const currentId = ref(null)
  const isPlaying = ref(false)
  const progress = ref(0) // aktuelle Position in Sekunden
  const duration = ref(0) // Gesamtlänge in Sekunden

  // Lautstärke (0-1), persistiert
  const volume = ref(parseFloat(localStorage.getItem('playerVolume')) || 0.7)

  // Nicht-reaktives Audio-Element + Object-URL-Cache
  let audioElement = null
  const audioObjectUrls = new Map()

  const currentTrack = computed(
    () => converter.files.find((f) => f.id === currentId.value) || null,
  )

  const currentIndex = computed(() =>
    converter.files.findIndex((f) => f.id === currentId.value),
  )

  const hasTrack = computed(() => currentTrack.value !== null)

  function getAudioUrl(item) {
    if (!audioObjectUrls.has(item.id)) {
      audioObjectUrls.set(item.id, URL.createObjectURL(item.file))
    }
    return audioObjectUrls.get(item.id)
  }

  function detachAudio() {
    if (audioElement) {
      audioElement.pause()
      audioElement.onended = null
      audioElement.ontimeupdate = null
      audioElement.onloadedmetadata = null
      audioElement = null
    }
  }

  /** Lädt einen Track und startet die Wiedergabe. */
  function load(item) {
    detachAudio()

    currentId.value = item.id
    progress.value = 0
    duration.value = 0

    const url = getAudioUrl(item)
    audioElement = new Audio(url)
    audioElement.volume = volume.value

    audioElement.ontimeupdate = () => {
      if (audioElement) progress.value = audioElement.currentTime
    }
    audioElement.onloadedmetadata = () => {
      if (audioElement) duration.value = audioElement.duration
    }
    audioElement.onended = () => {
      // Automatisch zum nächsten Track wechseln, sonst stoppen
      if (!next()) {
        isPlaying.value = false
        progress.value = 0
      }
    }

    audioElement.play()
    isPlaying.value = true
  }

  /**
   * Play/Pause-Umschaltung für einen bestimmten Track (Track-Liste-Button).
   * - Läuft der Track bereits: pausieren.
   * - Ist er pausiert/ausgewählt: fortsetzen.
   * - Sonst: neuen Track laden.
   */
  function toggle(item) {
    if (currentId.value === item.id && audioElement) {
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
    if (!audioElement) {
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
    if (audioElement) {
      audioElement.play()
      isPlaying.value = true
    } else if (currentTrack.value) {
      load(currentTrack.value)
    }
  }

  function stop() {
    detachAudio()
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
    volume.value = value
    localStorage.setItem('playerVolume', String(value))
    if (audioElement) audioElement.volume = value
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

      // Object-URLs für entfernte Tracks freigeben
      for (const [id, url] of audioObjectUrls) {
        if (!idSet.has(id)) {
          URL.revokeObjectURL(url)
          audioObjectUrls.delete(id)
        }
      }

      // Wiedergabe stoppen, wenn der aktuelle Track entfernt wurde
      if (currentId.value !== null && !idSet.has(currentId.value)) {
        stop()
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
