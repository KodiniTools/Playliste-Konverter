import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useToastStore } from './toast'
import { MAX_PLAYLIST_SIZE, OUTPUT_FORMATS, AVAILABLE_BITRATES } from '../constants'
import {
  uploadFiles,
  startConversion,
  fetchStatus,
  getDownloadUrl,
  cancelSession,
  subscribeStatus,
} from '../api/converter'
import { formatBytes } from '../utils/format'
import i18n from '../i18n'
import { readPref, writePref } from '../utils/storage'
import { logger } from '../utils/logger'

export const useConverterStore = defineStore('converter', () => {
  const files = ref([])
  const uploadProgress = ref(0)
  const status = ref('idle') // idle, uploading, converting, done, error
  const sessionId = ref(null)
  const downloadUrl = ref(null)
  const errorMessage = ref(null)
  const outputFileSize = ref(null) // Größe der konvertierten Datei
  const outputFormat = ref(normalizeFormat(readPref('outputFormat'))) // Standard: MP3
  const bitrate = ref(normalizeBitrate(parseInt(readPref('bitrate'), 10), outputFormat.value)) // Standard: 192 kbps

  // Für Abbrechen-Funktion
  let abortController = null
  let pollingTimer = null
  let closeEvents = null
  let smoothProgressInterval = null
  const isCancelling = ref(false)

  // Für simulierten flüssigen Fortschritt
  const displayProgress = ref(0)
  const lastBackendProgress = ref(0)
  const isIndeterminate = ref(false)
  // Position in der Server-Warteschlange (0 = nicht wartend)
  const queuePosition = ref(0)

  // Für Zeitberechnung
  const uploadStartTime = ref(null)
  const uploadSpeed = ref(0) // Bytes pro Sekunde
  const estimatedTimeRemaining = ref(null) // in Sekunden

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

  function addFiles(newFiles) {
    const toastStore = useToastStore()
    const validFiles = Array.from(newFiles).filter(
      (f) =>
        f.type === 'audio/mpeg' ||
        f.type === 'audio/wav' ||
        f.type === 'audio/mp3' ||
        f.name.endsWith('.mp3') ||
        f.name.endsWith('.wav'),
    )

    const invalidCount = newFiles.length - validFiles.length

    if (validFiles.length > 0) {
      files.value.push(
        ...validFiles.map((f, idx) => ({
          file: f,
          id: Date.now() + idx,
          name: f.name,
          size: f.size,
        })),
      )
      toastStore.success(
        `${validFiles.length} ${validFiles.length === 1 ? 'Datei' : 'Dateien'} hinzugefügt`,
      )
    }

    if (invalidCount > 0) {
      toastStore.warning(
        `${invalidCount} ${invalidCount === 1 ? 'Datei' : 'Dateien'} übersprungen (nur MP3/WAV)`,
      )
    }
  }

  function removeFile(id) {
    const toastStore = useToastStore()
    const file = files.value.find((f) => f.id === id)
    files.value = files.value.filter((f) => f.id !== id)
    if (file) {
      toastStore.info(`"${file.name}" entfernt`)
    }
  }

  function removeAllFiles() {
    const toastStore = useToastStore()
    const count = files.value.length
    files.value = []
    toastStore.info(`${count} ${count === 1 ? 'Datei' : 'Dateien'} entfernt`)
  }

  function moveFile(fromIndex, toIndex) {
    const item = files.value.splice(fromIndex, 1)[0]
    files.value.splice(toIndex, 0, item)
  }

  function setOutputFormat(format) {
    if (OUTPUT_FORMATS[format]) {
      outputFormat.value = format
      writePref('outputFormat', format)
      // Bitrate anpassen falls über Maximum des neuen Formats
      const maxBitrate = OUTPUT_FORMATS[format].maxBitrate || 320
      if (bitrate.value > maxBitrate) {
        setBitrate(maxBitrate)
      }
    }
  }

  function setBitrate(value) {
    const validBitrate = AVAILABLE_BITRATES.find((b) => b.value === value)
    if (validBitrate) {
      // Begrenze auf Format-Maximum
      const maxBitrate = currentFormatConfig.value.maxBitrate || 320
      const finalBitrate = Math.min(value, maxBitrate)
      bitrate.value = finalBitrate
      writePref('bitrate', finalBitrate)
    }
  }

  const currentFormatConfig = computed(() => {
    return OUTPUT_FORMATS[outputFormat.value] || OUTPUT_FORMATS.mp3
  })

  const availableFormats = computed(() => {
    return Object.entries(OUTPUT_FORMATS).map(([key, value]) => ({
      id: key,
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

  async function convert() {
    if (files.value.length === 0) {
      errorMessage.value = 'Keine Dateien ausgewählt'
      return
    }

    const toastStore = useToastStore()

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
        formData.append('order[]', idx)
      })

      const uploadRes = await uploadFiles(formData, {
        signal: abortController.signal,
        // Früh merken, damit Abbrechen während des Uploads die Server-Session freigibt
        onSessionId: (id) => {
          sessionId.value = id
        },
        onUploadProgress: (e) => {
          uploadProgress.value = Math.round((e.loaded / e.total) * 100)

          const elapsedTime = (Date.now() - uploadStartTime.value) / 1000
          if (elapsedTime > 0.5) {
            uploadSpeed.value = e.loaded / elapsedTime
            const remainingBytes = e.total - e.loaded
            estimatedTimeRemaining.value = remainingBytes / uploadSpeed.value
          }
        },
      })

      sessionId.value = uploadRes.data.session_id

      // Start conversion
      status.value = 'converting'
      estimatedTimeRemaining.value = null // Reset für Konvertierung
      uploadSpeed.value = 0

      await startConversion(sessionId.value, outputFormat.value, bitrate.value, {
        signal: abortController.signal,
      })

      // Poll status
      await pollStatus()
    } catch (err) {
      if (err.name === 'CanceledError' || err.name === 'AbortError' || isCancelling.value) {
        logger.info('Vorgang vom Nutzer abgebrochen')
        toastStore.info('Vorgang abgebrochen')
        reset()
        return
      }

      logger.error('Konvertierung fehlgeschlagen:', err, err.response?.data)
      status.value = 'error'
      errorMessage.value = uploadErrorMessage(err)
      toastStore.error(errorMessage.value)
    }
  }

  /**
   * Status vom Server übernehmen (aus SSE oder Polling).
   * @returns {boolean} true, wenn der Vorgang beendet ist (done/error)
   */
  function applyStatus(data) {
    const toastStore = useToastStore()
    lastBackendProgress.value = data.progress || 0
    queuePosition.value = data.status === 'queued' ? data.queue_position || 0 : 0

    if (data.status === 'done') {
      stopIntervals()
      displayProgress.value = 100
      isIndeterminate.value = false
      status.value = 'done'
      downloadUrl.value = getDownloadUrl(sessionId.value)
      outputFileSize.value = data.file_size || null
      toastStore.success('Konvertierung abgeschlossen!')
      return true
    }
    if (data.status === 'error') {
      stopIntervals()
      status.value = 'error'
      errorMessage.value = data.error
      toastStore.error(data.error || 'Konvertierung fehlgeschlagen')
      return true
    }
    return false
  }

  function failConnection() {
    const toastStore = useToastStore()
    stopIntervals()
    status.value = 'error'
    errorMessage.value = 'Statusabfrage fehlgeschlagen'
    toastStore.error('Verbindung zum Server verloren')
  }

  /** Fallback: Status pollen; die nächste Abfrage startet erst nach der Antwort. */
  function startPolling() {
    const pollOnce = async () => {
      pollingTimer = null
      if (isCancelling.value || status.value !== 'converting') return
      try {
        const res = await fetchStatus(sessionId.value, { signal: abortController?.signal })
        if (isCancelling.value || status.value !== 'converting') return
        if (!applyStatus(res.data)) pollingTimer = setTimeout(pollOnce, 1000)
      } catch (err) {
        if (err.name === 'CanceledError' || err.name === 'AbortError' || isCancelling.value) {
          stopIntervals()
          return
        }
        failConnection()
      }
    }
    pollingTimer = setTimeout(pollOnce, 1000)
  }

  async function pollStatus() {
    displayProgress.value = 0
    lastBackendProgress.value = 0
    isIndeterminate.value = false
    queuePosition.value = 0

    startProgressSimulation()

    // Bevorzugt Server-Sent Events; bei Verbindungsproblemen auf Polling umschalten
    closeEvents = subscribeStatus(sessionId.value, {
      onStatus: (data) => {
        if (!isCancelling.value && status.value === 'converting') applyStatus(data)
      },
      onGone: () => {
        if (!isCancelling.value && status.value === 'converting') failConnection()
      },
      onError: () => {
        if (closeEvents) {
          closeEvents()
          closeEvents = null
        }
        if (!isCancelling.value && status.value === 'converting' && !pollingTimer) startPolling()
      },
    })
    if (!closeEvents) startPolling()
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
    toastStore.info('Vorgang wird abgebrochen...')
    reset()
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

  function reset() {
    files.value = []
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
    setOutputFormat,
    setBitrate,
    convert,
    cancel,
    reset,
  }
})

/** Unbekanntes oder fehlendes Format aus dem Speicher → MP3. */
export function normalizeFormat(format) {
  return OUTPUT_FORMATS[format] ? format : 'mp3'
}

/**
 * Gespeicherte Bitrate auf eine angebotene Stufe bringen: unbekannt → 192 kbps,
 * über dem Format-Maximum → höchste erlaubte Stufe.
 */
export function normalizeBitrate(value, format) {
  const maxBitrate = OUTPUT_FORMATS[format]?.maxBitrate || 320
  const known = AVAILABLE_BITRATES.some((b) => b.value === value)
  const wanted = known ? value : 192
  if (wanted <= maxBitrate) return wanted
  const allowed = AVAILABLE_BITRATES.filter((b) => b.value <= maxBitrate)
  return allowed[allowed.length - 1].value
}

/**
 * Nutzerfreundliche Meldung für Fehler aus Upload/Konvertierung. Die
 * Limit-Codes des Servers (server/server.js) werden übersetzt; sonst bleibt es
 * bei der Server-Meldung bzw. der technischen Fehlermeldung.
 */
export function uploadErrorMessage(err) {
  const data = err?.response?.data
  const t = i18n.global.t
  switch (data?.code) {
    case 'PLAYLIST_TOO_LARGE':
      return t('error.playlistTooLarge', {
        max: formatBytes(data.max_bytes ?? MAX_PLAYLIST_SIZE, 0),
      })
    case 'FILE_TOO_LARGE':
      return t('error.fileTooLarge', { max: formatBytes(data.max_bytes, 0) ?? '500 MB' })
    case 'INSUFFICIENT_STORAGE':
      return t('error.serverStorage')
    default:
      // nginx-Rate-Limit (deploy/nginx-playlistkonverter.conf) antwortet mit HTML, ohne code
      if (err?.response?.status === 429) return t('error.rateLimited')
      return data?.error || err?.message || 'Upload fehlgeschlagen'
  }
}
