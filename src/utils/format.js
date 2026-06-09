/**
 * Formatiert Bytes in eine lesbare Größenangabe (MB oder GB).
 * Gibt null zurück wenn bytes falsy ist (z.B. für optionale Dateigrößen).
 */
export function formatBytes(bytes, decimals = 2) {
  if (!bytes) return null
  const mb = bytes / 1024 / 1024
  if (mb >= 1024) {
    return (mb / 1024).toFixed(decimals) + ' GB'
  }
  return mb.toFixed(decimals) + ' MB'
}

/**
 * Formatiert Sekunden als m:ss (z.B. 3:07).
 */
export function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}
