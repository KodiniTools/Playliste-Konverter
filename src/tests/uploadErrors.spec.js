/**
 * Fehlercodes des Servers (server/server.js) werden zu verständlichen Meldungen.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import i18n from '../i18n'
import { uploadErrorMessage } from '../stores/converter'
import { MAX_PLAYLIST_SIZE } from '../constants'

const axiosError = (status, data) => ({
  message: `Request failed with status code ${status}`,
  response: { status, data },
})

describe('uploadErrorMessage', () => {
  beforeEach(() => {
    i18n.global.locale.value = 'de'
  })

  it('PLAYLIST_TOO_LARGE nennt das Server-Limit', () => {
    const msg = uploadErrorMessage(
      axiosError(413, { code: 'PLAYLIST_TOO_LARGE', max_bytes: MAX_PLAYLIST_SIZE }),
    )
    expect(msg).toContain('größer als 5 GB')
  })

  it('429 vom nginx-Rate-Limit wird verständlich gemeldet', () => {
    const msg = uploadErrorMessage(axiosError(429, '<html>429 Too Many Requests</html>'))
    expect(msg).toContain('Zu viele Anfragen')
  })

  it('FILE_TOO_LARGE nennt das Limit pro Datei', () => {
    const msg = uploadErrorMessage(
      axiosError(413, { code: 'FILE_TOO_LARGE', max_bytes: 500 * 1024 ** 2 }),
    )
    expect(msg).toContain('größer als 500 MB')
  })

  it('INSUFFICIENT_STORAGE bittet um späteren Versuch (EN)', () => {
    i18n.global.locale.value = 'en'
    const msg = uploadErrorMessage(axiosError(507, { code: 'INSUFFICIENT_STORAGE' }))
    expect(msg).toBe(i18n.global.t('error.serverStorage'))
    expect(msg).toContain('try again')
  })

  it('Server-Codes werden übersetzt, die deutsche Server-Meldung nicht angezeigt', () => {
    i18n.global.locale.value = 'en'
    const msg = (code) => uploadErrorMessage(axiosError(400, { error: 'deutsch', code }))
    expect(msg('NO_FILES')).toBe('No files selected.')
    expect(msg('SESSION_NOT_FOUND')).toContain('session has expired')
    expect(msg('INVALID_SESSION')).toContain('session has expired')
    expect(msg('ALREADY_CONVERTING')).toContain('already being converted')
    expect(msg('INTERNAL')).toContain('Internal server error')
  })

  it('unbekannte Fehler: allgemeine Meldung statt technischem Text', () => {
    expect(uploadErrorMessage(axiosError(500, { error: 'Upload fehlgeschlagen: EIO' }))).toBe(
      i18n.global.t('error.uploadFailed'),
    )
    expect(uploadErrorMessage(new Error('Keine Session-ID vom Server erhalten'))).toBe(
      i18n.global.t('error.uploadFailed'),
    )
    expect(uploadErrorMessage(undefined)).toBe(i18n.global.t('error.uploadFailed'))
  })

  it('ohne Antwort vom Server: Hinweis auf die Verbindung', () => {
    const network = i18n.global.t('error.network')
    expect(uploadErrorMessage({ message: 'Network Error', code: 'ERR_NETWORK' })).toBe(network)
    expect(uploadErrorMessage(new TypeError('Failed to fetch'))).toBe(network)
    expect(uploadErrorMessage(new DOMException('Zeitüberschreitung', 'TimeoutError'))).toBe(network)
  })
})
