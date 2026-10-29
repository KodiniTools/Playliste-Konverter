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
