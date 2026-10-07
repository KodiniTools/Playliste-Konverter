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

  it('unbekannte Fehler behalten die Server- oder Fehlermeldung', () => {
    expect(uploadErrorMessage(axiosError(500, { error: 'Upload fehlgeschlagen: EIO' }))).toBe(
      'Upload fehlgeschlagen: EIO',
    )
    expect(uploadErrorMessage({ message: 'Network Error' })).toBe('Network Error')
    expect(uploadErrorMessage(undefined)).toBe('Upload fehlgeschlagen')
  })
})
