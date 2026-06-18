import axios from 'axios'
import { API_BASE_URL } from '../config'
import { UPLOAD_TIMEOUT, CONVERT_START_TIMEOUT, STATUS_POLL_TIMEOUT } from '../constants'

/**
 * Lädt Audiodateien hoch – einzeln, damit der Fortschritt stimmt und
 * Server-Limits (post_max_size) nicht überschritten werden.
 * @param {FormData} formData  Enthält files[] und order[]
 * @param {{ signal: AbortSignal, onUploadProgress: function }} options
 * @returns {Promise<{ session_id: string }>}
 */
export async function uploadFiles(formData, { signal, onUploadProgress }) {
  const fileEntries = formData.getAll('files[]')
  const orderEntries = formData.getAll('order[]')

  // Gesamtgröße aller Dateien für Fortschrittsberechnung
  const totalBytes = fileEntries.reduce((sum, f) => sum + (f.size || 0), 0)
  let loadedBytes = 0

  let sessionId = null

  for (let i = 0; i < fileEntries.length; i++) {
    const chunk = new FormData()
    chunk.append('files[]', fileEntries[i])
    chunk.append('order[]', orderEntries[i] ?? i)
    chunk.append('total_files', fileEntries.length)
    chunk.append('chunk_index', i)
    if (sessionId) chunk.append('session_id', sessionId)

    const fileSize = fileEntries[i].size || 0
    let prevLoaded = 0

    const res = await axios.post(`${API_BASE_URL}/upload`, chunk, {
      timeout: UPLOAD_TIMEOUT,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      signal,
      onUploadProgress: (e) => {
        const delta = (e.loaded || 0) - prevLoaded
        prevLoaded = e.loaded || 0
        loadedBytes += delta
        onUploadProgress({ loaded: loadedBytes, total: totalBytes })
      },
    })

    // Erste Antwort liefert session_id; Folge-Uploads nutzen dieselbe
    if (!sessionId) sessionId = res.data.session_id
    // Restliche Bytes dieser Datei gutschreiben (für den Fall dass Ereignis fehlt)
    const remaining = fileSize - prevLoaded
    if (remaining > 0) {
      loadedBytes += remaining
      onUploadProgress({ loaded: loadedBytes, total: totalBytes })
    }
  }

  return { data: { session_id: sessionId } }
}

/**
 * Startet die Konvertierung einer hochgeladenen Session.
 * @param {string} sessionId
 * @param {string} format
 * @param {number} bitrate
 * @param {{ signal: AbortSignal }} options
 */
export function startConversion(sessionId, format, bitrate, { signal }) {
  return axios.post(
    `${API_BASE_URL}/convert`,
    { session_id: sessionId, format, bitrate },
    { timeout: CONVERT_START_TIMEOUT, signal },
  )
}

/**
 * Fragt den Konvertierungsstatus ab.
 * @param {string} sessionId
 * @param {{ signal: AbortSignal }} options
 * @returns {Promise<{ status: string, progress: number, file_size?: number, error?: string }>}
 */
export function fetchStatus(sessionId, { signal }) {
  return axios.get(`${API_BASE_URL}/status/${sessionId}`, {
    timeout: STATUS_POLL_TIMEOUT,
    signal,
  })
}

/**
 * Gibt die Download-URL für eine fertige Session zurück.
 * @param {string} sessionId
 * @returns {string}
 */
export function getDownloadUrl(sessionId) {
  return `${API_BASE_URL}/download/${sessionId}`
}
