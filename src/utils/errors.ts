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
