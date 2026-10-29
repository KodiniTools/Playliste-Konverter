/**
 * Schlanker JSON-Client auf Basis von fetch – mit Timeout, Abbruch und
 * Fehlerobjekten in derselben Form wie axios (err.response.status/.data),
 * damit uploadErrorMessage() beide Quellen gleich behandelt.
 */

/** HTTP-Fehler mit Antwort (Status ≥ 400); `data` ist der JSON-Body oder Text der Antwort. */
export class HttpError extends Error {
  readonly response: { status: number; data: unknown }

  constructor(status: number, data: unknown) {
    super(`Request failed with status code ${status}`)
    this.name = 'HttpError'
    this.response = { status, data }
  }
}

/**
 * Signal, das bei Abbruch von außen ODER nach `ms` auslöst. Abbruch von außen
 * behält den Grund (AbortError), der Timeout meldet sich als TimeoutError.
 */
export function withTimeout(
  signal: AbortSignal | undefined,
  ms: number,
): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController()
  const timer = setTimeout(
    () => controller.abort(new DOMException('Zeitüberschreitung', 'TimeoutError')),
    ms,
  )
  const onAbort = () => controller.abort(signal?.reason)
  if (signal) {
    if (signal.aborted) onAbort()
    else signal.addEventListener('abort', onAbort, { once: true })
  }
  const cleanup = () => {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
  return { signal: controller.signal, cleanup }
}

export interface RequestJsonOptions {
  method?: string
  body?: unknown
  timeout: number
  signal?: AbortSignal
}

/**
 * JSON-Anfrage. Liefert `{ data }` wie axios. Der Typparameter beschreibt die
 * erwartete Antwort; geprüft wird sie nicht.
 */
export async function requestJson<T = unknown>(
  url: string,
  { method = 'GET', body, timeout, signal }: RequestJsonOptions,
): Promise<{ data: T }> {
  const { signal: combined, cleanup } = withTimeout(signal, timeout)
  try {
    const res = await fetch(url, {
      method,
      signal: combined,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const text = await res.text()
    let data: unknown = text
    try {
      data = text ? JSON.parse(text) : null
    } catch {
      // kein JSON (z. B. nginx-Fehlerseite) – Text bleibt erhalten
    }
    if (!res.ok) throw new HttpError(res.status, data)
    return { data: data as T }
  } finally {
    cleanup()
  }
}
