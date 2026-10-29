/**
 * Fehler-Helfer (utils/errors.ts) und Format-Prüfung (constants.ts): geworfene
 * Werte sind nicht immer Error-Instanzen, gespeicherte Werte nicht immer gültig.
 */
import { describe, expect, it } from 'vitest'
import { errorName, isAbortError } from '../utils/errors'
import { isOutputFormat } from '../constants'
import { normalizeFormat } from '../stores/converter'

describe('errorName / isAbortError', () => {
  it('liest den Namen von Error, DOMException und Fehlerobjekten', () => {
    expect(errorName(new DOMException('x', 'AbortError'))).toBe('AbortError')
    expect(errorName({ name: 'CanceledError' })).toBe('CanceledError')
    expect(errorName(new TypeError('x'))).toBe('TypeError')
  })

  it('liefert undefined für Werte ohne Namen', () => {
    for (const value of [undefined, null, 'AbortError', 42, {}, { name: 1 }]) {
      expect(errorName(value)).toBeUndefined()
    }
  })

  it('erkennt Abbrüche von fetch und axios', () => {
    expect(isAbortError(new DOMException('x', 'AbortError'))).toBe(true)
    expect(isAbortError({ name: 'CanceledError' })).toBe(true)
    expect(isAbortError(new DOMException('x', 'TimeoutError'))).toBe(false)
    expect(isAbortError(undefined)).toBe(false)
  })
})

describe('isOutputFormat', () => {
  it('akzeptiert nur die eigenen Formate', () => {
    expect(['mp3', 'webm', 'ogg'].every(isOutputFormat)).toBe(true)
    expect(isOutputFormat('wav')).toBe(false)
    expect(isOutputFormat(null)).toBe(false)
  })

  it('lässt geerbte Objekt-Schlüssel nicht als Format durch', () => {
    expect(isOutputFormat('toString')).toBe(false)
    expect(normalizeFormat('constructor')).toBe('mp3')
  })
})
