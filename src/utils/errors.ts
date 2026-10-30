/**
 * Name eines geworfenen Werts (z. B. 'AbortError', 'CanceledError'), ohne
 * vorauszusetzen, dass es ein Error-Objekt ist.
 */
export function errorName(err: unknown): string | undefined {
  if (typeof err !== 'object' || err === null || !('name' in err)) return undefined
  return typeof err.name === 'string' ? err.name : undefined
}

/** Abbruch durch den Nutzer: fetch/AbortController (AbortError) oder axios (CanceledError). */
export function isAbortError(err: unknown): boolean {
  const name = errorName(err)
  return name === 'AbortError' || name === 'CanceledError'
}

const NETWORK_ERROR_CODES = ['ERR_NETWORK', 'ECONNABORTED', 'ETIMEDOUT']

/**
 * Keine Antwort vom Server: fetch (TypeError, TimeoutError aus utils/http) oder
 * axios (Code ERR_NETWORK bzw. Zeitüberschreitung).
 */
export function isNetworkError(err: unknown): boolean {
  const name = errorName(err)
  if (name === 'TypeError' || name === 'TimeoutError') return true
  if (typeof err !== 'object' || err === null || !('code' in err)) return false
  return typeof err.code === 'string' && NETWORK_ERROR_CODES.includes(err.code)
}

/** HTTP-Status eines axios-Fehlers oder HttpError (utils/http), sonst undefined. */
export function httpStatusOf(err: unknown): number | undefined {
  if (typeof err !== 'object' || err === null || !('response' in err)) return undefined
  const response = err.response
  if (typeof response !== 'object' || response === null || !('status' in response)) return undefined
  return typeof response.status === 'number' ? response.status : undefined
}

// Vorübergehende Serverfehler: Zeitüberschreitung, Überlast, Neustart hinter nginx
const RETRYABLE_STATUS = [408, 429, 500, 502, 503, 504]

/**
 * Lohnt ein neuer Versuch (N10)? Bei Verbindungsabbruch und vorübergehenden
 * Serverfehlern ja; bei Ablehnungen wie 413 oder 410 und beim Abbrechen nicht.
 */
export function isRetryableUploadError(err: unknown): boolean {
  if (isAbortError(err)) return false
  if (isNetworkError(err)) return true
  const status = httpStatusOf(err)
  return status !== undefined && RETRYABLE_STATUS.includes(status)
}
