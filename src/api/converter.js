import axios from 'axios'
import { API_BASE_URL } from '../config'
import { UPLOAD_TIMEOUT, CONVERT_START_TIMEOUT, STATUS_POLL_TIMEOUT } from '../constants'

/**
 * Lädt Audiodateien hoch.
 * @param {FormData} formData
 * @param {{ signal: AbortSignal, onUploadProgress: function }} options
 * @returns {Promise<{ session_id: string }>}
 */
export function uploadFiles(formData, { signal, onUploadProgress }) {
  return axios.post(`${API_BASE_URL}/upload`, formData, {
    timeout: UPLOAD_TIMEOUT,
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
    signal,
    onUploadProgress,
  })
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
