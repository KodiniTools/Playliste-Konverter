/**
 * fetch-Client für Convert/Status: JSON, Fehlerform wie axios, Timeout, Abbruch.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { requestJson, HttpError } from '../utils/http'
import { uploadErrorMessage } from '../stores/converter'
import i18n from '../i18n'

/** fetch-Ersatz, der erst antwortet, wenn respond() gerufen wird, und Abbruch respektiert. */
function pendingFetch() {
  return vi.fn(
    (url, { signal }) =>
      new Promise((_, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason))
      }),
  )
}

const response = (status, body) => new Response(body, { status })

describe('requestJson', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('sendet JSON und liefert { data }', async () => {
    const fetchMock = vi.fn(async () => response(200, '{"success":true}'))
    vi.stubGlobal('fetch', fetchMock)

    const res = await requestJson('/api/convert', {
      method: 'POST',
      body: { session_id: 'x' },
      timeout: 1000,
    })
    expect(res).toEqual({ data: { success: true } })
    const [, init] = fetchMock.mock.calls[0]
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(init.body).toBe('{"session_id":"x"}')
  })

  it('HTTP-Fehler hat die axios-Form und wird übersetzt', async () => {
    vi.stubGlobal('fetch', async () =>
      response(507, '{"error":"voll","code":"INSUFFICIENT_STORAGE"}'),
    )
    const err = await requestJson('/api/convert', { timeout: 1000 }).catch((e) => e)
    expect(err).toBeInstanceOf(HttpError)
    expect(err.response).toEqual({
      status: 507,
      data: { error: 'voll', code: 'INSUFFICIENT_STORAGE' },
    })
    i18n.global.locale.value = 'de'
    expect(uploadErrorMessage(err)).toContain('zu wenig freien Speicher')
  })

  it('Nicht-JSON-Fehlerseite (nginx 429) bleibt als Text erhalten', async () => {
    vi.stubGlobal('fetch', async () => response(429, '<html>Too Many</html>'))
    const err = await requestJson('/api/status/x', { timeout: 1000 }).catch((e) => e)
    expect(err.response).toEqual({ status: 429, data: '<html>Too Many</html>' })
    expect(uploadErrorMessage(err)).toContain('Zu viele Anfragen')
  })

  it('Timeout bricht mit TimeoutError ab', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', pendingFetch())
    const promise = requestJson('/api/status/x', { timeout: 10_000 }).catch((e) => e)
    await vi.advanceTimersByTimeAsync(10_000)
    expect((await promise).name).toBe('TimeoutError')
  })

  it('Abbruch von außen kommt als AbortError an und räumt den Listener weg', async () => {
    vi.stubGlobal('fetch', pendingFetch())
    const controller = new AbortController()
    const removeSpy = vi.spyOn(controller.signal, 'removeEventListener')
    const promise = requestJson('/api/status/x', {
      timeout: 10_000,
      signal: controller.signal,
    }).catch((e) => e)
    controller.abort()
    expect((await promise).name).toBe('AbortError')
    expect(removeSpy).toHaveBeenCalledWith('abort', expect.any(Function))
  })
})
