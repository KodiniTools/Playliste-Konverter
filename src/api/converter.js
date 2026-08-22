import axios from 'axios'
import { API_BASE_URL } from '../config'
import {
  UPLOAD_TIMEOUT,
  UPLOAD_CONCURRENCY,
  CONVERT_START_TIMEOUT,
  STATUS_POLL_TIMEOUT,
} from '../constants'

/**
 * Lädt Audiodateien hoch – eine Datei pro Request (damit Server-Limits wie
 * post_max_size nicht überschritten werden), aber mehrere Requests parallel,
 * um die Bandbreite auszunutzen. Die erste Datei wird zuerst allein hochgeladen,
 * um die Session anzulegen; die restlichen laufen mit begrenzter Parallelität.
 * @param {FormData} formData  Enthält files[] und order[]
 * @param {{ signal: AbortSignal, onUploadProgress: function }} options
 * @returns {Promise<{ data: { session_id: string } }>}
 */
export async function uploadFiles(formData, { signal, onUploadProgress }) {
  const fileEntries = formData.getAll('files[]')
  const orderEntries = formData.getAll('order[]')
  const totalFiles = fileEntries.length

  // Gesamtgröße aller Dateien für Fortschrittsberechnung
  const totalBytes = fileEntries.reduce((sum, f) => sum + (f.size || 0), 0)

  // Pro Datei bereits übertragene Bytes; Summe ergibt den Gesamtfortschritt.
  const loadedPerFile = new Array(totalFiles).fill(0)
  const reportProgress = () => {
    const loaded = loadedPerFile.reduce((sum, b) => sum + b, 0)
    onUploadProgress({ loaded, total: totalBytes })
  }

  const uploadOne = async (index, sessionId) => {
    const chunk = new FormData()
    chunk.append('files[]', fileEntries[index])
    chunk.append('order[]', orderEntries[index] ?? index)
    chunk.append('total_files', totalFiles)
    chunk.append('chunk_index', index)
    if (sessionId) chunk.append('session_id', sessionId)

    const fileSize = fileEntries[index].size || 0

    const res = await axios.post(`${API_BASE_URL}/upload`, chunk, {
      timeout: UPLOAD_TIMEOUT,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      signal,
      onUploadProgress: (e) => {
        loadedPerFile[index] = e.loaded || 0
        reportProgress()
      },
    })

    // Übertragene Bytes exakt auf die Dateigröße setzen (falls ein Fortschritts-
    // Ereignis fehlte), damit die Gesamtsumme stimmt.
    loadedPerFile[index] = fileSize
    reportProgress()

    return res
  }

  if (totalFiles === 0) {
    return { data: { session_id: null } }
  }

  // Erste Datei zuerst: legt die Session an und liefert die session_id.
  const firstRes = await uploadOne(0, null)
  const sessionId = firstRes.data.session_id

  // Restliche Dateien mit begrenzter Parallelität hochladen (alle mit derselben
  // session_id). Ein einfacher Worker-Pool zieht sich Indizes aus einer Queue.
  let nextIndex = 1
  const worker = async () => {
    while (nextIndex < totalFiles) {
      const index = nextIndex++
      await uploadOne(index, sessionId)
    }
  }

  const poolSize = Math.max(1, Math.min(UPLOAD_CONCURRENCY, totalFiles - 1))
  await Promise.all(Array.from({ length: poolSize }, () => worker()))

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
