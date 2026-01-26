import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import axios from 'axios'
import { API_BASE_URL } from '../config'
import { useToastStore } from './toast'

// Timeout für große Uploads (10 Minuten)
const UPLOAD_TIMEOUT = 10 * 60 * 1000

// Maximale Größe für Konvertierung (1 GB)
const MAX_PLAYLIST_SIZE = 1024 * 1024 * 1024 // 1 GB in Bytes

// Verfügbare Ausgabeformate
const OUTPUT_FORMATS = {
  webm: { extension: 'webm', label: 'WebM (Opus)', description: 'Kompakt, modern' },
  mp3: { extension: 'mp3', label: 'MP3', description: 'Universell kompatibel' },
  ogg: { extension: 'ogg', label: 'OGG (Vorbis)', description: 'Open Source' }
}

export const useConverterStore = defineStore('converter', () => {
  const files = ref([])
  const uploadProgress = ref(0)
  const conversionProgress = ref(0)
  const status = ref('idle') // idle, uploading, converting, done, error
  const sessionId = ref(null)
  const downloadUrl = ref(null)
  const errorMessage = ref(null)
  const outputFileSize = ref(null) // Größe der konvertierten Datei
  const outputFormat = ref(localStorage.getItem('outputFormat') || 'mp3') // Standard: MP3

  // Für Abbrechen-Funktion
  let abortController = null
  let pollingInterval = null
  let smoothProgressInterval = null
  const isCancelling = ref(false)

  // Für simulierten flüssigen Fortschritt
  const displayProgress = ref(0)
  const lastBackendProgress = ref(0)

  // Für Zeitberechnung
  const uploadStartTime = ref(null)
  const uploadedBytes = ref(0)
  const totalBytes = ref(0)
  const uploadSpeed = ref(0) // Bytes pro Sekunde
  const estimatedTimeRemaining = ref(null) // in Sekunden

  const totalProgress = computed(() => {
    if (status.value === 'uploading') return uploadProgress.value * 0.3
    if (status.value === 'converting') return 30 + (displayProgress.value * 0.7)
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
    const validFiles = Array.from(newFiles).filter(f =>
      f.type === 'audio/mpeg' ||
      f.type === 'audio/wav' ||
      f.type === 'audio/mp3' ||
      f.name.endsWith('.mp3') ||
      f.name.endsWith('.wav')
    )

    const invalidCount = newFiles.length - validFiles.length

    if (validFiles.length > 0) {
      files.value.push(...validFiles.map((f, idx) => ({
        file: f,
        id: Date.now() + idx,
        name: f.name,
        size: f.size
      })))
      toastStore.success(`${validFiles.length} ${validFiles.length === 1 ? 'Datei' : 'Dateien'} hinzugefügt`)
    }

    if (invalidCount > 0) {
      toastStore.warning(`${invalidCount} ${invalidCount === 1 ? 'Datei' : 'Dateien'} übersprungen (nur MP3/WAV)`)
    }
  }

  function removeFile(id) {
    const toastStore = useToastStore()
    const file = files.value.find(f => f.id === id)
    files.value = files.value.filter(f => f.id !== id)
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
      localStorage.setItem('outputFormat', format)
    }
  }

  const currentFormatConfig = computed(() => {
    return OUTPUT_FORMATS[outputFormat.value] || OUTPUT_FORMATS.mp3
  })

  const availableFormats = computed(() => {
    return Object.entries(OUTPUT_FORMATS).map(([key, value]) => ({
      id: key,
      ...value
    }))
  })

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
      uploadedBytes.value = 0
      totalBytes.value = totalSize.value
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

      console.log('Uploading to:', `${API_BASE_URL}/upload`)
      console.log('Total files:', files.value.length)
      console.log('Total size:', files.value.reduce((sum, f) => sum + f.size, 0) / 1024 / 1024, 'MB')

      const uploadRes = await axios.post(`${API_BASE_URL}/upload`, formData, {
        timeout: UPLOAD_TIMEOUT,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        signal: abortController.signal,
        onUploadProgress: (e) => {
          uploadProgress.value = Math.round((e.loaded / e.total) * 100)
          uploadedBytes.value = e.loaded

          // Upload-Geschwindigkeit und Restzeit berechnen
          const elapsedTime = (Date.now() - uploadStartTime.value) / 1000 // in Sekunden
          if (elapsedTime > 0.5) { // Nur berechnen nach 0.5 Sekunden
            uploadSpeed.value = e.loaded / elapsedTime
            const remainingBytes = e.total - e.loaded
            estimatedTimeRemaining.value = remainingBytes / uploadSpeed.value
          }

          console.log(`Upload progress: ${uploadProgress.value}% (${e.loaded}/${e.total} bytes)`)
        }
      })

      console.log('Upload response:', uploadRes.data)
      sessionId.value = uploadRes.data.session_id

      // Start conversion
      status.value = 'converting'
      conversionProgress.value = 0
      estimatedTimeRemaining.value = null // Reset für Konvertierung
      uploadSpeed.value = 0

      console.log('Starting conversion for session:', sessionId.value, 'format:', outputFormat.value)
      await axios.post(`${API_BASE_URL}/convert`, {
        session_id: sessionId.value,
        format: outputFormat.value
      }, {
        timeout: 30000, // 30 Sekunden für Convert-Start
        signal: abortController.signal
      })

      // Poll status
      await pollStatus()

    } catch (err) {
      if (err.name === 'CanceledError' || err.name === 'AbortError' || isCancelling.value) {
        console.log('Operation cancelled by user')
        toastStore.info('Vorgang abgebrochen')
        reset()
        return
      }

      console.error('Convert error:', err)
      console.error('Error details:', err.response?.data)
      status.value = 'error'
      errorMessage.value = err.response?.data?.error || err.message || 'Upload fehlgeschlagen'
      toastStore.error(errorMessage.value)
    }
  }

  async function pollStatus() {
    const toastStore = useToastStore()

    // Starte simulierten flüssigen Fortschritt
    displayProgress.value = 0
    lastBackendProgress.value = 0
    const conversionStartTime = Date.now()

    smoothProgressInterval = setInterval(() => {
      // Simuliere flüssigen Fortschritt
      // Ziel: Von 0 auf 95% in ca. 60 Sekunden (wenn Backend keine Updates gibt)
      const elapsedSeconds = (Date.now() - conversionStartTime) / 1000

      // Berechne Zielfortschritt basierend auf Zeit (langsamer werdend)
      // Formel: 95 * (1 - e^(-elapsed/30)) - nähert sich asymptotisch 95%
      const timeBasedProgress = 95 * (1 - Math.exp(-elapsedSeconds / 30))

      // Nimm das Maximum aus Backend-Fortschritt und zeitbasiertem Fortschritt
      const targetProgress = Math.max(lastBackendProgress.value, timeBasedProgress)

      // Bewege displayProgress sanft zum Ziel
      if (displayProgress.value < targetProgress) {
        const diff = targetProgress - displayProgress.value
        displayProgress.value += Math.max(0.5, diff * 0.15)
        displayProgress.value = Math.min(95, displayProgress.value)
      }
    }, 100)

    pollingInterval = setInterval(async () => {
      if (isCancelling.value) {
        clearInterval(pollingInterval)
        clearInterval(smoothProgressInterval)
        pollingInterval = null
        smoothProgressInterval = null
        return
      }

      try {
        const url = `${API_BASE_URL}/status/${sessionId.value}`
        const res = await axios.get(url, {
          timeout: 10000,
          signal: abortController?.signal
        })

        // Aktualisiere Backend-Fortschritt
        conversionProgress.value = res.data.progress
        lastBackendProgress.value = res.data.progress
        console.log(`Conversion: ${res.data.status} - ${res.data.progress}%`)

        if (res.data.status === 'done') {
          clearInterval(pollingInterval)
          clearInterval(smoothProgressInterval)
          pollingInterval = null
          smoothProgressInterval = null
          displayProgress.value = 100
          status.value = 'done'
          downloadUrl.value = `${API_BASE_URL}/download/${sessionId.value}`
          outputFileSize.value = res.data.file_size || null
          console.log('Conversion done! Download:', downloadUrl.value)
          toastStore.success('Konvertierung abgeschlossen!')
        } else if (res.data.status === 'error') {
          clearInterval(pollingInterval)
          clearInterval(smoothProgressInterval)
          pollingInterval = null
          smoothProgressInterval = null
          status.value = 'error'
          errorMessage.value = res.data.error
          console.error('Conversion error:', res.data.error)
          toastStore.error(res.data.error || 'Konvertierung fehlgeschlagen')
        }
      } catch (err) {
        if (err.name === 'CanceledError' || err.name === 'AbortError' || isCancelling.value) {
          clearInterval(pollingInterval)
          clearInterval(smoothProgressInterval)
          pollingInterval = null
          smoothProgressInterval = null
          return
        }

        console.error('Polling error:', err)
        clearInterval(pollingInterval)
        clearInterval(smoothProgressInterval)
        pollingInterval = null
        smoothProgressInterval = null
        status.value = 'error'
        errorMessage.value = 'Statusabfrage fehlgeschlagen'
        toastStore.error('Verbindung zum Server verloren')
      }
    }, 1000)
  }

  function cancel() {
    const toastStore = useToastStore()
    isCancelling.value = true

    // Abort laufende Requests
    if (abortController) {
      abortController.abort()
      abortController = null
    }

    // Polling und Fortschritts-Simulation stoppen
    if (pollingInterval) {
      clearInterval(pollingInterval)
      pollingInterval = null
    }
    if (smoothProgressInterval) {
      clearInterval(smoothProgressInterval)
      smoothProgressInterval = null
    }

    toastStore.info('Vorgang wird abgebrochen...')
    reset()
  }

  function reset() {
    files.value = []
    uploadProgress.value = 0
    conversionProgress.value = 0
    displayProgress.value = 0
    lastBackendProgress.value = 0
    status.value = 'idle'
    sessionId.value = null
    downloadUrl.value = null
    errorMessage.value = null
    outputFileSize.value = null
    isCancelling.value = false
    uploadStartTime.value = null
    uploadedBytes.value = 0
    totalBytes.value = 0
    uploadSpeed.value = 0
    estimatedTimeRemaining.value = null

    // Cleanup
    if (abortController) {
      abortController.abort()
      abortController = null
    }
    if (pollingInterval) {
      clearInterval(pollingInterval)
      pollingInterval = null
    }
    if (smoothProgressInterval) {
      clearInterval(smoothProgressInterval)
      smoothProgressInterval = null
    }
  }

  return {
    files,
    uploadProgress,
    conversionProgress,
    status,
    totalProgress,
    totalSize,
    isOverSizeLimit,
    maxPlaylistSize,
    downloadUrl,
    errorMessage,
    outputFileSize,
    outputFormat,
    currentFormatConfig,
    availableFormats,
    isCancelling,
    formattedUploadSpeed,
    formattedTimeRemaining,
    addFiles,
    removeFile,
    removeAllFiles,
    moveFile,
    setOutputFormat,
    convert,
    cancel,
    reset
  }
})
