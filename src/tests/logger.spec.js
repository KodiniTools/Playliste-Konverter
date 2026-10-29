/**
 * Logger: Fehler landen immer in der Konsole, Hinweise nur im Dev-Build.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { logger } from '../utils/logger'

describe('logger', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('error schreibt mit Präfix nach console.error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const err = new Error('kaputt')
    logger.error('Download fehlgeschlagen:', err)
    expect(spy).toHaveBeenCalledWith('[Playlist-Konverter]', 'Download fehlgeschlagen:', err)
  })

  it('info schreibt im Dev-Build', () => {
    vi.stubEnv('DEV', true)
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {})
    logger.info('Datei gespeichert')
    expect(spy).toHaveBeenCalledWith('[Playlist-Konverter]', 'Datei gespeichert')
  })

  it('info schweigt im Produktions-Build', () => {
    vi.stubEnv('DEV', false)
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {})
    logger.info('Datei gespeichert')
    expect(spy).not.toHaveBeenCalled()
  })
})
