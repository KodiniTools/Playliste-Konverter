import axios from 'axios'
import { API_BASE_URL } from '../config'
import { UPLOAD_TIMEOUT, CONVERT_START_TIMEOUT, STATUS_POLL_TIMEOUT } from '../constants'

/**
 * Lädt Audiodateien hoch – eine Datei pro Request, damit der Fortschritt stimmt
 * und Server-Limits (post_max_size) nicht überschritten werden. Der Upload läuft
 * sequenziell: Bei bandbreitenbegrenzten Verbindungen (der Regelfall) bringt
 * paralleles Hochladen keinen Durchsatzgewinn, da sich alle Übertragungen
 * dieselbe Leitung teilen.
 * @param {FormData} formData  Enthält files[] und order[]
 * @param {{ signal: AbortSignal, onUploadProgress: function, onSessionId?: function }} options
 *   onSessionId wird mit der Session-ID aufgerufen, sobald die erste Datei angekommen ist.
 * @returns {Promise<{ data: { session_id: string } }>}
 */
export async function uploadFiles(formData, { signal, onUploadProgress, onSessionId }) {
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
    if (!sessionId) {
      sessionId = res.data.session_id
      onSessionId?.(sessionId)
    }
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
 * Status-Updates per Server-Sent Events abonnieren (GET /api/events/:id).
 * Gibt null zurück, wenn der Browser kein EventSource kennt – dann pollt der
 * Aufrufer. Verbindungsfehler melden sich über onError; der Aufrufer schließt
 * und fällt auf Polling zurück (kein automatisches Reconnect).
 * @param {string} sessionId
 * @param {{ onStatus: function, onGone: function, onError: function }} handlers
 * @returns {(() => void) | null} Funktion zum Schließen
 */
export function subscribeStatus(sessionId, { onStatus, onGone, onError }) {
  if (typeof EventSource === 'undefined') return null
  const source = new EventSource(`${API_BASE_URL}/events/${sessionId}`)
  source.addEventListener('status', (event) => {
    try {
      onStatus(JSON.parse(event.data))
    } catch (err) {
      onError(err)
    }
  })
  source.addEventListener('gone', () => onGone())
  source.onerror = (err) => onError(err)
  return () => source.close()
}

/**
 * Bittet den Server, eine Session abzubrechen: laufendes ffmpeg beenden, Slot und
 * Dateien freigeben. Funktioniert auch beim Schließen des Tabs (sendBeacon, sonst
 * fetch mit keepalive). Fehler werden ignoriert – der Server räumt spätestens
 * nach 1 Stunde selbst auf.
 * @param {string} sessionId
 */
export function cancelSession(sessionId) {
  const url = `${API_BASE_URL}/cancel/${sessionId}`
  try {
    if (navigator.sendBeacon?.(url)) return
    fetch(url, { method: 'POST', keepalive: true }).catch(() => {})
  } catch {
    // Abbrechen im Browser gilt trotzdem
  }
}

/**
 * Gibt die Download-URL für eine fertige Session zurück.
 * @param {string} sessionId
 * @returns {string}
 */
export function getDownloadUrl(sessionId) {
  return `${API_BASE_URL}/download/${sessionId}`
}
