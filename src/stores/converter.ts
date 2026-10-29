import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useToastStore } from './toast'
import {
  MAX_PLAYLIST_SIZE,
  OUTPUT_FORMATS,
  AVAILABLE_BITRATES,
  isOutputFormat,
  isAcceptedAudioFile,
  type OutputFormatId,
} from '../constants'
import {
  uploadFiles,
  startConversion,
  fetchStatus,
  getDownloadUrl,
  cancelSession,
  subscribeStatus,
  type ConversionStatus,
} from '../api/converter'
import { formatBytes } from '../utils/format'
import i18n from '../i18n'
import { readPref, writePref } from '../utils/storage'
import { logger } from '../utils/logger'
import { isAbortError } from '../utils/errors'

/** Ein Track der Playlist. */
export interface PlaylistItem {
  file: File
  id: number
  name: string
  size: number
}

export type ConverterStatus = 'idle' | 'uploading' | 'converting' | 'done' | 'error'

type Timer = ReturnType<typeof setTimeout>

export const useConverterStore = defineStore('converter', () => {
  const files = ref<PlaylistItem[]>([])
  const uploadProgress = ref(0)
  const status = ref<ConverterStatus>('idle')
  const sessionId = ref<string | null>(null)
  const downloadUrl = ref<string | null>(null)
  const errorMessage = ref<string | null>(null)
  const outputFileSize = ref<number | null>(null) // Größe der konvertierten Datei
  const outputFormat = ref<OutputFormatId>(normalizeFormat(readPref('outputFormat'))) // Standard: MP3
  const bitrate = ref(normalizeBitrate(parseInt(readPref('bitrate') ?? '', 10), outputFormat.value)) // Standard: 192 kbps

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

  function addFiles(newFiles: FileList | File[]) {
    const toastStore = useToastStore()
    const validFiles = Array.from(newFiles).filter(isAcceptedAudioFile)

    const invalidCount = newFiles.length - validFiles.length

    if (validFiles.length > 0) {
      files.value.push(
        ...validFiles.map((f) => ({
          file: f,
          id: nextTrackId++,
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

  function removeFile(id: number) {
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

  function moveFile(fromIndex: number, toIndex: number) {
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
        formData.append('order[]', String(idx))
      })

      const uploadRes = await uploadFiles(formData, {
        signal: abortController.signal,
        // Früh merken, damit Abbrechen während des Uploads die Server-Session freigibt
        onSessionId: (id) => {
          sessionId.value = id
        },
        onUploadProgress: (e) => {
          uploadProgress.value = Math.round((e.loaded / e.total) * 100)

          const elapsedTime = (Date.now() - (uploadStartTime.value ?? Date.now())) / 1000
          if (elapsedTime > 0.5) {
            uploadSpeed.value = e.loaded / elapsedTime
            const remainingBytes = e.total - e.loaded
            estimatedTimeRemaining.value = remainingBytes / uploadSpeed.value
          }
        },
      })

      const id = uploadRes.data.session_id
      if (!id) throw new Error('Keine Session-ID vom Server erhalten')
      sessionId.value = id

      // Start conversion
      status.value = 'converting'
      estimatedTimeRemaining.value = null // Reset für Konvertierung
      uploadSpeed.value = 0

      await startConversion(id, outputFormat.value, bitrate.value, {
        signal: abortController.signal,
      })

      // Poll status
      pollStatus(id)
    } catch (err) {
      if (isAbortError(err) || isCancelling.value) {
        logger.info('Vorgang vom Nutzer abgebrochen')
        toastStore.info('Vorgang abgebrochen')
        reset()
        return
      }

      logger.error('Konvertierung fehlgeschlagen:', err, responseOf(err)?.data)
      status.value = 'error'
      errorMessage.value = uploadErrorMessage(err)
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
      toastStore.success('Konvertierung abgeschlossen!')
      return true
    }
    if (data.status === 'error') {
      stopIntervals()
      status.value = 'error'
      errorMessage.value = data.error ?? null
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

/** `message` eines Fehlers (auch Fehlerobjekte, die keine Error-Instanz sind). */
function messageOf(err: unknown): string | undefined {
  if (typeof err !== 'object' || err === null || !('message' in err)) return undefined
  return typeof err.message === 'string' ? err.message : undefined
}

/** `response` eines axios-Fehlers oder HttpError (utils/http), sonst undefined. */
function responseOf(err: unknown): ErrorResponse | undefined {
  if (typeof err !== 'object' || err === null || !('response' in err)) return undefined
  const response = err.response
  return typeof response === 'object' && response !== null ? response : undefined
}

/**
 * Nutzerfreundliche Meldung für Fehler aus Upload/Konvertierung. Die
 * Limit-Codes des Servers (server/server.js) werden übersetzt; sonst bleibt es
 * bei der Server-Meldung bzw. der technischen Fehlermeldung.
 */
export function uploadErrorMessage(err: unknown): string {
  const response = responseOf(err)
  const data =
    typeof response?.data === 'object' && response.data !== null
      ? (response.data as ServerErrorBody)
      : undefined
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
      if (response?.status === 429) return t('error.rateLimited')
      return data?.error || messageOf(err) || 'Upload fehlgeschlagen'
  }
}
