import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import axios from 'axios'
import { API_BASE_URL } from '../config'

// Timeout für große Uploads (10 Minuten)
const UPLOAD_TIMEOUT = 10 * 60 * 1000

// Maximale Größe für Konvertierung (500 MB)
const MAX_PLAYLIST_SIZE = 500 * 1024 * 1024 // 500 MB in Bytes

export const useConverterStore = defineStore('converter', () => {
  const files = ref([])
  const uploadProgress = ref(0)
  const conversionProgress = ref(0)
  const status = ref('idle') // idle, uploading, converting, done, error
  const sessionId = ref(null)
  const downloadUrl = ref(null)
  const errorMessage = ref(null)
  const outputFileSize = ref(null) // Größe der konvertierten WebM-Datei

  const totalProgress = computed(() => {
    if (status.value === 'uploading') return uploadProgress.value * 0.3
    if (status.value === 'converting') return 30 + (conversionProgress.value * 0.7)
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

  function addFiles(newFiles) {
    const validFiles = Array.from(newFiles).filter(f => 
      f.type === 'audio/mpeg' || 
      f.type === 'audio/wav' || 
      f.type === 'audio/mp3' ||
      f.name.endsWith('.mp3') ||
      f.name.endsWith('.wav')
    )
    files.value.push(...validFiles.map((f, idx) => ({
      file: f,
      id: Date.now() + idx,
      name: f.name,
      size: f.size
    })))
  }

  function removeFile(id) {
    files.value = files.value.filter(f => f.id !== id)
  }

  function moveFile(fromIndex, toIndex) {
    const item = files.value.splice(fromIndex, 1)[0]
    files.value.splice(toIndex, 0, item)
  }

  async function convert() {
    if (files.value.length === 0) {
      errorMessage.value = 'Keine Dateien ausgewählt'
      return
    }

    try {
      status.value = 'uploading'
      uploadProgress.value = 0
      errorMessage.value = null

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
        onUploadProgress: (e) => {
          uploadProgress.value = Math.round((e.loaded / e.total) * 100)
          console.log(`Upload progress: ${uploadProgress.value}% (${e.loaded}/${e.total} bytes)`)
        }
      })

      console.log('Upload response:', uploadRes.data)
      sessionId.value = uploadRes.data.session_id

      // Start conversion
      status.value = 'converting'
      conversionProgress.value = 0

      console.log('Starting conversion for session:', sessionId.value)
      await axios.post(`${API_BASE_URL}/convert`, { 
        session_id: sessionId.value 
      }, {
        timeout: 30000 // 30 Sekunden für Convert-Start
      })

      // Poll status
      await pollStatus()

    } catch (err) {
      console.error('Convert error:', err)
      console.error('Error details:', err.response?.data)
      status.value = 'error'
      errorMessage.value = err.response?.data?.error || err.message || 'Upload fehlgeschlagen'
    }
  }

  async function pollStatus() {
    const interval = setInterval(async () => {
      try {
        const url = `${API_BASE_URL}/status/${sessionId.value}`
        const res = await axios.get(url, { timeout: 10000 })

        conversionProgress.value = res.data.progress
        console.log(`Conversion: ${res.data.status} - ${res.data.progress}%`)

        if (res.data.status === 'done') {
          clearInterval(interval)
          status.value = 'done'
          downloadUrl.value = `${API_BASE_URL}/download/${sessionId.value}`
          outputFileSize.value = res.data.file_size || null
          console.log('Conversion done! Download:', downloadUrl.value)
        } else if (res.data.status === 'error') {
          clearInterval(interval)
          status.value = 'error'
          errorMessage.value = res.data.error
          console.error('Conversion error:', res.data.error)
        }
      } catch (err) {
        console.error('Polling error:', err)
        clearInterval(interval)
        status.value = 'error'
        errorMessage.value = 'Statusabfrage fehlgeschlagen'
      }
    }, 1000)
  }

  function reset() {
    files.value = []
    uploadProgress.value = 0
    conversionProgress.value = 0
    status.value = 'idle'
    sessionId.value = null
    downloadUrl.value = null
    errorMessage.value = null
    outputFileSize.value = null
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
    addFiles,
    removeFile,
    moveFile,
    convert,
    reset
  }
})