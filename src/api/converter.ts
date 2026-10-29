import axios from 'axios'
import { API_BASE_URL } from '../config'
import { UPLOAD_TIMEOUT, CONVERT_START_TIMEOUT, STATUS_POLL_TIMEOUT } from '../constants'
import type { TransitionType } from '../constants'
import { requestJson } from '../utils/http'

/** Serverseitiger Konvertierungsstatus (GET /api/status/:id, SSE-Ereignis „status“). */
export interface ConversionStatus {
  status: 'uploading' | 'queued' | 'converting' | 'done' | 'error'
  progress: number
  file_size?: number
  /** Technische Meldung (deutsch, für Logs) */
  error?: string
  /** Fehlercode, z. B. FILE_UNREADABLE, FFMPEG_FAILED, NO_FILES, INTERNAL */
  error_code?: string
  /** Name der Datei bei FILE_UNREADABLE */
  error_file?: string
  queue_position?: number
}

export interface UploadProgress {
  loaded: number
  total: number
}

export interface UploadOptions {
  signal: AbortSignal
  onUploadProgress: (progress: UploadProgress) => void
  /** Wird mit der Session-ID aufgerufen, sobald die erste Datei angekommen ist. */
  onSessionId?: (sessionId: string) => void
}

export interface StatusHandlers {
  onStatus: (status: ConversionStatus) => void
  onGone: () => void
  onError: (err: unknown) => void
}

/**
 * Lädt Audiodateien hoch (axios, weil fetch keinen Upload-Fortschritt meldet) – eine Datei pro Request, damit der Fortschritt stimmt
 * und Server-Limits (post_max_size) nicht überschritten werden. Der Upload läuft
 * sequenziell: Bei bandbreitenbegrenzten Verbindungen (der Regelfall) bringt
 * paralleles Hochladen keinen Durchsatzgewinn, da sich alle Übertragungen
 * dieselbe Leitung teilen.
 * @param formData  Enthält files[] und order[]
 */
export async function uploadFiles(
  formData: FormData,
  { signal, onUploadProgress, onSessionId }: UploadOptions,
): Promise<{ data: { session_id: string | null } }> {
  const fileEntries = formData.getAll('files[]') as File[]
  const orderEntries = formData.getAll('order[]')

  // Gesamtgröße aller Dateien für Fortschrittsberechnung
  const totalBytes = fileEntries.reduce((sum, f) => sum + (f.size || 0), 0)
  let loadedBytes = 0

  let sessionId: string | null = null

  for (const [i, file] of fileEntries.entries()) {
    const chunk = new FormData()
    chunk.append('files[]', file)
    chunk.append('order[]', orderEntries[i] ?? String(i))
    chunk.append('chunk_index', String(i))
    if (sessionId) chunk.append('session_id', sessionId)

    const fileSize = file.size || 0
    let prevLoaded = 0

    const res = await axios.post<{ session_id: string }>(`${API_BASE_URL}/upload`, chunk, {
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
 */
/** Titel, Künstler und Album der Ausgabe (N6); leere Felder werden weggelassen. */
export interface OutputTags {
  title?: string
  artist?: string
  album?: string
}

/** Einstellungen der Konvertierung (POST /api/convert). */
export interface ConversionOptions {
  format: string
  bitrate: number
  /** 1 = Mono, 2 = Stereo */
  channels: 1 | 2
  /** Dateiname ohne Endung (Server bereinigt ihn erneut) */
  filename?: string
  tags?: OutputTags
  /** Pause oder Crossfade zwischen den Tracks (N4) */
  transition?: TransitionType
  transition_seconds?: number
  /** Lautheit der Tracks angleichen (N5) */
  loudnorm?: boolean
  /** Zuschnitt je Track in Upload-Reihenfolge, null = ganzer Track (N9) */
  tracks?: (TrackTrim | null)[]
  /** Stille am Anfang und Ende jedes Tracks entfernen (N9) */
  trim_silence?: boolean
}

/** Zugeschnittener Bereich eines Tracks in Sekunden; end null = bis zum Ende. */
export interface TrackTrim {
  start: number
  end: number | null
}

/** Cover-Bild (JPEG/PNG) zur Session hochladen; nur für MP3 relevant (N6). */
export function uploadCover(sessionId: string, cover: File, { signal }: { signal: AbortSignal }) {
  const form = new FormData()
  form.append('cover', cover)
  return requestJson<{ success?: boolean }>(`${API_BASE_URL}/cover/${sessionId}`, {
    method: 'POST',
    body: form,
    timeout: CONVERT_START_TIMEOUT,
    signal,
  })
}

export function startConversion(
  sessionId: string,
  options: ConversionOptions,
  { signal }: { signal: AbortSignal },
) {
  return requestJson<{ success?: boolean; queue_position?: number }>(`${API_BASE_URL}/convert`, {
    method: 'POST',
    body: { session_id: sessionId, ...options },
    timeout: CONVERT_START_TIMEOUT,
    signal,
  })
}

/**
 * Fragt den Konvertierungsstatus ab.
 */
export function fetchStatus(sessionId: string, { signal }: { signal?: AbortSignal }) {
  return requestJson<ConversionStatus>(`${API_BASE_URL}/status/${sessionId}`, {
    timeout: STATUS_POLL_TIMEOUT,
    signal,
  })
}

/**
 * Status-Updates per Server-Sent Events abonnieren (GET /api/events/:id).
 * Gibt null zurück, wenn der Browser kein EventSource kennt – dann pollt der
 * Aufrufer. Verbindungsfehler melden sich über onError; der Aufrufer schließt
 * und fällt auf Polling zurück (kein automatisches Reconnect).
 * @returns Funktion zum Schließen
 */
export function subscribeStatus(
  sessionId: string,
  { onStatus, onGone, onError }: StatusHandlers,
): (() => void) | null {
  if (typeof EventSource === 'undefined') return null
  const source = new EventSource(`${API_BASE_URL}/events/${sessionId}`)
  source.addEventListener('status', (event) => {
    try {
      onStatus(JSON.parse((event as MessageEvent<string>).data) as ConversionStatus)
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
 */
export function cancelSession(sessionId: string): void {
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
 */
export function getDownloadUrl(sessionId: string): string {
  return `${API_BASE_URL}/download/${sessionId}`
}
