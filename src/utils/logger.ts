/* eslint-disable no-console */
/**
 * Einheitliches Logging der App: Fehler immer (für Support über die
 * Browser-Konsole), Hinweise nur im Dev-Build, damit die Konsole auf
 * kodinitools.com sauber bleibt.
 */
export const logger = {
  info(...args: unknown[]) {
    if (import.meta.env.DEV) console.info('[Playlist-Konverter]', ...args)
  },
  error(...args: unknown[]) {
    console.error('[Playlist-Konverter]', ...args)
  },
}
