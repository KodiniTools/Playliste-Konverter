import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { useToastStore } from './toast'
import {
  MAX_PLAYLIST_SIZE,
  OUTPUT_FORMATS,
  AVAILABLE_BITRATES,
  isOutputFormat,
  isAcceptedAudioFile,
  isAcceptedCover,
  QUALITY_PRESETS,
  TRANSITION_TYPES,
  MIN_TRANSITION_SECONDS,
  MAX_TRANSITION_SECONDS,
  DEFAULT_TRANSITION_SECONDS,
  type TransitionType,
  type ChannelCount,
  type OutputFormatId,
  type QualityPreset,
} from '../constants'
import {
  uploadFiles,
  startConversion,
  fetchStatus,
  getDownloadUrl,
  cancelSession,
  subscribeStatus,
  uploadCover,
  type TrackTrim,
  type Chapter,
  type UploadRetryInfo,
  fetchReceived,
  type ConversionStatus,
  type OutputTags,
} from '../api/converter'
import { formatBytes } from '../utils/format'
import { probeDuration } from '../utils/audioDuration'
import { duplicateKey, sortItems, type SortMode } from '../utils/playlistOrder'
import i18n from '../i18n'
import { readPref, writePref } from '../utils/storage'
import { logger } from '../utils/logger'
import { httpStatusOf, isAbortError, isNetworkError, isRetryableUploadError } from '../utils/errors'

/** Ein Track der Playlist. */
export interface PlaylistItem {
  file: File
  id: number
  name: string
  size: number
  /** Dauer in Sekunden; undefined = wird noch ermittelt, null = unbekannt */
  duration?: number | null
  /** Zugeschnittener Bereich in Sekunden (N9); fehlt = Anfang bzw. Ende des Tracks */
  trimStart?: number
  trimEnd?: number
}

export type ConverterStatus = 'idle' | 'uploading' | 'converting' | 'done' | 'error'

type Timer = ReturnType<typeof setTimeout>

// Meldungen in der aktuellen Sprache (auch außerhalb von Komponenten)
const t = i18n.global.t

export const useConverterStore = defineStore('converter', () => {
  const files = ref<PlaylistItem[]>([])
  const uploadProgress = ref(0)
  const status = ref<ConverterStatus>('idle')
  const sessionId = ref<string | null>(null)
  const downloadUrl = ref<string | null>(null)
  const errorMessage = ref<string | null>(null)
  const outputFileSize = ref<number | null>(null) // Größe der konvertierten Datei
  const chapters = ref<Chapter[]>([]) // Kapitel der fertigen Playlist (N2)
  const outputFormat = ref<OutputFormatId>(normalizeFormat(readPref('outputFormat'))) // Standard: MP3
  const bitrate = ref(normalizeBitrate(parseInt(readPref('bitrate') ?? '', 10), outputFormat.value)) // Standard: 192 kbps
  const channels = ref<ChannelCount>(normalizeChannels(readPref('channels'))) // Standard: Stereo
  // Übergang zwischen Tracks (N4) und Lautheitsangleichung (N5)
  const transition = ref<TransitionType>(normalizeTransition(readPref('transition')))
  const transitionSeconds = ref(normalizeTransitionSeconds(readPref('transitionSeconds')))
  const loudnorm = ref(readPref('loudnorm') === '1')
  // Stille am Anfang und Ende jedes Tracks entfernen (N9)
  const trimSilence = ref(readPref('trimSilence') === '1')

  // Dateiname, Tags und Cover der Ausgabe (N6) – gelten nur für diese Playlist
  const outputName = ref('')
  const tags = ref<Required<OutputTags>>({ title: '', artist: '', album: '' })
  const cover = ref<File | null>(null)

  // Fortlaufende Track-IDs: eindeutig auch bei mehreren Hinzufügungen in derselben Millisekunde
  let nextTrackId = 1

  // Für Abbrechen-Funktion
  let abortController: AbortController | null = null
  let pollingTimer: Timer | null = null
  let closeEvents: (() => void) | null = null
  let smoothProgressInterval: ReturnType<typeof setInterval> | null = null
  const isCancelling = ref(false)

  // Für simulierten flüssigen Fortschritt
  const displayProgress = ref(0)
  const lastBackendProgress = ref(0)
  const isIndeterminate = ref(false)
  // Position in der Server-Warteschlange (0 = nicht wartend)
  const queuePosition = ref(0)

  // Für Zeitberechnung
  const uploadStartTime = ref<number | null>(null)
  const uploadSpeed = ref(0) // Bytes pro Sekunde
  const estimatedTimeRemaining = ref<number | null>(null) // in Sekunden
  // Abgebrochener Upload, der sich fortsetzen lässt, und laufender Wiederholversuch (N10)
  const resumeSessionId = ref<string | null>(null)
  const uploadRetry = ref<UploadRetryInfo | null>(null)
  const canResume = computed(() => status.value === 'error' && resumeSessionId.value !== null)

  const totalProgress = computed(() => {
    if (status.value === 'uploading') return uploadProgress.value * 0.3
    if (status.value === 'converting') return 30 + displayProgress.value * 0.7
    if (status.value === 'done') return 100
    return 0
  })

  const totalSize = computed(() => {
    return files.value.reduce((sum, f) => sum + f.size, 0)
  })

  const isOverSizeLimit = computed(() => {
    return totalSize.value > MAX_PLAYLIST_SIZE
  })

  const maxPlaylistSize = MAX_PLAYLIST_SIZE

  // Formatierte Upload-Geschwindigkeit
  const formattedUploadSpeed = computed(() => {
    if (uploadSpeed.value === 0) return null
    if (uploadSpeed.value >= 1024 * 1024) {
      return (uploadSpeed.value / (1024 * 1024)).toFixed(1) + ' MB/s'
    }
    return (uploadSpeed.value / 1024).toFixed(0) + ' KB/s'
  })

  // Formatierte Restzeit
  const formattedTimeRemaining = computed(() => {
    if (estimatedTimeRemaining.value === null || estimatedTimeRemaining.value <= 0) return null
    const seconds = Math.round(estimatedTimeRemaining.value)
    if (seconds < 60) return `${seconds}s`
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
  })

  /** Gesamtdauer der Tracks, deren Dauer bekannt ist (Sekunden). */
  /** Länge der fertigen Playlist: zugeschnittene Tracks plus Pausen bzw. minus Überblendungen. */
  const totalDuration = computed(() => {
    const tracks = files.value.reduce((sum, f) => sum + (effectiveDuration(f) ?? 0), 0)
    const joins = Math.max(0, files.value.length - 1)
    if (transition.value === 'gap') return tracks + joins * transitionSeconds.value
    if (transition.value === 'crossfade') {
      return Math.max(0, tracks - joins * transitionSeconds.value)
    }
    return tracks
  })

  /** Noch nicht alle Dauern ermittelt. */
  const durationsPending = computed(() => files.value.some((f) => f.duration === undefined))

  /** Mindestens eine Dauer konnte der Browser nicht lesen (Gesamtdauer ist dann ein Mindestwert). */
  const durationsIncomplete = computed(() => files.value.some((f) => f.duration === null))

  /** IDs der Tracks, die eine frühere Datei der Liste wiederholen (gleicher Name und Größe). */
  const duplicateIds = computed(() => {
    const seen = new Set<string>()
    const ids = new Set<number>()
    for (const item of files.value) {
      const key = duplicateKey(item)
      if (seen.has(key)) ids.add(item.id)
      else seen.add(key)
    }
    return ids
  })

  // Dauern nacheinander im Hintergrund ermitteln (N3)
  const durationQueue: number[] = []
  let probingDurations = false

  async function probeQueuedDurations() {
    if (probingDurations) return
    probingDurations = true
    try {
      for (let id = durationQueue.shift(); id !== undefined; id = durationQueue.shift()) {
        const item = files.value.find((f) => f.id === id)
        if (!item) continue
        const duration = await probeDuration(item.file)
        const current = files.value.find((f) => f.id === id)
        if (current) current.duration = duration
      }
    } finally {
      probingDurations = false
    }
  }

  function addFiles(newFiles: FileList | File[]) {
    const toastStore = useToastStore()
    const validFiles = Array.from(newFiles).filter(isAcceptedAudioFile)

    const invalidCount = newFiles.length - validFiles.length

    if (validFiles.length > 0) {
      const knownKeys = new Set(files.value.map(duplicateKey))
      let duplicateCount = 0
      const items: PlaylistItem[] = validFiles.map((f) => {
        const item: PlaylistItem = {
          file: f,
          id: nextTrackId++,
          name: f.name,
          size: f.size,
          duration: undefined,
        }
        const key = duplicateKey(item)
        if (knownKeys.has(key)) duplicateCount++
        else knownKeys.add(key)
        return item
      })
      files.value.push(...items)
      durationQueue.push(...items.map((item) => item.id))
      void probeQueuedDurations()
      toastStore.success(t('toast.filesAdded', validFiles.length))
      if (duplicateCount > 0) toastStore.warning(t('toast.duplicates', duplicateCount))
    }

    if (invalidCount > 0) {
      toastStore.warning(t('toast.filesSkipped', invalidCount))
    }
  }

  function removeFile(id: number) {
    const toastStore = useToastStore()
    const file = files.value.find((f) => f.id === id)
    files.value = files.value.filter((f) => f.id !== id)
    if (file) {
      toastStore.info(t('toast.fileRemoved', { name: file.name }))
    }
  }

  function removeAllFiles() {
    const toastStore = useToastStore()
    const count = files.value.length
    files.value = []
    toastStore.info(t('toast.filesRemoved', count))
  }

  /** Playlist neu ordnen: A–Z, nach Tracknummer, umkehren oder zufällig (N7). */
  function sortFiles(mode: SortMode) {
    files.value = sortItems(files.value, mode)
  }

  function moveFile(fromIndex: number, toIndex: number) {
    const last = files.value.length - 1
    if (fromIndex < 0 || fromIndex > last || toIndex < 0 || toIndex > last) return
    const item = files.value.splice(fromIndex, 1)[0]
    if (item === undefined) return
    files.value.splice(toIndex, 0, item)
  }

  function setOutputFormat(format: string) {
    if (isOutputFormat(format)) {
      outputFormat.value = format
      writePref('outputFormat', format)
      // Bitrate anpassen falls über Maximum des neuen Formats
      const maxBitrate = OUTPUT_FORMATS[format].maxBitrate || 320
      if (bitrate.value > maxBitrate) {
        setBitrate(maxBitrate)
      }
    }
  }

  function setBitrate(value: number) {
    const validBitrate = AVAILABLE_BITRATES.find((b) => b.value === value)
    if (validBitrate) {
      // Begrenze auf Format-Maximum
      const maxBitrate = currentFormatConfig.value.maxBitrate || 320
      const finalBitrate = Math.min(value, maxBitrate)
      bitrate.value = finalBitrate
      writePref('bitrate', finalBitrate)
    }
  }

  function setChannels(value: ChannelCount) {
    channels.value = normalizeChannels(value)
    writePref('channels', channels.value)
  }

  function setTransition(value: TransitionType) {
    transition.value = normalizeTransition(value)
    writePref('transition', transition.value)
  }

  function setTransitionSeconds(value: number) {
    transitionSeconds.value = normalizeTransitionSeconds(value)
    writePref('transitionSeconds', transitionSeconds.value)
  }

  function setLoudnorm(value: boolean) {
    loudnorm.value = value
    writePref('loudnorm', value ? '1' : '0')
  }

  function setTrimSilence(value: boolean) {
    trimSilence.value = value
    writePref('trimSilence', value ? '1' : '0')
  }

  /**
   * Track zuschneiden (N9). null = Anfang bzw. Ende des Tracks. Ungültige
   * Bereiche (Ende vor Start, hinter der bekannten Dauer) → false.
   */
  function setTrim(id: number, start: number | null, end: number | null): boolean {
    const item = files.value.find((f) => f.id === id)
    if (!item) return false
    const from = start ?? 0
    const length = typeof item.duration === 'number' ? item.duration : null
    if (from < 0 || (length !== null && from >= length)) return false
    if (end !== null && (end <= from || (length !== null && end > length + 0.05))) return false
    item.trimStart = from > 0 ? from : undefined
    item.trimEnd = end !== null && (length === null || end < length) ? end : undefined
    return true
  }

  /** Preset anwenden: Format, Bitrate und Kanäle auf einmal (N11). */
  function applyPreset(id: QualityPreset['id']) {
    const preset = QUALITY_PRESETS.find((p) => p.id === id)
    if (!preset) return
    setOutputFormat(preset.format)
    setBitrate(preset.bitrate)
    setChannels(preset.channels)
  }

  /** Preset, das zu den aktuellen Einstellungen passt, sonst null („Eigene“). */
  const activePreset = computed(
    () =>
      QUALITY_PRESETS.find(
        (p) =>
          p.format === outputFormat.value &&
          p.bitrate === bitrate.value &&
          p.channels === channels.value,
      )?.id ?? null,
  )

  /** Cover setzen (JPEG/PNG bis 5 MB) oder mit null entfernen; false bei ungültiger Datei. */
  function setCover(file: File | null): boolean {
    if (file && !isAcceptedCover(file)) {
      useToastStore().error(t('error.invalidCover'))
      return false
    }
    cover.value = file
    return true
  }

  /** Name der fertigen Datei, z. B. „Sommer Mix.mp3“ (wie der Server ihn bereinigt). */
  const outputFileName = computed(
    () => `${sanitizeOutputName(outputName.value)}.${currentFormatConfig.value.extension}`,
  )

  const currentFormatConfig = computed(() => {
    return OUTPUT_FORMATS[outputFormat.value] || OUTPUT_FORMATS.mp3
  })

  const availableFormats = computed(() => {
    return Object.entries(OUTPUT_FORMATS).map(([key, value]) => ({
      id: key as OutputFormatId,
      ...value,
    }))
  })

  const availableBitratesForFormat = computed(() => {
    const maxBitrate = currentFormatConfig.value.maxBitrate || 320
    return AVAILABLE_BITRATES.filter((b) => b.value <= maxBitrate)
  })

  function stopIntervals() {
    if (pollingTimer) {
      clearTimeout(pollingTimer)
      pollingTimer = null
    }
    if (closeEvents) {
      closeEvents()
      closeEvents = null
    }
    if (smoothProgressInterval) {
      clearInterval(smoothProgressInterval)
      smoothProgressInterval = null
    }
  }

  function startProgressSimulation() {
    const startTime = Date.now()

    smoothProgressInterval = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000
      const timeBased = 95 * (1 - Math.exp(-elapsed / 30))
      // Echter Server-Fortschritt hat Vorrang; die Zeitschätzung überbrückt nur
      // die Analysephase (Fortschritt ≤ 1). In der Warteschlange steht der Balken.
      let target = lastBackendProgress.value > 1 ? lastBackendProgress.value : timeBased
      if (queuePosition.value > 0) target = 0

      if (displayProgress.value < target) {
        const diff = target - displayProgress.value
        displayProgress.value += Math.max(0.5, diff * 0.15)
        displayProgress.value = Math.min(95, displayProgress.value)
      }

      // Indeterminate wenn Simulation die Decke erreicht ohne Backend-Fortschritt
      isIndeterminate.value = displayProgress.value >= 94 && lastBackendProgress.value < 5
    }, 100)
  }

  function convert() {
    return runJob(null)
  }

  /**
   * Abgebrochenen Upload fortsetzen (N10): fragt den Server, welche Dateien
   * schon da sind, und lädt nur den Rest hoch.
   */
  async function resumeUpload() {
    const id = resumeSessionId.value
    if (!id) return
    let received: Set<number>
    try {
      received = await fetchReceived(id)
    } catch (err) {
      const gone = [404, 410].includes(httpStatusOf(err) ?? 0)
      // Nicht mehr da: nur noch ein Neustart hilft
      if (gone) resumeSessionId.value = null
      errorMessage.value = gone ? t('error.resumeExpired') : uploadErrorMessage(err)
      useToastStore().error(errorMessage.value)
      return
    }
    await runJob({ sessionId: id, skip: received })
  }

  /** Upload, Start und Statusverfolgung; resume setzt eine bestehende Session fort. */
  async function runJob(resume: { sessionId: string; skip: Set<number> } | null) {
    if (files.value.length === 0) {
      errorMessage.value = t('error.noFiles')
      return
    }

    const toastStore = useToastStore()
    let uploaded = false
    resumeSessionId.value = null
    uploadRetry.value = null

    try {
      status.value = 'uploading'
      uploadProgress.value = 0
      errorMessage.value = null
      isCancelling.value = false

      // Zeitberechnung initialisieren
      uploadStartTime.value = Date.now()
      uploadSpeed.value = 0
      estimatedTimeRemaining.value = null

      // AbortController für Abbrechen-Funktion
      abortController = new AbortController()

      // Upload files
      const formData = new FormData()
      files.value.forEach((item, idx) => {
        formData.append('files[]', item.file)
        formData.append('order[]', String(idx))
      })

      if (resume) sessionId.value = resume.sessionId
      const skippedBytes = files.value.reduce(
        (sum, item, idx) => sum + (resume?.skip.has(idx) ? item.size : 0),
        0,
      )
      const uploadRes = await uploadFiles(formData, {
        signal: abortController.signal,
        sessionId: resume?.sessionId ?? null,
        skip: resume?.skip,
        // Verbindung weg: dieselbe Datei mit Backoff erneut senden
        onRetry: (info) => {
          uploadRetry.value = info
        },
        // Früh merken, damit Abbrechen während des Uploads die Server-Session freigibt
        onSessionId: (id) => {
          sessionId.value = id
        },
        onUploadProgress: (e) => {
          uploadProgress.value = Math.round((e.loaded / e.total) * 100)

          const elapsedTime = (Date.now() - (uploadStartTime.value ?? Date.now())) / 1000
          if (elapsedTime > 0.5) {
            // Beim Fortsetzen zählen nur die jetzt gesendeten Bytes für die Geschwindigkeit
            uploadSpeed.value = Math.max(0, e.loaded - skippedBytes) / elapsedTime
            const remainingBytes = e.total - e.loaded
            estimatedTimeRemaining.value = remainingBytes / uploadSpeed.value
          }
        },
      })

      const id = uploadRes.data.session_id
      if (!id) throw new Error('Keine Session-ID vom Server erhalten')
      sessionId.value = id
      uploaded = true
      uploadRetry.value = null

      // Start conversion
      status.value = 'converting'
      estimatedTimeRemaining.value = null // Reset für Konvertierung
      uploadSpeed.value = 0

      // Cover trägt nur MP3 (ID3); bei WebM/OGG wird es nicht hochgeladen
      if (cover.value && outputFormat.value === 'mp3') {
        await uploadCover(id, cover.value, { signal: abortController.signal })
      }

      await startConversion(
        id,
        {
          format: outputFormat.value,
          bitrate: bitrate.value,
          channels: channels.value,
          filename: sanitizeOutputName(outputName.value),
          tags: cleanTags(tags.value),
          transition: transition.value,
          transition_seconds: transitionSeconds.value,
          loudnorm: loudnorm.value,
          tracks: files.value.map(trimOf),
          trim_silence: trimSilence.value,
          titles: files.value.map((f) => f.name),
        },
        { signal: abortController.signal },
      )

      // Poll status
      pollStatus(id)
    } catch (err) {
      if (isAbortError(err) || isCancelling.value) {
        logger.info('Vorgang vom Nutzer abgebrochen')
        toastStore.info(t('toast.cancelled'))
        resetJob()
        return
      }

      logger.error('Konvertierung fehlgeschlagen:', err, responseOf(err)?.data)
      uploadRetry.value = null
      // Upload trotz Wiederholungen abgebrochen: angekommene Dateien bleiben auf dem Server
      const resumable = !uploaded && sessionId.value !== null && isRetryableUploadError(err)
      resumeSessionId.value = resumable ? sessionId.value : null
      status.value = 'error'
      errorMessage.value = resumable ? t('error.uploadInterrupted') : uploadErrorMessage(err)
      toastStore.error(errorMessage.value)
    }
  }

  /**
   * Status vom Server übernehmen (aus SSE oder Polling).
   * @returns true, wenn der Vorgang beendet ist (done/error)
   */
  function applyStatus(data: ConversionStatus, id: string): boolean {
    const toastStore = useToastStore()
    lastBackendProgress.value = data.progress || 0
    queuePosition.value = data.status === 'queued' ? data.queue_position || 0 : 0

    if (data.status === 'done') {
      stopIntervals()
      displayProgress.value = 100
      isIndeterminate.value = false
      status.value = 'done'
      downloadUrl.value = getDownloadUrl(id)
      outputFileSize.value = data.file_size || null
      chapters.value = Array.isArray(data.chapters) ? data.chapters : []
      toastStore.success(t('toast.done'))
      return true
    }
    if (data.status === 'error') {
      stopIntervals()
      status.value = 'error'
      logger.error('Konvertierung fehlgeschlagen:', data.error_code, data.error)
      errorMessage.value = statusErrorMessage(data)
      toastStore.error(errorMessage.value)
      return true
    }
    return false
  }

  function failConnection() {
    const toastStore = useToastStore()
    stopIntervals()
    status.value = 'error'
    errorMessage.value = t('error.statusFailed')
    toastStore.error(t('toast.connectionLost'))
  }

  /** Fallback: Status pollen; die nächste Abfrage startet erst nach der Antwort. */
  function startPolling(id: string) {
    const pollOnce = async () => {
      pollingTimer = null
      if (isCancelling.value || status.value !== 'converting') return
      try {
        const res = await fetchStatus(id, { signal: abortController?.signal })
        if (isCancelling.value || status.value !== 'converting') return
        if (!applyStatus(res.data, id)) pollingTimer = setTimeout(pollOnce, 1000)
      } catch (err) {
        if (isAbortError(err) || isCancelling.value) {
          stopIntervals()
          return
        }
        failConnection()
      }
    }
    pollingTimer = setTimeout(pollOnce, 1000)
  }

  function pollStatus(id: string) {
    displayProgress.value = 0
    lastBackendProgress.value = 0
    isIndeterminate.value = false
    queuePosition.value = 0

    startProgressSimulation()

    // Bevorzugt Server-Sent Events; bei Verbindungsproblemen auf Polling umschalten
    closeEvents = subscribeStatus(id, {
      onStatus: (data) => {
        if (!isCancelling.value && status.value === 'converting') applyStatus(data, id)
      },
      onGone: () => {
        if (!isCancelling.value && status.value === 'converting') failConnection()
      },
      onError: () => {
        if (closeEvents) {
          closeEvents()
          closeEvents = null
        }
        if (!isCancelling.value && status.value === 'converting' && !pollingTimer) startPolling(id)
      },
    })
    if (!closeEvents) startPolling(id)
  }

  function cancel() {
    const toastStore = useToastStore()
    isCancelling.value = true
    releaseServerSession()

    if (abortController) {
      abortController.abort()
      abortController = null
    }

    stopIntervals()
    toastStore.info(t('toast.cancelling'))
    // Die Playlist bleibt erhalten, damit sie direkt erneut konvertiert werden kann
    resetJob()
  }

  /** Laufende Server-Session (Upload oder Konvertierung) auf dem Server abbrechen. */
  function releaseServerSession() {
    const active = status.value === 'uploading' || status.value === 'converting'
    if (active && sessionId.value) cancelSession(sessionId.value)
  }

  // Tab schließen oder Seite verlassen: Server-Session freigeben. Bleibt die
  // Seite im Back-Forward-Cache (persisted), läuft der Vorgang danach weiter.
  window.addEventListener('pagehide', (event) => {
    if (!event.persisted) releaseServerSession()
  })

  /** Fortsetzbaren Upload verwerfen und seine Dateien auf dem Server freigeben. */
  function discardResume() {
    if (resumeSessionId.value) cancelSession(resumeSessionId.value)
    resumeSessionId.value = null
  }

  // Andere Playlist (Dateien oder Reihenfolge geändert): Fortsetzen passt nicht mehr
  watch(
    () => files.value.map((f) => f.id).join(','),
    () => discardResume(),
  )

  /** Vorgang (Upload, Konvertierung, Fehler, Ergebnis) zurücksetzen; die Playlist bleibt. */
  function resetJob() {
    discardResume()
    uploadRetry.value = null
    uploadProgress.value = 0
    displayProgress.value = 0
    lastBackendProgress.value = 0
    isIndeterminate.value = false
    queuePosition.value = 0
    status.value = 'idle'
    sessionId.value = null
    downloadUrl.value = null
    errorMessage.value = null
    outputFileSize.value = null
    chapters.value = []
    isCancelling.value = false
    uploadStartTime.value = null
    uploadSpeed.value = 0
    estimatedTimeRemaining.value = null

    if (abortController) {
      abortController.abort()
      abortController = null
    }

    stopIntervals()
  }

  /** Alles zurücksetzen, auch die Playlist (neue Konvertierung). */
  function reset() {
    resetJob()
    files.value = []
    outputName.value = ''
    tags.value = { title: '', artist: '', album: '' }
    cover.value = null
  }

  return {
    files,
    uploadProgress,
    status,
    totalProgress,
    totalSize,
    isOverSizeLimit,
    maxPlaylistSize,
    downloadUrl,
    errorMessage,
    outputFileSize,
    chapters,
    canResume,
    uploadRetry,
    resumeUpload,
    outputFormat,
    bitrate,
    currentFormatConfig,
    availableFormats,
    availableBitratesForFormat,
    isCancelling,
    isIndeterminate,
    queuePosition,
    formattedUploadSpeed,
    formattedTimeRemaining,
    addFiles,
    removeFile,
    removeAllFiles,
    moveFile,
    sortFiles,
    totalDuration,
    durationsPending,
    durationsIncomplete,
    duplicateIds,
    setOutputFormat,
    setBitrate,
    channels,
    setChannels,
    transition,
    setTransition,
    transitionSeconds,
    setTransitionSeconds,
    loudnorm,
    setLoudnorm,
    trimSilence,
    setTrimSilence,
    setTrim,
    outputName,
    tags,
    cover,
    setCover,
    outputFileName,
    applyPreset,
    activePreset,
    convert,
    cancel,
    resetJob,
    reset,
  }
})

/**
 * Dateiname ohne Endung wie server/metadata.js: keine Pfad-/Sonderzeichen,
 * höchstens 100 Zeichen, leer → „playlist“.
 */
export function sanitizeOutputName(input: string): string {
  const clean = input
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[/\\:*?"<>|]/g, '_')
    .replace(/^[\s.]+|[\s.]+$/g, '')
    .slice(0, 100)
    .trim()
  return clean || 'playlist'
}

/** Nur ausgefüllte Tags, getrimmt. */
export function cleanTags(input: OutputTags): OutputTags {
  const result: OutputTags = {}
  for (const field of ['title', 'artist', 'album'] as const) {
    const value = input[field]?.trim()
    if (value) result[field] = value
  }
  return result
}

/** Zugeschnittene Länge eines Tracks; null, solange die Dauer unbekannt ist. */
export function effectiveDuration(item: PlaylistItem): number | null {
  if (typeof item.duration !== 'number') return null
  const end = item.trimEnd ?? item.duration
  return Math.max(0, end - (item.trimStart ?? 0))
}

/** Trim-Angabe für den Server; null = ganzer Track. */
export function trimOf(item: PlaylistItem): TrackTrim | null {
  if (item.trimStart === undefined && item.trimEnd === undefined) return null
  return { start: item.trimStart ?? 0, end: item.trimEnd ?? null }
}

/** Gespeicherter Übergang: unbekannt → keiner. */
export function normalizeTransition(value: unknown): TransitionType {
  return (TRANSITION_TYPES as readonly unknown[]).includes(value)
    ? (value as TransitionType)
    : 'none'
}

/** Übergangsdauer auf halbe Sekunden zwischen 0,5 und 10 bringen (wie der Server). */
export function normalizeTransitionSeconds(value: unknown): number {
  const seconds = typeof value === 'number' ? value : parseFloat(String(value))
  if (!Number.isFinite(seconds)) return DEFAULT_TRANSITION_SECONDS
  const rounded = Math.round(seconds * 2) / 2
  return Math.min(MAX_TRANSITION_SECONDS, Math.max(MIN_TRANSITION_SECONDS, rounded))
}

/** Gespeicherte Kanalzahl: nur 1 (Mono) gilt, alles andere → Stereo. */
export function normalizeChannels(value: unknown): ChannelCount {
  return value === 1 || value === '1' ? 1 : 2
}

/** Unbekanntes oder fehlendes Format aus dem Speicher → MP3. */
export function normalizeFormat(format: unknown): OutputFormatId {
  return isOutputFormat(format) ? format : 'mp3'
}

/**
 * Gespeicherte Bitrate auf eine angebotene Stufe bringen: unbekannt → 192 kbps,
 * über dem Format-Maximum → höchste erlaubte Stufe.
 */
export function normalizeBitrate(value: number, format: string): number {
  const maxBitrate = isOutputFormat(format) ? OUTPUT_FORMATS[format].maxBitrate : 320
  const known = AVAILABLE_BITRATES.some((b) => b.value === value)
  const wanted = known ? value : 192
  if (wanted <= maxBitrate) return wanted
  const allowed = AVAILABLE_BITRATES.filter((b) => b.value <= maxBitrate)
  // allowed ist nie leer (jedes Format erlaubt 64 kbps)
  return allowed.at(-1)?.value ?? 64
}

interface ErrorResponse {
  status?: number
  data?: unknown
}

/** Server-Fehlerantwort (JSON) von Upload und Convert. */
interface ServerErrorBody {
  code?: string
  error?: string
  max_bytes?: number
}

/** `response` eines axios-Fehlers oder HttpError (utils/http), sonst undefined. */
function responseOf(err: unknown): ErrorResponse | undefined {
  if (typeof err !== 'object' || err === null || !('response' in err)) return undefined
  const response = err.response
  return typeof response === 'object' && response !== null ? response : undefined
}

/**
 * Nutzerfreundliche Meldung für Fehler aus Upload/Konvertierung in der
 * aktuellen Sprache. Der Server liefert einen `code` (server/app.js); seine
 * deutsche `error`-Meldung ist nur für Logs gedacht.
 */
export function uploadErrorMessage(err: unknown): string {
  const response = responseOf(err)
  const data =
    typeof response?.data === 'object' && response.data !== null
      ? (response.data as ServerErrorBody)
      : undefined
  switch (data?.code) {
    case 'PLAYLIST_TOO_LARGE':
      return t('error.playlistTooLarge', {
        max: formatBytes(data.max_bytes ?? MAX_PLAYLIST_SIZE, 0),
      })
    case 'FILE_TOO_LARGE':
      return t('error.fileTooLarge', { max: formatBytes(data.max_bytes, 0) ?? '500 MB' })
    case 'INSUFFICIENT_STORAGE':
      return t('error.serverStorage')
    case 'NO_FILES':
      return t('error.noFiles')
    case 'INVALID_SESSION':
    case 'SESSION_NOT_FOUND':
      return t('error.sessionExpired')
    case 'SESSION_CANCELLED':
      return t('toast.cancelled')
    case 'INVALID_COVER':
    case 'COVER_TOO_LARGE':
      return t('error.invalidCover')
    case 'ALREADY_CONVERTING':
      return t('error.alreadyConverting')
    case 'INTERNAL':
      return t('error.internal')
    default:
      // nginx-Rate-Limit (deploy/nginx-playlistkonverter.conf) antwortet mit HTML, ohne code
      if (response?.status === 429) return t('error.rateLimited')
      if (!response && isNetworkError(err)) return t('error.network')
      return t('error.uploadFailed')
  }
}

/** Nutzerfreundliche Meldung für eine fehlgeschlagene Konvertierung (Status `error`). */
export function statusErrorMessage(
  data: Pick<ConversionStatus, 'error_code' | 'error_file'>,
): string {
  switch (data.error_code) {
    case 'FILE_UNREADABLE':
      return data.error_file
        ? t('error.fileUnreadable', { name: data.error_file })
        : t('error.conversionFailed')
    case 'NO_FILES':
      return t('error.noFiles')
    case 'INTERNAL':
      return t('error.internal')
    default:
      return t('error.conversionFailed')
  }
}
