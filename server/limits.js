'use strict'

/**
 * Speicher-Grenzen des Konvertierungsdienstes (reine Funktionen, ohne Express).
 *
 * - Gesamtgröße pro Sitzung: spiegelt MAX_PLAYLIST_SIZE der App (src/constants.js),
 *   damit ein Client, der die App umgeht, nicht beliebig viel hochladen kann.
 * - Platzreserve: Uploads werden abgelehnt, bevor die Partition des Temp-Ordners
 *   unter die Reserve fällt – der Ordner liegt auf derselben Partition wie das System.
 */

const fsp = require('fs/promises')

const UNITS = { '': 1, B: 1, K: 1024, M: 1024 ** 2, G: 1024 ** 3, T: 1024 ** 4 }

/**
 * Bytes aus einer Angabe wie "5G", "20g", "512M", "1048576" (binäre Einheiten).
 * Ungültige oder fehlende Werte liefern den Fallback.
 * @param {string|number|undefined} value
 * @param {number} fallback
 * @returns {number}
 */
function parseBytes(value, fallback) {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : fallback
  if (typeof value !== 'string') return fallback
  const match = value.trim().match(/^(\d+(?:\.\d+)?)\s*([BKMGT]?)(?:i?B)?$/i)
  if (!match) return fallback
  const unit = UNITS[match[2].toUpperCase()]
  return Math.floor(parseFloat(match[1]) * unit)
}

/**
 * Bleibt nach dem Schreiben von `incoming` Bytes noch mindestens `reserve` frei?
 * @param {{ available: number, incoming: number, reserve: number }} params
 */
function hasRoomFor({ available, incoming, reserve }) {
  return available - Math.max(0, incoming) >= reserve
}

/**
 * Würde die Sitzung mit `incoming` Bytes das Gesamtlimit überschreiten?
 * @param {{ current: number, incoming: number, max: number }} params
 */
function exceedsPlaylistLimit({ current, incoming, max }) {
  return current + incoming > max
}

/**
 * Für unprivilegierte Prozesse verfügbare Bytes auf der Partition von `dir`.
 * @param {string} dir
 * @returns {Promise<number>}
 */
async function availableBytes(dir) {
  const stats = await fsp.statfs(dir)
  return stats.bavail * stats.bsize
}

/** Lesbare Größe für Fehlermeldungen, z. B. 5368709120 → "5 GB". */
function formatGB(bytes) {
  const gb = bytes / 1024 ** 3
  return `${Number.isInteger(gb) ? gb : gb.toFixed(1)} GB`
}

module.exports = { parseBytes, hasRoomFor, exceedsPlaylistLimit, availableBytes, formatGB }
