/**
 * Formatiert Bytes in eine lesbare Größenangabe (MB oder GB).
 * Gibt null zurück wenn bytes falsy ist (z.B. für optionale Dateigrößen).
 */
export function formatBytes(bytes: number | null | undefined, decimals = 2): string | null {
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
export function formatTime(seconds: number | null | undefined): string {
  if (!seconds || isNaN(seconds)) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

/**
 * Formatiert längere Dauern: ab einer Stunde h:mm:ss, sonst m:ss.
 */
export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || isNaN(seconds)) return '0:00'
  const total = Math.round(seconds)
  const hours = Math.floor(total / 3600)
  if (hours === 0) return formatTime(total)
  const mins = Math.floor((total % 3600) / 60)
  const secs = total % 60
  return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}
