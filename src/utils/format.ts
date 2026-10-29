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

/**
 * Zeitangabe für das Trimmen: m:ss, mit Zehnteln nur wenn nötig (1:05.5).
 */
export function formatTrimTime(seconds: number): string {
  const tenths = Math.round(seconds * 10)
  const whole = Math.floor(tenths / 10)
  const fraction = tenths % 10
  const hours = Math.floor(whole / 3600)
  const mins = Math.floor((whole % 3600) / 60)
  const secs = (whole % 60).toString().padStart(2, '0')
  const base =
    hours > 0 ? `${hours}:${mins.toString().padStart(2, '0')}:${secs}` : `${mins}:${secs}`
  return fraction > 0 ? `${base}.${fraction}` : base
}

/**
 * Eingabe wie „83“, „1:23“, „1:23,5“ oder „1:02:03“ in Sekunden; ungültig → null.
 */
export function parseTime(input: string): number | null {
  const text = input.trim().replace(',', '.')
  if (!/^\d+(?::\d{1,2}){0,2}(?:\.\d+)?$/.test(text)) return null
  const parts = text.split(':').map(Number)
  if (parts.slice(1).some((part) => part >= 60)) return null
  return parts.reduce((total, part) => total * 60 + part, 0)
}
